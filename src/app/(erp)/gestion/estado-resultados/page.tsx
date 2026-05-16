import { createClient } from "@/lib/supabase/server";
import EstadoResultadosClient from "./EstadoResultadosClient";

export default async function EstadoResultadosPage() {
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

  type FilaEERR = { codigo: string; nombre: string; tipo: string; nivel: number; porMes: number[]; total: number };
  const filaMap = new Map<string, FilaEERR>();

  // Inicializar cuentas nivel 4
  for (const c of cuentas || []) {
    if (c.nivel === 4) {
      filaMap.set(c.codigo, { codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, nivel: c.nivel, porMes: Array(12).fill(0), total: 0 });
    }
  }

  // Acumular movimientos
  for (const m of movs || []) {
    const fila = filaMap.get(m.cuenta_codigo);
    if (!fila) continue;
    const comp = m.comprobantes as unknown as { mes: number };
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;
    const saldo = fila.tipo === "I" ? haber - debe : debe - haber;
    fila.porMes[comp.mes - 1] += saldo;
    fila.total += saldo;
  }

  // Filtrar cuentas con movimiento
  const filasConMov = Array.from(filaMap.values()).filter((f) => f.total !== 0 || f.porMes.some((v) => v !== 0));

  // Acumular a niveles superiores
  for (const c of cuentas || []) {
    if (c.nivel >= 4) continue;
    const prefix = c.codigo;
    const porMes = Array(12).fill(0);
    let total = 0;
    for (const fila of filasConMov) {
      if (fila.codigo.startsWith(prefix)) {
        for (let i = 0; i < 12; i++) porMes[i] += fila.porMes[i];
        total += fila.total;
      }
    }
    if (total !== 0) {
      filaMap.set(prefix, { codigo: prefix, nombre: c.nombre, tipo: c.tipo, nivel: c.nivel, porMes, total });
    }
  }

  const filas = Array.from(filaMap.values())
    .filter((f) => f.total !== 0 || f.porMes.some((v) => v !== 0))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  const totalIngresos = filas.filter((f) => f.tipo === "I" && f.nivel === 4).reduce((s, f) => s + f.total, 0);
  const totalGastos = filas.filter((f) => f.tipo === "G" && f.nivel === 4).reduce((s, f) => s + f.total, 0);

  return (
    <EstadoResultadosClient
      anio={anio}
      filas={filas}
      totalIngresos={totalIngresos}
      totalGastos={totalGastos}
    />
  );
}
