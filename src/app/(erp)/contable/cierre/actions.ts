"use server";

import { createClient } from "@/lib/supabase/server";
import { crearComprobante } from "../comprobantes/actions";
import { revalidatePath } from "next/cache";

export type PreviewCierre = {
  anio: number;
  totalIngresos: number;
  totalGastos: number;
  resultado: number;
  cuentasIngreso: { codigo: string; nombre: string; saldo: number }[];
  cuentasGasto: { codigo: string; nombre: string; saldo: number }[];
};

export type PreviewApertura = {
  anioOrigen: number;
  anioDestino: number;
  cuentas: { codigo: string; nombre: string; tipo: string; saldo: number }[];
  totalDebe: number;
  totalHaber: number;
};

export async function getPeriodos() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("periodos")
    .select("*")
    .order("anio", { ascending: false });
  return data || [];
}

export async function crearPeriodo(anio: number) {
  const supabase = await createClient();

  const { data: existe } = await supabase
    .from("periodos")
    .select("anio")
    .eq("anio", anio)
    .single();

  if (existe) return { error: `Período ${anio} ya existe` };

  const { error } = await supabase
    .from("periodos")
    .insert({ anio, estado: "ABIERTO" });

  if (error) return { error: error.message };

  revalidatePath("/contable/cierre");
  return { error: null };
}

export async function previsualizarCierre(anio: number): Promise<{ data: PreviewCierre | null; error: string | null }> {
  const supabase = await createClient();

  const { data: periodo } = await supabase
    .from("periodos")
    .select("anio, estado")
    .eq("anio", anio)
    .single();

  if (!periodo) return { data: null, error: "Período no encontrado" };
  if (periodo.estado !== "ABIERTO") return { data: null, error: "Período no está abierto" };

  // Get all movements for the year
  const { data: movs } = await supabase
    .from("mov_contables")
    .select("cuenta_codigo, debe, haber, comprobantes!inner(anio, estado)")
    .eq("comprobantes.anio", anio)
    .eq("comprobantes.estado", "VIGENTE");

  // Get income and expense accounts
  const { data: cuentas } = await supabase
    .from("plan_cuentas")
    .select("codigo, nombre, tipo")
    .eq("nivel", 4)
    .eq("estado", "S")
    .in("tipo", ["I", "G"]);

  const cuentaMap = new Map((cuentas || []).map((c) => [c.codigo, c]));

  // Calculate balances by account
  const saldosPorCuenta = new Map<string, number>();
  for (const m of movs || []) {
    const cuenta = cuentaMap.get(m.cuenta_codigo);
    if (!cuenta) continue;
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;
    const saldo = cuenta.tipo === "G" ? debe - haber : haber - debe;
    saldosPorCuenta.set(m.cuenta_codigo, (saldosPorCuenta.get(m.cuenta_codigo) || 0) + saldo);
  }

  const cuentasIngreso: { codigo: string; nombre: string; saldo: number }[] = [];
  const cuentasGasto: { codigo: string; nombre: string; saldo: number }[] = [];
  let totalIngresos = 0;
  let totalGastos = 0;

  for (const [codigo, saldo] of saldosPorCuenta) {
    if (Math.abs(saldo) < 1) continue;
    const cuenta = cuentaMap.get(codigo);
    if (!cuenta) continue;
    if (cuenta.tipo === "I") {
      cuentasIngreso.push({ codigo, nombre: cuenta.nombre, saldo });
      totalIngresos += saldo;
    } else if (cuenta.tipo === "G") {
      cuentasGasto.push({ codigo, nombre: cuenta.nombre, saldo });
      totalGastos += saldo;
    }
  }

  cuentasIngreso.sort((a, b) => a.codigo.localeCompare(b.codigo));
  cuentasGasto.sort((a, b) => a.codigo.localeCompare(b.codigo));

  return {
    data: {
      anio,
      totalIngresos,
      totalGastos,
      resultado: totalIngresos - totalGastos,
      cuentasIngreso,
      cuentasGasto,
    },
    error: null,
  };
}

