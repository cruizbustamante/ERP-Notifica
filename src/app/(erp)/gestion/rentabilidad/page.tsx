import { createClient } from "@/lib/supabase/server";
import RentabilidadClient from "./RentabilidadClient";

export default async function RentabilidadPage() {
  const supabase = await createClient();
  const anio = new Date().getFullYear();

  const [{ data: movs }, { data: cuentas }] = await Promise.all([
    supabase
      .from("mov_contables")
      .select("cuenta_codigo, debe, haber, comprobantes!inner(anio, mes, estado)")
      .eq("comprobantes.anio", anio)
      .eq("comprobantes.estado", "VIGENTE"),
    supabase
      .from("plan_cuentas")
      .select("codigo, nombre, tipo, nivel")
      .eq("estado", "S")
      .in("tipo", ["I", "G"])
      .order("codigo"),
  ]);

  const cuentaMap = new Map((cuentas || []).map((c) => [c.codigo, c]));

  const ingresosPorMes = Array(12).fill(0);
  const gastosPorMes = Array(12).fill(0);

  // Gastos por grupo (nivel 3)
  const grupoMes = new Map<string, number[]>();
  const grupoTotal = new Map<string, number>();

  for (const m of movs || []) {
    const cta = cuentaMap.get(m.cuenta_codigo);
    if (!cta || cta.nivel !== 4) continue;
    const comp = m.comprobantes as unknown as { mes: number };
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;
    const saldo = cta.tipo === "I" ? haber - debe : debe - haber;
    const mes = comp.mes;

    if (cta.tipo === "I") {
      ingresosPorMes[mes - 1] += saldo;
    } else {
      gastosPorMes[mes - 1] += saldo;

      // Acumular grupo nivel 3
      const grupoCode = cta.codigo.substring(0, 7); // X-X-XX
      if (!grupoMes.has(grupoCode)) grupoMes.set(grupoCode, Array(12).fill(0));
      grupoMes.get(grupoCode)![mes - 1] += saldo;
      grupoTotal.set(grupoCode, (grupoTotal.get(grupoCode) || 0) + saldo);
    }
  }

  // Buscar nombres de grupo nivel 3
  const grupos = Array.from(grupoTotal.entries())
    .filter(([, total]) => Math.abs(total) >= 1)
    .sort((a, b) => b[1] - a[1])
    .map(([codigo, total]) => {
      const ctaGrupo = (cuentas || []).find((c) => c.codigo === codigo);
      return {
        codigo,
        nombre: ctaGrupo?.nombre || codigo,
        porMes: grupoMes.get(codigo) || Array(12).fill(0),
        total,
      };
    });

  const totalIngresos = ingresosPorMes.reduce((s, v) => s + v, 0);
  const totalGastos = gastosPorMes.reduce((s, v) => s + v, 0);

  return (
    <RentabilidadClient
      anio={anio}
      ingresosPorMes={ingresosPorMes}
      gastosPorMes={gastosPorMes}
      totalIngresos={totalIngresos}
      totalGastos={totalGastos}
      grupos={grupos}
    />
  );
}
