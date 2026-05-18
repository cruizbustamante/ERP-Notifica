"use server";

import { createClient } from "@/lib/supabase/server";
import { crearComprobante } from "../comprobantes/actions";
import { revalidatePath } from "next/cache";
import { requireRol } from "@/lib/auth";

export type PreviewCierre = {
  anio: number;
  totalIngresos: number;
  totalGastos: number;
  resultado: number;
  cuentasIngreso: { codigo: string; nombre: string; saldo: number }[];
  cuentasGasto: { codigo: string; nombre: string; saldo: number }[];
};

export type PreviewAperturaLinea = {
  codigo: string;
  nombre: string;
  tipo: string;
  saldo: number;
  auxiliar_rut: string;
  auxiliar_nombre: string;
};

export type PreviewApertura = {
  anioOrigen: number;
  anioDestino: number;
  cuentas: PreviewAperturaLinea[];
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
  await requireRol("admin");
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

  const { count } = await supabase
    .from("comprobantes")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "A")
    .eq("anio", anioDestino);

  if (count && count > 0) {
    return { data: null, error: `Ya existe comprobante de apertura para ${anioDestino}` };
  }

  const { data: movs } = await supabase
    .from("mov_contables")
    .select("cuenta_codigo, auxiliar_rut, debe, haber, comprobantes!inner(anio, estado)")
    .eq("comprobantes.anio", anioOrigen)
    .eq("comprobantes.estado", "VIGENTE");

  const { data: cuentasAPT } = await supabase
    .from("plan_cuentas")
    .select("codigo, nombre, tipo, nivel, usa_auxiliar")
    .eq("nivel", 4)
    .eq("estado", "S")
    .in("tipo", ["A", "P", "T"]);

  const { data: cuentasIG } = await supabase
    .from("plan_cuentas")
    .select("codigo, tipo")
    .in("tipo", ["I", "G"]);

  const cuentaMap = new Map((cuentasAPT || []).map((c) => [c.codigo, c]));
  const cuentaTipoIG = new Map((cuentasIG || []).map((c) => [c.codigo, c.tipo]));

  // A/P/T balances grouped by (cuenta, auxiliar)
  const saldos = new Map<string, number>();
  let totalIngresos = 0;
  let totalGastos = 0;

  for (const m of movs || []) {
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;

    const cuenta = cuentaMap.get(m.cuenta_codigo);
    if (cuenta) {
      const deudor = cuenta.tipo === "A";
      const saldo = deudor ? debe - haber : haber - debe;
      const key = cuenta.usa_auxiliar === "X" && m.auxiliar_rut
        ? `${m.cuenta_codigo}|${m.auxiliar_rut}`
        : m.cuenta_codigo;
      saldos.set(key, (saldos.get(key) || 0) + saldo);
    }

    const tipoIG = cuentaTipoIG.get(m.cuenta_codigo);
    if (tipoIG === "I") totalIngresos += haber - debe;
    else if (tipoIG === "G") totalGastos += debe - haber;
  }

  // Excluir cuentas 3-3 (resultado del ejercicio) del traslado directo
  for (const key of [...saldos.keys()]) {
    if (key.startsWith("3-3")) saldos.delete(key);
  }

  // Resultado I-G → Resultados Acumulados
  const resultado = totalIngresos - totalGastos;
  const ctaAcum = "3-2-01-001";
  if (Math.abs(resultado) >= 1) {
    saldos.set(ctaAcum, (saldos.get(ctaAcum) || 0) + resultado);
    if (!cuentaMap.has(ctaAcum)) {
      const { data: ctaRes } = await supabase
        .from("plan_cuentas")
        .select("codigo, nombre, tipo, nivel, usa_auxiliar")
        .eq("codigo", ctaAcum)
        .single();
      if (ctaRes) cuentaMap.set(ctaAcum, ctaRes);
    }
  }

  // Fetch auxiliar names for display
  const rutsUsados = new Set<string>();
  for (const key of saldos.keys()) {
    const parts = key.split("|");
    if (parts.length === 2 && parts[1]) rutsUsados.add(parts[1]);
  }
  const auxMap = new Map<string, string>();
  if (rutsUsados.size > 0) {
    const { data: auxs } = await supabase
      .from("auxiliares")
      .select("rut, razon_social")
      .in("rut", [...rutsUsados]);
    for (const a of auxs || []) auxMap.set(a.rut, a.razon_social);
  }

  const cuentasPreview: PreviewAperturaLinea[] = [];
  let totalDebe = 0;
  let totalHaber = 0;

  for (const [key, saldo] of saldos) {
    if (Math.abs(saldo) < 1) continue;
    const parts = key.split("|");
    const codigo = parts[0];
    const auxRut = parts[1] || "";
    const cuenta = cuentaMap.get(codigo);
    if (!cuenta) continue;
    const deudor = cuenta.tipo === "A";
    cuentasPreview.push({
      codigo,
      nombre: cuenta.nombre,
      tipo: cuenta.tipo,
      saldo,
      auxiliar_rut: auxRut,
      auxiliar_nombre: auxRut ? (auxMap.get(auxRut) || auxRut) : "",
    });
    if (deudor) {
      if (saldo >= 0) totalDebe += saldo;
      else totalHaber += Math.abs(saldo);
    } else {
      if (saldo >= 0) totalHaber += saldo;
      else totalDebe += Math.abs(saldo);
    }
  }

  cuentasPreview.sort((a, b) => a.codigo.localeCompare(b.codigo) || a.auxiliar_rut.localeCompare(b.auxiliar_rut));

  return {
    data: { anioOrigen, anioDestino, cuentas: cuentasPreview, totalDebe, totalHaber },
    error: null,
  };
}

