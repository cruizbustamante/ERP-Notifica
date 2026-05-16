import { createClient } from "@/lib/supabase/server";
import SituacionClient from "./SituacionClient";

export default async function SituacionFinancieraPage() {
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

  type FilaBG = { codigo: string; nombre: string; tipo: string; nivel: number; saldo: number };
  const saldosPorCuenta = new Map<string, number>();

  const cuentaMap = new Map((cuentas || []).map((c) => [c.codigo, c]));

  for (const m of movs || []) {
    const cta = cuentaMap.get(m.cuenta_codigo);
    if (!cta) continue;
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;
    const deudor = cta.tipo === "A" || cta.tipo === "G";
    const saldo = deudor ? debe - haber : haber - debe;
    saldosPorCuenta.set(m.cuenta_codigo, (saldosPorCuenta.get(m.cuenta_codigo) || 0) + saldo);
  }

  const filaMap = new Map<string, FilaBG>();

  // Nivel 4
  for (const [codigo, saldo] of saldosPorCuenta) {
    const cta = cuentaMap.get(codigo);
    if (!cta || cta.nivel !== 4) continue;
    if (Math.abs(saldo) < 1) continue;
    filaMap.set(codigo, { codigo, nombre: cta.nombre, tipo: cta.tipo, nivel: cta.nivel, saldo });
  }

  // Acumular niveles superiores
  for (const cta of cuentas || []) {
    if (cta.nivel >= 4) continue;
    let total = 0;
    for (const [cod, fila] of filaMap) {
      if (cod.startsWith(cta.codigo) && cod !== cta.codigo && fila.nivel === 4) {
        total += fila.saldo;
      }
    }
    if (Math.abs(total) >= 1) {
      filaMap.set(cta.codigo, { codigo: cta.codigo, nombre: cta.nombre, tipo: cta.tipo, nivel: cta.nivel, saldo: total });
    }
  }

  // Calcular resultado del ejercicio (ingresos - gastos)
  const resultadoEjercicio = Array.from(filaMap.values())
    .filter((f) => f.nivel === 4 && f.tipo === "I")
    .reduce((s, f) => s + f.saldo, 0)
    - Array.from(filaMap.values())
      .filter((f) => f.nivel === 4 && f.tipo === "G")
      .reduce((s, f) => s + f.saldo, 0);

  const filas = Array.from(filaMap.values())
    .filter((f) => ["A", "P", "T"].includes(f.tipo))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  const totalActivo = filas.filter((f) => f.tipo === "A" && f.nivel === 4).reduce((s, f) => s + f.saldo, 0);
  const totalPasivo = filas.filter((f) => f.tipo === "P" && f.nivel === 4).reduce((s, f) => s + f.saldo, 0);
  const totalPatrimonio = filas.filter((f) => f.tipo === "T" && f.nivel === 4).reduce((s, f) => s + f.saldo, 0);

  return (
    <SituacionClient
      anio={anio}
      filas={filas}
      totalActivo={totalActivo}
      totalPasivo={totalPasivo}
      totalPatrimonio={totalPatrimonio}
      resultadoEjercicio={resultadoEjercicio}
    />
  );
}
