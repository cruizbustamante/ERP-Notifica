import { createClient } from "@/lib/supabase/server";
import FlujoEfectivoClient from "./FlujoEfectivoClient";

export default async function FlujoEfectivoPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const supabase = await createClient();
  const params = await searchParams;
  const currentYear = new Date().getFullYear();
  const anio = params.anio ? Number(params.anio) : currentYear;

  const { data: periodos } = await supabase
    .from("periodos")
    .select("anio, estado")
    .order("anio", { ascending: false });

  const { data: cartolas } = await supabase
    .from("cartolas")
    .select("mes, monto, cargo_abono, tipo, categoria_flujo, contabilizado")
    .eq("anio", anio);

  const categoriaSet = new Set<string>();
  const porCategoriaMes = new Map<string, number[]>();

  let totalAbonos = 0;
  let totalCargos = 0;

  for (const r of cartolas || []) {
    const mes = r.mes;
    if (!mes || mes < 1 || mes > 12) continue;
    const monto = Math.abs(Number(r.monto) || 0);
    const esAbono = r.cargo_abono === "ABONO" || r.tipo === "ABONO";
    const flujo = esAbono ? monto : -monto;

    if (esAbono) totalAbonos += monto;
    else totalCargos += monto;

    const cat = r.categoria_flujo || "SIN CLASIFICAR";
    categoriaSet.add(cat);

    if (!porCategoriaMes.has(cat)) porCategoriaMes.set(cat, Array(12).fill(0));
    porCategoriaMes.get(cat)![mes - 1] += flujo;
  }

  const orden = ["OPERACIONAL", "INVERSIÓN", "FINANCIAMIENTO", "SIN CLASIFICAR"];
  const categorias = Array.from(categoriaSet)
    .sort((a, b) => {
      const ia = orden.indexOf(a);
      const ib = orden.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map((cat) => {
      const porMes = porCategoriaMes.get(cat) || Array(12).fill(0);
      return { categoria: cat, porMes, total: porMes.reduce((s, v) => s + v, 0) };
    });

  // Saldo inicial: saldo del primer movimiento del año anterior o 0
  const { data: saldoIni } = await supabase
    .from("cartolas")
    .select("saldo, monto, cargo_abono, tipo")
    .eq("anio", anio)
    .order("fecha", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);

  let saldoInicial = 0;
  if (saldoIni && saldoIni.length > 0) {
    const first = saldoIni[0];
    const montoFirst = Number(first.monto) || 0;
    const saldoFirst = Number(first.saldo) || 0;
    const esAbono = first.cargo_abono === "ABONO" || first.tipo === "ABONO";
    saldoInicial = esAbono ? saldoFirst - montoFirst : saldoFirst + Math.abs(montoFirst);
  }

  return (
    <FlujoEfectivoClient
      anio={anio}
      periodos={periodos || []}
      categorias={categorias}
      saldoInicial={saldoInicial}
      totalAbonos={totalAbonos}
      totalCargos={totalCargos}
    />
  );
}
