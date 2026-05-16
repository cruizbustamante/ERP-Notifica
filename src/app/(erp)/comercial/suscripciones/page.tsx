import { createClient } from "@/lib/supabase/server";
import SuscripcionesClient from "./SuscripcionesClient";

export default async function SuscripcionesPage() {
  const supabase = await createClient();
  const anio = new Date().getFullYear();

  const { data: ventas } = await supabase
    .from("ventas_sii")
    .select("rut_receptor, razon_social, monto_total, mes, tipo_dte")
    .eq("anio", anio);

  // Group by client and month
  const clienteMap = new Map<string, { razon_social: string; porMes: number[] }>();

  for (const v of ventas || []) {
    const rut = v.rut_receptor;
    if (!rut || !v.mes) continue;

    const monto = Math.abs(Number(v.monto_total) || 0);
    const isNC = [61, 111].includes(v.tipo_dte);
    const valor = isNC ? -monto : monto;

    let cliente = clienteMap.get(rut);
    if (!cliente) {
      cliente = { razon_social: v.razon_social || rut, porMes: Array(12).fill(0) };
      clienteMap.set(rut, cliente);
    }
    cliente.porMes[v.mes - 1] += valor;
  }

  const clientes = Array.from(clienteMap.entries())
    .map(([rut, data]) => {
      const mesesActivos = data.porMes.filter((v) => v > 0).length;
      const totalAnio = data.porMes.reduce((s, v) => s + v, 0);
      return {
        rut,
        razon_social: data.razon_social,
        porMes: data.porMes,
        totalAnio,
        mesesActivos,
        promedioMensual: mesesActivos > 0 ? totalAnio / mesesActivos : 0,
        esRecurrente: mesesActivos >= 3,
      };
    })
    .filter((c) => c.totalAnio > 0)
    .sort((a, b) => b.totalAnio - a.totalAnio);

  // MRR per month (only recurring clients)
  const recurrentes = clientes.filter((c) => c.esRecurrente);
  const mrrPorMes = Array(12).fill(0);
  for (const c of recurrentes) {
    for (let i = 0; i < 12; i++) mrrPorMes[i] += c.porMes[i];
  }

  const totalMRR = recurrentes.reduce((s, c) => s + c.totalAnio, 0);

  return (
    <SuscripcionesClient
      anio={anio}
      clientes={clientes}
      mrrPorMes={mrrPorMes}
      totalMRR={totalMRR}
      clientesRecurrentes={recurrentes.length}
      totalClientes={clientes.length}
    />
  );
}
