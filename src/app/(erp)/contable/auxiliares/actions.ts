"use server";

import { createClient } from "@/lib/supabase/server";

export type MovAuxiliar = {
  fecha: string;
  comprobante: string;
  tipo_doc: string;
  num_doc: string;
  tipo_doc_ref: string;
  num_doc_ref: string;
  glosa: string;
  debe: number;
  haber: number;
  saldo: number;
};

export type InformeAuxiliarResult = {
  cuenta_codigo: string;
  cuenta_nombre: string;
  cuenta_tipo: string;
  auxiliar_rut: string;
  auxiliar_nombre: string;
  saldo_anterior: number;
  movimientos: MovAuxiliar[];
  total_debe: number;
  total_haber: number;
  saldo_final: number;
};

export async function getMovimientosAuxiliar(
  cuentaCodigo: string,
  auxiliarRut: string,
  anio: number,
  mesDesde: number,
  mesHasta: number
): Promise<{ data: InformeAuxiliarResult | null; error: string | null }> {
  const supabase = await createClient();

  // Look up the cuenta
  const { data: cuenta } = await supabase
    .from("plan_cuentas")
    .select("codigo, nombre, tipo")
    .eq("codigo", cuentaCodigo)
    .single();

  if (!cuenta) return { data: null, error: "Cuenta no encontrada" };

  // Look up the auxiliar
  const { data: auxiliar } = await supabase
    .from("auxiliares")
    .select("rut, razon_social")
    .eq("rut", auxiliarRut)
    .single();

  if (!auxiliar) return { data: null, error: "Auxiliar no encontrado" };

  const deudor = cuenta.tipo === "A" || cuenta.tipo === "G";

  // Saldo anterior: movements before mesDesde in same year
  let saldoAnterior = 0;

  if (mesDesde > 1) {
    const { data: movsAnt } = await supabase
      .from("mov_contables")
      .select("debe, haber, comprobantes!inner(anio, mes, estado)")
      .eq("cuenta_codigo", cuentaCodigo)
      .eq("auxiliar_rut", auxiliarRut)
      .eq("comprobantes.anio", anio)
      .eq("comprobantes.estado", "VIGENTE")
      .lt("comprobantes.mes", mesDesde);

    for (const m of movsAnt || []) {
      saldoAnterior += deudor
        ? Number(m.debe) - Number(m.haber)
        : Number(m.haber) - Number(m.debe);
    }
  }

  // Movements in the selected range
  const { data: movs } = await supabase
    .from("mov_contables")
    .select(
      "debe, haber, glosa, tipo_doc, num_doc, tipo_doc_ref, num_doc_ref, comprobantes!inner(numero, tipo, fecha, anio, mes, estado)"
    )
    .eq("cuenta_codigo", cuentaCodigo)
    .eq("auxiliar_rut", auxiliarRut)
    .eq("comprobantes.anio", anio)
    .eq("comprobantes.estado", "VIGENTE")
    .gte("comprobantes.mes", mesDesde)
    .lte("comprobantes.mes", mesHasta)
    .order("comprobantes(fecha)")
    .order("comprobantes(numero)");

  let saldoAcum = saldoAnterior;
  let totalDebe = 0;
  let totalHaber = 0;

  const movimientos: MovAuxiliar[] = (movs || []).map((m) => {
    const comp = m.comprobantes as unknown as {
      numero: number;
      tipo: string;
      fecha: string;
    };
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
      tipo_doc: m.tipo_doc || "",
      num_doc: m.num_doc || "",
      tipo_doc_ref:
        ((m as Record<string, unknown>).tipo_doc_ref as string) || "",
      num_doc_ref:
        ((m as Record<string, unknown>).num_doc_ref as string) || "",
    };
  });

  return {
    data: {
      cuenta_codigo: cuenta.codigo,
      cuenta_nombre: cuenta.nombre,
      cuenta_tipo: cuenta.tipo,
      auxiliar_rut: auxiliar.rut,
      auxiliar_nombre: auxiliar.razon_social,
      saldo_anterior: saldoAnterior,
      movimientos,
      total_debe: totalDebe,
      total_haber: totalHaber,
      saldo_final: saldoAcum,
    },
    error: null,
  };
}

