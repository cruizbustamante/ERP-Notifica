import { createClient } from "@/lib/supabase/server";
import ClientesClient from "./ClientesClient";

export default async function ClientesPage() {
  const supabase = await createClient();
  const anio = new Date().getFullYear();

  const [{ data: auxiliares }, { data: ventas }, { data: movsCxC }, { data: fichas }] = await Promise.all([
    supabase.from("auxiliares").select("*").eq("estado", "S").order("razon_social"),
    supabase.from("ventas_sii").select("rut_receptor, monto_total, folio, fecha_emision, tipo_dte").eq("anio", anio),
    supabase
      .from("mov_contables")
      .select("auxiliar_rut, debe, haber, tipo_doc, num_doc, referencia, comprobantes!inner(estado)")
      .eq("cuenta_codigo", "1-1-03-001")
      .eq("comprobantes.estado", "VIGENTE")
      .neq("tipo_doc", ""),
    supabase.from("ficha_comercial").select("*"),
  ]);

  const ventasMap = new Map<string, { total: number; cant: number; ultima: string | null }>();
  for (const v of ventas || []) {
    const rut = v.rut_receptor;
    if (!rut) continue;
    const total = Math.abs(Number(v.monto_total) || 0);
    const isNC = [61, 111].includes(v.tipo_dte);
    const existing = ventasMap.get(rut) || { total: 0, cant: 0, ultima: null };
    existing.total += isNC ? -total : total;
    existing.cant++;
    if (!existing.ultima || (v.fecha_emision && v.fecha_emision > existing.ultima)) existing.ultima = v.fecha_emision;
    ventasMap.set(rut, existing);
  }

  const saldoCxC = new Map<string, number>();
  for (const m of movsCxC || []) {
    const rut = m.auxiliar_rut || "";
    if (!rut) continue;
    const monto = (Number(m.debe) || 0) - (Number(m.haber) || 0);
    saldoCxC.set(rut, (saldoCxC.get(rut) || 0) + monto);
  }

  const clientes = (auxiliares || []).map((a) => {
    const vta = ventasMap.get(a.rut) || { total: 0, cant: 0, ultima: null };
    const saldo = saldoCxC.get(a.rut) || 0;
    return {
      rut: a.rut,
      razon_social: a.razon_social,
      giro: a.giro || "",
      email: a.email || "",
      telefono: a.telefono || "",
      comuna: a.comuna || "",
      totalVentas: vta.total,
      cantDocs: vta.cant,
      ultimaVenta: vta.ultima,
      saldoPendiente: Math.max(saldo, 0),
    };
  });

  const totalVentasGlobal = clientes.reduce((s, c) => s + c.totalVentas, 0);
  const clientesConDeuda = clientes.filter((c) => c.saldoPendiente > 0).length;

  const fichasNormalized = (fichas || []).map((f) => ({
    rut: f.rut,
    razon_social: f.razon_social || "",
    email: f.email || "",
    giro: f.giro || "",
    direccion: f.direccion || "",
    telefono: f.telefono || "",
    facturacion_tipo: f.facturacion_tipo || "",
    tipo_doc: f.tipo_doc || "",
    plan: f.plan || "",
    valor_plan: Number(f.valor_plan) || 0,
    fecha_inicio: f.fecha_inicio || "",
    estado: f.estado || "",
    notas: f.notas || "",
  }));

  return (
    <ClientesClient
      clientes={clientes}
      fichas={fichasNormalized}
      totalClientes={clientes.length}
      totalVentasGlobal={totalVentasGlobal}
      clientesConDeuda={clientesConDeuda}
    />
  );
}
