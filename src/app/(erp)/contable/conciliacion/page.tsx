import { createClient } from "@/lib/supabase/server";
import ConciliacionClient from "./ConciliacionClient";
import { getBancos } from "./actions";

export default async function ConciliacionPage() {
  const supabase = await createClient();
  const currentYear = new Date().getFullYear();
  const bancos = await getBancos();

  const [{ data: periodos }, { data: cuentas }, { data: auxiliares }, { data: cartolasRaw }, { data: allCartolas }, { data: categoriasFlujo }] =
    await Promise.all([
      supabase.from("periodos").select("anio, estado").order("anio", { ascending: false }),
      supabase.from("plan_cuentas").select("codigo, nombre, tipo, usa_auxiliar, usa_documento").eq("nivel", 4).eq("estado", "S").order("codigo"),
      supabase.from("auxiliares").select("rut, razon_social").eq("estado", "S").order("razon_social"),
      supabase.from("cartolas").select("id, fecha, monto, saldo, cargo_abono, contabilizado, mes, descripcion, cuenta_banco").eq("anio", currentYear).order("fecha", { ascending: false }),
      supabase.from("cartolas").select("monto, cargo_abono, cuenta_banco"),
      supabase.from("categoria_flujo").select("id, codigo, nombre, tipo, flujo, orden").eq("estado", "S").order("orden"),
    ]);

  const movimientos = cartolasRaw || [];
  const allMovs = allCartolas || [];

  type SaldoBanco = { saldo: number; totalMovs: number; pendientes: number; contabilizados: number; totalAbonos: number; totalCargos: number };
  const saldosPorBanco: Record<string, SaldoBanco> = {};

  for (const b of bancos) {
    const bancMovs = allMovs.filter((m) => m.cuenta_banco === b.id);
    saldosPorBanco[b.id] = {
      saldo: bancMovs.reduce((s, m) => {
        const monto = Math.abs(Number(m.monto));
        return s + (m.cargo_abono === "A" ? monto : -monto);
      }, 0),
      totalMovs: bancMovs.length,
      pendientes: 0,
      contabilizados: 0,
      totalAbonos: 0,
      totalCargos: 0,
    };
  }

  const porMesPorBanco: Record<string, Record<number, { abonos: number; cargos: number; pend: number; cont: number }>> = {};
  for (const b of bancos) porMesPorBanco[b.id] = {};

  for (const m of movimientos) {
    const banco = m.cuenta_banco || "CTE-SANTANDER";
    const mes = m.mes || 1;
    if (!porMesPorBanco[banco]) porMesPorBanco[banco] = {};
    if (!porMesPorBanco[banco][mes]) porMesPorBanco[banco][mes] = { abonos: 0, cargos: 0, pend: 0, cont: 0 };
    const monto = Math.abs(Number(m.monto));

    if (saldosPorBanco[banco]) {
      if (m.contabilizado) saldosPorBanco[banco].contabilizados++;
      else saldosPorBanco[banco].pendientes++;
      if (m.cargo_abono === "A") saldosPorBanco[banco].totalAbonos += monto;
      else saldosPorBanco[banco].totalCargos += monto;
    }

    if (m.contabilizado) porMesPorBanco[banco][mes].cont++;
    else {
      porMesPorBanco[banco][mes].pend++;
      if (m.cargo_abono === "A") porMesPorBanco[banco][mes].abonos += monto;
      else porMesPorBanco[banco][mes].cargos += monto;
    }
  }

  const saldoConsolidado = Object.values(saldosPorBanco).reduce((s, b) => s + b.saldo, 0);

  return (
    <ConciliacionClient
      periodos={periodos || []}
      cuentas={cuentas || []}
      auxiliares={auxiliares || []}
      categoriasFlujo={categoriasFlujo || []}
      currentYear={currentYear}
      bancos={bancos}
      saldosPorBanco={saldosPorBanco}
      saldoConsolidado={saldoConsolidado}
      porMesPorBanco={porMesPorBanco}
    />
  );
}
