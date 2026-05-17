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

// ─── Usuarios ─────────────────────────────────────────────────────────

export async function getUsuarios() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("*")
    .order("created_at");
  if (error) return { data: [], error: error.message };
  return { data: data || [], error: null };
}

export async function crearUsuario(data: { email: string; password: string; nombre: string; rol: string }) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("user_roles")
    .select("id")
    .eq("email", data.email)
    .single();

  if (existing) return { error: "Ya existe un usuario con ese email" };

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({
        email: data.email,
        password: data.password,
      }),
    }
  );

  const result = await res.json();
  if (!res.ok || result.error) {
    return { error: result.error?.message || result.msg || "Error al crear usuario en auth" };
  }

  const userId = result.id || result.user?.id;
  if (!userId) return { error: "No se pudo obtener el ID del usuario creado" };

  const { error: roleErr } = await supabase.from("user_roles").insert({
    user_id: userId,
    email: data.email,
    nombre: data.nombre,
    rol: data.rol,
    activo: true,
  });

  if (roleErr) return { error: roleErr.message };

  revalidatePath("/configuracion");
  return { error: null };
}

export async function actualizarUsuario(id: number, data: { nombre: string; rol: string }) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_roles")
    .update({ nombre: data.nombre, rol: data.rol })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { error: null };
}

export async function toggleUsuario(id: number, activo: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_roles")
    .update({ activo: !activo })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { error: null };
}
