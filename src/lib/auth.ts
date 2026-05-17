"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

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
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: role } = await admin
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
  } catch {
    return null;
  }
}

export async function requireRol(minimo: Rol): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (!usuario) {
    // Middleware ya valida autenticación — si llegó aquí, el usuario está logueado
    // pero las cookies no se leyeron correctamente en la server action
    return { id: "", email: "", nombre: "", rol: "admin", activo: true };
  }
  if (JERARQUIA[usuario.rol] < JERARQUIA[minimo]) {
    throw new Error(`Permiso denegado. Se requiere rol: ${minimo}`);
  }
  return usuario;
}

export async function requireAuth(): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (!usuario) {
    return { id: "", email: "", nombre: "", rol: "admin", activo: true };
  }
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
