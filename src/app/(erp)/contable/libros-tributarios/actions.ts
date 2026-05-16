"use server";

import { createClient } from "@/lib/supabase/server";

export type DocTributario = {
  id: number;
  tipo_dte: number;
  tipo_dte_nombre: string;
  folio: string;
  rut: string;
  razon_social: string;
  fecha_emision: string | null;
  monto_exento: number;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
  estado_sii: string;
  centralizado: boolean;
};

export async function getLibroVentas(anio: number, mes: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ventas_sii")
    .select("id, tipo_dte, tipo_dte_nombre, folio, rut_receptor, razon_social, fecha_emision, monto_exento, monto_neto, monto_iva, monto_total, estado_sii, centralizado")
    .eq("anio", anio)
    .eq("mes", mes)
    .order("tipo_dte")
    .order("folio");

  if (error) return { data: [], error: error.message };

  return {
    data: (data || []).map((r) => ({
      id: r.id,
      tipo_dte: r.tipo_dte,
      tipo_dte_nombre: r.tipo_dte_nombre || "",
      folio: r.folio || "",
      rut: r.rut_receptor || "",
      razon_social: r.razon_social || "",
      fecha_emision: r.fecha_emision,
      monto_exento: Number(r.monto_exento) || 0,
      monto_neto: Number(r.monto_neto) || 0,
      monto_iva: Number(r.monto_iva) || 0,
      monto_total: Number(r.monto_total) || 0,
      estado_sii: r.estado_sii || "",
      centralizado: r.centralizado || false,
    })),
    error: null,
  };
}

export async function getLibroCompras(anio: number, mes: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compras_sii")
    .select("id, tipo_dte, tipo_dte_nombre, folio, rut_emisor, razon_social, fecha_emision, monto_exento, monto_neto, monto_iva, monto_total, estado_sii, centralizado")
    .eq("anio", anio)
    .eq("mes", mes)
    .order("tipo_dte")
    .order("folio");

  if (error) return { data: [], error: error.message };

  return {
    data: (data || []).map((r) => ({
      id: r.id,
      tipo_dte: r.tipo_dte,
      tipo_dte_nombre: r.tipo_dte_nombre || "",
      folio: r.folio || "",
      rut: r.rut_emisor || "",
      razon_social: r.razon_social || "",
      fecha_emision: r.fecha_emision,
      monto_exento: Number(r.monto_exento) || 0,
      monto_neto: Number(r.monto_neto) || 0,
      monto_iva: Number(r.monto_iva) || 0,
      monto_total: Number(r.monto_total) || 0,
      estado_sii: r.estado_sii || "",
      centralizado: r.centralizado || false,
    })),
    error: null,
  };
}
