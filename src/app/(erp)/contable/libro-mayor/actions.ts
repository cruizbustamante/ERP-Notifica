"use server";

import { createClient } from "@/lib/supabase/server";

export type MovMayor = {
  fecha: string;
  comprobante: string;
  glosa: string;
  debe: number;
  haber: number;
  saldo: number;
  auxiliar_rut: string;
  tipo_doc: string;
  num_doc: string;
};

export type LibroMayorResult = {
  cuenta_codigo: string;
  cuenta_nombre: string;
  cuenta_tipo: string;
  saldo_anterior: number;
  movimientos: MovMayor[];
  total_debe: number;
  total_haber: number;
  saldo_final: number;
};

export async function getLibroMayor(
  cuentaCodigo: string,
  anio: number,
  mesDesde: number,
  mesHasta: number
): Promise<{ data: LibroMayorResult | null; error: string | null }> {
  const supabase = await createClient();

  const { data: cuenta } = await supabase
    .from("plan_cuentas")
    .select("codigo, nombre, tipo")
    .eq("codigo", cuentaCodigo)
    .single();

  if (!cuenta) return { data: null, error: "Cuenta no encontrada" };

  const deudor = cuenta.tipo === "A" || cuenta.tipo === "G";

  // Saldo anterior: movimientos del mismo año pero meses anteriores a mesDesde
  // + movimientos de años anteriores (simplificado: solo apertura del año en curso)
  let saldoAnterior = 0;

  if (mesDesde > 1) {
    const { data: movsAnt } = await supabase
      .from("mov_contables")
      .select("debe, haber, comprobantes!inner(anio, mes, estado)")
      .eq("cuenta_codigo", cuentaCodigo)
      .eq("comprobantes.anio", anio)
      .eq("comprobantes.estado", "VIGENTE")
      .lt("comprobantes.mes", mesDesde);

    for (const m of movsAnt || []) {
      saldoAnterior += deudor
        ? Number(m.debe) - Number(m.haber)
        : Number(m.haber) - Number(m.debe);
    }
  }

  // Movimientos del rango seleccionado
  const { data: movs } = await supabase
    .from("mov_contables")
    .select("debe, haber, glosa, auxiliar_rut, tipo_doc, num_doc, comprobantes!inner(numero, tipo, fecha, anio, mes, estado)")
    .eq("cuenta_codigo", cuentaCodigo)
    .eq("comprobantes.anio", anio)
    .eq("comprobantes.estado", "VIGENTE")
    .gte("comprobantes.mes", mesDesde)
    .lte("comprobantes.mes", mesHasta)
    .order("comprobantes(fecha)")
    .order("comprobantes(numero)");

  let saldoAcum = saldoAnterior;
  let totalDebe = 0;
  let totalHaber = 0;

  const movimientos: MovMayor[] = (movs || []).map((m) => {
    const comp = m.comprobantes as unknown as { numero: number; tipo: string; fecha: string };
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;
    totalDebe += debe;
    totalHaber += haber;
    saldoAcum += deudor ? debe - haber : haber - debe;

    return {
      fecha: comp.fecha,
      comprobante: `${comp.tipo}-${comp.numero}`,
      glosa: m.glosa || "",
      debe,
      haber,
      saldo: saldoAcum,
      auxiliar_rut: m.auxiliar_rut || "",
      tipo_doc: m.tipo_doc || "",
      num_doc: m.num_doc || "",
    };
  });

  return {
    data: {
      cuenta_codigo: cuenta.codigo,
      cuenta_nombre: cuenta.nombre,
      cuenta_tipo: cuenta.tipo,
      saldo_anterior: saldoAnterior,
      movimientos,
      total_debe: totalDebe,
      total_haber: totalHaber,
      saldo_final: saldoAcum,
    },
    error: null,
  };
}

export type CuentaMayor = {
  cuenta_codigo: string;
  cuenta_nombre: string;
  cuenta_tipo: string;
  saldo_anterior: number;
  movimientos: MovMayor[];
  total_debe: number;
  total_haber: number;
  saldo_final: number;
};

