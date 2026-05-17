import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";
import { getBancos } from "../../contable/conciliacion/actions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const anio = new Date().getFullYear();
  const mes = new Date().getMonth() + 1;
  const bancos = await getBancos();

  const [
    { data: movs },
    { data: ventasSii },
    { data: comprasSii },
    { data: cartola },
    { data: cuentas },
    { data: allCartolas },
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
      .select("mes, monto, tipo, cargo_abono, contabilizado, cuenta_banco")
      .eq("anio", anio),
    supabase
      .from("plan_cuentas")
      .select("codigo, nombre, tipo")
      .eq("nivel", 4)
      .eq("estado", "S"),
    supabase
      .from("cartolas")
      .select("monto, cargo_abono, cuenta_banco"),
  ]);

  const cuentaTipoMap: Record<string, string> = {};
  for (const c of cuentas || []) cuentaTipoMap[c.codigo] = c.tipo;

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

  const noCentralizadosCompras = { cant: 0, monto: 0 };
  for (const c of comprasSii || []) {
    if (!c.centralizado) {
      const dtes_nc = [61, 111];
      const signo = dtes_nc.includes(c.tipo_dte) ? -1 : 1;
      noCentralizadosCompras.cant++;
      noCentralizadosCompras.monto += (Number(c.monto_total) || 0) * signo;
    }
  }

  const cartolaPend = { cant: 0, abonos: 0, cargos: 0 };
  for (const c of cartola || []) {
    if (!c.contabilizado) {
      cartolaPend.cant++;
      const monto = Math.abs(Number(c.monto) || 0);
      if (c.tipo === "ABONO" || c.cargo_abono === "A") cartolaPend.abonos += monto;
      else cartolaPend.cargos += monto;
    }
  }

  // Saldos por banco
  const saldoMap: Record<string, { saldo: number; pendientes: number }> = {};
  for (const b of bancos) saldoMap[b.id] = { saldo: 0, pendientes: 0 };

  for (const c of allCartolas || []) {
    const banco = c.cuenta_banco || "CTE-SANTANDER";
    if (!saldoMap[banco]) saldoMap[banco] = { saldo: 0, pendientes: 0 };
    const monto = Math.abs(Number(c.monto));
    saldoMap[banco].saldo += c.cargo_abono === "A" ? monto : -monto;
  }

  for (const c of cartola || []) {
    if (!c.contabilizado) {
      const banco = c.cuenta_banco || "CTE-SANTANDER";
      if (saldoMap[banco]) saldoMap[banco].pendientes++;
    }
  }

  const saldosBanco = bancos.map((b) => ({
    nombre: b.nombre,
    saldo: saldoMap[b.id]?.saldo || 0,
    pendientes: saldoMap[b.id]?.pendientes || 0,
  }));

  const saldoConsolidado = saldosBanco.reduce((s, b) => s + b.saldo, 0);

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
      saldosBanco={saldosBanco}
      saldoConsolidado={saldoConsolidado}
    />
  );
}
