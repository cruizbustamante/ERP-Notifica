"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRol } from "@/lib/auth";

const IVA = 0.19;

const TASAS_DEFAULT = {
  MKT_COMISION_NL: 15,
  MKT_TASA_TBK_DEBITO: 1.49,
  MKT_TASA_TBK_CREDITO: 2.49,
  MKT_TASA_MP: 3.19,
};

async function getTasas() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("config")
    .select("clave, valor")
    .in("clave", Object.keys(TASAS_DEFAULT));
  const map: Record<string, number> = {};
  for (const d of data || []) map[d.clave] = Number(d.valor);
  return {
    comisionNL: (map.MKT_COMISION_NL ?? TASAS_DEFAULT.MKT_COMISION_NL) / 100,
    tbkDebito: (map.MKT_TASA_TBK_DEBITO ?? TASAS_DEFAULT.MKT_TASA_TBK_DEBITO) / 100,
    tbkCredito: (map.MKT_TASA_TBK_CREDITO ?? TASAS_DEFAULT.MKT_TASA_TBK_CREDITO) / 100,
    mp: (map.MKT_TASA_MP ?? TASAS_DEFAULT.MKT_TASA_MP) / 100,
  };
}

function calcularCostoPlataforma(monto: number, plataforma: string, cardType: string, tasas: Awaited<ReturnType<typeof getTasas>>) {
  let tasaNeta: number;
  if (plataforma === "MP") {
    tasaNeta = tasas.mp;
  } else if (cardType && (cardType.toLowerCase().includes("créd") || cardType.toLowerCase().includes("cred"))) {
    tasaNeta = tasas.tbkCredito;
  } else {
    tasaNeta = tasas.tbkDebito;
  }
  return Math.round(monto * tasaNeta * (1 + IVA));
}

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
  costo_plataforma: number;
  plataforma: string;
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
  costo_plataforma?: number;
  plataforma?: string;
  id_tbk?: string;
  id_mp?: string;
  card_type?: string;
};

function calcularDesglose(monto: number, comisionNL: number) {
  const base_receptor = Math.round(monto / (1 + comisionNL));
  const comision_nl_bruta = monto - base_receptor;
  const comision_nl_neta = Math.round(comision_nl_bruta / (1 + IVA));
  const iva_comision = comision_nl_bruta - comision_nl_neta;
  return { base_receptor, comision_nl_bruta, comision_nl_neta, iva_comision };
}

