import { createClient } from "@/lib/supabase/server";
import CobranzaClient from "./CobranzaClient";

export default async function CobranzaPage() {
  const supabase = await createClient();
  const anio = new Date().getFullYear();
  const mes = new Date().getMonth() + 1;

  const [{ data: config }, { data: auxiliares }, { data: correos }] = await Promise.all([
    supabase.from("config_contable").select("clave, valor"),
    supabase.from("auxiliares").select("rut, razon_social, email, telefono").eq("estado", "S"),
    supabase
      .from("correos_enviados")
      .select("destinatario_rut, nivel, mes, anio, estado, created_at")
      .eq("tipo", "COBRANZA")
      .eq("anio", anio),
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

  type DocInfo = { saldo: number; fecha_doc: string | null; rut: string; tipo_doc: string; num_doc: string };
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
      docSaldos.set(key, { saldo: monto, fecha_doc: m.fecha_doc, rut: m.auxiliar_rut, tipo_doc: m.tipo_doc || "", num_doc: m.num_doc || "" });
    }
  }

  type DocPendiente = { tipoDoc: string; numDoc: string; dias: number; saldo: number };
  const clienteMap = new Map<string, { totalDeuda: number; docs: DocPendiente[]; diasMax: number }>();

  for (const [, val] of docSaldos) {
    if (val.saldo < 1) continue;
    const dias = val.fecha_doc ? Math.max(0, Math.floor((hoy.getTime() - new Date(val.fecha_doc).getTime()) / 86400000)) : 0;
    const existing = clienteMap.get(val.rut);
    const docInfo: DocPendiente = { tipoDoc: val.tipo_doc, numDoc: val.num_doc, dias, saldo: val.saldo };
    if (existing) {
      existing.totalDeuda += val.saldo;
      existing.docs.push(docInfo);
      existing.diasMax = Math.max(existing.diasMax, dias);
    } else {
      clienteMap.set(val.rut, { totalDeuda: val.saldo, docs: [docInfo], diasMax: dias });
    }
  }

  function getNivel(dias: number): "NORMAL" | "ALERTA" | "CRÍTICO" | "JUDICIAL" {
    if (dias <= 30) return "NORMAL";
    if (dias <= 60) return "ALERTA";
    if (dias <= 90) return "CRÍTICO";
    return "JUDICIAL";
  }

  const correosMap: Record<string, { nivel: string; mes: number; fecha: string }[]> = {};
  for (const c of correos || []) {
    if (!correosMap[c.destinatario_rut]) correosMap[c.destinatario_rut] = [];
    correosMap[c.destinatario_rut].push({ nivel: c.nivel, mes: c.mes, fecha: c.created_at });
  }

  const clientes = Array.from(clienteMap.entries())
    .map(([rut, data]) => {
      const aux = auxiliaresMap.get(rut);
      const nivel = getNivel(data.diasMax);
      return {
        rut,
        razon_social: aux?.razon_social || rut,
        email: aux?.email || "",
        telefono: aux?.telefono || "",
        totalDeuda: data.totalDeuda,
        docs: data.docs,
        cantDocs: data.docs.length,
        diasMax: data.diasMax,
        nivel,
        correosEnviados: correosMap[rut] || [],
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
      anio={anio}
      mes={mes}
    />
  );
}
