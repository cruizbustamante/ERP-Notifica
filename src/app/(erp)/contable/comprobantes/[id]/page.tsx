import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DetalleComprobanteClient from "./DetalleComprobanteClient";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("comprobantes")
    .select("*")
    .eq("id", Number(id))
    .single();

  if (!comp) redirect("/contable/comprobantes");

  const { data: movs } = await supabase
    .from("mov_contables")
    .select("*")
    .eq("comprobante_id", comp.id)
    .order("linea");

  const { data: cuentas } = await supabase
    .from("plan_cuentas")
    .select("codigo, nombre, tipo, nivel, usa_auxiliar, usa_documento")
    .eq("estado", "S")
    .eq("nivel", 4)
    .order("codigo");

  return (
    <DetalleComprobanteClient
      comprobante={{ ...comp, lineas: movs || [] }}
      cuentas={cuentas || []}
    />
  );
}
