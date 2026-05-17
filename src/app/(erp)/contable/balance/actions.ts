"use server";

import { createClient } from "@/lib/supabase/server";

export type FilaBalance = {
  codigo: string;
  nombre: string;
  tipo: string;
  nivel: number;
  debitos: number;
  creditos: number;
  deudor: number;
  acreedor: number;
  activo: number;
  pasivo: number;
  perdida: number;
  ganancia: number;
};

export type BalanceResult = {
  filas: FilaBalance[];
  totales: {
    debitos: number;
    creditos: number;
    deudor: number;
    acreedor: number;
    activo: number;
    pasivo: number;
    perdida: number;
    ganancia: number;
  };
  pgActivo: number;
  pgPasivo: number;
  pgPerdida: number;
  pgGanancia: number;
};

export async function getBalance(anio: number, mesHasta: number): Promise<{ data: BalanceResult; error: string | null }> {
  const supabase = await createClient();

  const { data: cuentas } = await supabase
    .from("plan_cuentas")
    .select("codigo, nombre, tipo, nivel, estado")
    .eq("estado", "S")
    .order("codigo");

  if (!cuentas) return { data: emptyResult(), error: "Error cargando plan de cuentas" };

  const { data: movs } = await supabase
    .from("mov_contables")
    .select("cuenta_codigo, debe, haber, comprobantes!inner(mes, anio, estado)")
    .eq("comprobantes.anio", anio)
    .eq("comprobantes.estado", "VIGENTE")
    .lte("comprobantes.mes", mesHasta);

  const acum = new Map<string, { debe: number; haber: number }>();

  for (const m of movs || []) {
    const codigo = m.cuenta_codigo;
    if (!acum.has(codigo)) acum.set(codigo, { debe: 0, haber: 0 });
    const a = acum.get(codigo)!;
    a.debe += Number(m.debe) || 0;
    a.haber += Number(m.haber) || 0;
  }

  const filasMap = new Map<string, FilaBalance>();

  for (const [codigo, a] of acum) {
    const cta = cuentas.find((c) => c.codigo === codigo);
    if (!cta) continue;

    const neto = a.debe - a.haber;
    const deudor = neto > 0 ? neto : 0;
    const acreedor = neto < 0 ? Math.abs(neto) : 0;

    const esBalanceSheet = ["A", "P", "T"].includes(cta.tipo);
    const esResultado = ["I", "G"].includes(cta.tipo);

    filasMap.set(codigo, {
      codigo,
      nombre: cta.nombre,
      tipo: cta.tipo,
      nivel: cta.nivel,
      debitos: a.debe,
      creditos: a.haber,
      deudor,
      acreedor,
      activo: esBalanceSheet ? deudor : 0,
      pasivo: esBalanceSheet ? acreedor : 0,
      perdida: esResultado ? deudor : 0,
      ganancia: esResultado ? acreedor : 0,
    });
  }

  for (const cta of cuentas) {
    if (cta.nivel >= 4) continue;
    const prefix = cta.codigo;
    let tot = { debe: 0, haber: 0 };

    for (const [cod, fila] of filasMap) {
      if (cod.startsWith(prefix) && cod !== prefix && fila.nivel === 4) {
        tot.debe += fila.debitos;
        tot.haber += fila.creditos;
      }
    }

    const debeAcum = tot.debe;
    const haberAcum = tot.haber;

    if (debeAcum > 0 || haberAcum > 0) {
      const neto = debeAcum - haberAcum;
      const deudor = neto > 0 ? neto : 0;
      const acreedor = neto < 0 ? Math.abs(neto) : 0;
      const esBS = ["A", "P", "T"].includes(cta.tipo);
      const esRes = ["I", "G"].includes(cta.tipo);

      filasMap.set(prefix, {
        codigo: prefix,
        nombre: cta.nombre,
        tipo: cta.tipo,
        nivel: cta.nivel,
        debitos: debeAcum,
        creditos: haberAcum,
        deudor,
        acreedor,
        activo: esBS ? deudor : 0,
        pasivo: esBS ? acreedor : 0,
        perdida: esRes ? deudor : 0,
        ganancia: esRes ? acreedor : 0,
      });
    }
  }

  const filas = Array.from(filasMap.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));

  const n4 = filas.filter((f) => f.nivel === 4);
  const totales = {
    debitos: n4.reduce((s, f) => s + f.debitos, 0),
    creditos: n4.reduce((s, f) => s + f.creditos, 0),
    deudor: n4.reduce((s, f) => s + f.deudor, 0),
    acreedor: n4.reduce((s, f) => s + f.acreedor, 0),
    activo: n4.reduce((s, f) => s + f.activo, 0),
    pasivo: n4.reduce((s, f) => s + f.pasivo, 0),
    perdida: n4.reduce((s, f) => s + f.perdida, 0),
    ganancia: n4.reduce((s, f) => s + f.ganancia, 0),
  };

  const resultado = totales.ganancia - totales.perdida;
  let pgActivo = 0, pgPasivo = 0, pgPerdida = 0, pgGanancia = 0;

  if (resultado >= 0) {
    pgPasivo = resultado;
    pgPerdida = resultado;
  } else {
    pgActivo = Math.abs(resultado);
    pgGanancia = Math.abs(resultado);
  }

  return { data: { filas, totales, pgActivo, pgPasivo, pgPerdida, pgGanancia }, error: null };
}

function emptyResult(): BalanceResult {
  return {
    filas: [],
    totales: { debitos: 0, creditos: 0, deudor: 0, acreedor: 0, activo: 0, pasivo: 0, perdida: 0, ganancia: 0 },
    pgActivo: 0, pgPasivo: 0, pgPerdida: 0, pgGanancia: 0,
  };
}
