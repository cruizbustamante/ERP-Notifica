import { createClient } from "@/lib/supabase/server";
import CarteraClient from "./CarteraClient";

type DocPendiente = {
  auxiliar_rut: string;
  razon_social: string;
  tipo_doc: string;
  num_doc: string;
  fecha_doc: string | null;
  saldo: number;
  dias: number;
};

type ResumenAuxiliar = {
  rut: string;
  razon_social: string;
  total: number;
  al_dia: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  docs: number;
};

function calcularDocsPendientes(
  movs: { cuenta_codigo: string; debe: string; haber: string; auxiliar_rut: string; tipo_doc: string; num_doc: string; fecha_doc: string | null; referencia: string }[],
  cuentaCodigo: string,
  esDeudor: boolean,
  auxiliaresMap: Map<string, string>,
  hoy: Date,
): DocPendiente[] {
  const saldos = new Map<string, { saldo: number; fecha_doc: string | null }>();

  for (const m of movs) {
    if (m.cuenta_codigo !== cuentaCodigo) continue;
    if (!m.tipo_doc || !m.num_doc) continue;

    const docKey = `${m.auxiliar_rut}|${m.tipo_doc}|${m.num_doc}`;
    const refKey = m.referencia ? `${m.auxiliar_rut}|${m.referencia}` : docKey;
    const isRegistro = !m.referencia || m.referencia === `${m.tipo_doc}|${m.num_doc}`;

    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;
    const monto = esDeudor ? debe - haber : haber - debe;

    const key = isRegistro ? docKey : refKey;
    const existing = saldos.get(key);
    if (existing) {
      existing.saldo += monto;
    } else {
      saldos.set(key, { saldo: monto, fecha_doc: m.fecha_doc });
    }
  }

  const docs: DocPendiente[] = [];
  for (const [key, val] of saldos) {
    if (Math.abs(val.saldo) < 1) continue;
    const [rut, tipo, num] = key.split("|");
    const fechaDoc = val.fecha_doc;
    const dias = fechaDoc ? Math.max(0, Math.floor((hoy.getTime() - new Date(fechaDoc).getTime()) / 86400000)) : 0;

    docs.push({
      auxiliar_rut: rut,
      razon_social: auxiliaresMap.get(rut) || rut,
      tipo_doc: tipo,
      num_doc: num,
      fecha_doc: fechaDoc,
      saldo: Math.abs(val.saldo),
      dias,
    });
  }

  return docs.sort((a, b) => b.dias - a.dias);
}

function agruparPorAuxiliar(docs: DocPendiente[]): ResumenAuxiliar[] {
  const map = new Map<string, ResumenAuxiliar>();
  for (const d of docs) {
    let r = map.get(d.auxiliar_rut);
    if (!r) {
      r = { rut: d.auxiliar_rut, razon_social: d.razon_social, total: 0, al_dia: 0, d31_60: 0, d61_90: 0, d90_plus: 0, docs: 0 };
      map.set(d.auxiliar_rut, r);
    }
    r.total += d.saldo;
    r.docs++;
    if (d.dias <= 30) r.al_dia += d.saldo;
    else if (d.dias <= 60) r.d31_60 += d.saldo;
    else if (d.dias <= 90) r.d61_90 += d.saldo;
    else r.d90_plus += d.saldo;
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export default async function CarteraPage() {
  const supabase = await createClient();
  const hoy = new Date();

  const [{ data: config }, { data: movs }, { data: auxiliares }] = await Promise.all([
    supabase.from("config_contable").select("clave, valor"),
    supabase
      .from("mov_contables")
      .select("cuenta_codigo, debe, haber, auxiliar_rut, tipo_doc, num_doc, fecha_doc, referencia, comprobantes!inner(estado)")
      .eq("comprobantes.estado", "VIGENTE")
      .neq("tipo_doc", ""),
    supabase.from("auxiliares").select("rut, razon_social").eq("estado", "S"),
  ]);

  const configMap: Record<string, string> = {};
  for (const c of config || []) configMap[c.clave] = c.valor;

  const ctaCxC = configMap.CUENTA_CLIENTES || "1-1-03-001";
  const ctaCxP = configMap.CUENTA_PROVEEDORES || "2-1-02-001";

  const auxiliaresMap = new Map<string, string>();
  for (const a of auxiliares || []) auxiliaresMap.set(a.rut, a.razon_social);

  const allMovs = (movs || []).map((m) => ({
    cuenta_codigo: m.cuenta_codigo,
    debe: String(m.debe),
    haber: String(m.haber),
    auxiliar_rut: m.auxiliar_rut || "",
    tipo_doc: m.tipo_doc || "",
    num_doc: m.num_doc || "",
    fecha_doc: m.fecha_doc,
    referencia: m.referencia || "",
  }));

  const cxc = calcularDocsPendientes(allMovs, ctaCxC, true, auxiliaresMap, hoy);
  const cxp = calcularDocsPendientes(allMovs, ctaCxP, false, auxiliaresMap, hoy);

  const resumenCxC = agruparPorAuxiliar(cxc);
  const resumenCxP = agruparPorAuxiliar(cxp);

  return (
    <CarteraClient
      cxc={cxc}
      cxp={cxp}
      resumenCxC={resumenCxC}
      resumenCxP={resumenCxP}
      totalCxC={cxc.reduce((s, d) => s + d.saldo, 0)}
      totalCxP={cxp.reduce((s, d) => s + d.saldo, 0)}
    />
  );
}
