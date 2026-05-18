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

  const [{ data: movs }, { data: cuentas }, { data: tiposDoc }, { data: auxiliares }, { data: categoriasFlujo }] =
    await Promise.all([
      supabase
        .from("mov_contables")
        .select("*")
        .eq("comprobante_id", comp.id)
        .order("linea"),
      supabase
        .from("plan_cuentas")
        .select("codigo, nombre, tipo, nivel, usa_auxiliar, usa_documento, conciliable")
        .eq("estado", "S")
        .eq("nivel", 4)
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
      supabase
        .from("categoria_flujo")
        .select("id, codigo, nombre, tipo, flujo, orden")
        .eq("estado", "S")
        .order("orden"),
    ]);

  return (
    <DetalleComprobanteClient
      comprobante={{ ...comp, lineas: movs || [] }}
      cuentas={cuentas || []}
      tiposDoc={tiposDoc || []}
      auxiliares={auxiliares || []}
      categoriasFlujo={categoriasFlujo || []}
    />
  );
}
