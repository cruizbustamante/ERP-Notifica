import { createClient } from "@/lib/supabase/server";
import ConciliacionClient from "./ConciliacionClient";

export default async function ConciliacionPage() {
  const supabase = await createClient();
  const currentYear = new Date().getFullYear();

  const [{ data: periodos }, { data: cuentas }, { data: auxiliares }] =
    await Promise.all([
      supabase
        .from("periodos")
        .select("anio, estado")
        .order("anio", { ascending: false }),
      supabase
        .from("plan_cuentas")
        .select("codigo, nombre, tipo, usa_auxiliar, usa_documento")
        .eq("nivel", 4)
        .eq("estado", "S")
        .order("codigo"),
      supabase
        .from("auxiliares")
        .select("rut, razon_social")
        .eq("estado", "S")
        .order("razon_social"),
    ]);

  return (
    <ConciliacionClient
      periodos={periodos || []}
      cuentas={cuentas || []}
      auxiliares={auxiliares || []}
      currentYear={currentYear}
    />
  );
}