export async function cerrarPeriodo(anio: number) {
  await requireRol("admin");
  const supabase = await createClient();

  const { data: periodo } = await supabase
    .from("periodos")
    .select("anio, estado")
    .eq("anio", anio)
    .single();

  if (!periodo) return { error: "Período no encontrado" };
  if (periodo.estado !== "ABIERTO") return { error: "Período no está abierto" };

  const { data: comps } = await supabase
    .from("comprobantes")
    .select("id")
    .eq("anio", anio)
    .eq("estado", "VIGENTE");

  if (!comps || comps.length === 0) {
    return { error: "No hay comprobantes en el período. No se puede cerrar un período vacío." };
  }

  // Calcular resultado del ejercicio (informativo)
  const { data: movs } = await supabase
    .from("mov_contables")
    .select("cuenta_codigo, debe, haber, comprobantes!inner(anio, estado)")
    .eq("comprobantes.anio", anio)
    .eq("comprobantes.estado", "VIGENTE");

  const { data: cuentasIG } = await supabase
    .from("plan_cuentas")
    .select("codigo, tipo")
    .in("tipo", ["I", "G"]);

  const cuentaTipoMap = new Map((cuentasIG || []).map((c) => [c.codigo, c.tipo]));
  let totalIngresos = 0;
  let totalGastos = 0;

  for (const m of movs || []) {
    const tipo = cuentaTipoMap.get(m.cuenta_codigo);
    if (!tipo) continue;
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;
    if (tipo === "I") totalIngresos += haber - debe;
    else if (tipo === "G") totalGastos += debe - haber;
  }

  const resultado = totalIngresos - totalGastos;

  await supabase
    .from("periodos")
    .update({ estado: "CERRADO", fecha_cierre: `${anio}-12-31` })
    .eq("anio", anio);

  revalidatePath("/contable/cierre");
  return { error: null, resultado };
}

