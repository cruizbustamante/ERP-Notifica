"use server";

import { createClient } from "@/lib/supabase/server";

export type Rol = "admin" | "contador" | "comercial" | "consulta";

export type UsuarioActual = {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
};

const JERARQUIA: Record<Rol, number> = {
  admin: 4,
  contador: 3,
  comercial: 2,
  consulta: 1,
};

export async function getUsuarioActual(): Promise<UsuarioActual | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: role } = await supabase
    .from("user_roles")
    .select("nombre, rol, activo, email")
    .eq("user_id", user.id)
    .single();

  if (!role || !role.activo) return null;

  return {
    id: user.id,
    email: role.email || user.email || "",
    nombre: role.nombre || "",
    rol: (role.rol as Rol) || "consulta",
    activo: role.activo,
  };
}

export async function requireRol(minimo: Rol): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (!usuario) throw new Error("No autenticado");
  if (JERARQUIA[usuario.rol] < JERARQUIA[minimo]) {
    throw new Error(`Permiso denegado. Se requiere rol: ${minimo}`);
  }
  return usuario;
}

export async function requireAuth(): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (!usuario) throw new Error("No autenticado");
  return usuario;
}

export async function puedeEscribir(rol: Rol): Promise<boolean> {
  return JERARQUIA[rol] >= JERARQUIA.comercial;
}

export async function puedeContabilizar(rol: Rol): Promise<boolean> {
  return JERARQUIA[rol] >= JERARQUIA.contador;
}

export async function esAdmin(rol: Rol): Promise<boolean> {
  return rol === "admin";
}

export async function getPermisosPorSeccion(): Promise<Record<string, Rol>> {
  return {
    configuracion: "admin",
    cierre: "admin",
    centralizacion: "contador",
    comprobantes: "contador",
    conciliacion: "contador",
    "plan-cuentas": "contador",
    facturacion: "comercial",
    cobranza: "comercial",
    marketplace: "comercial",
    clientes: "comercial",
    suscripciones: "comercial",
  };
}
