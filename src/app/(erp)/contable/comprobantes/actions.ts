"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRol } from "@/lib/auth";

type LineaData = {
  cuenta_codigo: string;
  debe: number;
  haber: number;
  glosa: string;
  auxiliar_rut: string;
  tipo_doc: string;
  num_doc: string;
  fecha_doc: string | null;
  tipo_doc_ref: string;
  num_doc_ref: string;
  categoria_flujo: string;
};

export async function crearComprobante(data: {
  tipo: string;
  fecha: string;
  glosa: string;
  lineas: LineaData[];
}) {
  await requireRol("contador");
  const supabase = await createClient();

  // 1. Mínimo 2 líneas
  if (data.lineas.length < 2) {
    return { error: "El comprobante debe tener al menos 2 líneas" };
  }

  // 2. Cuadratura + montos no negativos
  let totalDebe = 0;
  let totalHaber = 0;
  for (let i = 0; i < data.lineas.length; i++) {
    const l = data.lineas[i];
    if (l.debe < 0) return { error: `Línea ${i + 1}: monto DEBE no puede ser negativo` };
    if (l.haber < 0) return { error: `Línea ${i + 1}: monto HABER no puede ser negativo` };
    if (l.debe === 0 && l.haber === 0) return { error: `Línea ${i + 1}: debe tener monto en Debe o Haber` };
    totalDebe += l.debe;
    totalHaber += l.haber;
  }
  if (Math.abs(totalDebe - totalHaber) > 0.01) {
    return {
      error: `Descuadrado: Debe $${Math.round(totalDebe).toLocaleString()} ≠ Haber $${Math.round(totalHaber).toLocaleString()}`,
    };
  }

  // 3. Validar cada línea contra plan de cuentas
  const codigosCuenta = [...new Set(data.lineas.map((l) => l.cuenta_codigo))];
  const { data: cuentas } = await supabase
    .from("plan_cuentas")
    .select("codigo, nombre, tipo, nivel, usa_auxiliar, usa_documento, conciliable, estado")
    .in("codigo", codigosCuenta);

  const cuentaMap = new Map(
    (cuentas || []).map((c) => [c.codigo, c])
  );

  const rutsUsados: string[] = [];

  for (let i = 0; i < data.lineas.length; i++) {
    const l = data.lineas[i];
    const cuenta = cuentaMap.get(l.cuenta_codigo);

    if (!cuenta) return { error: `Línea ${i + 1}: cuenta ${l.cuenta_codigo} no existe` };
    if (cuenta.estado !== "S") return { error: `Línea ${i + 1}: cuenta ${l.cuenta_codigo} está inactiva` };
    if (cuenta.nivel !== 4) {
      return { error: `Línea ${i + 1}: cuenta ${l.cuenta_codigo} (${cuenta.nombre}) no es de movimiento` };
    }
    const esSistema = data.tipo === "A" || data.tipo === "C";
    if (cuenta.usa_auxiliar === "X" && !l.auxiliar_rut && !esSistema) {
      return { error: `Línea ${i + 1}: cuenta ${l.cuenta_codigo} requiere auxiliar` };
    }
    if (cuenta.usa_documento === "X" && (!l.tipo_doc || !l.num_doc) && !l.tipo_doc_ref && !esSistema) {
      return { error: `Línea ${i + 1}: cuenta ${l.cuenta_codigo} requiere documento` };
    }
    if (cuenta.usa_auxiliar !== "X") {
      l.auxiliar_rut = "";
    }
    if (cuenta.usa_documento !== "X") {
      l.tipo_doc = "";
      l.num_doc = "";
      l.fecha_doc = null;
      l.tipo_doc_ref = "";
      l.num_doc_ref = "";
    }

    if (l.auxiliar_rut && !rutsUsados.includes(l.auxiliar_rut)) {
      rutsUsados.push(l.auxiliar_rut);
    }
  }

  // 4. Validar auxiliares existen
  if (rutsUsados.length > 0) {
    const { data: auxs } = await supabase
      .from("auxiliares")
      .select("rut")
      .in("rut", rutsUsados);
    const rutsExistentes = new Set((auxs || []).map((a) => a.rut));
    for (const rut of rutsUsados) {
      if (!rutsExistentes.has(rut)) {
        return { error: `Auxiliar ${rut} no existe en el maestro` };
      }
    }
  }

  // 5. Período abierto
  const fecha = new Date(data.fecha + "T12:00:00");
  const anio = fecha.getFullYear();
  const mes = fecha.getMonth() + 1;

  const { data: periodo } = await supabase
    .from("periodos")
    .select("estado")
    .eq("anio", anio)
    .single();

  if (!periodo) return { error: `No existe período para ${anio}` };
  if (periodo.estado !== "ABIERTO") return { error: `Período ${anio} está cerrado` };

  // 6. Detección de duplicados (docs tributarios con REGISTRO)
  const docsRegistro = data.lineas.filter(
    (l) => l.tipo_doc && l.num_doc && !l.tipo_doc_ref
  );
  if (docsRegistro.length > 0) {
    for (const doc of docsRegistro) {
      const { count } = await supabase
        .from("mov_contables")
        .select("*, comprobantes!inner(estado)", { count: "exact", head: true })
        .eq("cuenta_codigo", doc.cuenta_codigo)
        .eq("auxiliar_rut", doc.auxiliar_rut)
        .eq("tipo_doc", doc.tipo_doc)
        .eq("num_doc", doc.num_doc)
        .eq("tipo_doc_ref", "")
        .eq("comprobantes.estado", "VIGENTE");

      if (count && count > 0) {
        return {
          error: `Documento duplicado: ${doc.tipo_doc} ${doc.num_doc} ya existe para auxiliar ${doc.auxiliar_rut} en cuenta ${doc.cuenta_codigo}`,
        };
      }
    }
  }

  // 7. Validar rebajas no excedan saldo disponible
  const lineasRebaja = data.lineas.filter((l) => l.tipo_doc_ref);
  for (const l of lineasRebaja) {
    const cuenta = cuentaMap.get(l.cuenta_codigo);
    if (!cuenta) continue;
    const esDeudor = cuenta.tipo === "A" || cuenta.tipo === "G";
    const montoRebaja = esDeudor ? l.haber : l.debe;

    if (montoRebaja > 0) {
      const { data: movs } = await supabase
        .from("mov_contables")
        .select("debe, haber, comprobantes!inner(estado)")
        .eq("cuenta_codigo", l.cuenta_codigo)
        .eq("auxiliar_rut", l.auxiliar_rut)
        .eq("comprobantes.estado", "VIGENTE")
        .or(`and(tipo_doc_ref.eq.${l.tipo_doc_ref},num_doc_ref.eq.${l.num_doc_ref}),and(tipo_doc.eq.${l.tipo_doc_ref},num_doc.eq.${l.num_doc_ref},tipo_doc_ref.eq.)`);

      let saldoDoc = 0;
      for (const m of movs || []) {
        saldoDoc += esDeudor
          ? Number(m.debe) - Number(m.haber)
          : Number(m.haber) - Number(m.debe);
      }

      if (montoRebaja > Math.abs(saldoDoc) + 1) {
        return {
          error: `${l.tipo_doc_ref} ${l.num_doc_ref}: rebaja $${Math.round(montoRebaja).toLocaleString()} excede saldo disponible $${Math.round(Math.abs(saldoDoc)).toLocaleString()}`,
        };
      }
    }
  }

  // 8. Asignar número
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

  // 9. Insertar comprobante
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

  // 10. Insertar movimientos (glosa línea hereda de cabecera si vacía)
  const lineas = data.lineas.map((l, i) => ({
    comprobante_id: comp.id,
    linea: i + 1,
    cuenta_codigo: l.cuenta_codigo,
    debe: l.debe,
    haber: l.haber,
    glosa: l.glosa || data.glosa,
    auxiliar_rut: l.auxiliar_rut,
    tipo_doc: l.tipo_doc,
    num_doc: l.num_doc,
    fecha_doc: l.fecha_doc || null,
    tipo_doc_ref: l.tipo_doc_ref,
    num_doc_ref: l.num_doc_ref,
    categoria_flujo: l.categoria_flujo,
  }));

  const { error: lineErr } = await supabase
    .from("mov_contables")
    .insert(lineas);

  if (lineErr) {
    await supabase.from("comprobantes").delete().eq("id", comp.id);
    return { error: lineErr.message };
  }

  revalidatePath("/contable/comprobantes");
  return { data: { id: comp.id, numero, tipo: data.tipo }, error: null };
}

