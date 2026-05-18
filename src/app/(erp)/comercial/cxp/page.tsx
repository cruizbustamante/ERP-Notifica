import { createClient } from "@/lib/supabase/server";
import CxPClient from "./CxPClient";

export default async function CuentasPorPagarPage() {
  const supabase = await createClient();

  const [{ data: config }, { data: auxiliares }] = await Promise.all([
    supabase.from("config_contable").select("clave, valor"),
    supabase.from("auxiliares").select("rut, razon_social").eq("estado", "S"),
  ]);

  const configMap: Record<string, string> = {};
  for (const c of config || []) configMap[c.clave] = c.valor;
  const ctaCxP = configMap.CUENTA_PROVEEDORES || "2-1-02-001";

  const { data: movs } = await supabase
    .from("mov_contables")
    .select("auxiliar_rut, debe, haber, tipo_doc, num_doc, fecha_doc, tipo_doc_ref, num_doc_ref, comprobantes!inner(estado)")
    .eq("cuenta_codigo", ctaCxP)
    .eq("comprobantes.estado", "VIGENTE")
    .neq("tipo_doc", "");

  const auxiliaresMap = new Map<string, string>();
  for (const a of auxiliares || []) auxiliaresMap.set(a.rut, a.razon_social);

  const hoy = new Date();
  const saldos = new Map<string, { saldo: number; fecha_doc: string | null }>();

  for (const m of movs || []) {
    if (!m.auxiliar_rut) continue;
    const docKey = `${m.auxiliar_rut}|${m.tipo_doc}|${m.num_doc}`;
    const hasRef = m.tipo_doc_ref && m.num_doc_ref;
    const refKey = hasRef ? `${m.auxiliar_rut}|${m.tipo_doc_ref}|${m.num_doc_ref}` : docKey;
    const isReg = !hasRef;
    const monto = (Number(m.haber) || 0) - (Number(m.debe) || 0);
    const key = isReg ? docKey : refKey;
    const existing = saldos.get(key);
    if (existing) {
      existing.saldo += monto;
    } else {
      saldos.set(key, { saldo: monto, fecha_doc: m.fecha_doc });
    }
  }

  const documentos = Array.from(saldos.entries())
    .filter(([, v]) => Math.abs(v.saldo) >= 1)
    .map(([key, val]) => {
      const [rut, tipo, num] = key.split("|");
      const dias = val.fecha_doc ? Math.max(0, Math.floor((hoy.getTime() - new Date(val.fecha_doc).getTime()) / 86400000)) : 0;
      return {
        auxiliar_rut: rut,
        razon_social: auxiliaresMap.get(rut) || rut,
        tipo_doc: tipo,
        num_doc: num,
        fecha_doc: val.fecha_doc,
        saldo: Math.abs(val.saldo),
        dias,
      };
    })
    .sort((a, b) => b.dias - a.dias);

  return (
    <CxPClient
      documentos={documentos}
      totalPendiente={documentos.reduce((s, d) => s + d.saldo, 0)}
    />
  );
}
