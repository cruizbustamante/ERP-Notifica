import { createClient } from "@/lib/supabase/server";
import NuevoComprobanteClient from "./NuevoComprobanteClient";

export default async function NuevoComprobantePage() {
  const supabase = await createClient();

  const [{ data: cuentas }, { data: tiposDoc }, { data: auxiliares }] =
    await Promise.all([
      supabase
        .from("plan_cuentas")
        .select("codigo, nombre, tipo, usa_auxiliar, usa_documento")
        .eq("nivel", 4)
        .eq("estado", "S")
        .order("codigo"),
      supabase
        .from("tipos_documento")
        .select("codigo, nombre, abreviatura")
        .eq("estado", "S")
        .order("codigo"),
      supabase
        .from("auxiliares")
        .select("rut, razon_social")
        .eq("estado", "S")
        .order("razon_social"),
    ]);

  return (
    <NuevoComprobanteClient
      cuentas={cuentas || []}
      tiposDoc={tiposDoc || []}
      auxiliares={auxiliares || []}
    />
  );
}
