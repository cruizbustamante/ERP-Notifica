"use server";

import { createClient } from "@/lib/supabase/server";
import { enviarEmail, buildCobranzaHtml, getAsuntoCobranza, type DocCobranza } from "@/lib/email";
import { revalidatePath } from "next/cache";
import { requireRol } from "@/lib/auth";

export async function enviarCorreoCobranza(params: {
  rut: string;
  nombre: string;
  email: string;
  docs: DocCobranza[];
  totalDeuda: number;
  maxDias: number;
  nivel: "RECORDATORIO" | "URGENTE" | "CRITICO";
  mes: number;
  anio: number;
}) {
  await requireRol("comercial");
  const asunto = getAsuntoCobranza(params.nivel);
  const html = buildCobranzaHtml({
    nombre: params.nombre,
    docs: params.docs,
    totalDeuda: params.totalDeuda,
    maxDias: params.maxDias,
    nivel: params.nivel,
  });

  const result = await enviarEmail({ to: params.email, subject: asunto, html });

  const supabase = await createClient();
  await supabase.from("correos_enviados").insert({
    tipo: "COBRANZA",
    destinatario_rut: params.rut,
    destinatario_nombre: params.nombre,
    destinatario_email: params.email,
    asunto,
    nivel: params.nivel,
    monto: params.totalDeuda,
    estado: result.success ? "ENVIADO" : "ERROR",
    error: result.error || null,
    mes: params.mes,
    anio: params.anio,
  });

  revalidatePath("/comercial/cobranza");
  return result;
}

export async function enviarCobranzaMasivo(clientes: {
  rut: string;
  nombre: string;
  email: string;
  docs: DocCobranza[];
  totalDeuda: number;
  maxDias: number;
  nivel: "RECORDATORIO" | "URGENTE" | "CRITICO";
  mes: number;
  anio: number;
}[]) {
  let exitosos = 0;
  let fallidos = 0;
  const resultados: { rut: string; nombre: string; nivel: string; success: boolean; error?: string }[] = [];

  for (const c of clientes) {
    if (!c.email) {
      resultados.push({ rut: c.rut, nombre: c.nombre, nivel: c.nivel, success: false, error: "Sin email" });
      fallidos++;
      continue;
    }
    const result = await enviarCorreoCobranza(c);
    resultados.push({ rut: c.rut, nombre: c.nombre, nivel: c.nivel, ...result });
    if (result.success) exitosos++;
    else fallidos++;
  }

  return { exitosos, fallidos, total: clientes.length, resultados };
}

export async function getCorreosCobranza(anio: number, mes?: number) {
  const supabase = await createClient();
  let query = supabase
    .from("correos_enviados")
    .select("*")
    .eq("tipo", "COBRANZA")
    .eq("anio", anio)
    .order("created_at", { ascending: false });

  if (mes) query = query.eq("mes", mes);

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: data || [], error: null };
}

export async function previewCobranzaHtml(params: {
  nombre: string;
  docs: DocCobranza[];
  totalDeuda: number;
  maxDias: number;
  nivel: "RECORDATORIO" | "URGENTE" | "CRITICO";
}) {
  return {
    asunto: getAsuntoCobranza(params.nivel),
    html: buildCobranzaHtml(params),
  };
}