export async function cargarTransacciones(transacciones: TransaccionInput[]) {
  await requireRol("comercial");
  const supabase = await createClient();
  const tasas = await getTasas();
  const lote = `CARGA-${Date.now()}`;

  const rows = transacciones.map((t) => {
    const desglose = calcularDesglose(t.monto_bruto, tasas.comisionNL);
    const costoPlat = calcularCostoPlataforma(t.monto_bruto, t.plataforma || "TBK", t.card_type || "", tasas);
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
      costo_tbk: costoPlat,
      costo_plataforma: costoPlat,
      plataforma: t.plataforma || "TBK",
      id_tbk: t.id_tbk || null,
      id_mp: t.id_mp || null,
      card_type: t.card_type || null,
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
  await requireRol("comercial");
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
  await requireRol("comercial");
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

export type RentabilidadPlataforma = {
  plataforma: string;
  transacciones: number;
  monto_bruto: number;
  comision_nl_bruta: number;
  comision_nl_neta: number;
  iva_comision: number;
  costo_plataforma: number;
  rentabilidad_neta: number;
  margen_pct: number;
};

export async function marcarBoletaEmitida(ids: number[], folio: string, fecha: string) {
  await requireRol("comercial");
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketplace_transacciones")
    .update({ boleta_emitida: true, boleta_folio: folio, boleta_fecha: fecha })
    .in("id", ids);

  if (error) return { error: error.message };
  revalidatePath("/comercial/marketplace");
  return { error: null };
}

export type ResumenMensualMKT = {
  periodo: string;
  mes: number;
  n_tx: number;
  total_ventas: number;
  base_receptores: number;
  comision_nl_bruta: number;
  comision_nl_neta: number;
  iva_comision: number;
  costo_plataforma: number;
  margen_neto: number;
  boletas_pendientes: number;
};

export async function getResumenMensualMKT(anio: number): Promise<{ data: ResumenMensualMKT[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_transacciones")
    .select("fecha_transaccion, monto_bruto, base_receptor, comision_nl_bruta, comision_nl_neta, iva_comision, costo_plataforma, costo_tbk, estado, boleta_emitida");

  if (error) return { data: [], error: error.message };

  const meses: Record<number, ResumenMensualMKT> = {};
  for (let m = 1; m <= 12; m++) {
    meses[m] = {
      periodo: `${anio}-${String(m).padStart(2, "0")}`,
      mes: m,
      n_tx: 0, total_ventas: 0, base_receptores: 0,
      comision_nl_bruta: 0, comision_nl_neta: 0, iva_comision: 0,
      costo_plataforma: 0, margen_neto: 0, boletas_pendientes: 0,
    };
  }

  for (const t of data || []) {
    if (t.estado === "ANULADO") continue;
    const fecha = new Date(t.fecha_transaccion);
    if (fecha.getFullYear() !== anio) continue;
    const m = fecha.getMonth() + 1;
    const r = meses[m];
    r.n_tx++;
    r.total_ventas += Number(t.monto_bruto) || 0;
    r.base_receptores += Number(t.base_receptor) || 0;
    r.comision_nl_bruta += Number(t.comision_nl_bruta) || 0;
    r.comision_nl_neta += Number(t.comision_nl_neta) || 0;
    r.iva_comision += Number(t.iva_comision) || 0;
    r.costo_plataforma += Number(t.costo_plataforma) || Number(t.costo_tbk) || 0;
    if (!t.boleta_emitida) r.boletas_pendientes++;
  }

  for (const r of Object.values(meses)) {
    r.margen_neto = r.comision_nl_neta - r.costo_plataforma;
  }

  return { data: Object.values(meses).filter((m) => m.n_tx > 0), error: null };
}

export type ComparativoNegocio = {
  linea: string;
  ingresos: number;
  costos: number;
  margen: number;
  margen_pct: number;
  transacciones: number;
  por_mes: { mes: number; ingresos: number }[];
};

export async function getComparativoNegocios(anio: number): Promise<{ data: ComparativoNegocio[]; error: string | null }> {
  const supabase = await createClient();

  const [{ data: ventas }, { data: mkt }] = await Promise.all([
    supabase
      .from("ventas_sii")
      .select("mes, monto_neto, monto_total, tipo_dte")
      .eq("anio", anio),
    supabase
      .from("marketplace_transacciones")
      .select("fecha_transaccion, comision_nl_neta, costo_plataforma, costo_tbk, estado"),
  ]);

  // Suscripciones (from ventas_sii facturas - excluyendo NC)
  const suscPorMes: number[] = Array(12).fill(0);
  let suscTotal = 0;
  let suscTx = 0;
  for (const v of ventas || []) {
    const isNC = [61, 111].includes(v.tipo_dte);
    const monto = Number(v.monto_neto) || 0;
    const signo = isNC ? -1 : 1;
    if (v.mes >= 1 && v.mes <= 12) {
      suscPorMes[v.mes - 1] += monto * signo;
    }
    suscTotal += monto * signo;
    suscTx++;
  }

  // Marketplace
  const mktPorMes: number[] = Array(12).fill(0);
  let mktIngresos = 0;
  let mktCostos = 0;
  let mktTx = 0;
  for (const t of mkt || []) {
    if (t.estado === "ANULADO") continue;
    const fecha = new Date(t.fecha_transaccion);
    if (fecha.getFullYear() !== anio) continue;
    const m = fecha.getMonth();
    const ingreso = Number(t.comision_nl_neta) || 0;
    const costo = Number(t.costo_plataforma) || Number(t.costo_tbk) || 0;
    mktPorMes[m] += ingreso;
    mktIngresos += ingreso;
    mktCostos += costo;
    mktTx++;
  }

  const result: ComparativoNegocio[] = [
    {
      linea: "Suscripciones",
      ingresos: suscTotal,
      costos: 0,
      margen: suscTotal,
      margen_pct: 100,
      transacciones: suscTx,
      por_mes: suscPorMes.map((v, i) => ({ mes: i + 1, ingresos: v })),
    },
    {
      linea: "Marketplace",
      ingresos: mktIngresos,
      costos: mktCostos,
      margen: mktIngresos - mktCostos,
      margen_pct: mktIngresos > 0 ? ((mktIngresos - mktCostos) / mktIngresos) * 100 : 0,
      transacciones: mktTx,
      por_mes: mktPorMes.map((v, i) => ({ mes: i + 1, ingresos: v })),
    },
  ];

  return { data: result, error: null };
}

export async function getRentabilidadPorPlataforma(): Promise<{ data: RentabilidadPlataforma[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_transacciones")
    .select("plataforma, monto_bruto, comision_nl_bruta, comision_nl_neta, iva_comision, costo_plataforma, costo_tbk, estado");

  if (error) return { data: [], error: error.message };

  const mapa: Record<string, RentabilidadPlataforma> = {};

  for (const t of data || []) {
    if (t.estado === "ANULADO") continue;
    const plat = t.plataforma || "TBK";
    if (!mapa[plat]) {
      mapa[plat] = {
        plataforma: plat,
        transacciones: 0,
        monto_bruto: 0,
        comision_nl_bruta: 0,
        comision_nl_neta: 0,
        iva_comision: 0,
        costo_plataforma: 0,
        rentabilidad_neta: 0,
        margen_pct: 0,
      };
    }
    const r = mapa[plat];
    r.transacciones++;
    r.monto_bruto += Number(t.monto_bruto) || 0;
    r.comision_nl_bruta += Number(t.comision_nl_bruta) || 0;
    r.comision_nl_neta += Number(t.comision_nl_neta) || 0;
    r.iva_comision += Number(t.iva_comision) || 0;
    r.costo_plataforma += Number(t.costo_plataforma) || Number(t.costo_tbk) || 0;
  }

  for (const r of Object.values(mapa)) {
    r.rentabilidad_neta = r.comision_nl_neta - r.costo_plataforma;
    r.margen_pct = r.monto_bruto > 0 ? (r.rentabilidad_neta / r.monto_bruto) * 100 : 0;
  }

  return { data: Object.values(mapa), error: null };
}

export async function recalcularCostos() {
  await requireRol("admin");
  const supabase = await createClient();
  const tasas = await getTasas();

  const { data, error } = await supabase
    .from("marketplace_transacciones")
    .select("id, monto_bruto, plataforma, card_type");

  if (error) return { error: error.message, actualizados: 0 };

  let actualizados = 0;
  for (const t of data || []) {
    const desglose = calcularDesglose(Number(t.monto_bruto), tasas.comisionNL);
    const costoPlat = calcularCostoPlataforma(Number(t.monto_bruto), t.plataforma || "TBK", t.card_type || "", tasas);
    const { error: updErr } = await supabase
      .from("marketplace_transacciones")
      .update({
        base_receptor: desglose.base_receptor,
        comision_nl_bruta: desglose.comision_nl_bruta,
        comision_nl_neta: desglose.comision_nl_neta,
        iva_comision: desglose.iva_comision,
        costo_plataforma: costoPlat,
        costo_tbk: costoPlat,
      })
      .eq("id", t.id);
    if (!updErr) actualizados++;
  }

  revalidatePath("/comercial/marketplace");
  return { error: null, actualizados };
}
