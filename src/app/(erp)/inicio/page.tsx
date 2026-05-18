import { createClient } from "@/lib/supabase/server";
import CommandCenter from "../../CommandCenter";

export default async function InicioPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const supabase = await createClient();
  const params = await searchParams;
  const currentYear = new Date().getFullYear();
  const anio = params.anio ? Number(params.anio) : currentYear;

  const [
    { count: totalComprobantes },
    { count: totalVentas },
    { count: totalCompras },
    { data: cartolaPend },
    { data: ventasPend },
    { data: comprasPend },
    { data: allCartolas },
    { data: periodos },
  ] = await Promise.all([
    supabase.from("comprobantes").select("*", { count: "exact", head: true }).eq("anio", anio).eq("estado", "VIGENTE"),
    supabase.from("ventas_sii").select("*", { count: "exact", head: true }).eq("anio", anio),
    supabase.from("compras_sii").select("*", { count: "exact", head: true }).eq("anio", anio),
    supabase.from("cartolas").select("id").eq("anio", anio).eq("contabilizado", false),
    supabase.from("ventas_sii").select("id").eq("anio", anio).eq("centralizado", false),
    supabase.from("compras_sii").select("id").eq("anio", anio).eq("centralizado", false),
    supabase.from("cartolas").select("monto, cargo_abono"),
    supabase.from("periodos").select("anio, estado").order("anio", { ascending: false }),
  ]);

  const saldoCtaCte = (allCartolas || []).reduce((s, m) => {
    const monto = Math.abs(Number(m.monto));
    return s + (m.cargo_abono === "A" ? monto : -monto);
  }, 0);

  return (
    <CommandCenter
      periodos={periodos || []}
      anio={anio}
      stats={{
        comprobantes: totalComprobantes || 0,
        ventas: totalVentas || 0,
        compras: totalCompras || 0,
        cartolaPendiente: cartolaPend?.length || 0,
        ventasPendiente: ventasPend?.length || 0,
        comprasPendiente: comprasPend?.length || 0,
        saldoCtaCte,
      }}
    />
  );
}
