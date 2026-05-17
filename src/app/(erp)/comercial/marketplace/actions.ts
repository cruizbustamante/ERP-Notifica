"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const COMISION_NL = 0.15;
const IVA = 0.19;

export type TransaccionRow = {
  id: number;
  orden_id: string;
  fecha_transaccion: string;
  receptor_rut: string;
  receptor_nombre: string | null;
  monto_bruto: number;
  base_receptor: number;
  comision_nl_bruta: number;
  comision_nl_neta: number;
  iva_comision: number;
  costo_tbk: number;
  estado: string;
  fecha_pago: string | null;
  referencia_pago: string | null;
  lote_carga: string | null;
  created_at: string;
};

export type TransaccionInput = {
  orden_id: string;
  fecha_transaccion: string;
  receptor_rut: string;
  receptor_nombre: string;
  monto_bruto: number;
  costo_tbk?: number;
};

function calcularDesglose(monto: number) {
  const base_receptor = Math.round(monto / (1 + COMISION_NL));
  const comision_nl_bruta = monto - base_receptor;
  const comision_nl_neta = Math.round(comision_nl_bruta / (1 + IVA));
  const iva_comision = comision_nl_bruta - comision_nl_neta;
  return { base_receptor, comision_nl_bruta, comision_nl_neta, iva_comision };
}

export async function cargarTransacciones(transacciones: TransaccionInput[]) {
  const supabase = await createClient();
  const lote = `CARGA-${Date.now()}`;

  const rows = transacciones.map((t) => {
    const desglose = calcularDesglose(t.monto_bruto);
    return {
      orden_id: t.orden_id,
      fecha_transaccion: t.fecha_transaccion,
      receptor_rut: t.receptor_rut,
      receptor_nombre: t.receptor_nombre,
      monto_bruto: t.monto_bruto,
      base_receptor: desglose.base_receptor,
      comision_nl_bruta: desglose.comision_nl_bruta,
      comision_nl_neta: desglose.comision_nl_neta,
      iva_comision: desglose.iva_comision,
      costo_tbk: t.costo_tbk || 0,
      lote_carga: lote,
    };
  });

  const { error, data } = await supabase
    .from("marketplace_transacciones")
    .upsert(rows, { onConflict: "orden_id" })
    .select();

  if (error) return { error: error.message, insertados: 0 };

  revalidatePath("/comercial/marketplace");
  return { error: null, insertados: data?.length || 0, lote };
}

export async function getTransacciones(filtros?: {
  estado?: string;
  receptor_rut?: string;
  desde?: string;
  hasta?: string;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("marketplace_transacciones")
    .select("*")
    .order("fecha_transaccion", { ascending: false });

  if (filtros?.estado && filtros.estado !== "TODOS") {
    query = query.eq("estado", filtros.estado);
  }
  if (filtros?.receptor_rut) {
    query = query.eq("receptor_rut", filtros.receptor_rut);
  }
  if (filtros?.desde) {
    query = query.gte("fecha_transaccion", filtros.desde);
  }
  if (filtros?.hasta) {
    query = query.lte("fecha_transaccion", filtros.hasta);
  }

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: data || [], error: null };
}

export async function marcarPagado(ids: number[], referencia: string, fechaPago: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketplace_transacciones")
    .update({ estado: "PAGADO", fecha_pago: fechaPago, referencia_pago: referencia })
    .in("id", ids);

  if (error) return { error: error.message };
  revalidatePath("/comercial/marketplace");
  return { error: null };
}

export async function anularTransaccion(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketplace_transacciones")
    .update({ estado: "ANULADO" })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/comercial/marketplace");
  return { error: null };
}

export async function getResumenReceptores() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_transacciones")
    .select("receptor_rut, receptor_nombre, monto_bruto, base_receptor, estado");

  if (error) return { data: [], error: error.message };

  const mapa: Record<string, {
    rut: string;
    nombre: string;
    total_bruto: number;
    total_por_pagar: number;
    pagado: number;
    pendiente: number;
  }> = {};

  for (const t of data || []) {
    if (!mapa[t.receptor_rut]) {
      mapa[t.receptor_rut] = {
        rut: t.receptor_rut,
        nombre: t.receptor_nombre || t.receptor_rut,
        total_bruto: 0,
        total_por_pagar: 0,
        pagado: 0,
        pendiente: 0,
      };
    }
    const r = mapa[t.receptor_rut];
    if (t.estado === "ANULADO") continue;
    r.total_bruto += Number(t.monto_bruto);
    r.total_por_pagar += Number(t.base_receptor);
    if (t.estado === "PAGADO") r.pagado += Number(t.base_receptor);
    else r.pendiente += Number(t.base_receptor);
  }

  return { data: Object.values(mapa), error: null };
}
