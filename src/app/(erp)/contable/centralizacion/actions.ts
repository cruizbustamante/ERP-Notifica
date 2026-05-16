"use server";

import { createClient } from "@/lib/supabase/server";
import { crearComprobante } from "../comprobantes/actions";
import { revalidatePath } from "next/cache";

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
  const { data } = await supabase.from("config_contable").select("clave, valor");
  const map: Record<string, string> = {};
  for (const r of data || []) map[r.clave] = r.valor;
  return map;
}

// ─── Resumen por mes ────────────────────────────────────────────────────

export async function getResumenCentralizacion(anio: number) {
  const supabase = await createClient();

  const [{ data: ventas }, { data: compras }, { data: historial }] = await Promise.all([
    supabase.from("ventas_sii").select("mes, monto_neto, monto_iva, monto_total, tipo_dte, centralizado").eq("anio", anio),
    supabase.from("compras_sii").select("mes, monto_neto, monto_iva, monto_total, tipo_dte, centralizado").eq("anio", anio),
    supabase.from("centralizaciones").select("*").eq("anio", anio).order("created_at", { ascending: false }),
  ]);

  type MesData = { pendiente: number; centralizado: number; cantPend: number; cantCent: number; neto: number; iva: number };
  const emptyMes = (): MesData => ({ pendiente: 0, centralizado: 0, cantPend: 0, cantCent: 0, neto: 0, iva: 0 });

  const ventasPorMes: Record<number, MesData> = {};
  const comprasPorMes: Record<number, MesData> = {};
  for (let m = 1; m <= 12; m++) { ventasPorMes[m] = emptyMes(); comprasPorMes[m] = emptyMes(); }

  for (const v of ventas || []) {
    const m = v.mes;
    if (!m || m < 1 || m > 12) continue;
    const signo = esNC(v.tipo_dte) ? -1 : 1;
    const total = (Number(v.monto_total) || 0) * signo;
    const neto = (Number(v.monto_neto) || 0) * signo;
    const iva = (Number(v.monto_iva) || 0) * signo;
    if (v.centralizado) {
      ventasPorMes[m].centralizado += total;
      ventasPorMes[m].cantCent++;
    } else {
      ventasPorMes[m].pendiente += total;
      ventasPorMes[m].cantPend++;
      ventasPorMes[m].neto += neto;
      ventasPorMes[m].iva += iva;
    }
  }

  for (const c of compras || []) {
    const m = c.mes;
    if (!m || m < 1 || m > 12) continue;
    const signo = esNC(c.tipo_dte) ? -1 : 1;
    const total = (Number(c.monto_total) || 0) * signo;
    const neto = (Number(c.monto_neto) || 0) * signo;
    const iva = (Number(c.monto_iva) || 0) * signo;
    if (c.centralizado) {
      comprasPorMes[m].centralizado += total;
      comprasPorMes[m].cantCent++;
    } else {
      comprasPorMes[m].pendiente += total;
      comprasPorMes[m].cantPend++;
      comprasPorMes[m].neto += neto;
      comprasPorMes[m].iva += iva;
    }
  }

  return {
    ventas: ventasPorMes,
    compras: comprasPorMes,
    historial: historial || [],
  };
}

// ─── Documentos pendientes ──────────────────────────────────────────────

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

export async function getDocumentosPendientes(tipo: "ventas" | "compras", anio: number, mes: number) {
  const supabase = await createClient();
  const tabla = tipo === "ventas" ? "ventas_sii" : "compras_sii";

  const { data, error } = await supabase
    .from(tabla)
    .select("*")
    .eq("anio", anio)
    .eq("mes", mes)
    .eq("centralizado", false)
    .order("tipo_dte")
    .order("folio");

  if (error) return { docs: [], error: error.message };

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
      rut: tipo === "ventas" ? (r.rut_receptor || "") : (r.rut_emisor || ""),
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

  docs.sort((a, b) => {
    if (a.esNC !== b.esNC) return a.esNC ? 1 : -1;
    if (a.esND !== b.esND) return a.esND ? 1 : -1;
    return parseInt(a.folio) - parseInt(b.folio);
  });

  return { docs, error: null };
}

// ─── Centralizar ────────────────────────────────────────────────────────

