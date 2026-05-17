import { createClient } from "@/lib/supabase/server";
import { normalizeRut } from "@/lib/rut";
import ClientesClient from "./ClientesClient";

export default async function ClientesPage() {
  const supabase = await createClient();
  const anio = new Date().getFullYear();

  const [{ data: auxiliares }, { data: fichas }, { data: ventas }, { data: movsCxC }] = await Promise.all([
    supabase.from("auxiliares").select("*").eq("estado", "S").order("razon_social"),
    supabase.from("ficha_comercial").select("*"),
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
    const rut = normalizeRut(v.rut_receptor);
    if (!rut) continue;
    const total = Math.abs(Number(v.monto_total) || 0);
    const isNC = [61, 111].includes(v.tipo_dte);
    const existing = ventasMap.get(rut) || { total: 0, cant: 0, ultima: null };
    existing.total += isNC ? -total : total;
    existing.cant++;
    if (!existing.ultima || (v.fecha_emision && v.fecha_emision > existing.ultima)) existing.ultima = v.fecha_emision;
    ventasMap.set(rut, existing);
  }

  // Saldo CxC
  const saldoCxC = new Map<string, number>();
  for (const m of movsCxC || []) {
    const rut = normalizeRut(m.auxiliar_rut || "");
    if (!rut) continue;
    const monto = (Number(m.debe) || 0) - (Number(m.haber) || 0);
    saldoCxC.set(rut, (saldoCxC.get(rut) || 0) + monto);
  }

  const clientes = (auxiliares || []).map((a) => {
    const rutNorm = normalizeRut(a.rut);
    const vta = ventasMap.get(rutNorm) || { total: 0, cant: 0, ultima: null };
    const saldo = saldoCxC.get(rutNorm) || 0;
    return {
      rut: rutNorm,
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

  const fichasNormalized = (fichas || []).map((f) => ({
    rut: normalizeRut(f.rut),
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

  // Estadísticas para dashboard
  const activos = fichasNormalized.filter((f) => f.estado === "ACTIVO").length;
  const inactivos = fichasNormalized.filter((f) => f.estado === "INACTIVO").length;
  const totalFichas = fichasNormalized.length;
  const retencion = totalFichas > 0 ? Math.round((activos / totalFichas) * 100) : 0;

  // Tipo documento distribución
  const factura = fichasNormalized.filter((f) => f.tipo_doc === "Factura").length;
  const boleta = fichasNormalized.filter((f) => f.tipo_doc === "Boleta").length;
  const otroDoc = totalFichas - factura - boleta;

  // Tarifa promedio
  const conTarifa = fichasNormalized.filter((f) => f.valor_plan > 0);
  const tarifaPromedio = conTarifa.length > 0
    ? conTarifa.reduce((s, f) => s + f.valor_plan, 0) / conTarifa.length
    : 0;

  // Evolución mensual (nuevos clientes por mes basado en fecha_inicio)
  const evolucion: { mes: string; nuevos: number; acumulado: number }[] = [];
  const fechas = fichasNormalized
    .filter((f) => f.fecha_inicio)
    .map((f) => f.fecha_inicio)
    .sort();

  if (fechas.length > 0) {
    const primera = new Date(fechas[0] + "T12:00:00");
    const ahora = new Date();
    let cursor = new Date(primera.getFullYear(), primera.getMonth(), 1);
    let acum = 0;

    while (cursor <= ahora) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const mesStr = `${y}-${String(m + 1).padStart(2, "0")}`;
      const nuevos = fichasNormalized.filter((f) => {
        if (!f.fecha_inicio) return false;
        const d = new Date(f.fecha_inicio + "T12:00:00");
        return d.getFullYear() === y && d.getMonth() === m;
      }).length;
      acum += nuevos;
      const label = new Date(y, m).toLocaleDateString("es-CL", { month: "short", year: "numeric" });
      evolucion.push({ mes: label, nuevos, acumulado: acum });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // Nuevos este mes
  const hoy = new Date();
  const nuevosEsteMes = fichasNormalized.filter((f) => {
    if (!f.fecha_inicio) return false;
    const d = new Date(f.fecha_inicio + "T12:00:00");
    return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth();
  }).length;

  // MRR
  const mrr = fichasNormalized
    .filter((f) => f.estado === "ACTIVO" && f.valor_plan > 0)
    .reduce((s, f) => s + f.valor_plan, 0);

  // CxC total
  const totalCxC = clientes.reduce((s, c) => s + c.saldoPendiente, 0);
  const clientesConDeuda = clientes.filter((c) => c.saldoPendiente > 0).length;
  const totalVentasGlobal = clientes.reduce((s, c) => s + c.totalVentas, 0);

  // Plan distribución
  const planes = new Map<string, number>();
  for (const f of fichasNormalized) {
    const p = f.plan || "Sin plan";
    planes.set(p, (planes.get(p) || 0) + 1);
  }

  return (
    <ClientesClient
      clientes={clientes}
      fichas={fichasNormalized}
      totalClientes={clientes.length}
      totalVentasGlobal={totalVentasGlobal}
      clientesConDeuda={clientesConDeuda}
      dashboard={{
        activos,
        inactivos,
        totalFichas,
        retencion,
        factura,
        boleta,
        otroDoc,
        tarifaPromedio,
        evolucion,
        nuevosEsteMes,
        mrr,
        totalCxC,
        planes: Object.fromEntries(planes),
      }}
    />
  );
}