export async function generarApertura(anioOrigen: number) {
  await requireRol("admin");
  const supabase = await createClient();
  const anioDestino = anioOrigen + 1;

  const { data: periodoOrigen } = await supabase
    .from("periodos")
    .select("estado")
    .eq("anio", anioOrigen)
    .single();

  if (!periodoOrigen || periodoOrigen.estado !== "CERRADO") {
    return { error: `Período ${anioOrigen} debe estar cerrado` };
  }

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

  const { count } = await supabase
    .from("comprobantes")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "A")
    .eq("anio", anioDestino);

  if (count && count > 0) {
    return { error: `Ya existe comprobante de apertura para ${anioDestino}` };
  }

  const { data: movs } = await supabase
    .from("mov_contables")
    .select("cuenta_codigo, auxiliar_rut, debe, haber, comprobantes!inner(anio, estado)")
    .eq("comprobantes.anio", anioOrigen)
    .eq("comprobantes.estado", "VIGENTE");

  const { data: cuentasAPT } = await supabase
    .from("plan_cuentas")
    .select("codigo, tipo, nivel, usa_auxiliar")
    .eq("nivel", 4)
    .eq("estado", "S")
    .in("tipo", ["A", "P", "T"]);

  const { data: cuentasIG } = await supabase
    .from("plan_cuentas")
    .select("codigo, tipo")
    .in("tipo", ["I", "G"]);

  const cuentaMap = new Map((cuentasAPT || []).map((c) => [c.codigo, c]));
  const cuentaTipoIG = new Map((cuentasIG || []).map((c) => [c.codigo, c.tipo]));

  const saldos = new Map<string, number>();
  let totalIngresos = 0;
  let totalGastos = 0;

  for (const m of movs || []) {
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;

    const cuenta = cuentaMap.get(m.cuenta_codigo);
    if (cuenta) {
      const deudor = cuenta.tipo === "A";
      const saldo = deudor ? debe - haber : haber - debe;
      const key = cuenta.usa_auxiliar === "X" && m.auxiliar_rut
        ? `${m.cuenta_codigo}|${m.auxiliar_rut}`
        : m.cuenta_codigo;
      saldos.set(key, (saldos.get(key) || 0) + saldo);
    }

    const tipoIG = cuentaTipoIG.get(m.cuenta_codigo);
    if (tipoIG === "I") totalIngresos += haber - debe;
    else if (tipoIG === "G") totalGastos += debe - haber;
  }

  // Excluir cuentas 3-3 (resultado del ejercicio) del traslado directo
  for (const key of [...saldos.keys()]) {
    if (key.startsWith("3-3")) saldos.delete(key);
  }

  // Resultado I-G → Resultados Acumulados
  const resultado = totalIngresos - totalGastos;
  const ctaAcum = "3-2-01-001";
  if (Math.abs(resultado) >= 1) {
    saldos.set(ctaAcum, (saldos.get(ctaAcum) || 0) + resultado);
    if (!cuentaMap.has(ctaAcum)) {
      const { data: ctaRes } = await supabase
        .from("plan_cuentas")
        .select("codigo, tipo, nivel, usa_auxiliar")
        .eq("codigo", ctaAcum)
        .single();
      if (ctaRes) cuentaMap.set(ctaAcum, ctaRes);
    }
  }

  const lineas: { cuenta_codigo: string; debe: number; haber: number; glosa: string; auxiliar_rut: string; tipo_doc: string; num_doc: string; fecha_doc: string | null; tipo_doc_ref: string; num_doc_ref: string; categoria_flujo: string }[] = [];

  for (const [key, saldo] of saldos) {
    if (Math.abs(saldo) < 1) continue;
    const parts = key.split("|");
    const codigo = parts[0];
    const auxRut = parts[1] || "";
    const cuenta = cuentaMap.get(codigo);
    if (!cuenta) continue;
    const deudor = cuenta.tipo === "A";

    lineas.push({
      cuenta_codigo: codigo,
      debe: deudor ? (saldo >= 0 ? saldo : 0) : (saldo < 0 ? Math.abs(saldo) : 0),
      haber: deudor ? (saldo < 0 ? Math.abs(saldo) : 0) : (saldo >= 0 ? saldo : 0),
      glosa: `Apertura ${anioDestino}`,
      auxiliar_rut: auxRut, tipo_doc: "", num_doc: "", fecha_doc: null, tipo_doc_ref: "", num_doc_ref: "", categoria_flujo: "",
    });
  }

  if (lineas.length === 0) {
    return { error: "No hay saldos patrimoniales para traspasar" };
  }

  lineas.sort((a, b) => a.cuenta_codigo.localeCompare(b.cuenta_codigo));

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

export async function reabrirPeriodo(anio: number) {
  await requireRol("admin");
  const supabase = await createClient();

  const { data: periodo } = await supabase
    .from("periodos")
    .select("anio, estado")
    .eq("anio", anio)
    .single();

  if (!periodo) return { error: "Período no encontrado" };
  if (periodo.estado !== "CERRADO") return { error: "Solo se puede reabrir un período cerrado" };

  const anioSiguiente = anio + 1;

  // Check if next period is closed — can't reopen if downstream is closed
  const { data: periodoSig } = await supabase
    .from("periodos")
    .select("estado")
    .eq("anio", anioSiguiente)
    .single();

  if (periodoSig && periodoSig.estado === "CERRADO") {
    return { error: `No se puede reabrir ${anio} porque el período ${anioSiguiente} también está cerrado. Reábralo primero.` };
  }

  // Anular comprobante de apertura del año siguiente (tipo A)
  const { data: compApertura } = await supabase
    .from("comprobantes")
    .select("id")
    .eq("tipo", "A")
    .eq("anio", anioSiguiente)
    .eq("estado", "VIGENTE");

  for (const c of compApertura || []) {
    await supabase.from("comprobantes").update({ estado: "ANULADO" }).eq("id", c.id);
  }

  // Reabrir período
  const { error } = await supabase
    .from("periodos")
    .update({ estado: "ABIERTO", fecha_cierre: null })
    .eq("anio", anio);

  if (error) return { error: error.message };

  revalidatePath("/contable/cierre");
  revalidatePath("/contable/comprobantes");
  return { error: null, anulados: { apertura: (compApertura || []).length } };
}