export async function centralizarDocumentos(
  tipo: "ventas" | "compras",
  anio: number,
  mes: number,
  cuentaContrapartida: string,
  docIds: number[]
) {
  const supabase = await createClient();
  const config = await getConfig();

  if (docIds.length === 0) return { error: "No hay documentos seleccionados" };

  const { docs, error: docsErr } = await getDocumentosPendientes(tipo, anio, mes);
  if (docsErr) return { error: docsErr };

  const selectedDocs = docs.filter((d) => docIds.includes(d.id));
  if (selectedDocs.length === 0) return { error: "Ningún documento pendiente coincide con la selección" };

  // Asegurar auxiliares existen
  const rutsUnicos = [...new Set(selectedDocs.map((d) => d.rut).filter(Boolean))];
  if (rutsUnicos.length > 0) {
    const { data: auxExistentes } = await supabase
      .from("auxiliares")
      .select("rut")
      .in("rut", rutsUnicos);
    const existentes = new Set((auxExistentes || []).map((a) => a.rut));
    const faltantes = rutsUnicos.filter((r) => !existentes.has(r));
    if (faltantes.length > 0) {
      const nuevosAux = faltantes.map((rut) => {
        const doc = selectedDocs.find((d) => d.rut === rut);
        return {
          rut,
          razon_social: doc?.razon_social || "",
          tipo: tipo === "ventas" ? "CLIENTE" : "PROVEEDOR",
          estado: "S",
        };
      });
      await supabase.from("auxiliares").insert(nuevosAux);
    }
  }

  type LineaComp = {
    cuenta_codigo: string;
    debe: number;
    haber: number;
    glosa: string;
    auxiliar_rut: string;
    tipo_doc: string;
    num_doc: string;
    fecha_doc: string | null;
    referencia: string;
  };

  let lineas: LineaComp[];

  if (tipo === "ventas") {
    lineas = buildLineasVentas(selectedDocs, cuentaContrapartida, config);
  } else {
    lineas = buildLineasCompras(selectedDocs, cuentaContrapartida, config);
  }

  // Verificar cuadratura
  let totalDebe = 0, totalHaber = 0;
  for (const l of lineas) { totalDebe += l.debe; totalHaber += l.haber; }
  if (Math.abs(totalDebe - totalHaber) > 1) {
    return { error: `Descuadre: Debe $${Math.round(totalDebe).toLocaleString()} ≠ Haber $${Math.round(totalHaber).toLocaleString()}` };
  }

  // Último día del mes
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const fecha = `${anio}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const glosa = `CENTRALIZA ${tipo.toUpperCase()} ${MESES[mes].toUpperCase()} ${anio}`;

  const result = await crearComprobante({
    tipo: "T",
    fecha,
    glosa,
    lineas,
  });

  if (result.error) return { error: result.error };

  // Marcar documentos como centralizados
  const tabla = tipo === "ventas" ? "ventas_sii" : "compras_sii";
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
    registros: selectedDocs.length,
    usuario: "",
    estado: "ACTIVO",
    anio,
    mes,
  });

  revalidatePath("/contable/centralizacion");
  return {
    data: {
      comprobante: result.data,
      documentos: selectedDocs.length,
      totalDebe: Math.round(totalDebe),
      totalHaber: Math.round(totalHaber),
    },
    error: null,
  };
}

// ─── Anular centralización ──────────────────────────────────────────────

export async function anularCentralizacion(centralizacionId: number) {
  const supabase = await createClient();

  const { data: cent } = await supabase
    .from("centralizaciones")
    .select("*")
    .eq("id", centralizacionId)
    .single();

  if (!cent) return { error: "Centralización no encontrada" };
  if (cent.estado === "ANULADO") return { error: "Ya está anulada" };

  // Anular comprobante asociado
  if (cent.comprobante_id) {
    const { anularComprobante } = await import("../comprobantes/actions");
    const res = await anularComprobante(cent.comprobante_id);
    if (res.error) return { error: `Error anulando comprobante: ${res.error}` };
  }

  // Desmarcar documentos
  const tipo = cent.tipo?.toLowerCase();
  if (tipo === "ventas" || tipo === "compras") {
    const tabla = tipo === "ventas" ? "ventas_sii" : "compras_sii";
    await supabase
      .from(tabla)
      .update({ centralizado: false, comprobante_id: null })
      .eq("comprobante_id", cent.comprobante_id);
  }

  // Marcar centralización como anulada
  await supabase
    .from("centralizaciones")
    .update({ estado: "ANULADO" })
    .eq("id", centralizacionId);

  revalidatePath("/contable/centralizacion");
  return { error: null };
}

// ─── Builders de líneas contables ───────────────────────────────────────

function buildLineasVentas(docs: DocPendiente[], cuentaVentas: string, config: Record<string, string>) {
  const ctaClientes = config.CUENTA_CLIENTES || "1-1-03-001";
  const ctaIVADebito = config.CUENTA_IVA_DEBITO || "2-1-05-001";
  const ctaVentas = cuentaVentas || config.CUENTA_VENTAS || "4-1-01-001";

  type Linea = { cuenta_codigo: string; debe: number; haber: number; glosa: string; auxiliar_rut: string; tipo_doc: string; num_doc: string; fecha_doc: string | null; referencia: string };
  const lineas: Linea[] = [];
  let totalNeto = 0, totalIVA = 0;

  for (const doc of docs) {
    const isNC = doc.esNC;
    const montoTotal = Math.round(Math.abs(doc.monto_total));
    const montoNeto = Math.round(Math.abs(doc.monto_neto));
    const montoIVA = Math.round(Math.abs(doc.monto_iva));

    // NC → referencia a doc original (REBAJA)
    // FAC/FEX → referencia a sí misma (REGISTRO)
    let referencia = "";
    if ((isNC || doc.esND) && doc.ref_tipo && doc.ref_folio) {
      referencia = `${doc.ref_tipo}|${doc.ref_folio}`;
    }

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

    const signo = isNC ? -1 : 1;
    totalNeto += montoNeto * signo;
    totalIVA += montoIVA * signo;
  }

  // IVA Débito (resumen)
  if (totalIVA !== 0) {
    lineas.push({
      cuenta_codigo: ctaIVADebito,
      debe: totalIVA < 0 ? Math.abs(totalIVA) : 0,
      haber: totalIVA > 0 ? totalIVA : 0,
      glosa: "IVA Débito Fiscal",
      auxiliar_rut: "", tipo_doc: "", num_doc: "", fecha_doc: null, referencia: "",
    });
  }

  // Ventas (resumen)
  if (totalNeto !== 0) {
    lineas.push({
      cuenta_codigo: ctaVentas,
      debe: totalNeto < 0 ? Math.abs(totalNeto) : 0,
      haber: totalNeto > 0 ? totalNeto : 0,
      glosa: "Ventas",
      auxiliar_rut: "", tipo_doc: "", num_doc: "", fecha_doc: null, referencia: "",
    });
  }

  return lineas;
}

function buildLineasCompras(docs: DocPendiente[], cuentaGasto: string, config: Record<string, string>) {
  const ctaProveedores = config.CUENTA_PROVEEDORES || "2-1-03-001";
  const ctaIVACredito = config.CUENTA_IVA_CREDITO || "1-1-07-001";
  const ctaGasto = cuentaGasto || config.CUENTA_GASTOS || "7-1-01-001";

  type Linea = { cuenta_codigo: string; debe: number; haber: number; glosa: string; auxiliar_rut: string; tipo_doc: string; num_doc: string; fecha_doc: string | null; referencia: string };
  const lineas: Linea[] = [];
  let totalNeto = 0, totalIVA = 0;

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

    const signo = isNC ? -1 : 1;
    totalNeto += montoNeto * signo;
    totalIVA += montoIVA * signo;
  }

  // Gasto (resumen)
  if (totalNeto !== 0) {
    lineas.push({
      cuenta_codigo: ctaGasto,
      debe: totalNeto > 0 ? totalNeto : 0,
      haber: totalNeto < 0 ? Math.abs(totalNeto) : 0,
      glosa: "Gastos",
      auxiliar_rut: "", tipo_doc: "", num_doc: "", fecha_doc: null, referencia: "",
    });
  }

  // IVA Crédito (resumen)
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
