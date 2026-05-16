import { createClient } from "@/lib/supabase/server";
import CobranzaClient from "./CobranzaClient";

export default async function CobranzaPage() {
  const supabase = await createClient();

  const [{ data: config }, { data: auxiliares }] = await Promise.all([
    supabase.from("config_contable").select("clave, valor"),
    supabase.from("auxiliares").select("rut, razon_social, email, telefono").eq("estado", "S"),
  ]);

  const configMap: Record<string, string> = {};
  for (const c of config || []) configMap[c.clave] = c.valor;
  const ctaCxC = configMap.CUENTA_CLIENTES || "1-1-03-001";

  const { data: movs } = await supabase
    .from("mov_contables")
    .select("auxiliar_rut, debe, haber, tipo_doc, num_doc, fecha_doc, referencia, comprobantes!inner(estado)")
    .eq("cuenta_codigo", ctaCxC)
    .eq("comprobantes.estado", "VIGENTE")
    .neq("tipo_doc", "");

  const auxiliaresMap = new Map<string, { razon_social: string; email: string; telefono: string }>();
  for (const a of auxiliares || []) {
    auxiliaresMap.set(a.rut, { razon_social: a.razon_social, email: a.email || "", telefono: a.telefono || "" });
  }

  const hoy = new Date();

  // Calculate per-document saldos
  type DocInfo = { saldo: number; fecha_doc: string | null; rut: string };
  const docSaldos = new Map<string, DocInfo>();

  for (const m of movs || []) {
    if (!m.auxiliar_rut) continue;
    const docKey = `${m.auxiliar_rut}|${m.tipo_doc}|${m.num_doc}`;
    const refKey = m.referencia ? `${m.auxiliar_rut}|${m.referencia}` : docKey;
    const isReg = !m.referencia || m.referencia === `${m.tipo_doc}|${m.num_doc}`;
    const monto = (Number(m.debe) || 0) - (Number(m.haber) || 0);
    const key = isReg ? docKey : refKey;
    const existing = docSaldos.get(key);
    if (existing) {
      existing.saldo += monto;
    } else {
      docSaldos.set(key, { saldo: monto, fecha_doc: m.fecha_doc, rut: m.auxiliar_rut });
    }
  }

  // Group by client
  const clienteMap = new Map<string, { totalDeuda: number; docs: number; diasMax: number }>();
  for (const [, val] of docSaldos) {
    if (Math.abs(val.saldo) < 1) continue;
    const dias = val.fecha_doc ? Math.max(0, Math.floor((hoy.getTime() - new Date(val.fecha_doc).getTime()) / 86400000)) : 0;
    const existing = clienteMap.get(val.rut);
    if (existing) {
      existing.totalDeuda += Math.abs(val.saldo);
      existing.docs++;
      existing.diasMax = Math.max(existing.diasMax, dias);
    } else {
      clienteMap.set(val.rut, { totalDeuda: Math.abs(val.saldo), docs: 1, diasMax: dias });
    }
  }

  function getNivel(dias: number): "NORMAL" | "ALERTA" | "CRÍTICO" | "JUDICIAL" {
    if (dias <= 30) return "NORMAL";
    if (dias <= 60) return "ALERTA";
    if (dias <= 90) return "CRÍTICO";
    return "JUDICIAL";
  }

  const clientes = Array.from(clienteMap.entries())
    .map(([rut, data]) => {
      const aux = auxiliaresMap.get(rut);
      return {
        rut,
        razon_social: aux?.razon_social || rut,
        email: aux?.email || "",
        telefono: aux?.telefono || "",
        totalDeuda: data.totalDeuda,
        docs: data.docs,
        diasMax: data.diasMax,
        nivel: getNivel(data.diasMax),
      };
    })
    .sort((a, b) => b.diasMax - a.diasMax);

  const totalDeuda = clientes.reduce((s, c) => s + c.totalDeuda, 0);
  const totalNormal = clientes.filter((c) => c.nivel === "NORMAL").reduce((s, c) => s + c.totalDeuda, 0);
  const totalAlerta = clientes.filter((c) => c.nivel === "ALERTA").reduce((s, c) => s + c.totalDeuda, 0);
  const totalCritico = clientes.filter((c) => c.nivel === "CRÍTICO" || c.nivel === "JUDICIAL").reduce((s, c) => s + c.totalDeuda, 0);

  return (
    <CobranzaClient
      clientes={clientes}
      totalDeuda={totalDeuda}
      totalNormal={totalNormal}
      totalAlerta={totalAlerta}
      totalCritico={totalCritico}
    />
  );
}
