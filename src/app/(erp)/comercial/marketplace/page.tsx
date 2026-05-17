import { createClient } from "@/lib/supabase/server";
import MarketplaceClient from "./MarketplaceClient";

export default async function MarketplacePage() {
  const supabase = await createClient();
  const anio = new Date().getFullYear();

  const [{ data: transacciones }, { data: receptores }, { data: allTx }] = await Promise.all([
    supabase
      .from("marketplace_transacciones")
      .select("*")
      .order("fecha_transaccion", { ascending: false })
      .limit(500),
    supabase
      .from("marketplace_transacciones")
      .select("receptor_rut, receptor_nombre")
      .limit(1000),
    supabase
      .from("marketplace_transacciones")
      .select("fecha_transaccion, monto_bruto, base_receptor, comision_nl_bruta, comision_nl_neta, iva_comision, costo_plataforma, costo_tbk, plataforma, estado, boleta_emitida, boleta_folio"),
  ]);

  const receptoresUnicos = Array.from(
    new Map(
      (receptores || []).map((r) => [r.receptor_rut, { rut: r.receptor_rut, nombre: r.receptor_nombre || r.receptor_rut }])
    ).values()
  );

  // Pre-compute CFO KPIs
  let totalVentas = 0, totalComBruta = 0, totalComNeta = 0, totalIva = 0;
  let totalCosto = 0, totalBase = 0, totalTx = 0, boletasPend = 0;
  const porMes: Record<number, { ventas: number; margen: number; tx: number }> = {};

  for (const t of allTx || []) {
    if (t.estado === "ANULADO") continue;
    const fecha = new Date(t.fecha_transaccion);
    if (fecha.getFullYear() !== anio) continue;
    const m = fecha.getMonth() + 1;
    totalTx++;
    totalVentas += Number(t.monto_bruto) || 0;
    totalBase += Number(t.base_receptor) || 0;
    totalComBruta += Number(t.comision_nl_bruta) || 0;
    totalComNeta += Number(t.comision_nl_neta) || 0;
    totalIva += Number(t.iva_comision) || 0;
    const costo = Number(t.costo_plataforma) || Number(t.costo_tbk) || 0;
    totalCosto += costo;
    if (!t.boleta_emitida) boletasPend++;
    if (!porMes[m]) porMes[m] = { ventas: 0, margen: 0, tx: 0 };
    porMes[m].ventas += Number(t.monto_bruto) || 0;
    porMes[m].margen += (Number(t.comision_nl_neta) || 0) - costo;
    porMes[m].tx++;
  }

  const totalMargen = totalComNeta - totalCosto;

  const kpis = {
    totalVentas, totalComBruta, totalComNeta, totalIva,
    totalCosto, totalBase, totalMargen, totalTx, boletasPend,
    ticketPromedio: totalTx > 0 ? Math.round(totalVentas / totalTx) : 0,
    margenPct: totalVentas > 0 ? (totalMargen / totalVentas) * 100 : 0,
    costoPct: totalVentas > 0 ? (totalCosto / totalVentas) * 100 : 0,
    margenPorTx: totalTx > 0 ? Math.round(totalMargen / totalTx) : 0,
    porMes: Object.entries(porMes).map(([m, v]) => ({ mes: Number(m), ...v })).sort((a, b) => a.mes - b.mes),
  };

  return (
    <MarketplaceClient
      transaccionesIniciales={transacciones || []}
      receptores={receptoresUnicos}
      kpis={kpis}
      anio={anio}
    />
  );
}
