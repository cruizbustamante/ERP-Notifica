"use server";

import { createClient } from "@/lib/supabase/server";
import { enviarEmail, buildFacturaHtml, getAsuntoFactura } from "@/lib/email";
import { revalidatePath } from "next/cache";

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export async function enviarCorreoFactura(params: {
  rut: string;
  nombre: string;
  email: string;
  folio: string;
  total: number;
  facturacionTipo: string;
  mes: number;
  anio: number;
}) {
  const periodo = `${MESES[params.mes]} ${params.anio}`;
  const asunto = getAsuntoFactura(params.facturacionTipo, periodo);
  const html = buildFacturaHtml({
    nombre: params.nombre,
    facturacionTipo: params.facturacionTipo,
    periodo,
    folio: params.folio,
    total: params.total,
  });

  const result = await enviarEmail({ to: params.email, subject: asunto, html });

  const supabase = await createClient();
  await supabase.from("correos_enviados").insert({
    tipo: "FACTURA",
    destinatario_rut: params.rut,
    destinatario_nombre: params.nombre,
    destinatario_email: params.email,
    asunto,
    folio: params.folio,
    monto: params.total,
    estado: result.success ? "ENVIADO" : "ERROR",
    error: result.error || null,
    mes: params.mes,
    anio: params.anio,
  });

  revalidatePath("/comercial/facturacion");
  return result;
}

export async function enviarFacturasMasivo(facturas: {
  rut: string;
  nombre: string;
  email: string;
  folio: string;
  total: number;
  facturacionTipo: string;
  mes: number;
  anio: number;
}[]) {
  let exitosos = 0;
  let fallidos = 0;
  const resultados: { rut: string; nombre: string; success: boolean; error?: string }[] = [];

  for (const f of facturas) {
    if (!f.email) {
      resultados.push({ rut: f.rut, nombre: f.nombre, success: false, error: "Sin email" });
      fallidos++;
      continue;
    }
    const result = await enviarCorreoFactura(f);
    resultados.push({ rut: f.rut, nombre: f.nombre, ...result });
    if (result.success) exitosos++;
    else fallidos++;
  }

  return { exitosos, fallidos, total: facturas.length, resultados };
}

export async function getCorreosEnviados(tipo: string, anio: number, mes?: number) {
  const supabase = await createClient();
  let query = supabase
    .from("correos_enviados")
    .select("*")
    .eq("tipo", tipo)
    .eq("anio", anio)
    .order("created_at", { ascending: false });

  if (mes) query = query.eq("mes", mes);

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: data || [], error: null };
}

export async function previewFacturaHtml(params: {
  nombre: string;
  facturacionTipo: string;
  folio: string;
  total: number;
  mes: number;
  anio: number;
}) {
  const periodo = `${MESES[params.mes]} ${params.anio}`;
  return {
    asunto: getAsuntoFactura(params.facturacionTipo, periodo),
    html: buildFacturaHtml({
      nombre: params.nombre,
      facturacionTipo: params.facturacionTipo,
      periodo,
      folio: params.folio,
      total: params.total,
    }),
  };
}
