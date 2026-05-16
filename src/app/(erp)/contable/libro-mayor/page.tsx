import { createClient } from "@/lib/supabase/server";
import LibroMayorClient from "./LibroMayorClient";

export default async function LibroMayorPage() {
  const supabase = await createClient();
  const currentYear = new Date().getFullYear();

  const [{ data: periodos }, { data: cuentas }] = await Promise.all([
    supabase
      .from("periodos")
      .select("anio, estado")
      .order("anio", { ascending: false }),
    supabase
      .from("plan_cuentas")
      .select("codigo, nombre, tipo")
      .eq("nivel", 4)
      .eq("estado", "S")
      .order("codigo"),
  ]);

  return (
    <LibroMayorClient
      periodos={periodos || []}
      cuentas={cuentas || []}
      currentYear={currentYear}
    />
  );
}