export async function previsualizarApertura(anioOrigen: number): Promise<{ data: PreviewApertura | null; error: string | null }> {
  const supabase = await createClient();
  const anioDestino = anioOrigen + 1;

  const { data: periodoOrigen } = await supabase
    .from("periodos")
    .select("estado")
    .eq("anio", anioOrigen)
    .single();

  if (!periodoOrigen || periodoOrigen.estado !== "CERRADO") {
    return { data: null, error: `Período ${anioOrigen} debe estar cerrado para generar apertura` };
  }

  // Check if apertura already exists
  const { count } = await supabase
    .from("comprobantes")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "A")
    .eq("anio", anioDestino);

  if (count && count > 0) {
    return { data: null, error: `Ya existe comprobante de apertura para ${anioDestino}` };
  }

  // Get all movements for the closed year (including the cierre comprobante)
  const { data: movs } = await supabase
    .from("mov_contables")
    .select("cuenta_codigo, debe, haber, comprobantes!inner(anio, estado)")
    .eq("comprobantes.anio", anioOrigen)
    .eq("comprobantes.estado", "VIGENTE");

  const { data: cuentas } = await supabase
    .from("plan_cuentas")
    .select("codigo, nombre, tipo, nivel")
    .eq("nivel", 4)
    .eq("estado", "S")
    .in("tipo", ["A", "P", "T"]);

  const cuentaMap = new Map((cuentas || []).map((c) => [c.codigo, c]));
  const saldos = new Map<string, number>();

  for (const m of movs || []) {
    const cuenta = cuentaMap.get(m.cuenta_codigo);
    if (!cuenta) continue;
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;
    const deudor = cuenta.tipo === "A";
    const saldo = deudor ? debe - haber : haber - debe;
    saldos.set(m.cuenta_codigo, (saldos.get(m.cuenta_codigo) || 0) + saldo);
  }

  const cuentasPreview: { codigo: string; nombre: string; tipo: string; saldo: number }[] = [];
  let totalDebe = 0;
  let totalHaber = 0;

  for (const [codigo, saldo] of saldos) {
    if (Math.abs(saldo) < 1) continue;
    const cuenta = cuentaMap.get(codigo);
    if (!cuenta) continue;
    const deudor = cuenta.tipo === "A";
    cuentasPreview.push({ codigo, nombre: cuenta.nombre, tipo: cuenta.tipo, saldo });
    if (deudor) {
      if (saldo >= 0) totalDebe += saldo;
      else totalHaber += Math.abs(saldo);
    } else {
      if (saldo >= 0) totalHaber += saldo;
      else totalDebe += Math.abs(saldo);
    }
  }

  cuentasPreview.sort((a, b) => a.codigo.localeCompare(b.codigo));

  return {
    data: { anioOrigen, anioDestino, cuentas: cuentasPreview, totalDebe, totalHaber },
    error: null,
  };
}

export async function cerrarPeriodo(anio: number) {
  const supabase = await createClient();

  const { data: periodo } = await supabase
    .from("periodos")
    .select("anio, estado")
    .eq("anio", anio)
    .single();

  if (!periodo) return { error: "Período no encontrado" };
  if (periodo.estado !== "ABIERTO") return { error: "Período no está abierto" };

  // Verificar que no haya comprobantes pendientes de cuadratura
  const { data: comps } = await supabase
    .from("comprobantes")
    .select("id, numero, tipo")
    .eq("anio", anio)
    .eq("estado", "VIGENTE");

  if (!comps || comps.length === 0) {
    return { error: "No hay comprobantes en el período. No se puede cerrar un período vacío." };
  }

  // Calcular resultado del ejercicio
  const { data: movs } = await supabase
    .from("mov_contables")
    .select("cuenta_codigo, debe, haber, comprobantes!inner(anio, estado)")
    .eq("comprobantes.anio", anio)
    .eq("comprobantes.estado", "VIGENTE");

  const { data: cuentas } = await supabase
    .from("plan_cuentas")
    .select("codigo, tipo")
    .in("tipo", ["I", "G"]);

  const cuentasResultado = new Set((cuentas || []).map((c) => c.codigo));
  const cuentaTipoMap = new Map((cuentas || []).map((c) => [c.codigo, c.tipo]));

  let totalIngresos = 0;
  let totalGastos = 0;

  for (const m of movs || []) {
    if (!cuentasResultado.has(m.cuenta_codigo)) continue;
    const tipo = cuentaTipoMap.get(m.cuenta_codigo);
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;
    if (tipo === "I") {
      totalIngresos += haber - debe;
    } else if (tipo === "G") {
      totalGastos += debe - haber;
    }
  }

  const resultado = totalIngresos - totalGastos;

  // Crear comprobante de cierre: saldar cuentas I y G contra Resultado del Ejercicio
  const lineasCierre: { cuenta_codigo: string; debe: number; haber: number; glosa: string; auxiliar_rut: string; tipo_doc: string; num_doc: string; fecha_doc: string | null; referencia: string }[] = [];

  // Acumular saldos por cuenta
  const saldosPorCuenta = new Map<string, number>();
  for (const m of movs || []) {
    if (!cuentasResultado.has(m.cuenta_codigo)) continue;
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;
    const tipo = cuentaTipoMap.get(m.cuenta_codigo);
    const saldo = tipo === "G" ? debe - haber : haber - debe;
    saldosPorCuenta.set(m.cuenta_codigo, (saldosPorCuenta.get(m.cuenta_codigo) || 0) + saldo);
  }

  for (const [codigo, saldo] of saldosPorCuenta) {
    if (Math.abs(saldo) < 1) continue;
    const tipo = cuentaTipoMap.get(codigo);
    lineasCierre.push({
      cuenta_codigo: codigo,
      debe: tipo === "I" ? Math.abs(saldo) : 0,
      haber: tipo === "G" ? Math.abs(saldo) : 0,
      glosa: `Cierre ${anio}`,
      auxiliar_rut: "", tipo_doc: "", num_doc: "", fecha_doc: null, referencia: "",
    });
  }

  // Línea Resultado del Ejercicio
  const ctaResultado = "3-3-01-001";
  if (lineasCierre.length > 0) {
    lineasCierre.push({
      cuenta_codigo: ctaResultado,
      debe: resultado < 0 ? Math.abs(resultado) : 0,
      haber: resultado > 0 ? resultado : 0,
      glosa: `Resultado del ejercicio ${anio}`,
      auxiliar_rut: "", tipo_doc: "", num_doc: "", fecha_doc: null, referencia: "",
    });

    const resCierre = await crearComprobante({
      tipo: "C",
      fecha: `${anio}-12-31`,
      glosa: `CIERRE EJERCICIO ${anio}`,
      lineas: lineasCierre,
    });

    if (resCierre.error) return { error: `Error creando comprobante de cierre: ${resCierre.error}` };
  }

  // Cerrar período
  await supabase
    .from("periodos")
    .update({ estado: "CERRADO", fecha_cierre: `${anio}-12-31` })
    .eq("anio", anio);

  revalidatePath("/contable/cierre");
  return { error: null, resultado };
}

