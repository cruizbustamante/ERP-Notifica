"use server";

import { createClient } from "@/lib/supabase/server";

export type FilaBalance = {
  codigo: string;
  nombre: string;
  tipo: string;
  nivel: number;
  debeAnterior: number;
  haberAnterior: number;
  debePeriodo: number;
  haberPeriodo: number;
  debeAcumulado: number;
  haberAcumulado: number;
  saldoDeudor: number;
  saldoAcreedor: number;
};

export async function getBalance(anio: number, mesHasta: number) {
  const supabase = await createClient();

  // Todas las cuentas
  const { data: cuentas } = await supabase
    .from("plan_cuentas")
    .select("codigo, nombre, tipo, nivel, estado")
    .eq("estado", "S")
    .order("codigo");

  if (!cuentas) return { data: [], error: "Error cargando plan de cuentas" };

  // Movimientos del año hasta mesHasta
  const { data: movs } = await supabase
    .from("mov_contables")
    .select("cuenta_codigo, debe, haber, comprobantes!inner(mes, anio, estado)")
    .eq("comprobantes.anio", anio)
    .eq("comprobantes.estado", "VIGENTE")
    .lte("comprobantes.mes", mesHasta);

  // Separar anterior (mes < mesHasta si mesHasta > 1) vs periodo (mes == mesHasta)
  type Acum = { debeAnt: number; haberAnt: number; debePer: number; haberPer: number };
  const acum = new Map<string, Acum>();

  for (const m of movs || []) {
    const comp = m.comprobantes as unknown as { mes: number };
    const codigo = m.cuenta_codigo;
    if (!acum.has(codigo)) acum.set(codigo, { debeAnt: 0, haberAnt: 0, debePer: 0, haberPer: 0 });
    const a = acum.get(codigo)!;
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;

    if (comp.mes < mesHasta) {
      a.debeAnt += debe;
      a.haberAnt += haber;
    } else {
      a.debePer += debe;
      a.haberPer += haber;
    }
  }

  // Construir filas para cuentas nivel 4 con movimiento, luego acumular a niveles superiores
  const filasMap = new Map<string, FilaBalance>();

  // Inicializar cuentas de movimiento (nivel 4)
  for (const [codigo, a] of acum) {
    const cta = cuentas.find((c) => c.codigo === codigo);
    if (!cta) continue;

    const debeAcum = a.debeAnt + a.debePer;
    const haberAcum = a.haberAnt + a.haberPer;
    const neto = debeAcum - haberAcum;

    filasMap.set(codigo, {
      codigo,
      nombre: cta.nombre,
      tipo: cta.tipo,
      nivel: cta.nivel,
      debeAnterior: a.debeAnt,
      haberAnterior: a.haberAnt,
      debePeriodo: a.debePer,
      haberPeriodo: a.haberPer,
      debeAcumulado: debeAcum,
      haberAcumulado: haberAcum,
      saldoDeudor: neto > 0 ? neto : 0,
      saldoAcreedor: neto < 0 ? Math.abs(neto) : 0,
    });
  }

  // Acumular a niveles superiores (3, 2, 1)
  for (const cta of cuentas) {
    if (cta.nivel >= 4) continue;
    const prefix = cta.codigo;
    let tot = { debeAnt: 0, haberAnt: 0, debePer: 0, haberPer: 0 };

    for (const [cod, fila] of filasMap) {
      if (cod.startsWith(prefix) && cod !== prefix && fila.nivel === 4) {
        tot.debeAnt += fila.debeAnterior;
        tot.haberAnt += fila.haberAnterior;
        tot.debePer += fila.debePeriodo;
        tot.haberPer += fila.haberPeriodo;
      }
    }

    const debeAcum = tot.debeAnt + tot.debePer;
    const haberAcum = tot.haberAnt + tot.haberPer;
    const neto = debeAcum - haberAcum;

    if (debeAcum > 0 || haberAcum > 0) {
      filasMap.set(prefix, {
        codigo: prefix,
        nombre: cta.nombre,
        tipo: cta.tipo,
        nivel: cta.nivel,
        debeAnterior: tot.debeAnt,
        haberAnterior: tot.haberAnt,
        debePeriodo: tot.debePer,
        haberPeriodo: tot.haberPer,
        debeAcumulado: debeAcum,
        haberAcumulado: haberAcum,
        saldoDeudor: neto > 0 ? neto : 0,
        saldoAcreedor: neto < 0 ? Math.abs(neto) : 0,
      });
    }
  }

  const filas = Array.from(filasMap.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
  return { data: filas, error: null };
}
