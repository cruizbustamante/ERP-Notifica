import { createClient } from "@/lib/supabase/server";
import IndicadoresClient from "./IndicadoresClient";

export default async function IndicadoresPage() {
  const supabase = await createClient();
  const anio = new Date().getFullYear();

  const [{ data: movs }, { data: cuentas }] = await Promise.all([
    supabase
      .from("mov_contables")
      .select("cuenta_codigo, debe, haber, comprobantes!inner(anio, estado)")
      .eq("comprobantes.anio", anio)
      .eq("comprobantes.estado", "VIGENTE"),
    supabase
      .from("plan_cuentas")
      .select("codigo, nombre, tipo, nivel")
      .eq("estado", "S")
      .order("codigo"),
  ]);

  const cuentaMap = new Map((cuentas || []).map((c) => [c.codigo, c]));
  const saldos = new Map<string, number>();

  for (const m of movs || []) {
    const cta = cuentaMap.get(m.cuenta_codigo);
    if (!cta || cta.nivel !== 4) continue;
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;
    const deudor = cta.tipo === "A" || cta.tipo === "G";
    const saldo = deudor ? debe - haber : haber - debe;
    saldos.set(m.cuenta_codigo, (saldos.get(m.cuenta_codigo) || 0) + saldo);
  }

  // Clasificar por tipo y nivel 1 (corriente vs no corriente)
  // Nivel 1 = X (primer dígito del código)
  // Activos: 1-1 = corriente, 1-2 = no corriente
  // Pasivos: 2-1 = corriente, 2-2 = no corriente
  let activoCorriente = 0;
  let activoNoCorriente = 0;
  let pasivoCorriente = 0;
  let pasivoNoCorriente = 0;
  let patrimonio = 0;
  let ingresos = 0;
  let gastos = 0;

  for (const [codigo, saldo] of saldos) {
    const cta = cuentaMap.get(codigo);
    if (!cta) continue;
    const grupo = codigo.substring(0, 3); // e.g. "1-1", "1-2", "2-1"

    switch (cta.tipo) {
      case "A":
        if (grupo === "1-1") activoCorriente += saldo;
        else activoNoCorriente += saldo;
        break;
      case "P":
        if (grupo === "2-1") pasivoCorriente += saldo;
        else pasivoNoCorriente += saldo;
        break;
      case "T":
        patrimonio += saldo;
        break;
      case "I":
        ingresos += saldo;
        break;
      case "G":
        gastos += saldo;
        break;
    }
  }

  const resultado = ingresos - gastos;
  const totalActivo = activoCorriente + activoNoCorriente;
  const totalPasivo = pasivoCorriente + pasivoNoCorriente;

  type Indicador = { nombre: string; valor: number; formato: "pct" | "ratio" | "monto" | "dias"; color: string; descripcion: string };
  const indicadores: Indicador[] = [];

  // Liquidez corriente
  indicadores.push({
    nombre: "Liquidez Corriente",
    valor: pasivoCorriente > 0 ? activoCorriente / pasivoCorriente : 0,
    formato: "ratio",
    color: "text-blue-600",
    descripcion: "Activo Corriente / Pasivo Corriente. Ideal > 1.0",
  });

  // Prueba ácida (sin inventarios, para servicios es = liquidez corriente)
  indicadores.push({
    nombre: "Capital de Trabajo",
    valor: activoCorriente - pasivoCorriente,
    formato: "monto",
    color: "text-blue-600",
    descripcion: "Activo Corriente − Pasivo Corriente",
  });

  // Endeudamiento
  const patrimonioTotal = patrimonio + resultado;
  indicadores.push({
    nombre: "Endeudamiento",
    valor: patrimonioTotal > 0 ? totalPasivo / patrimonioTotal : 0,
    formato: "ratio",
    color: "text-red-600",
    descripcion: "Pasivo Total / Patrimonio. Ideal < 1.0",
  });

  // Solvencia
  indicadores.push({
    nombre: "Solvencia",
    valor: totalPasivo > 0 ? totalActivo / totalPasivo : 0,
    formato: "ratio",
    color: "text-green-600",
    descripcion: "Activo Total / Pasivo Total. Ideal > 1.5",
  });

  // Margen neto
  indicadores.push({
    nombre: "Margen Neto",
    valor: ingresos > 0 ? (resultado / ingresos) * 100 : 0,
    formato: "pct",
    color: "text-green-600",
    descripcion: "Resultado / Ingresos × 100",
  });

  // ROE
  indicadores.push({
    nombre: "ROE",
    valor: patrimonioTotal > 0 ? (resultado / patrimonioTotal) * 100 : 0,
    formato: "pct",
    color: "text-purple-600",
    descripcion: "Resultado / Patrimonio × 100. Retorno sobre el patrimonio",
  });

  // ROA
  indicadores.push({
    nombre: "ROA",
    valor: totalActivo > 0 ? (resultado / totalActivo) * 100 : 0,
    formato: "pct",
    color: "text-blue-600",
    descripcion: "Resultado / Activo Total × 100. Retorno sobre activos",
  });

  // Autonomía financiera
  indicadores.push({
    nombre: "Autonomía Financiera",
    valor: totalActivo > 0 ? (patrimonioTotal / totalActivo) * 100 : 0,
    formato: "pct",
    color: "text-purple-600",
    descripcion: "Patrimonio / Activo Total × 100. Independencia financiera",
  });

  return (
    <IndicadoresClient
      anio={anio}
      indicadores={indicadores}
      activoCorriente={activoCorriente}
      activoNoCorriente={activoNoCorriente}
      pasivoCorriente={pasivoCorriente}
      pasivoNoCorriente={pasivoNoCorriente}
      patrimonio={patrimonio}
      ingresos={ingresos}
      gastos={gastos}
      resultado={resultado}
    />
  );
}
