"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Config empresa ────────────────────────────────────────────────────

export async function updateConfig(clave: string, valor: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("config")
    .upsert({ clave, valor }, { onConflict: "clave" });
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { error: null };
}

// ─── Categorías flujo ──────────────────────────────────────────────────

export async function upsertCategoriaFlujo(data: {
  id?: number;
  codigo: string;
  nombre: string;
  tipo: string;
  orden: number;
}) {
  const supabase = await createClient();
  if (data.id) {
    const { error } = await supabase
      .from("categoria_flujo")
      .update({ codigo: data.codigo, nombre: data.nombre, tipo: data.tipo, orden: data.orden })
      .eq("id", data.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("categoria_flujo")
      .insert({ codigo: data.codigo, nombre: data.nombre, tipo: data.tipo, orden: data.orden });
    if (error) return { error: error.message };
  }
  revalidatePath("/configuracion");
  revalidatePath("/contable/conciliacion");
  return { error: null };
}

export async function toggleCategoriaFlujo(id: number, estado: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("categoria_flujo")
    .update({ estado: estado === "S" ? "N" : "S" })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  revalidatePath("/contable/conciliacion");
  return { error: null };
}

// ─── Tipos documento ───────────────────────────────────────────────────

export async function upsertTipoDocumento(data: {
  id?: number;
  codigo: string;
  nombre: string;
  abreviatura: string;
  clasificacion: string;
  codigo_sii: number;
  afecto_iva: string;
  origen: string;
}) {
  const supabase = await createClient();
  if (data.id) {
    const { error } = await supabase
      .from("tipos_documento")
      .update(data)
      .eq("id", data.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("tipos_documento")
      .insert(data);
    if (error) return { error: error.message };
  }
  revalidatePath("/configuracion");
  return { error: null };
}

export async function toggleTipoDocumento(id: number, estado: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tipos_documento")
    .update({ estado: estado === "S" ? "N" : "S" })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { error: null };
}

// ─── Planes ────────────────────────────────────────────────────────────

export async function upsertPlan(data: {
  id?: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  valor_base: number;
  moneda: string;
}) {
  const supabase = await createClient();
  if (data.id) {
    const { error } = await supabase.from("planes").update(data).eq("id", data.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("planes").insert(data);
    if (error) return { error: error.message };
  }
  revalidatePath("/configuracion");
  return { error: null };
}

export async function togglePlan(id: number, estado: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("planes")
    .update({ estado: estado === "S" ? "N" : "S" })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { error: null };
}