export async function getLibroMayorCompleto(
  anio: number,
  mesDesde: number,
  mesHasta: number
): Promise<{ data: CuentaMayor[]; error: string | null }> {
  const supabase = await createClient();

  const { data: cuentasConMov } = await supabase
    .from("mov_contables")
    .select("cuenta_codigo, comprobantes!inner(anio, estado)")
    .eq("comprobantes.anio", anio)
    .eq("comprobantes.estado", "VIGENTE");

  const codigos = [...new Set((cuentasConMov || []).map((m) => m.cuenta_codigo))];
  if (codigos.length === 0) return { data: [], error: null };

  const { data: cuentas } = await supabase
    .from("plan_cuentas")
    .select("codigo, nombre, tipo")
    .in("codigo", codigos)
    .order("codigo");

  if (!cuentas || cuentas.length === 0) return { data: [], error: null };

  const results: CuentaMayor[] = [];

  for (const cuenta of cuentas) {
    const deudor = cuenta.tipo === "A" || cuenta.tipo === "G";
    let saldoAnterior = 0;

    if (mesDesde > 1) {
      const { data: movsAnt } = await supabase
        .from("mov_contables")
        .select("debe, haber, comprobantes!inner(anio, mes, estado)")
        .eq("cuenta_codigo", cuenta.codigo)
        .eq("comprobantes.anio", anio)
        .eq("comprobantes.estado", "VIGENTE")
        .lt("comprobantes.mes", mesDesde);

      for (const m of movsAnt || []) {
        saldoAnterior += deudor
          ? Number(m.debe) - Number(m.haber)
          : Number(m.haber) - Number(m.debe);
      }
    }

    const { data: movs } = await supabase
      .from("mov_contables")
      .select("debe, haber, glosa, auxiliar_rut, tipo_doc, num_doc, comprobantes!inner(numero, tipo, fecha, anio, mes, estado)")
      .eq("cuenta_codigo", cuenta.codigo)
      .eq("comprobantes.anio", anio)
      .eq("comprobantes.estado", "VIGENTE")
      .gte("comprobantes.mes", mesDesde)
      .lte("comprobantes.mes", mesHasta)
      .order("comprobantes(fecha)")
      .order("comprobantes(numero)");

    let saldoAcum = saldoAnterior;
    let totalDebe = 0;
    let totalHaber = 0;

    const movimientos: MovMayor[] = (movs || []).map((m) => {
      const comp = m.comprobantes as unknown as { numero: number; tipo: string; fecha: string };
      const debe = Number(m.debe) || 0;
      const haber = Number(m.haber) || 0;
      totalDebe += debe;
      totalHaber += haber;
      saldoAcum += deudor ? debe - haber : haber - debe;
      return {
        fecha: comp.fecha,
        comprobante: `${comp.tipo}-${comp.numero}`,
        glosa: m.glosa || "",
        debe,
        haber,
        saldo: saldoAcum,
        auxiliar_rut: m.auxiliar_rut || "",
        tipo_doc: m.tipo_doc || "",
        num_doc: m.num_doc || "",
      };
    });

    if (movimientos.length > 0 || saldoAnterior !== 0) {
      results.push({
        cuenta_codigo: cuenta.codigo,
        cuenta_nombre: cuenta.nombre,
        cuenta_tipo: cuenta.tipo,
        saldo_anterior: saldoAnterior,
        movimientos,
        total_debe: totalDebe,
        total_haber: totalHaber,
        saldo_final: saldoAcum,
      });
    }
  }

  return { data: results, error: null };
}

export async function getCuentasConMovimientos(anio: number) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("mov_contables")
    .select("cuenta_codigo, comprobantes!inner(anio, estado)")
    .eq("comprobantes.anio", anio)
    .eq("comprobantes.estado", "VIGENTE");

  const codigos = [...new Set((data || []).map((m) => m.cuenta_codigo))];

  if (codigos.length === 0) return [];

  const { data: cuentas } = await supabase
    .from("plan_cuentas")
    .select("codigo, nombre, tipo")
    .in("codigo", codigos)
    .order("codigo");

  return cuentas || [];
}
