"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type LineaData = {
  cuenta_codigo: string;
  debe: number;
  haber: number;
  glosa: string;
  auxiliar_rut: string;
  tipo_doc: string;
  num_doc: string;
  fecha_doc: string | null;
  referencia: string;
};

export async function crearComprobante(data: {
  tipo: string;
  fecha: string;
  glosa: string;
  lineas: LineaData[];
}) {
  const supabase = await createClient();

  if (data.lineas.length < 2) {
    return { error: "El comprobante debe tener al menos 2 líneas" };
  }

  const totalDebe = data.lineas.reduce((s, l) => s + l.debe, 0);
  const totalHaber = data.lineas.reduce((s, l) => s + l.haber, 0);
  if (Math.abs(totalDebe - totalHaber) > 0.01) {
    return {
      error: `Descuadrado: Debe $${Math.round(totalDebe).toLocaleString()} ≠ Haber $${Math.round(totalHaber).toLocaleString()}`,
    };
  }

  for (const l of data.lineas) {
    if (!l.cuenta_codigo) return { error: "Todas las líneas deben tener cuenta" };
    if (l.debe === 0 && l.haber === 0)
      return { error: "Cada línea debe tener monto en Debe o Haber" };
  }

  const fecha = new Date(data.fecha + "T12:00:00");
  const anio = fecha.getFullYear();
  const mes = fecha.getMonth() + 1;

  const { data: periodo } = await supabase
    .from("periodos")
    .select("estado")
    .eq("anio", anio)
    .single();

  if (!periodo) return { error: `No existe período para ${anio}` };
  if (periodo.estado !== "ABIERTO")
    return { error: `Período ${anio} está cerrado` };

  const { data: maxFolio } = await supabase
    .from("comprobantes")
    .select("numero")
    .eq("tipo", data.tipo)
    .eq("anio", anio)
    .order("numero", { ascending: false })
    .limit(1)
    .single();

  const numero = (maxFolio?.numero || 0) + 1;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: comp, error: compErr } = await supabase
    .from("comprobantes")
    .insert({
      numero,
      tipo: data.tipo,
      fecha: data.fecha,
      glosa: data.glosa,
      anio,
      mes,
      estado: "VIGENTE",
      usuario: user?.email || "",
    })
    .select("id")
    .single();

  if (compErr) return { error: compErr.message };

  const lineas = data.lineas.map((l, i) => ({
    comprobante_id: comp.id,
    linea: i + 1,
    cuenta_codigo: l.cuenta_codigo,
    debe: l.debe,
    haber: l.haber,
    glosa: l.glosa,
    auxiliar_rut: l.auxiliar_rut,
    tipo_doc: l.tipo_doc,
    num_doc: l.num_doc,
    fecha_doc: l.fecha_doc || null,
    referencia: l.referencia,
  }));

  const { error: lineErr } = await supabase
    .from("mov_contables")
    .insert(lineas);

  if (lineErr) {
    await supabase.from("comprobantes").delete().eq("id", comp.id);
    return { error: lineErr.message };
  }

  revalidatePath("/contable/comprobantes");
  return { data: { id: comp.id, numero, tipo: data.tipo } };
}

export async function anularComprobante(id: number) {
  const supabase = await createClient();

  const { data: movs } = await supabase
    .from("mov_contables")
    .select("tipo_doc, num_doc")
    .eq("comprobante_id", id)
    .neq("tipo_doc", "");

  if (movs && movs.length > 0) {
    for (const m of movs) {
      const docRef = `${m.tipo_doc}|${m.num_doc}`;
      const { count } = await supabase
        .from("mov_contables")
        .select("*", { count: "exact", head: true })
        .eq("referencia", docRef)
        .neq("comprobante_id", id);

      if (count && count > 0) {
        return {
          error: `No se puede anular: documento ${m.tipo_doc} ${m.num_doc} tiene rebajas asociadas`,
        };
      }
    }
  }

  const { error } = await supabase
    .from("comprobantes")
    .update({ estado: "ANULADO" })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/contable/comprobantes");
  return { error: null };
}

export async function getDocumentosAbiertos(
  cuenta_codigo: string,
  auxiliar_rut: string
) {
  const supabase = await createClient();

  const { data: cuenta } = await supabase
    .from("plan_cuentas")
    .select("tipo")
    .eq("codigo", cuenta_codigo)
    .single();

  if (!cuenta) return { data: [] };

  const deudor = cuenta.tipo === "A" || cuenta.tipo === "G";

  const { data: movs } = await supabase
    .from("mov_contables")
    .select(
      "tipo_doc, num_doc, debe, haber, referencia, comprobantes!inner(estado)"
    )
    .eq("cuenta_codigo", cuenta_codigo)
    .eq("auxiliar_rut", auxiliar_rut)
    .eq("comprobantes.estado", "VIGENTE")
    .neq("tipo_doc", "");

  if (!movs || movs.length === 0) return { data: [] };

  const saldos = new Map<string, number>();

  for (const m of movs) {
    const docKey = `${m.tipo_doc}|${m.num_doc}`;
    const refKey = m.referencia || docKey;
    const isRegistro = !m.referencia || m.referencia === docKey;

    const monto = deudor
      ? Number(m.debe) - Number(m.haber)
      : Number(m.haber) - Number(m.debe);

    if (isRegistro) {
      saldos.set(docKey, (saldos.get(docKey) || 0) + monto);
    } else {
      saldos.set(refKey, (saldos.get(refKey) || 0) + monto);
    }
  }

  return {
    data: Array.from(saldos.entries())
      .filter(([, saldo]) => Math.abs(saldo) > 0.01)
      .map(([key, saldo]) => ({
        tipo_doc: key.split("|")[0],
        num_doc: key.split("|")[1],
        saldo: Math.abs(saldo),
      })),
  };
}
