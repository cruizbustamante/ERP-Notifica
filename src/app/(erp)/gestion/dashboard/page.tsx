import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();
  const anio = new Date().getFullYear();
  const mes = new Date().getMonth() + 1;

  const [
    { data: movs },
    { data: ventasSii },
    { data: comprasSii },
    { data: cartola },
    { data: cuentas },
  ] = await Promise.all([
    supabase
      .from("mov_contables")
      .select("cuenta_codigo, debe, haber, comprobantes!inner(anio, mes, estado)")
      .eq("comprobantes.anio", anio)
      .eq("comprobantes.estado", "VIGENTE"),
    supabase
      .from("ventas_sii")
      .select("mes, monto_total, tipo_dte, centralizado")
      .eq("anio", anio),
    supabase
      .from("compras_sii")
      .select("mes, monto_total, tipo_dte, centralizado")
      .eq("anio", anio),
    supabase
      .from("cartolas")
      .select("mes, monto, tipo, cargo_abono, contabilizado")
      .eq("anio", anio),
    supabase
      .from("plan_cuentas")
      .select("codigo, nombre, tipo")
      .eq("nivel", 4)
      .eq("estado", "S"),
  ]);

  const cuentaTipoMap: Record<string, string> = {};
  for (const c of cuentas || []) cuentaTipoMap[c.codigo] = c.tipo;

  // Calcular ingresos y gastos por mes
  const ingresosPorMes: number[] = Array(12).fill(0);
  const gastosPorMes: number[] = Array(12).fill(0);

  for (const m of movs || []) {
    const comp = m.comprobantes as unknown as { mes: number };
    const tipo = cuentaTipoMap[m.cuenta_codigo];
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;
    if (tipo === "I") ingresosPorMes[comp.mes - 1] += haber - debe;
    if (tipo === "G") gastosPorMes[comp.mes - 1] += debe - haber;
  }

  // Ventas SII por mes
  const ventasPorMes: number[] = Array(12).fill(0);
  const noCentralizadosVentas = { cant: 0, monto: 0 };
  for (const v of ventasSii || []) {
    if (v.mes >= 1 && v.mes <= 12) {
      const dtes_nc = [61, 111];
      const signo = dtes_nc.includes(v.tipo_dte) ? -1 : 1;
      ventasPorMes[v.mes - 1] += (Number(v.monto_total) || 0) * signo;
      if (!v.centralizado) {
        noCentralizadosVentas.cant++;
        noCentralizadosVentas.monto += (Number(v.monto_total) || 0) * signo;
      }
    }
  }

  // Compras SII
  const noCentralizadosCompras = { cant: 0, monto: 0 };
  for (const c of comprasSii || []) {
    if (!c.centralizado) {
      const dtes_nc = [61, 111];
      const signo = dtes_nc.includes(c.tipo_dte) ? -1 : 1;
      noCentralizadosCompras.cant++;
      noCentralizadosCompras.monto += (Number(c.monto_total) || 0) * signo;
    }
  }

  // Cartola pendiente
  const cartolaPend = { cant: 0, abonos: 0, cargos: 0 };
  for (const c of cartola || []) {
    if (!c.contabilizado) {
      cartolaPend.cant++;
      const monto = Math.abs(Number(c.monto) || 0);
      if (c.tipo === "ABONO" || c.cargo_abono === "ABONO") cartolaPend.abonos += monto;
      else cartolaPend.cargos += monto;
    }
  }

  const totalIngresos = ingresosPorMes.reduce((a, b) => a + b, 0);
  const totalGastos = gastosPorMes.reduce((a, b) => a + b, 0);
  const totalVentas = ventasPorMes.reduce((a, b) => a + b, 0);

  return (
    <DashboardClient
      anio={anio}
      mes={mes}
      ingresosPorMes={ingresosPorMes}
      gastosPorMes={gastosPorMes}
      ventasPorMes={ventasPorMes}
      totalIngresos={totalIngresos}
      totalGastos={totalGastos}
      totalVentas={totalVentas}
      noCentralizadosVentas={noCentralizadosVentas}
      noCentralizadosCompras={noCentralizadosCompras}
      cartolaPend={cartolaPend}
    />
  );
}
