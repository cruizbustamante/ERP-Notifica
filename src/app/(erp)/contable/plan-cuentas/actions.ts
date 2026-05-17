"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRol } from "@/lib/auth";

export async function crearCuenta(data: {
  codigo: string;
  nombre: string;
  tipo: string;
  usa_auxiliar: string;
  usa_documento: string;
  conciliable: string;
  nivel: number;
}) {
  await requireRol("contador");
  if (!/^\d-\d-\d{2}-\d{3}$/.test(data.codigo)) {
    return { error: "Formato de código inválido. Use X-X-XX-XXX" };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("plan_cuentas")
    .select("codigo")
    .eq("codigo", data.codigo)
    .single();

  if (existing) {
    return { error: `El código ${data.codigo} ya existe` };
  }

  if (data.nivel < 4) {
    data.usa_auxiliar = "";
    data.usa_documento = "";
    data.conciliable = "";
  }

  const { error } = await supabase.from("plan_cuentas").insert({
    codigo: data.codigo,
    nombre: data.nombre.toUpperCase(),
    tipo: data.tipo,
    usa_auxiliar: data.usa_auxiliar,
    usa_documento: data.usa_documento,
    conciliable: data.conciliable,
    nivel: data.nivel,
    estado: "S",
  });

  if (error) return { error: error.message };

  revalidatePath("/contable/plan-cuentas");
  return { error: null };
}

export async function actualizarCuenta(
  id: number,
  data: {
    nombre: string;
    usa_auxiliar: string;
    usa_documento: string;
    conciliable: string;
  }
) {
  await requireRol("contador");
  const supabase = await createClient();

  const { error } = await supabase
    .from("plan_cuentas")
    .update({
      nombre: data.nombre.toUpperCase(),
      usa_auxiliar: data.usa_auxiliar,
      usa_documento: data.usa_documento,
      conciliable: data.conciliable,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/contable/plan-cuentas");
  return { error: null };
}

export async function toggleEstado(id: number, nuevoEstado: string) {
  await requireRol("contador");
  const supabase = await createClient();

  if (nuevoEstado === "N") {
    const { data: cuenta } = await supabase
      .from("plan_cuentas")
      .select("codigo")
      .eq("id", id)
      .single();

    if (cuenta) {
      const { count } = await supabase
        .from("mov_contables")
        .select("*", { count: "exact", head: true })
        .eq("cuenta_codigo", cuenta.codigo);

      if (count && count > 0) {
        return {
          error: `No se puede desactivar: tiene ${count} movimientos contables`,
        };
      }
    }
  }

  const { error } = await supabase
    .from("plan_cuentas")
    .update({ estado: nuevoEstado })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/contable/plan-cuentas");
  return { error: null };
}
