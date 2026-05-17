"use server";

import { createClient } from "@/lib/supabase/server";
import { crearComprobante } from "../comprobantes/actions";
import { revalidatePath } from "next/cache";
import { normalizeRut } from "@/lib/rut";
import { requireRol } from "@/lib/auth";

const MAPA_DTE: Record<number, string> = {
  33: "FAC", 34: "FEX", 39: "BV", 41: "BVE",
  46: "FC", 48: "VT", 52: "GD", 56: "ND", 61: "NC",
  110: "FEX", 111: "NCE", 112: "NDE",
};

const DTES_NOTA_CREDITO = [61, 111];
const DTES_NOTA_DEBITO = [56, 112];

function esNC(dte: number) { return DTES_NOTA_CREDITO.includes(dte); }
function esND(dte: number) { return DTES_NOTA_DEBITO.includes(dte); }

async function getConfig() {
  const supabase = await createClient();
  const { data } = await supabase.from("config").select("clave, valor");
  const map: Record<string, string> = {};
  for (const r of data || []) map[r.clave] = r.valor;
  return map;
}

// ─── Tipos exportados ──────────────────────────────────────────────────

export type TipoLibro = "ventas" | "compras" | "honorarios" | "transbank";

export type DocPendiente = {
  id: number;
  tipo_dte: number;
  tipo_dte_nombre: string;
  folio: string;
  rut: string;
  razon_social: string;
  fecha_emision: string | null;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
  monto_exento: number;
  esNC: boolean;
  esND: boolean;
  ref_tipo: string;
  ref_folio: string;
};

export type DocHonorario = {
  id: number;
  rut: string;
  razon_social: string;
  folio: string;
  fecha_emision: string | null;
  monto_bruto: number;
  retencion: number;
  monto_liquido: number;
};

export type DocTransbank = {
  id: number;
  fecha: string | null;
  numero_operacion: string;
  tipo_tarjeta: string;
  monto_bruto: number;
  comision: number;
  iva_comision: number;
  monto_neto: number;
};

type MesData = { pendiente: number; centralizado: number; cantPend: number; cantCent: number; neto: number; iva: number };
type Historial = { id: number; tipo: string; periodo: string; fecha: string; comprobante_id: number; registros: number; total_debe: number; total_haber: number; estado: string; anio: number; mes: number };

// ─── Reglas de centralización ──────────────────────────────────────────

export type ReglaCentralizacion = {
  id: number;
  tipo: string;
  rut: string;
  razon_social: string;
  cuenta_codigo: string;
  descripcion: string;
  estado: string;
};

export async function getReglas(tipo?: string) {
  const supabase = await createClient();
  let query = supabase.from("reglas_centralizacion").select("*").eq("estado", "S");
  if (tipo) query = query.eq("tipo", tipo.toUpperCase());
  const { data } = await query.order("razon_social");
  return (data || []) as ReglaCentralizacion[];
}

