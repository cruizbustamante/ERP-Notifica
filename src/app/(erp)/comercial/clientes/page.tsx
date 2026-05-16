import { createClient } from "@/lib/supabase/server";
import ClientesClient from "./ClientesClient";

export default async function ClientesPage() {
  const supabase = await createClient();
  const anio = new Date().getFullYear();

  const [{ data: auxiliares }, { data: ventas }, { data: movsCxC }] = await Promise.all([
    supabase.from("auxiliares").select("*").eq("estado", "S").order("razon_social"),
    supabase.from("ventas_sii").select("rut_receptor, monto_total, folio, fecha_emision, tipo_dte").eq("anio", anio),
    supabase
      .from("mov_contables")
      .select("auxiliar_rut, debe, haber, tipo_doc, num_doc, referencia, comprobantes!inner(estado)")
      .eq("cuenta_codigo", "1-1-03-001")
      .eq("comprobantes.estado", "VIGENTE")
      .neq("tipo_doc", ""),
  ]);

  // Ventas por cliente
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

  // Saldo pendiente CxC por auxiliar
  const saldoCxC = new Map<string, number>();
  for (const m of movsCxC || []) {
    const rut = m.auxiliar_rut || "";
    if (!rut) continue;
    const docKey = `${rut}|${m.tipo_doc}|${m.num_doc}`;
    const refKey = m.referencia ? `${rut}|${m.referencia}` : docKey;
    const isReg = !m.referencia || m.referencia === `${m.tipo_doc}|${m.num_doc}`;
    const monto = (Number(m.debe) || 0) - (Number(m.haber) || 0);
    const key = isReg ? rut : rut;
    saldoCxC.set(key, (saldoCxC.get(key) || 0) + monto);
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

  const conVentas = clientes.filter((c) => c.totalVentas > 0 || c.cantDocs > 0);
  const totalVentasGlobal = conVentas.reduce((s, c) => s + c.totalVentas, 0);
  const clientesConDeuda = clientes.filter((c) => c.saldoPendiente > 0).length;

  return (
    <ClientesClient
      clientes={clientes}
      totalClientes={clientes.length}
      totalVentasGlobal={totalVentasGlobal}
      clientesConDeuda={clientesConDeuda}
    />
  );
}