export async function generarApertura(anioOrigen: number) {
  const supabase = await createClient();
  const anioDestino = anioOrigen + 1;

  // Verificar origen cerrado
  const { data: periodoOrigen } = await supabase
    .from("periodos")
    .select("estado")
    .eq("anio", anioOrigen)
    .single();

  if (!periodoOrigen || periodoOrigen.estado !== "CERRADO") {
    return { error: `Período ${anioOrigen} debe estar cerrado` };
  }

  // Verificar/crear destino
  const { data: periodoDestino } = await supabase
    .from("periodos")
    .select("estado")
    .eq("anio", anioDestino)
    .single();

  if (!periodoDestino) {
    await supabase.from("periodos").insert({ anio: anioDestino, estado: "ABIERTO", fecha_apertura: `${anioDestino}-01-01` });
  } else if (periodoDestino.estado !== "ABIERTO") {
    return { error: `Período ${anioDestino} no está abierto` };
  }

  // Verificar que no exista comprobante de apertura
  const { count } = await supabase
    .from("comprobantes")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "A")
    .eq("anio", anioDestino);

  if (count && count > 0) {
    return { error: `Ya existe comprobante de apertura para ${anioDestino}` };
  }

  // Calcular saldos de cuentas patrimoniales (A, P, T)
  const { data: movs } = await supabase
    .from("mov_contables")
    .select("cuenta_codigo, debe, haber, comprobantes!inner(anio, estado)")
    .eq("comprobantes.anio", anioOrigen)
    .eq("comprobantes.estado", "VIGENTE");

  const { data: cuentas } = await supabase
    .from("plan_cuentas")
    .select("codigo, tipo, nivel")
    .eq("nivel", 4)
    .eq("estado", "S")
    .in("tipo", ["A", "P", "T"]);

  const cuentaMap = new Map((cuentas || []).map((c) => [c.codigo, c.tipo]));
  const saldos = new Map<string, number>();

  for (const m of movs || []) {
    const tipo = cuentaMap.get(m.cuenta_codigo);
    if (!tipo) continue;
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;
    const deudor = tipo === "A";
    const saldo = deudor ? debe - haber : haber - debe;
    saldos.set(m.cuenta_codigo, (saldos.get(m.cuenta_codigo) || 0) + saldo);
  }

  const lineas: { cuenta_codigo: string; debe: number; haber: number; glosa: string; auxiliar_rut: string; tipo_doc: string; num_doc: string; fecha_doc: string | null; referencia: string }[] = [];

  for (const [codigo, saldo] of saldos) {
    if (Math.abs(saldo) < 1) continue;
    const tipo = cuentaMap.get(codigo);
    const deudor = tipo === "A";

    lineas.push({
      cuenta_codigo: codigo,
      debe: deudor ? Math.abs(saldo) : (saldo < 0 ? Math.abs(saldo) : 0),
      haber: deudor ? (saldo < 0 ? Math.abs(saldo) : 0) : Math.abs(saldo),
      glosa: `Apertura ${anioDestino}`,
      auxiliar_rut: "", tipo_doc: "", num_doc: "", fecha_doc: null, referencia: "",
    });
  }

  if (lineas.length === 0) {
    return { error: "No hay saldos patrimoniales para traspasar" };
  }

  const res = await crearComprobante({
    tipo: "A",
    fecha: `${anioDestino}-01-01`,
    glosa: `APERTURA EJERCICIO ${anioDestino}`,
    lineas,
  });

  if (res.error) return { error: res.error };

  revalidatePath("/contable/cierre");
  return { error: null, comprobante: res.data };
}