export async function upsertRegla(data: {
  id?: number;
  tipo: string;
  rut: string;
  razon_social: string;
  cuenta_codigo: string;
  descripcion: string;
}) {
  await requireRol("contador");
  const supabase = await createClient();
  if (data.id) {
    const { error } = await supabase.from("reglas_centralizacion").update(data).eq("id", data.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("reglas_centralizacion").insert(data);
    if (error) return { error: error.message };
  }
  revalidatePath("/contable/centralizacion");
  return { error: null };
}

export async function deleteRegla(id: number) {
  await requireRol("contador");
  const supabase = await createClient();
  const { error } = await supabase.from("reglas_centralizacion").update({ estado: "N" }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/contable/centralizacion");
  return { error: null };
}

// ─── Resumen por mes ────────────────────────────────────────────────────

export async function getResumenCentralizacion(anio: number) {
  const supabase = await createClient();

  const [{ data: ventas }, { data: compras }, { data: honorarios }, { data: transbank }, { data: historial }] = await Promise.all([
    supabase.from("ventas_sii").select("mes, monto_neto, monto_iva, monto_total, tipo_dte, centralizado").eq("anio", anio),
    supabase.from("compras_sii").select("mes, monto_neto, monto_iva, monto_total, tipo_dte, centralizado").eq("anio", anio),
    supabase.from("honorarios_sii").select("mes, monto_bruto, retencion, monto_liquido, centralizado").eq("anio", anio),
    supabase.from("transbank_vouchers").select("mes, monto_bruto, comision, iva_comision, monto_neto, centralizado").eq("anio", anio),
    supabase.from("centralizaciones").select("*").eq("anio", anio).order("created_at", { ascending: false }),
  ]);

  const emptyMes = (): MesData => ({ pendiente: 0, centralizado: 0, cantPend: 0, cantCent: 0, neto: 0, iva: 0 });

  const ventasPorMes: Record<number, MesData> = {};
  const comprasPorMes: Record<number, MesData> = {};
  const honorariosPorMes: Record<number, MesData> = {};
  const transbankPorMes: Record<number, MesData> = {};
  for (let m = 1; m <= 12; m++) { ventasPorMes[m] = emptyMes(); comprasPorMes[m] = emptyMes(); honorariosPorMes[m] = emptyMes(); transbankPorMes[m] = emptyMes(); }

  for (const v of ventas || []) {
    const m = v.mes;
    if (!m || m < 1 || m > 12) continue;
    const signo = esNC(v.tipo_dte) ? -1 : 1;
    const total = (Number(v.monto_total) || 0) * signo;
    const neto = (Number(v.monto_neto) || 0) * signo;
    const iva = (Number(v.monto_iva) || 0) * signo;
    if (v.centralizado) { ventasPorMes[m].centralizado += total; ventasPorMes[m].cantCent++; }
    else { ventasPorMes[m].pendiente += total; ventasPorMes[m].cantPend++; ventasPorMes[m].neto += neto; ventasPorMes[m].iva += iva; }
  }

  for (const c of compras || []) {
    const m = c.mes;
    if (!m || m < 1 || m > 12) continue;
    const signo = esNC(c.tipo_dte) ? -1 : 1;
    const total = (Number(c.monto_total) || 0) * signo;
    const neto = (Number(c.monto_neto) || 0) * signo;
    const iva = (Number(c.monto_iva) || 0) * signo;
    if (c.centralizado) { comprasPorMes[m].centralizado += total; comprasPorMes[m].cantCent++; }
    else { comprasPorMes[m].pendiente += total; comprasPorMes[m].cantPend++; comprasPorMes[m].neto += neto; comprasPorMes[m].iva += iva; }
  }

  for (const h of honorarios || []) {
    const m = h.mes;
    if (!m || m < 1 || m > 12) continue;
    const bruto = Number(h.monto_bruto) || 0;
    const ret = Number(h.retencion) || 0;
    if (h.centralizado) { honorariosPorMes[m].centralizado += bruto; honorariosPorMes[m].cantCent++; }
    else { honorariosPorMes[m].pendiente += bruto; honorariosPorMes[m].cantPend++; honorariosPorMes[m].neto += bruto; honorariosPorMes[m].iva += ret; }
  }

  for (const t of transbank || []) {
    const m = t.mes;
    if (!m || m < 1 || m > 12) continue;
    const bruto = Number(t.monto_bruto) || 0;
    const comision = Number(t.comision) || 0;
    const ivaComision = Number(t.iva_comision) || 0;
    if (t.centralizado) { transbankPorMes[m].centralizado += bruto; transbankPorMes[m].cantCent++; }
    else { transbankPorMes[m].pendiente += bruto; transbankPorMes[m].cantPend++; transbankPorMes[m].neto += bruto; transbankPorMes[m].iva += comision + ivaComision; }
  }

  return {
    ventas: ventasPorMes,
    compras: comprasPorMes,
    honorarios: honorariosPorMes,
    transbank: transbankPorMes,
    historial: (historial || []) as Historial[],
  };
}

// ─── Documentos pendientes ──────────────────────────────────────────────

export async function getDocumentosPendientes(tipo: TipoLibro, anio: number, mes: number) {
  const supabase = await createClient();

  if (tipo === "transbank") {
    const { data, error } = await supabase
      .from("transbank_vouchers")
      .select("*")
      .eq("anio", anio)
      .eq("mes", mes)
      .eq("centralizado", false)
      .order("fecha");

    if (error) return { docs: [], docsHon: [], docsTransbank: [], error: error.message };

    const docsTransbank: DocTransbank[] = (data || []).map((r) => ({
      id: r.id,
      fecha: r.fecha,
      numero_operacion: r.numero_operacion || "",
      tipo_tarjeta: r.tipo_tarjeta || "",
      monto_bruto: Number(r.monto_bruto) || 0,
      comision: Number(r.comision) || 0,
      iva_comision: Number(r.iva_comision) || 0,
      monto_neto: Number(r.monto_neto) || 0,
    }));

    return { docs: [], docsHon: [], docsTransbank, error: null };
  }

  if (tipo === "honorarios") {
    const { data, error } = await supabase
      .from("honorarios_sii")
      .select("*")
      .eq("anio", anio)
      .eq("mes", mes)
      .eq("centralizado", false)
      .order("fecha_emision");

    if (error) return { docs: [], docsHon: [], docsTransbank: [], error: error.message };

    const docsHon: DocHonorario[] = (data || []).map((r) => ({
      id: r.id,
      rut: normalizeRut(r.rut_emisor || ""),
      razon_social: r.razon_social || "",
      folio: r.folio || "",
      fecha_emision: r.fecha_emision,
      monto_bruto: Number(r.monto_bruto) || 0,
      retencion: Number(r.retencion) || 0,
      monto_liquido: Number(r.monto_liquido) || 0,
    }));

    return { docs: [], docsHon, docsTransbank: [], error: null };
  }

  const tabla = tipo === "ventas" ? "ventas_sii" : "compras_sii";

  const { data, error } = await supabase
    .from(tabla)
    .select("*")
    .eq("anio", anio)
    .eq("mes", mes)
    .eq("centralizado", false)
    .order("tipo_dte")
    .order("folio");

  if (error) return { docs: [], docsHon: [], docsTransbank: [], error: error.message };

  const docs: DocPendiente[] = (data || []).map((r) => {
    const dte = r.tipo_dte || 33;
    const isNC = esNC(dte);
    const isND = esND(dte);

    let refTipo = "";
    let refFolio = "";
    if ((isNC || isND) && r.tipo_doc_ref && r.folio_doc_ref) {
      refTipo = MAPA_DTE[r.tipo_doc_ref] || String(r.tipo_doc_ref);
      refFolio = r.folio_doc_ref;
    } else if (isNC && r.folio_doc_ref && !r.tipo_doc_ref) {
      refTipo = "FAC";
      refFolio = r.folio_doc_ref;
    }

    return {
      id: r.id,
      tipo_dte: dte,
      tipo_dte_nombre: r.tipo_dte_nombre || MAPA_DTE[dte] || String(dte),
      folio: r.folio || "",
      rut: normalizeRut(tipo === "ventas" ? (r.rut_receptor || "") : (r.rut_emisor || "")),
      razon_social: r.razon_social || "",
      fecha_emision: r.fecha_emision,
      monto_neto: Number(r.monto_neto) || 0,
      monto_iva: Number(r.monto_iva) || 0,
      monto_total: Number(r.monto_total) || 0,
      monto_exento: Number(r.monto_exento) || 0,
      esNC: isNC,
      esND: isND,
      ref_tipo: refTipo,
      ref_folio: refFolio,
    };
  });

  // Completar razón social vacía desde auxiliares
  const rutsSinNombre = [...new Set(docs.filter(d => !d.razon_social).map(d => d.rut).filter(Boolean))];
  if (rutsSinNombre.length > 0) {
    const { data: auxData } = await supabase.from("auxiliares").select("rut, razon_social").in("rut", rutsSinNombre);
    const auxMap = new Map((auxData || []).map(a => [a.rut, a.razon_social]));
    for (const d of docs) {
      if (!d.razon_social && auxMap.has(d.rut)) d.razon_social = auxMap.get(d.rut)!;
    }
  }

  const ordenTipo = (d: DocPendiente) => d.esNC ? 3 : d.esND ? 2 : DTES_NOTA_CREDITO.includes(d.tipo_dte) || DTES_NOTA_DEBITO.includes(d.tipo_dte) ? 2 : d.tipo_dte === 39 || d.tipo_dte === 41 ? 1 : 0;
  docs.sort((a, b) => {
    const oa = ordenTipo(a), ob = ordenTipo(b);
    if (oa !== ob) return oa - ob;
    return parseInt(a.folio) - parseInt(b.folio);
  });

  return { docs, docsHon: [], docsTransbank: [], error: null };
}

// ─── Previsualizar centralización ────────────────────────────────────────

export type LineaPreview = {
  cuenta_codigo: string;
  debe: number;
  haber: number;
  glosa: string;
  auxiliar_rut: string;
  tipo_doc: string;
  num_doc: string;
};

export async function previsualizarCentralizacion(
  tipo: TipoLibro,
  anio: number,
  mes: number,
  cuentaContrapartida: string,
  docIds: number[],
  cuentasPorDoc?: Record<number, string>
): Promise<{ lineas: LineaPreview[]; totalDebe: number; totalHaber: number; error: string | null }> {
  const config = await getConfig();

  if (docIds.length === 0) return { lineas: [], totalDebe: 0, totalHaber: 0, error: "No hay documentos seleccionados" };

  const reglas = await getReglas(tipo.toUpperCase());
  const reglasMap = new Map(reglas.map((r) => [normalizeRut(r.rut), r.cuenta_codigo]));

  type LineaComp = {
    cuenta_codigo: string; debe: number; haber: number; glosa: string;
    auxiliar_rut: string; tipo_doc: string; num_doc: string;
    fecha_doc: string | null; referencia: string;
  };

  let lineas: LineaComp[];

  if (tipo === "transbank") {
    const { docsTransbank, error: docsErr } = await getDocumentosPendientes(tipo, anio, mes);
    if (docsErr) return { lineas: [], totalDebe: 0, totalHaber: 0, error: docsErr };
    const selectedDocs = docsTransbank.filter((d) => docIds.includes(d.id));
    if (selectedDocs.length === 0) return { lineas: [], totalDebe: 0, totalHaber: 0, error: "Sin documentos" };
    lineas = buildLineasTransbank(selectedDocs, config);
  } else if (tipo === "honorarios") {
    const { docsHon, error: docsErr } = await getDocumentosPendientes(tipo, anio, mes);
    if (docsErr) return { lineas: [], totalDebe: 0, totalHaber: 0, error: docsErr };
    const selectedDocs = docsHon.filter((d) => docIds.includes(d.id));
    if (selectedDocs.length === 0) return { lineas: [], totalDebe: 0, totalHaber: 0, error: "Sin documentos" };
    lineas = buildLineasHonorarios(selectedDocs, cuentaContrapartida, config, reglasMap);
  } else {
    const { docs, error: docsErr } = await getDocumentosPendientes(tipo, anio, mes);
    if (docsErr) return { lineas: [], totalDebe: 0, totalHaber: 0, error: docsErr };
    const selectedDocs = docs.filter((d) => docIds.includes(d.id));
    if (selectedDocs.length === 0) return { lineas: [], totalDebe: 0, totalHaber: 0, error: "Sin documentos" };
    if (tipo === "ventas") lineas = buildLineasVentas(selectedDocs, cuentaContrapartida, config, reglasMap);
    else lineas = buildLineasCompras(selectedDocs, cuentaContrapartida, config, reglasMap, cuentasPorDoc);
  }

  let totalDebe = 0, totalHaber = 0;
  for (const l of lineas) { totalDebe += l.debe; totalHaber += l.haber; }

  const preview: LineaPreview[] = lineas.map((l) => ({
    cuenta_codigo: l.cuenta_codigo,
    debe: l.debe,
    haber: l.haber,
    glosa: l.glosa,
    auxiliar_rut: l.auxiliar_rut,
    tipo_doc: l.tipo_doc,
    num_doc: l.num_doc,
  }));

  return { lineas: preview, totalDebe: Math.round(totalDebe), totalHaber: Math.round(totalHaber), error: null };
}

// ─── Centralizar documentos ─────────────────────────────────────────────

export async function centralizarDocumentos(
  tipo: TipoLibro,
  anio: number,
  mes: number,
  cuentaContrapartida: string,
  docIds: number[],
  cuentasPorDoc?: Record<number, string>
) {
  await requireRol("contador");
  const supabase = await createClient();
  const config = await getConfig();

  if (docIds.length === 0) return { error: "No hay documentos seleccionados" };

  // Cargar reglas de cuenta por proveedor/cliente
  const reglas = await getReglas(tipo.toUpperCase());
  const reglasMap = new Map(reglas.map((r) => [normalizeRut(r.rut), r.cuenta_codigo]));

  type LineaComp = {
    cuenta_codigo: string; debe: number; haber: number; glosa: string;
    auxiliar_rut: string; tipo_doc: string; num_doc: string;
    fecha_doc: string | null; referencia: string;
  };

  let lineas: LineaComp[];
  let registros = 0;

  if (tipo === "transbank") {
    const { docsTransbank, error: docsErr } = await getDocumentosPendientes(tipo, anio, mes);
    if (docsErr) return { error: docsErr };
    const selectedDocs = docsTransbank.filter((d) => docIds.includes(d.id));
    if (selectedDocs.length === 0) return { error: "Ningún documento pendiente coincide" };
    registros = selectedDocs.length;

    lineas = buildLineasTransbank(selectedDocs, config);
  } else if (tipo === "honorarios") {
    const { docsHon, error: docsErr } = await getDocumentosPendientes(tipo, anio, mes);
    if (docsErr) return { error: docsErr };
    const selectedDocs = docsHon.filter((d) => docIds.includes(d.id));
    if (selectedDocs.length === 0) return { error: "Ningún documento pendiente coincide" };
    registros = selectedDocs.length;

    // Asegurar auxiliares
    await ensureAuxiliares(supabase, selectedDocs.map((d) => ({ rut: d.rut, razon_social: d.razon_social })), "PROVEEDOR");

    lineas = buildLineasHonorarios(selectedDocs, cuentaContrapartida, config, reglasMap);
  } else {
    const { docs, error: docsErr } = await getDocumentosPendientes(tipo, anio, mes);
    if (docsErr) return { error: docsErr };
    const selectedDocs = docs.filter((d) => docIds.includes(d.id));
    if (selectedDocs.length === 0) return { error: "Ningún documento pendiente coincide" };
    registros = selectedDocs.length;

    // Asegurar auxiliares
    const tipoAux = tipo === "ventas" ? "CLIENTE" : "PROVEEDOR";
    await ensureAuxiliares(supabase, selectedDocs.map((d) => ({ rut: d.rut, razon_social: d.razon_social })), tipoAux);

    if (tipo === "ventas") {
      lineas = buildLineasVentas(selectedDocs, cuentaContrapartida, config, reglasMap);
    } else {
      lineas = buildLineasCompras(selectedDocs, cuentaContrapartida, config, reglasMap, cuentasPorDoc);
    }
  }

  // Verificar cuadratura
  let totalDebe = 0, totalHaber = 0;
  for (const l of lineas) { totalDebe += l.debe; totalHaber += l.haber; }
  if (Math.abs(totalDebe - totalHaber) > 1) {
    return { error: `Descuadre: Debe ${formatCLP(totalDebe)} ≠ Haber ${formatCLP(totalHaber)}` };
  }

  // Último día del mes
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const fecha = `${anio}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  const MESES = ["", "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  const glosa = `CENTRALIZA ${tipo.toUpperCase()} ${MESES[mes]} ${anio}`;

  const result = await crearComprobante({ tipo: "T", fecha, glosa, lineas });
  if (result.error) return { error: result.error };

  // Marcar documentos como centralizados
  const tabla = tipo === "ventas" ? "ventas_sii" : tipo === "compras" ? "compras_sii" : tipo === "honorarios" ? "honorarios_sii" : "transbank_vouchers";
  await supabase
    .from(tabla)
    .update({ centralizado: true, comprobante_id: result.data!.id })
    .in("id", docIds);

  // Registrar en historial
  await supabase.from("centralizaciones").insert({
    tipo: tipo.toUpperCase(),
    periodo: `${anio}-${String(mes).padStart(2, "0")}`,
    fecha,
    comprobante_id: result.data!.id,
    total_debe: Math.round(totalDebe),
    total_haber: Math.round(totalHaber),
    registros,
    usuario: "",
    estado: "ACTIVO",
    anio,
    mes,
  });

  revalidatePath("/contable/centralizacion");
  return {
    data: { comprobante: result.data, documentos: registros, totalDebe: Math.round(totalDebe), totalHaber: Math.round(totalHaber) },
    error: null,
  };
}

// ─── Anular centralización ──────────────────────────────────────────────

export async function anularCentralizacion(centralizacionId: number) {
  await requireRol("contador");
  const supabase = await createClient();

  const { data: cent } = await supabase
    .from("centralizaciones")
    .select("*")
    .eq("id", centralizacionId)
    .single();

  if (!cent) return { error: "Centralización no encontrada" };
  if (cent.estado === "ANULADO") return { error: "Ya está anulada" };

  if (cent.comprobante_id) {
    const { anularComprobante } = await import("../comprobantes/actions");
    const res = await anularComprobante(cent.comprobante_id);
    if (res.error) return { error: `Error anulando comprobante: ${res.error}` };
  }

  // Desmarcar documentos
  const tipo = (cent.tipo || "").toLowerCase();
  const tablaMap: Record<string, string> = { ventas: "ventas_sii", compras: "compras_sii", honorarios: "honorarios_sii", transbank: "transbank_vouchers" };
  const tabla = tablaMap[tipo];
  if (tabla) {
    await supabase
      .from(tabla)
      .update({ centralizado: false, comprobante_id: null })
      .eq("comprobante_id", cent.comprobante_id);
  }

  await supabase.from("centralizaciones").update({ estado: "ANULADO" }).eq("id", centralizacionId);

  revalidatePath("/contable/centralizacion");
  return { error: null };
}

// ─── Eliminar carga pendiente ───────────────────────────────────────────

export async function eliminarCargaPendiente(
  tipo: TipoLibro,
  anio: number,
  mes: number
): Promise<{ eliminados: number; error: string | null }> {
  await requireRol("contador");
  const supabase = await createClient();
  const tablaMap: Record<string, string> = { ventas: "ventas_sii", compras: "compras_sii", honorarios: "honorarios_sii", transbank: "transbank_vouchers" };
  const tabla = tablaMap[tipo];
  if (!tabla) return { eliminados: 0, error: "Tipo no válido" };

  const { data, error } = await supabase
    .from(tabla)
    .delete()
    .eq("anio", anio)
    .eq("mes", mes)
    .eq("centralizado", false)
    .select("id");

  if (error) return { eliminados: 0, error: error.message };

  revalidatePath("/contable/centralizacion");
  return { eliminados: data?.length || 0, error: null };
}

// ─── Cargar Excel SII ───────────────────────────────────────────────────

export async function cargarExcelVentas(registros: Array<{
  tipo_dte: number;
  tipo_dte_nombre: string;
  folio: string;
  rut_receptor: string;
  razon_social: string;
  fecha_emision: string;
  monto_exento: number;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
  tipo_doc_ref?: number;
  folio_doc_ref?: string;
}>) {
  await requireRol("contador");
  const supabase = await createClient();
  const { createHash } = await import("crypto");
  let nuevos = 0, duplicados = 0;
  const errores: string[] = [];

  const records = registros.map((r) => {
    const rutNorm = normalizeRut(r.rut_receptor);
    const huellaStr = `V|${r.tipo_dte}|${r.folio}|${rutNorm}|${r.fecha_emision}|${Math.round(r.monto_total)}`;
    const huella = createHash("md5").update(huellaStr).digest("hex");
    const [year, month] = r.fecha_emision.split("-").map(Number);
    return {
      ...r,
      rut_receptor: rutNorm,
      huella,
      anio: year,
      mes: month,
      centralizado: false,
    };
  });

  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { data, error } = await supabase
      .from("ventas_sii")
      .upsert(batch, { onConflict: "huella", ignoreDuplicates: true })
      .select("id");
    if (error) errores.push(`Lote ${Math.floor(i / 50) + 1}: ${error.message}`);
    else nuevos += data?.length || 0;
    duplicados += batch.length - (data?.length || 0);
  }

  revalidatePath("/contable/centralizacion");
  return { nuevos, duplicados, errores };
}

export async function cargarExcelCompras(registros: Array<{
  tipo_dte: number;
  tipo_dte_nombre: string;
  folio: string;
  rut_emisor: string;
  razon_social: string;
  fecha_emision: string;
  fecha_recepcion?: string;
  monto_exento: number;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
  tipo_doc_ref?: number;
  folio_doc_ref?: string;
}>, mesOverride?: number, anioOverride?: number) {
  await requireRol("contador");
  const supabase = await createClient();
  const { createHash } = await import("crypto");
  let nuevos = 0, duplicados = 0;
  const errores: string[] = [];

  const records = registros.map((r) => {
    const rutNorm = normalizeRut(r.rut_emisor);
    const huellaStr = `C|${r.tipo_dte}|${r.folio}|${rutNorm}|${r.fecha_emision}|${Math.round(r.monto_total)}`;
    const huella = createHash("md5").update(huellaStr).digest("hex");
    const mes = mesOverride || (() => { const [, m] = (r.fecha_recepcion || r.fecha_emision).split("-").map(Number); return m; })();
    const anio = anioOverride || (() => { const [y] = (r.fecha_recepcion || r.fecha_emision).split("-").map(Number); return y; })();
    return {
      ...r,
      rut_emisor: rutNorm,
      huella,
      anio,
      mes,
      centralizado: false,
    };
  });

  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { data, error } = await supabase
      .from("compras_sii")
      .upsert(batch, { onConflict: "huella", ignoreDuplicates: true })
      .select("id");
    if (error) errores.push(`Lote ${Math.floor(i / 50) + 1}: ${error.message}`);
    else nuevos += data?.length || 0;
    duplicados += batch.length - (data?.length || 0);
  }

  revalidatePath("/contable/centralizacion");
  return { nuevos, duplicados, errores };
}

export async function cargarExcelHonorarios(registros: Array<{
  rut_emisor: string;
  razon_social: string;
  folio: string;
  fecha_emision: string;
  monto_bruto: number;
  retencion: number;
  monto_liquido: number;
}>) {
  await requireRol("contador");
  const supabase = await createClient();
  const { createHash } = await import("crypto");
  let nuevos = 0, duplicados = 0;
  const errores: string[] = [];

  const records = registros.map((r) => {
    const rutNorm = normalizeRut(r.rut_emisor);
    const huellaStr = `H|${r.folio}|${rutNorm}|${r.fecha_emision}|${Math.round(r.monto_bruto)}`;
    const huella = createHash("md5").update(huellaStr).digest("hex");
    const [year, month] = r.fecha_emision.split("-").map(Number);
    return {
      ...r,
      rut_emisor: rutNorm,
      huella,
      anio: year,
      mes: month,
      centralizado: false,
    };
  });

  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { data, error } = await supabase
      .from("honorarios_sii")
      .upsert(batch, { onConflict: "huella", ignoreDuplicates: true })
      .select("id");
    if (error) errores.push(`Lote ${Math.floor(i / 50) + 1}: ${error.message}`);
    else nuevos += data?.length || 0;
    duplicados += batch.length - (data?.length || 0);
  }

  revalidatePath("/contable/centralizacion");
  return { nuevos, duplicados, errores };
}

export async function cargarExcelTransbank(registros: Array<{
  fecha: string;
  numero_operacion: string;
  tipo_tarjeta: string;
  monto_bruto: number;
  comision: number;
  iva_comision: number;
  monto_neto: number;
}>) {
  await requireRol("contador");
  const supabase = await createClient();
  const { createHash } = await import("crypto");
  let nuevos = 0, duplicados = 0;
  const errores: string[] = [];

  const records = registros.map((r) => {
    const huellaStr = `TB|${r.numero_operacion}|${r.fecha}|${Math.round(r.monto_bruto)}`;
    const huella = createHash("md5").update(huellaStr).digest("hex");
    const [year, month] = r.fecha.split("-").map(Number);
    return {
      ...r,
      huella,
      anio: year,
      mes: month,
      centralizado: false,
    };
  });

  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { data, error } = await supabase
      .from("transbank_vouchers")
      .upsert(batch, { onConflict: "huella", ignoreDuplicates: true })
      .select("id");
    if (error) errores.push(`Lote ${Math.floor(i / 50) + 1}: ${error.message}`);
    else nuevos += data?.length || 0;
    duplicados += batch.length - (data?.length || 0);
  }

  revalidatePath("/contable/centralizacion");
  return { nuevos, duplicados, errores };
}

// ─── Verificar duplicados (preview antes de cargar) ────────────────────

export type PreviewCarga = {
  nuevos: Array<{ folio: string; rut: string; razon_social: string; fecha: string; monto: number; tipo_dte_nombre?: string }>;
  duplicados: Array<{ folio: string; rut: string; razon_social: string; fecha: string; monto: number; tipo_dte_nombre?: string }>;
  resumenMeses: Record<number, number>;
  totalNuevos: number;
  totalDuplicados: number;
  montoNuevos: number;
  montoDuplicados: number;
};

export async function verificarDuplicados(
  tipo: "ventas" | "compras" | "honorarios" | "transbank",
  registros: Array<Record<string, unknown>>,
  mesOverride?: number
): Promise<PreviewCarga> {
  const supabase = await createClient();
  const { createHash } = await import("crypto");

  const tabla = tipo === "ventas" ? "ventas_sii" : tipo === "compras" ? "compras_sii" : tipo === "honorarios" ? "honorarios_sii" : "transbank_vouchers";

  const huellas: string[] = [];
  const dataPorHuella: Record<string, { folio: string; rut: string; razon_social: string; fecha: string; monto: number; tipo_dte_nombre?: string; mes: number }> = {};

  for (const r of registros) {
    let huellaStr = "";
    let folio = "", rut = "", razon = "", fecha = "", monto = 0, mes = 0, tipoDteNombre = "";

    if (tipo === "ventas") {
      const rutNorm = normalizeRut(String(r.rut_receptor || ""));
      huellaStr = `V|${r.tipo_dte}|${r.folio}|${rutNorm}|${r.fecha_emision}|${Math.round(Number(r.monto_total))}`;
      folio = String(r.folio); rut = rutNorm; razon = String(r.razon_social || "");
      fecha = String(r.fecha_emision); monto = Number(r.monto_total); tipoDteNombre = String(r.tipo_dte_nombre || "");
      const [, m] = fecha.split("-").map(Number); mes = m;
    } else if (tipo === "compras") {
      const rutNorm = normalizeRut(String(r.rut_emisor || ""));
      huellaStr = `C|${r.tipo_dte}|${r.folio}|${rutNorm}|${r.fecha_emision}|${Math.round(Number(r.monto_total))}`;
      folio = String(r.folio); rut = rutNorm; razon = String(r.razon_social || "");
      fecha = String(r.fecha_emision); monto = Number(r.monto_total); tipoDteNombre = String(r.tipo_dte_nombre || "");
      mes = mesOverride || (() => { const [, m] = String(r.fecha_recepcion || r.fecha_emision).split("-").map(Number); return m; })();
    } else if (tipo === "honorarios") {
      const rutNorm = normalizeRut(String(r.rut_emisor || ""));
      huellaStr = `H|${r.folio}|${rutNorm}|${r.fecha_emision}|${Math.round(Number(r.monto_bruto))}`;
      folio = String(r.folio); rut = rutNorm; razon = String(r.razon_social || "");
      fecha = String(r.fecha_emision); monto = Number(r.monto_bruto);
      const [, m] = fecha.split("-").map(Number); mes = m;
    } else {
      huellaStr = `TB|${r.numero_operacion}|${r.fecha}|${Math.round(Number(r.monto_bruto))}`;
      folio = String(r.numero_operacion); rut = ""; razon = String(r.tipo_tarjeta || "");
      fecha = String(r.fecha); monto = Number(r.monto_bruto);
      const [, m] = fecha.split("-").map(Number); mes = m;
    }

    const huella = createHash("md5").update(huellaStr).digest("hex");
    huellas.push(huella);
    dataPorHuella[huella] = { folio, rut, razon_social: razon, fecha, monto, tipo_dte_nombre: tipoDteNombre, mes };
  }

  const existentes = new Set<string>();
  for (let i = 0; i < huellas.length; i += 100) {
    const batch = huellas.slice(i, i + 100);
    const { data } = await supabase.from(tabla).select("huella").in("huella", batch);
    for (const row of data || []) existentes.add(row.huella);
  }

  const nuevos: PreviewCarga["nuevos"] = [];
  const duplicados: PreviewCarga["duplicados"] = [];
  const resumenMeses: Record<number, number> = {};
  let montoNuevos = 0, montoDuplicados = 0;

  for (const huella of huellas) {
    const d = dataPorHuella[huella];
    const item = { folio: d.folio, rut: d.rut, razon_social: d.razon_social, fecha: d.fecha, monto: d.monto, tipo_dte_nombre: d.tipo_dte_nombre };
    if (existentes.has(huella)) {
      duplicados.push(item);
      montoDuplicados += d.monto;
    } else {
      nuevos.push(item);
      montoNuevos += d.monto;
      resumenMeses[d.mes] = (resumenMeses[d.mes] || 0) + 1;
    }
  }

  return { nuevos, duplicados, resumenMeses, totalNuevos: nuevos.length, totalDuplicados: duplicados.length, montoNuevos, montoDuplicados };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatCLP(n: number) { return "$" + Math.round(n).toLocaleString("es-CL"); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureAuxiliares(supabase: any, items: { rut: string; razon_social: string }[], tipoAux: string) {
  const rutsUnicos = [...new Set(items.map((d) => normalizeRut(d.rut)).filter(Boolean))];
  if (rutsUnicos.length === 0) return;

  const { data: existentes } = await supabase.from("auxiliares").select("rut").in("rut", rutsUnicos);
  const existSet = new Set((existentes || []).map((a: { rut: string }) => a.rut));
  const faltantes = rutsUnicos.filter((r) => !existSet.has(r));

  if (faltantes.length > 0) {
    const nuevos = faltantes.map((rut) => {
      const item = items.find((d) => normalizeRut(d.rut) === rut);
      return { rut, razon_social: item?.razon_social || "", tipo: tipoAux, estado: "S" };
    });
    await supabase.from("auxiliares").insert(nuevos);
  }
}

// ─── Builders de líneas contables ───────────────────────────────────────

function buildLineasVentas(docs: DocPendiente[], cuentaVentas: string, config: Record<string, string>, reglasMap: Map<string, string>) {
  const ctaClientes = config.CENT_CTA_CLIENTES || "1-1-03-001";
  const ctaIVADebito = config.CENT_CTA_IVA_DEBITO || "2-1-06-001";
  const ctaVentasDefault = cuentaVentas || config.CENT_CTA_VENTAS || "4-1-01-001";

  type Linea = { cuenta_codigo: string; debe: number; haber: number; glosa: string; auxiliar_rut: string; tipo_doc: string; num_doc: string; fecha_doc: string | null; referencia: string };
  const lineas: Linea[] = [];
  let totalIVA = 0;
  const ventasPorCuenta = new Map<string, number>();

  for (const doc of docs) {
    const isNC = doc.esNC;
    const montoTotal = Math.round(Math.abs(doc.monto_total));
    const montoNeto = Math.round(Math.abs(doc.monto_neto));
    const montoIVA = Math.round(Math.abs(doc.monto_iva));

    let referencia = "";
    if ((isNC || doc.esND) && doc.ref_tipo && doc.ref_folio) {
      referencia = `${doc.ref_tipo}|${doc.ref_folio}`;
    }

    // Línea individual por documento (cuenta clientes)
    lineas.push({
      cuenta_codigo: ctaClientes,
      debe: isNC ? 0 : montoTotal,
      haber: isNC ? montoTotal : 0,
      glosa: `${doc.razon_social} ${doc.tipo_dte_nombre} ${doc.folio}`,
      auxiliar_rut: doc.rut,
      tipo_doc: doc.tipo_dte_nombre,
      num_doc: doc.folio,
      fecha_doc: doc.fecha_emision,
      referencia,
    });

    // Acumular neto por cuenta (regla específica o default)
    const ctaVenta = reglasMap.get(doc.rut) || ctaVentasDefault;
    const signo = isNC ? -1 : 1;
    ventasPorCuenta.set(ctaVenta, (ventasPorCuenta.get(ctaVenta) || 0) + montoNeto * signo);
    totalIVA += montoIVA * signo;
  }

  // Línea resumen IVA Débito
  if (totalIVA !== 0) {
    lineas.push({
      cuenta_codigo: ctaIVADebito,
      debe: totalIVA < 0 ? Math.abs(totalIVA) : 0,
      haber: totalIVA > 0 ? totalIVA : 0,
      glosa: "IVA Débito Fiscal",
      auxiliar_rut: "", tipo_doc: "", num_doc: "", fecha_doc: null, referencia: "",
    });
  }

  // Líneas resumen Ventas (una por cuenta)
  for (const [cuenta, neto] of ventasPorCuenta) {
    if (neto !== 0) {
      lineas.push({
        cuenta_codigo: cuenta,
        debe: neto < 0 ? Math.abs(neto) : 0,
        haber: neto > 0 ? neto : 0,
        glosa: "Ventas",
        auxiliar_rut: "", tipo_doc: "", num_doc: "", fecha_doc: null, referencia: "",
      });
    }
  }

  return lineas;
}

function buildLineasCompras(docs: DocPendiente[], cuentaGasto: string, config: Record<string, string>, reglasMap: Map<string, string>, cuentasPorDoc?: Record<number, string>) {
  const ctaProveedores = config.CENT_CTA_PROVEEDORES || "2-1-02-001";
  const ctaIVACredito = config.CENT_CTA_IVA_CREDITO || "1-1-07-002";
  const ctaGastoDefault = cuentaGasto || config.CENT_CTA_GASTOS || "5-1-01-001";

  type Linea = { cuenta_codigo: string; debe: number; haber: number; glosa: string; auxiliar_rut: string; tipo_doc: string; num_doc: string; fecha_doc: string | null; referencia: string };
  const lineas: Linea[] = [];
  let totalIVA = 0;
  const gastosPorCuenta = new Map<string, number>();

  for (const doc of docs) {
    const isNC = doc.esNC;
    const montoTotal = Math.round(Math.abs(doc.monto_total));
    const montoNeto = Math.round(Math.abs(doc.monto_neto));
    const montoIVA = Math.round(Math.abs(doc.monto_iva));

    let referencia = "";
    if ((isNC || doc.esND) && doc.ref_tipo && doc.ref_folio) {
      referencia = `${doc.ref_tipo}|${doc.ref_folio}`;
    }

    lineas.push({
      cuenta_codigo: ctaProveedores,
      debe: isNC ? montoTotal : 0,
      haber: isNC ? 0 : montoTotal,
      glosa: `${doc.razon_social} ${doc.tipo_dte_nombre} ${doc.folio}`,
      auxiliar_rut: doc.rut,
      tipo_doc: doc.tipo_dte_nombre,
      num_doc: doc.folio,
      fecha_doc: doc.fecha_emision,
      referencia,
    });

    const ctaGasto = cuentasPorDoc?.[doc.id] || reglasMap.get(doc.rut) || ctaGastoDefault;
    const signo = isNC ? -1 : 1;
    gastosPorCuenta.set(ctaGasto, (gastosPorCuenta.get(ctaGasto) || 0) + montoNeto * signo);
    totalIVA += montoIVA * signo;
  }

  // Líneas resumen Gastos (una por cuenta)
  for (const [cuenta, neto] of gastosPorCuenta) {
    if (neto !== 0) {
      lineas.push({
        cuenta_codigo: cuenta,
        debe: neto > 0 ? neto : 0,
        haber: neto < 0 ? Math.abs(neto) : 0,
        glosa: "Gastos",
        auxiliar_rut: "", tipo_doc: "", num_doc: "", fecha_doc: null, referencia: "",
      });
    }
  }

  // IVA Crédito
  if (totalIVA !== 0) {
    lineas.push({
      cuenta_codigo: ctaIVACredito,
      debe: totalIVA > 0 ? totalIVA : 0,
      haber: totalIVA < 0 ? Math.abs(totalIVA) : 0,
      glosa: "IVA Crédito Fiscal",
      auxiliar_rut: "", tipo_doc: "", num_doc: "", fecha_doc: null, referencia: "",
    });
  }

  return lineas;
}

function buildLineasHonorarios(docs: DocHonorario[], cuentaGasto: string, config: Record<string, string>, reglasMap: Map<string, string>) {
  const ctaGastoDefault = cuentaGasto || config.CENT_CTA_HONORARIOS_GASTO || "5-1-02-001";
  const ctaRetencion = config.CENT_CTA_RETENCION || "2-1-07-001";
  const ctaHonPagar = config.CENT_CTA_HONORARIOS_PAGAR || "2-1-04-001";

  type Linea = { cuenta_codigo: string; debe: number; haber: number; glosa: string; auxiliar_rut: string; tipo_doc: string; num_doc: string; fecha_doc: string | null; referencia: string };
  const lineas: Linea[] = [];
  const gastosPorCuenta = new Map<string, number>();
  let totalRetencion = 0;

  for (const doc of docs) {
    const bruto = Math.round(Math.abs(doc.monto_bruto));
    const retencion = Math.round(Math.abs(doc.retencion));
    const liquido = Math.round(Math.abs(doc.monto_liquido));

    // Línea individual: Honorarios por pagar (al prestador)
    lineas.push({
      cuenta_codigo: ctaHonPagar,
      debe: 0,
      haber: liquido,
      glosa: `${doc.razon_social} BH ${doc.folio}`,
      auxiliar_rut: doc.rut,
      tipo_doc: "BH",
      num_doc: doc.folio,
      fecha_doc: doc.fecha_emision,
      referencia: "",
    });

    // Acumular gasto por cuenta (regla o default)
    const ctaGasto = reglasMap.get(doc.rut) || ctaGastoDefault;
    gastosPorCuenta.set(ctaGasto, (gastosPorCuenta.get(ctaGasto) || 0) + bruto);
    totalRetencion += retencion;
  }

  // Líneas resumen Gasto Honorarios (una por cuenta)
  for (const [cuenta, total] of gastosPorCuenta) {
    if (total !== 0) {
      lineas.push({
        cuenta_codigo: cuenta,
        debe: total,
        haber: 0,
        glosa: "Gasto Honorarios",
        auxiliar_rut: "", tipo_doc: "", num_doc: "", fecha_doc: null, referencia: "",
      });
    }
  }

  // Retención Honorarios (resumen)
  if (totalRetencion !== 0) {
    lineas.push({
      cuenta_codigo: ctaRetencion,
      debe: 0,
      haber: totalRetencion,
      glosa: "Retención Honorarios",
      auxiliar_rut: "", tipo_doc: "", num_doc: "", fecha_doc: null, referencia: "",
    });
  }

  return lineas;
}

function buildLineasTransbank(docs: DocTransbank[], config: Record<string, string>) {
  const ctaBanco = config.CENT_CTA_TRANSBANK_BANCO || "1-1-01-002";
  const ctaComision = config.CENT_CTA_TRANSBANK_COMISION || "5-1-04-001";
  const ctaIVA = config.CENT_CTA_TRANSBANK_IVA || "1-1-07-002";
  const ctaVentas = config.CENT_CTA_TRANSBANK_VENTAS || "4-1-01-001";

  type Linea = { cuenta_codigo: string; debe: number; haber: number; glosa: string; auxiliar_rut: string; tipo_doc: string; num_doc: string; fecha_doc: string | null; referencia: string };
  const lineas: Linea[] = [];
  let totalNeto = 0;
  let totalComision = 0;
  let totalIVA = 0;
  let totalBruto = 0;

  for (const doc of docs) {
    totalNeto += Math.round(doc.monto_neto);
    totalComision += Math.round(doc.comision);
    totalIVA += Math.round(doc.iva_comision);
    totalBruto += Math.round(doc.monto_bruto);
  }

  // DEBE: Banco (monto neto depositado)
  if (totalNeto !== 0) {
    lineas.push({
      cuenta_codigo: ctaBanco,
      debe: totalNeto,
      haber: 0,
      glosa: "Depósito Transbank",
      auxiliar_rut: "", tipo_doc: "TB", num_doc: "", fecha_doc: null, referencia: "",
    });
  }

  // DEBE: Comisión Transbank (gasto)
  if (totalComision !== 0) {
    lineas.push({
      cuenta_codigo: ctaComision,
      debe: totalComision,
      haber: 0,
      glosa: "Comisión Transbank",
      auxiliar_rut: "", tipo_doc: "TB", num_doc: "", fecha_doc: null, referencia: "",
    });
  }

  // DEBE: IVA Crédito Fiscal (sobre la comisión)
  if (totalIVA !== 0) {
    lineas.push({
      cuenta_codigo: ctaIVA,
      debe: totalIVA,
      haber: 0,
      glosa: "IVA Crédito Fiscal Comisión Transbank",
      auxiliar_rut: "", tipo_doc: "TB", num_doc: "", fecha_doc: null, referencia: "",
    });
  }

  // HABER: Ventas/Clientes (monto bruto)
  if (totalBruto !== 0) {
    lineas.push({
      cuenta_codigo: ctaVentas,
      debe: 0,
      haber: totalBruto,
      glosa: "Ventas Transbank",
      auxiliar_rut: "", tipo_doc: "TB", num_doc: "", fecha_doc: null, referencia: "",
    });
  }

  return lineas;
}
