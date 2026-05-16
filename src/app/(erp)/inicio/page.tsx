import { createClient } from "@/lib/supabase/server";
import CommandCenter from "../../CommandCenter";

export default async function InicioPage() {
  const supabase = await createClient();
  const anio = new Date().getFullYear();

  const [
    { count: totalComprobantes },
    { count: totalVentas },
    { count: totalCompras },
    { data: cartolaPend },
    { data: ventasPend },
    { data: comprasPend },
  ] = await Promise.all([
    supabase.from("comprobantes").select("*", { count: "exact", head: true }).eq("anio", anio).eq("estado", "VIGENTE"),
    supabase.from("ventas_sii").select("*", { count: "exact", head: true }).eq("anio", anio),
    supabase.from("compras_sii").select("*", { count: "exact", head: true }).eq("anio", anio),
    supabase.from("cartolas").select("id").eq("anio", anio).eq("contabilizado", false),
    supabase.from("ventas_sii").select("id").eq("anio", anio).eq("centralizado", false),
    supabase.from("compras_sii").select("id").eq("anio", anio).eq("centralizado", false),
  ]);

  return (
    <CommandCenter
      anio={anio}
      stats={{
        comprobantes: totalComprobantes || 0,
        ventas: totalVentas || 0,
        compras: totalCompras || 0,
        cartolaPendiente: cartolaPend?.length || 0,
        ventasPendiente: ventasPend?.length || 0,
        comprasPendiente: comprasPend?.length || 0,
      }}
    />
  );
}
