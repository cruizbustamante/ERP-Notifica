import { createClient } from "@/lib/supabase/server";
import FacturacionClient from "./FacturacionClient";

export default async function FacturacionPage() {
  const supabase = await createClient();
  const anio = new Date().getFullYear();

  const { data: ventas } = await supabase
    .from("ventas_sii")
    .select("id, tipo_dte, tipo_dte_nombre, rut_receptor, razon_social, folio, fecha_emision, monto_neto, monto_iva, monto_total, estado_sii, centralizado, mes")
    .eq("anio", anio)
    .order("fecha_emision", { ascending: false });

  const documentos = (ventas || []).map((v) => ({
    id: v.id,
    tipo_dte: v.tipo_dte,
    tipo_dte_nombre: v.tipo_dte_nombre || "",
    rut_receptor: v.rut_receptor || "",
    razon_social: v.razon_social || "",
    folio: v.folio || "",
    fecha_emision: v.fecha_emision || "",
    monto_neto: Number(v.monto_neto) || 0,
    monto_iva: Number(v.monto_iva) || 0,
    monto_total: Number(v.monto_total) || 0,
    estado_sii: v.estado_sii || "",
    centralizado: v.centralizado || false,
  }));

  const resumenMensual = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const docsDelMes = documentos.filter((d) => {
      const m = new Date(d.fecha_emision).getMonth() + 1;
      return m === mes;
    });
    const facturas = docsDelMes.filter((d) => ![61, 111].includes(d.tipo_dte));
    const nc = docsDelMes.filter((d) => [61, 111].includes(d.tipo_dte));
    return {
      mes,
      facturas: facturas.length,
      nc: nc.length,
      total: facturas.reduce((s, d) => s + d.monto_total, 0) - nc.reduce((s, d) => s + d.monto_total, 0),
    };
  });

  const noNC = documentos.filter((d) => ![61, 111].includes(d.tipo_dte));
  const siNC = documentos.filter((d) => [61, 111].includes(d.tipo_dte));

  return (
    <FacturacionClient
      anio={anio}
      documentos={documentos}
      resumenMensual={resumenMensual}
      totalFacturado={noNC.reduce((s, d) => s + d.monto_total, 0)}
      totalNC={siNC.reduce((s, d) => s + d.monto_total, 0)}
      cantDocs={documentos.length}
    />
  );
}