export async function anularComprobante(id: number) {
  await requireRol("contador");
  const supabase = await createClient();

  // Verificar que el comprobante existe y está vigente
  const { data: comp } = await supabase
    .from("comprobantes")
    .select("id, anio, estado")
    .eq("id", id)
    .single();

  if (!comp) return { error: "Comprobante no encontrado" };
  if (comp.estado === "ANULADO") return { error: "Ya está anulado" };

  // Verificar período abierto
  const { data: periodo } = await supabase
    .from("periodos")
    .select("estado")
    .eq("anio", comp.anio)
    .single();

  if (periodo && periodo.estado !== "ABIERTO") {
    return { error: `Período ${comp.anio} está cerrado` };
  }

  // Verificar referencias cruzadas (rebajas que apuntan a docs de este comprobante)
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
        .select("*, comprobantes!inner(estado)", { count: "exact", head: true })
        .eq("tipo_doc_ref", m.tipo_doc)
        .eq("num_doc_ref", m.num_doc)
        .neq("comprobante_id", id)
        .eq("comprobantes.estado", "VIGENTE");

      if (count && count > 0) {
        return {
          error: `No se puede anular: documento ${m.tipo_doc} ${m.num_doc} tiene rebajas asociadas en comprobantes vigentes`,
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

export async function getComprobante(id: number) {
  const supabase = await createClient();

  const { data: comp, error } = await supabase
    .from("comprobantes")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !comp) return { data: null, error: error?.message || "No encontrado" };

  const { data: movs } = await supabase
    .from("mov_contables")
    .select("*")
    .eq("comprobante_id", id)
    .order("linea");

  return { data: { ...comp, lineas: movs || [] }, error: null };
}

export async function actualizarComprobante(
  id: number,
  data: { fecha: string; glosa: string; lineas: LineaData[] }
) {
  await requireRol("contador");
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("comprobantes")
    .select("id, anio, estado")
    .eq("id", id)
    .single();

  if (!comp) return { error: "Comprobante no encontrado" };
  if (comp.estado === "ANULADO") return { error: "No se puede modificar un comprobante anulado" };

  // Validar período abierto
  const { data: periodo } = await supabase
    .from("periodos")
    .select("estado")
    .eq("anio", comp.anio)
    .single();

  if (periodo && periodo.estado !== "ABIERTO") {
    return { error: `Período ${comp.anio} está cerrado` };
  }

  if (data.lineas.length < 2) return { error: "Mínimo 2 líneas" };

  let totalDebe = 0, totalHaber = 0;
  for (const l of data.lineas) {
    if (l.debe < 0 || l.haber < 0) return { error: "Montos no pueden ser negativos" };
    if (l.debe === 0 && l.haber === 0) return { error: "Cada línea debe tener monto" };
    totalDebe += l.debe;
    totalHaber += l.haber;
  }
  if (Math.abs(totalDebe - totalHaber) > 0.01) {
    return { error: `Descuadrado: Debe $${Math.round(totalDebe).toLocaleString()} ≠ Haber $${Math.round(totalHaber).toLocaleString()}` };
  }

  // Validar cuentas
  const codigos = [...new Set(data.lineas.map((l) => l.cuenta_codigo))];
  const { data: cuentas } = await supabase
    .from("plan_cuentas")
    .select("codigo, nombre, tipo, nivel, usa_auxiliar, usa_documento, estado")
    .in("codigo", codigos);

  const cuentaMap = new Map((cuentas || []).map((c) => [c.codigo, c]));
  for (const l of data.lineas) {
    const cuenta = cuentaMap.get(l.cuenta_codigo);
    if (!cuenta) return { error: `Cuenta ${l.cuenta_codigo} no existe` };
    if (cuenta.estado !== "S") return { error: `Cuenta ${l.cuenta_codigo} inactiva` };
    if (cuenta.nivel !== 4) return { error: `Cuenta ${l.cuenta_codigo} no es de movimiento` };
  }

  // Actualizar fecha/mes
  const fecha = new Date(data.fecha + "T12:00:00");
  const mes = fecha.getMonth() + 1;

  const { error: updErr } = await supabase
    .from("comprobantes")
    .update({ fecha: data.fecha, glosa: data.glosa, mes })
    .eq("id", id);

  if (updErr) return { error: updErr.message };

  // Reemplazar movimientos: borrar y reinsertar
  await supabase.from("mov_contables").delete().eq("comprobante_id", id);

  const lineas = data.lineas.map((l, i) => ({
    comprobante_id: id,
    linea: i + 1,
    cuenta_codigo: l.cuenta_codigo,
    debe: l.debe,
    haber: l.haber,
    glosa: l.glosa || data.glosa,
    auxiliar_rut: l.auxiliar_rut,
    tipo_doc: l.tipo_doc,
    num_doc: l.num_doc,
    fecha_doc: l.fecha_doc || null,
    tipo_doc_ref: l.tipo_doc_ref,
    num_doc_ref: l.num_doc_ref,
    categoria_flujo: l.categoria_flujo,
  }));

  const { error: lineErr } = await supabase.from("mov_contables").insert(lineas);
  if (lineErr) return { error: lineErr.message };

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
      "tipo_doc, num_doc, tipo_doc_ref, num_doc_ref, debe, haber, comprobantes!inner(estado)"
    )
    .eq("cuenta_codigo", cuenta_codigo)
    .eq("auxiliar_rut", auxiliar_rut)
    .eq("comprobantes.estado", "VIGENTE")
    .or("tipo_doc.neq.,tipo_doc_ref.neq.");

  if (!movs || movs.length === 0) return { data: [] };

  const saldos = new Map<string, number>();

  for (const m of movs) {
    const monto = deudor
      ? Number(m.debe) - Number(m.haber)
      : Number(m.haber) - Number(m.debe);

    if (m.tipo_doc_ref && m.num_doc_ref) {
      const refKey = `${m.tipo_doc_ref}|${m.num_doc_ref}`;
      saldos.set(refKey, (saldos.get(refKey) || 0) + monto);
    } else if (m.tipo_doc && m.num_doc) {
      const docKey = `${m.tipo_doc}|${m.num_doc}`;
      saldos.set(docKey, (saldos.get(docKey) || 0) + monto);
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
