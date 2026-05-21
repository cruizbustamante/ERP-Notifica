"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizeRut } from "@/lib/rut";
import { requireRol } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type FichaUpdate = {
  rut: string;
  razon_social: string;
  nombre_fantasia?: string;
  giro?: string;
  direccion?: string;
  comuna?: string;
  telefono?: string;
  email?: string;
  contacto_nombre?: string;
  contacto_email?: string;
  facturacion_tipo?: string;
  tipo_doc?: string;
  plan?: string;
  valor_plan?: number;
  fecha_inicio?: string;
  estado?: string;
  notas?: string;
};

export async function guardarFicha(data: FichaUpdate) {
  await requireRol("comercial");
  const supabase = await createClient();
  const rut = normalizeRut(data.rut);
  if (!rut) return { error: "RUT inválido" };

  const record = {
    rut,
    razon_social: data.razon_social,
    nombre_fantasia: data.nombre_fantasia || "",
    giro: data.giro || "",
    direccion: data.direccion || "",
    comuna: data.comuna || "",
    telefono: data.telefono || "",
    email: data.email || "",
    contacto_nombre: data.contacto_nombre || "",
    contacto_email: data.contacto_email || "",
    facturacion_tipo: data.facturacion_tipo || "Mes Vencido",
    tipo_doc: data.tipo_doc || "Factura",
    plan: data.plan || "",
    valor_plan: data.valor_plan || 0,
    fecha_inicio: data.fecha_inicio || null,
    estado: data.estado || "ACTIVO",
    notas: data.notas || "",
  };

  const { error } = await supabase
    .from("ficha_comercial")
    .upsert(record, { onConflict: "rut" });

  if (error) return { error: error.message };

  const { data: existingAux } = await supabase
    .from("auxiliares")
    .select("rut")
    .eq("rut", rut)
    .maybeSingle();

  if (existingAux) {
    await supabase.from("auxiliares").update({
      razon_social: data.razon_social,
      giro: data.giro || "",
      direccion: data.direccion || "",
      comuna: data.comuna || "",
      telefono: data.telefono || "",
      email: data.email || "",
    }).eq("rut", rut);
  } else {
    await supabase.from("auxiliares").insert({
      rut,
      razon_social: data.razon_social,
      giro: data.giro || "",
      direccion: data.direccion || "",
      comuna: data.comuna || "",
      telefono: data.telefono || "",
      email: data.email || "",
      tipo: "CLIENTE",
      estado: "S",
    });
  }

  revalidatePath("/comercial/clientes");
  return { error: null };
}

export type AuxiliarUpdate = {
  rut: string;
  razon_social: string;
  tipo: string;
  giro?: string;
  direccion?: string;
  comuna?: string;
  telefono?: string;
  email?: string;
  estudio_rut?: string;
};

export async function guardarAuxiliar(data: AuxiliarUpdate) {
  await requireRol("comercial");
  const supabase = await createClient();
  const rut = normalizeRut(data.rut);
  if (!rut) return { error: "RUT inválido" };

  const { error } = await supabase.from("auxiliares").upsert({
    rut,
    razon_social: data.razon_social,
    tipo: data.tipo,
    giro: data.giro || "",
    direccion: data.direccion || "",
    comuna: data.comuna || "",
    telefono: data.telefono || "",
    email: data.email || "",
    estudio_rut: data.estudio_rut ? normalizeRut(data.estudio_rut) : "",
    estado: "S",
  }, { onConflict: "rut" });

  if (error) return { error: error.message };
  revalidatePath("/comercial/clientes");
  return { error: null };
}
