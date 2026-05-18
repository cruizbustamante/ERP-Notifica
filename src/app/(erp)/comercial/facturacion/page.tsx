import { createClient } from "@/lib/supabase/server";
import FacturacionClient from "./FacturacionClient";

export default async function FacturacionPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const supabase = await createClient();
  const params = await searchParams;
  const currentYear = new Date().getFullYear();
  const anio = params.anio ? Number(params.anio) : currentYear;
  const mesActual = new Date().getMonth() + 1;

  const [
    { data: ventas },
    { data: fichas },
    { data: correos },
    { data: periodos },
  ] = await Promise.all([
    supabase
      .from("ventas_sii")
      .select("id, tipo_dte, tipo_dte_nombre, rut_receptor, razon_social, folio, fecha_emision, monto_neto, monto_iva, monto_total, estado_sii, centralizado, mes")
      .eq("anio", anio)
      .order("fecha_emision", { ascending: false }),
    supabase
      .from("ficha_comercial")
      .select("rut, razon_social, email, contacto_email, facturacion_tipo, tipo_doc, plan, valor_plan, estado")
      .eq("estado", "ACTIVO"),
    supabase
      .from("correos_enviados")
      .select("destinatario_rut, folio, mes, anio, estado, created_at")
      .eq("tipo", "FACTURA")
      .eq("anio", anio),
    supabase.from("periodos").select("anio, estado").order("anio", { ascending: false }),
  ]);

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
    mes: v.mes || 0,
  }));

  const clientesActivos = (fichas || []).map((f) => ({
    rut: f.rut,
    razon_social: f.razon_social,
    email: f.email || f.contacto_email || "",
    facturacion_tipo: f.facturacion_tipo || "",
    tipo_doc: f.tipo_doc || "",
    plan: f.plan || "",
    valor_plan: Number(f.valor_plan) || 0,
  }));

  const correosMap: Record<string, { mes: number; folio: string; fecha: string }[]> = {};
  for (const c of correos || []) {
    const key = c.destinatario_rut;
    if (!correosMap[key]) correosMap[key] = [];
    correosMap[key].push({ mes: c.mes, folio: c.folio, fecha: c.created_at });
  }

  const resumenMensual = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const docsDelMes = documentos.filter((d) => d.mes === mes || new Date(d.fecha_emision).getMonth() + 1 === mes);
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
      periodos={periodos || []}
      anio={anio}
      mesActual={mesActual}
      documentos={documentos}
      clientesActivos={clientesActivos}
      correosEnviados={correosMap}
      resumenMensual={resumenMensual}
      totalFacturado={noNC.reduce((s, d) => s + d.monto_total, 0)}
      totalNC={siNC.reduce((s, d) => s + d.monto_total, 0)}
      cantDocs={documentos.length}
    />
  );
}
