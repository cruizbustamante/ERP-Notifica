import { createClient } from "@/lib/supabase/server";
import ConciliacionClient from "./ConciliacionClient";

export default async function ConciliacionPage() {
  const supabase = await createClient();
  const currentYear = new Date().getFullYear();

  const [{ data: periodos }, { data: cuentas }, { data: auxiliares }, { data: cartolasRaw }] =
    await Promise.all([
      supabase.from("periodos").select("anio, estado").order("anio", { ascending: false }),
      supabase.from("plan_cuentas").select("codigo, nombre, tipo, usa_auxiliar, usa_documento").eq("nivel", 4).eq("estado", "S").order("codigo"),
      supabase.from("auxiliares").select("rut, razon_social").eq("estado", "S").order("razon_social"),
      supabase.from("cartolas").select("id, fecha, monto, saldo, cargo_abono, contabilizado, mes, descripcion").eq("anio", currentYear).order("fecha", { ascending: false }),
    ]);

  const movimientos = cartolasRaw || [];
  const ultimoSaldo = movimientos.length > 0 ? Number(movimientos[0].saldo) : 0;
  const pendientes = movimientos.filter((m) => !m.contabilizado);
  const contabilizados = movimientos.filter((m) => m.contabilizado);

  const totalAbonos = movimientos.filter((m) => m.cargo_abono === "A").reduce((s, m) => s + Math.abs(Number(m.monto)), 0);
  const totalCargos = movimientos.filter((m) => m.cargo_abono === "C").reduce((s, m) => s + Math.abs(Number(m.monto)), 0);

  // Resumen por mes
  const porMes: Record<number, { abonos: number; cargos: number; pend: number; cont: number }> = {};
  for (const m of movimientos) {
    const mes = m.mes || 1;
    if (!porMes[mes]) porMes[mes] = { abonos: 0, cargos: 0, pend: 0, cont: 0 };
    const monto = Math.abs(Number(m.monto));
    if (m.contabilizado) porMes[mes].cont++;
    else {
      porMes[mes].pend++;
      if (m.cargo_abono === "A") porMes[mes].abonos += monto;
      else porMes[mes].cargos += monto;
    }
  }

  return (
    <ConciliacionClient
      periodos={periodos || []}
      cuentas={cuentas || []}
      auxiliares={auxiliares || []}
      currentYear={currentYear}
      dashboard={{
        saldo: ultimoSaldo,
        totalMovs: movimientos.length,
        pendientes: pendientes.length,
        contabilizados: contabilizados.length,
        totalAbonos,
        totalCargos,
        porMes,
      }}
    />
  );
}
