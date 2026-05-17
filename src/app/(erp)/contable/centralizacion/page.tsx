import { createClient } from "@/lib/supabase/server";
import CentralizacionClient from "./CentralizacionClient";

export default async function CentralizacionPage() {
  const supabase = await createClient();
  const currentYear = new Date().getFullYear();

  const [
    { data: periodos },
    { data: cuentasVentas },
    { data: cuentasGastos },
    { data: reglas },
    { data: configRows },
  ] = await Promise.all([
    supabase.from("periodos").select("anio, estado").order("anio", { ascending: false }),
    supabase.from("plan_cuentas").select("codigo, nombre").eq("nivel", 4).eq("estado", "S").eq("tipo", "I").order("codigo"),
    supabase.from("plan_cuentas").select("codigo, nombre").eq("nivel", 4).eq("estado", "S").eq("tipo", "G").order("codigo"),
    supabase.from("reglas_centralizacion").select("*").eq("estado", "S").order("razon_social"),
    supabase.from("config").select("clave, valor").like("clave", "CENT_%"),
  ]);

  const configCent: Record<string, string> = {};
  for (const r of configRows || []) configCent[r.clave] = r.valor;

  return (
    <CentralizacionClient
      periodos={periodos || []}
      cuentasVentas={cuentasVentas || []}
      cuentasGastos={cuentasGastos || []}
      reglas={reglas || []}
      configCent={configCent}
      currentYear={currentYear}
    />
  );
}
