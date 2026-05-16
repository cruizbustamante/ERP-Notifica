"use server";

import { createClient } from "@/lib/supabase/server";

export type ComprobanteConLineas = {
  id: number;
  numero: number;
  tipo: string;
  fecha: string;
  glosa: string;
  estado: string;
  lineas: {
    linea: number;
    cuenta_codigo: string;
    cuenta_nombre: string;
    debe: number;
    haber: number;
    glosa: string;
    auxiliar_rut: string;
    tipo_doc: string;
    num_doc: string;
  }[];
};

export async function getLibroDiario(anio: number, mes: number | null) {
  const supabase = await createClient();

  let query = supabase
    .from("comprobantes")
    .select("id, numero, tipo, fecha, glosa, estado, mes")
    .eq("anio", anio)
    .eq("estado", "VIGENTE")
    .order("fecha")
    .order("tipo")
    .order("numero");

  if (mes) {
    query = query.eq("mes", mes);
  }

  const { data: comprobantes, error } = await query;
  if (error) return { data: [], error: error.message };
  if (!comprobantes || comprobantes.length === 0) return { data: [], error: null };

  const ids = comprobantes.map((c) => c.id);

  const { data: movs } = await supabase
    .from("mov_contables")
    .select("comprobante_id, linea, cuenta_codigo, debe, haber, glosa, auxiliar_rut, tipo_doc, num_doc")
    .in("comprobante_id", ids)
    .order("linea");

  const { data: cuentas } = await supabase
    .from("plan_cuentas")
    .select("codigo, nombre");

  const cuentaMap = new Map((cuentas || []).map((c) => [c.codigo, c.nombre]));
  const movsMap = new Map<number, typeof movs>();
  for (const m of movs || []) {
    const arr = movsMap.get(m.comprobante_id) || [];
    arr.push(m);
    movsMap.set(m.comprobante_id, arr);
  }

  const result: ComprobanteConLineas[] = comprobantes.map((c) => ({
    id: c.id,
    numero: c.numero,
    tipo: c.tipo,
    fecha: c.fecha,
    glosa: c.glosa,
    estado: c.estado,
    lineas: (movsMap.get(c.id) || []).map((m) => ({
      linea: m.linea,
      cuenta_codigo: m.cuenta_codigo,
      cuenta_nombre: cuentaMap.get(m.cuenta_codigo) || "",
      debe: Number(m.debe) || 0,
      haber: Number(m.haber) || 0,
      glosa: m.glosa,
      auxiliar_rut: m.auxiliar_rut || "",
      tipo_doc: m.tipo_doc || "",
      num_doc: m.num_doc || "",
    })),
  }));

  return { data: result, error: null };
}