// --- Saldos pendientes ---

export type DocPendiente = {
  tipo_doc: string;
  num_doc: string;
  fecha_doc: string | null;
  monto_original: number;
  rebajas: number;
  saldo: number;
};

export async function getDocsPendientes(
  cuentaCodigo: string,
  auxiliarRut: string
): Promise<{ data: DocPendiente[]; error: string | null }> {
  const supabase = await createClient();

  // Look up the cuenta to determine deudor/acreedor
  const { data: cuenta } = await supabase
    .from("plan_cuentas")
    .select("codigo, tipo")
    .eq("codigo", cuentaCodigo)
    .single();

  if (!cuenta) return { data: [], error: "Cuenta no encontrada" };

  const deudor = cuenta.tipo === "A" || cuenta.tipo === "G";

  // Query all movements for this cuenta+auxiliar with tipo_doc
  const { data: movs } = await supabase
    .from("mov_contables")
    .select(
      "tipo_doc, num_doc, fecha_doc, debe, haber, tipo_doc_ref, num_doc_ref, comprobantes!inner(estado)"
    )
    .eq("cuenta_codigo", cuentaCodigo)
    .eq("auxiliar_rut", auxiliarRut)
    .eq("comprobantes.estado", "VIGENTE")
    .neq("tipo_doc", "");

  if (!movs || movs.length === 0) return { data: [], error: null };

  // Build a map of documents
  // Key: "tipo_doc|num_doc"
  // Original registros: movements without tipo_doc_ref
  // Rebajas: movements with tipo_doc_ref pointing to another document
  const docMap: Record<
    string,
    {
      tipo_doc: string;
      num_doc: string;
      fecha_doc: string | null;
      monto_original: number;
      rebajas: number;
    }
  > = {};

  for (const m of movs) {
    const tipoDocRef =
      ((m as Record<string, unknown>).tipo_doc_ref as string) || "";
    const numDocRef =
      ((m as Record<string, unknown>).num_doc_ref as string) || "";
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;

    // Calculate the amount based on account type
    // For deudor accounts: debe increases balance, haber decreases
    // For acreedor accounts: haber increases balance, debe decreases
    const monto = deudor ? debe - haber : haber - debe;

    if (!tipoDocRef) {
      // This is an original document registration
      const key = `${m.tipo_doc}|${m.num_doc}`;
      if (!docMap[key]) {
        docMap[key] = {
          tipo_doc: m.tipo_doc,
          num_doc: m.num_doc,
          fecha_doc: m.fecha_doc || null,
          monto_original: 0,
          rebajas: 0,
        };
      }
      docMap[key].monto_original += monto;
      if (m.fecha_doc && !docMap[key].fecha_doc) {
        docMap[key].fecha_doc = m.fecha_doc;
      }
    } else {
      // This is a rebaja pointing to tipoDocRef|numDocRef
      const key = `${tipoDocRef}|${numDocRef}`;
      if (!docMap[key]) {
        docMap[key] = {
          tipo_doc: tipoDocRef,
          num_doc: numDocRef,
          fecha_doc: null,
          monto_original: 0,
          rebajas: 0,
        };
      }
      // Rebajas reduce the balance, so they come with opposite sign
      docMap[key].rebajas += Math.abs(monto);
    }
  }

  // Build result: only documents with saldo > 0.01
  const result: DocPendiente[] = [];

  for (const key of Object.keys(docMap)) {
    const doc = docMap[key];
    const saldo = Math.abs(doc.monto_original) - doc.rebajas;
    if (saldo > 0.01) {
      result.push({
        tipo_doc: doc.tipo_doc,
        num_doc: doc.num_doc,
        fecha_doc: doc.fecha_doc,
        monto_original: Math.abs(doc.monto_original),
        rebajas: doc.rebajas,
        saldo,
      });
    }
  }

  // Sort by tipo_doc, then num_doc
  result.sort((a, b) => {
    if (a.tipo_doc !== b.tipo_doc) return a.tipo_doc.localeCompare(b.tipo_doc);
    return a.num_doc.localeCompare(b.num_doc);
  });

  return { data: result, error: null };
}
