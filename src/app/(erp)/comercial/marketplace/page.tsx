import { createClient } from "@/lib/supabase/server";
import MarketplaceClient from "./MarketplaceClient";

export default async function MarketplacePage() {
  const supabase = await createClient();

  const [{ data: transacciones }, { data: receptores }] = await Promise.all([
    supabase
      .from("marketplace_transacciones")
      .select("*")
      .order("fecha_transaccion", { ascending: false })
      .limit(200),
    supabase
      .from("marketplace_transacciones")
      .select("receptor_rut, receptor_nombre")
      .limit(1000),
  ]);

  const receptoresUnicos = Array.from(
    new Map(
      (receptores || []).map((r) => [r.receptor_rut, { rut: r.receptor_rut, nombre: r.receptor_nombre || r.receptor_rut }])
    ).values()
  );

  return (
    <MarketplaceClient
      transaccionesIniciales={transacciones || []}
      receptores={receptoresUnicos}
    />
  );
}
