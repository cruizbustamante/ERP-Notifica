"use server";

import { createClient } from "@/lib/supabase/server";
import { crearComprobante } from "../comprobantes/actions";
import { revalidatePath } from "next/cache";
import { requireRol } from "@/lib/auth";

async function getConfig() {
  const supabase = await createClient();
  const { data } = await supabase.from("config").select("clave, valor");
  const map: Record<string, string> = {};
  for (const r of data || []) map[r.clave] = r.valor;
  return map;
}

// ─── Resumen cartola ────────────────────────────────────────────────────

export async function getResumenCartola(anio: number, banco?: string) {
  const supabase = await createClient();

  let query = supabase
    .from("cartolas")
    .select("mes, monto, tipo, contabilizado, cargo_abono")
    .eq("anio", anio);

  if (banco) query = query.eq("cuenta_banco", banco);

  const { data } = await query;

  type MesData = { abonos: number; cargos: number; pend: number; cont: number };
  const porMes: Record<number, MesData> = {};
  for (let m = 1; m <= 12; m++) porMes[m] = { abonos: 0, cargos: 0, pend: 0, cont: 0 };

  for (const r of data || []) {
    const m = r.mes;
    if (!m || m < 1 || m > 12) continue;
    const monto = Math.abs(Number(r.monto) || 0);
    if (r.contabilizado) {
      porMes[m].cont++;
    } else {
      porMes[m].pend++;
      if (r.cargo_abono === "A" || r.tipo === "ABONO") porMes[m].abonos += monto;
      else porMes[m].cargos += monto;
    }
  }

  return porMes;
}

// ─── Movimientos de un mes ──────────────────────────────────────────────

export type MovCartola = {
  id: number;
  fecha: string | null;
  descripcion: string;
  monto: number;
  saldo: number;
  tipo: string;
  cargo_abono: string;
  num_doc: string;
  sucursal: string;
  contabilizado: boolean;
  comprobante_id: number | null;
  categoria_flujo: string | null;
  rut_extraido: string;
  nombre_extraido: string;
};

function extraerRUT(descripcion: string): string {
  const texto = descripcion || "";
  // Patron 1: XX.XXX.XXX-X
  const m1 = texto.match(/(\d{1,2}\.\d{3}\.\d{3}-[\dkK])/);
  if (m1) return m1[1].toUpperCase();
  // Patron 2: XXXXXXXX-X
  const m2 = texto.match(/(\d{7,8}-[\dkK])/);
  if (m2) return m2[1].toUpperCase();
  return "";
}

function extraerNombre(descripcion: string): string {
  const texto = (descripcion || "").trim();
  const parts = texto.split(/\s{2,}|\t/);
  if (parts.length >= 2) return parts[parts.length - 1].trim();
  return "";
}

export async function getMovimientosCartola(anio: number, mes: number, soloNoCont = false, banco?: string) {
  const supabase = await createClient();

  let query = supabase
    .from("cartolas")
    .select("*")
    .eq("anio", anio)
    .eq("mes", mes)
    .order("fecha", { ascending: false });

  if (banco) query = query.eq("cuenta_banco", banco);
  if (soloNoCont) {
    query = query.eq("contabilizado", false);
  }

  const { data, error } = await query;
  if (error) return { movimientos: [], error: error.message };

  const movimientos: MovCartola[] = (data || []).map((r) => ({
    id: r.id,
    fecha: r.fecha,
    descripcion: r.descripcion || "",
    monto: Number(r.monto) || 0,
    saldo: Number(r.saldo) || 0,
    tipo: r.tipo || "",
    cargo_abono: r.cargo_abono || r.tipo || "",
    num_doc: r.num_doc || "",
    sucursal: r.sucursal || "",
    contabilizado: r.contabilizado || false,
    comprobante_id: r.comprobante_id,
    categoria_flujo: r.categoria_flujo,
    rut_extraido: r.nombre_match ? "" : extraerRUT(r.descripcion || ""),
    nombre_extraido: extraerNombre(r.descripcion || ""),
  }));

  return { movimientos, error: null };
}

// ─── Contabilizar movimiento ────────────────────────────────────────────

export type ContabilizarInput = {
  cartola_id: number;
  tipo_contab: "COBRANZA" | "PAGO" | "GASTO" | "INGRESO";
  cuenta_contra: string;
  auxiliar_rut: string;
  glosa: string;
  tipo_doc: string;
  num_doc: string;
  tipo_doc_ref: string;
  num_doc_ref: string;
  categoria_flujo: string;
};

export async function contabilizarMovimiento(input: ContabilizarInput) {
  await requireRol("contador");
  const supabase = await createClient();
  const config = await getConfig();

  // Leer movimiento
  const { data: mov } = await supabase
    .from("cartolas")
    .select("*")
    .eq("id", input.cartola_id)
    .single();

  if (!mov) return { error: "Movimiento no encontrado" };
  if (mov.contabilizado) return { error: "Ya está contabilizado" };

  const ctaBanco = mov.cuenta_banco === "CTE-MP"
    ? (config.CUENTA_BANCO_MP || "1-1-01-003")
    : (config.CUENTA_BANCO || "1-1-01-002");

  const monto = Math.abs(Number(mov.monto) || 0);
  const esAbono = (mov.cargo_abono === "A" || mov.tipo === "ABONO");
  const fecha = mov.fecha;

  if (monto === 0) return { error: "Monto es $0" };

  // Construir líneas del comprobante
  type Linea = {
    cuenta_codigo: string; debe: number; haber: number; glosa: string;
    auxiliar_rut: string; tipo_doc: string; num_doc: string;
    fecha_doc: string | null; tipo_doc_ref: string; num_doc_ref: string; categoria_flujo: string;
  };

  const lineas: Linea[] = [];

  lineas.push({
    cuenta_codigo: ctaBanco,
    debe: esAbono ? monto : 0,
    haber: esAbono ? 0 : monto,
    glosa: input.glosa || mov.descripcion,
    auxiliar_rut: "",
    tipo_doc: "", num_doc: "",
    fecha_doc: null,
    tipo_doc_ref: "", num_doc_ref: "",
    categoria_flujo: input.categoria_flujo || "",
  });

  lineas.push({
    cuenta_codigo: input.cuenta_contra,
    debe: esAbono ? 0 : monto,
    haber: esAbono ? monto : 0,
    glosa: input.glosa || mov.descripcion,
    auxiliar_rut: input.auxiliar_rut || "",
    tipo_doc: input.tipo_doc || "",
    num_doc: input.num_doc || "",
    fecha_doc: fecha,
    tipo_doc_ref: input.tipo_doc_ref || "",
    num_doc_ref: input.num_doc_ref || "",
    categoria_flujo: "",
  });

  // Tipo comprobante: I para ingresos/cobranza, E para egresos/pagos
  const tipoComp = esAbono ? "I" : "E";

  const result = await crearComprobante({
    tipo: tipoComp,
    fecha,
    glosa: input.glosa || `Banco: ${mov.descripcion}`,
    lineas,
  });

  if (result.error) return { error: result.error };

  // Marcar como contabilizado
  await supabase
    .from("cartolas")
    .update({
      contabilizado: true,
      comprobante_id: result.data!.id,
      categoria_flujo: input.categoria_flujo || null,
    })
    .eq("id", input.cartola_id);

  revalidatePath("/contable/conciliacion");
  return { data: result.data, error: null };
}

// ─── Contabilizar lote ──────────────────────────────────────────────────

export async function contabilizarLote(items: ContabilizarInput[]) {
  await requireRol("contador");
  const resultados: { id: number; ok: boolean; error?: string }[] = [];

  for (const item of items) {
    const res = await contabilizarMovimiento(item);
    resultados.push({
      id: item.cartola_id,
      ok: !res.error,
      error: res.error || undefined,
    });
  }

  revalidatePath("/contable/conciliacion");
  return resultados;
}

// ─── Anular contabilización ─────────────────────────────────────────────

export async function anularContabilizacion(cartolaId: number) {
  await requireRol("contador");
  const supabase = await createClient();

  const { data: mov } = await supabase
    .from("cartolas")
    .select("comprobante_id, contabilizado")
    .eq("id", cartolaId)
    .single();

  if (!mov) return { error: "Movimiento no encontrado" };
  if (!mov.contabilizado) return { error: "No está contabilizado" };

  if (mov.comprobante_id) {
    const { anularComprobante } = await import("../comprobantes/actions");
    const res = await anularComprobante(mov.comprobante_id);
    if (res.error) return { error: `Error anulando comprobante: ${res.error}` };
  }

  await supabase
    .from("cartolas")
    .update({ contabilizado: false, comprobante_id: null, categoria_flujo: null })
    .eq("id", cartolaId);

  revalidatePath("/contable/conciliacion");
  return { error: null };
}

// ─── Bancos disponibles ────────────────────────────────────────────────

export type BancoInfo = {
  id: string;
  nombre: string;
  cuenta: string;
  cuentaContable: string;
};

export async function getBancos(): Promise<BancoInfo[]> {
  const config = await getConfig();
  return [
    {
      id: "CTE-SANTANDER",
      nombre: config.BANCO_NOMBRE || "Santander",
      cuenta: config.BANCO_CTA || "",
      cuentaContable: config.CUENTA_BANCO || "1-1-01-002",
    },
    {
      id: "CTE-MP",
      nombre: config.BANCO_NOMBRE_MP || "Mercado Pago",
      cuenta: config.BANCO_CTA_MP || "",
      cuentaContable: config.CUENTA_BANCO_MP || "1-1-01-003",
    },
  ];
}

export async function getSaldosBancos() {
  const supabase = await createClient();
  const bancos = await getBancos();
  const { data: allCartolas } = await supabase
    .from("cartolas")
    .select("monto, cargo_abono, cuenta_banco, contabilizado");

  type SaldoBanco = { saldo: number; totalMovs: number; pendientes: number; contabilizados: number; totalAbonos: number; totalCargos: number };
  const saldosPorBanco: Record<string, SaldoBanco> = {};
  for (const b of bancos) {
    saldosPorBanco[b.id] = { saldo: 0, totalMovs: 0, pendientes: 0, contabilizados: 0, totalAbonos: 0, totalCargos: 0 };
  }
  for (const m of allCartolas || []) {
    const banco = m.cuenta_banco || "CTE-SANTANDER";
    if (!saldosPorBanco[banco]) continue;
    const monto = Math.abs(Number(m.monto));
    const s = saldosPorBanco[banco];
    s.totalMovs++;
    s.saldo += m.cargo_abono === "A" ? monto : -monto;
    if (m.contabilizado) s.contabilizados++;
    else s.pendientes++;
    if (m.cargo_abono === "A") s.totalAbonos += monto;
    else s.totalCargos += monto;
  }
  const consolidado = Object.values(saldosPorBanco).reduce((s, b) => s + b.saldo, 0);
  return { saldosPorBanco, consolidado };
}

// ─── Cargar cartola desde Excel ─────────────────────────────────────────

export async function cargarCartolaSantander(movimientos: Array<{
  monto: number;
  descripcion: string;
  fecha: string;
  saldo: number;
  num_doc: string;
  sucursal: string;
  cargo_abono: string;
}>) {
  await requireRol("contador");
  const supabase = await createClient();
  const errores: string[] = [];
  let nuevos = 0;
  let duplicados = 0;

  const { createHash } = await import("crypto");

  const huellaCount = new Map<string, number>();
  const records = movimientos.map((m) => {
    let huellaStr = `${m.fecha}|${Math.round(m.monto)}|${Math.round(m.saldo)}|${m.descripcion}|${m.cargo_abono}`;
    const count = (huellaCount.get(huellaStr) || 0) + 1;
    huellaCount.set(huellaStr, count);
    if (count > 1) huellaStr += `|${count}`;
    const huella = createHash("md5").update(huellaStr).digest("hex");
    const [year, month] = m.fecha.split("-").map(Number);
    return {
      cuenta_banco: "CTE-SANTANDER",
      fecha: m.fecha,
      descripcion: m.descripcion,
      monto: m.monto,
      saldo: m.saldo,
      num_doc: m.num_doc,
      sucursal: m.sucursal,
      cargo_abono: m.cargo_abono,
      huella,
      anio: year,
      mes: month,
      contabilizado: false,
      estado_conciliacion: "PENDIENTE",
    };
  });

  // Insert in batches of 50
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { data, error } = await supabase
      .from("cartolas")
      .upsert(batch, { onConflict: "huella", ignoreDuplicates: true })
      .select("id");

    if (error) {
      errores.push(`Lote ${Math.floor(i / 50) + 1}: ${error.message}`);
    } else {
      nuevos += data?.length || 0;
    }
    duplicados += batch.length - (data?.length || 0);
  }

  revalidatePath("/contable/conciliacion");
  revalidatePath("/inicio");
  return { nuevos, duplicados, errores };
}

// ─── Cargar cartola Mercado Pago ────────────────────────────────────────

export async function cargarCartolaMP(movimientos: Array<{
  op_id: string;
  tipo_pago: string;
  tipo_operacion: string;
  valor_compra: number;
  fecha: string;
  comisiones: number;
  monto_neto: number;
}>) {
  await requireRol("contador");
  const supabase = await createClient();
  let nuevos = 0;
  let duplicados = 0;
  const errores: string[] = [];

  const { createHash } = await import("crypto");

  const records = movimientos.map((m) => {
    const huellaStr = `${m.op_id}|${m.tipo_operacion}|${m.monto_neto}`;
    const huella = createHash("md5").update(huellaStr).digest("hex");
    const [year, month] = m.fecha.split("-").map(Number);
    const montoNeto = Number(m.monto_neto);
    const esAbono = montoNeto > 0;

    return {
      cuenta_banco: "CTE-MP",
      fecha: m.fecha,
      descripcion: `${m.tipo_operacion} · ${m.tipo_pago} · OP ${m.op_id}`,
      monto: Math.abs(montoNeto),
      saldo: 0,
      num_doc: m.op_id,
      sucursal: "",
      cargo_abono: esAbono ? "A" : "C",
      huella,
      anio: year,
      mes: month,
      contabilizado: false,
      estado_conciliacion: "PENDIENTE",
    };
  });

  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { data, error } = await supabase
      .from("cartolas")
      .upsert(batch, { onConflict: "huella", ignoreDuplicates: true })
      .select("id");

    if (error) {
      errores.push(`Lote ${Math.floor(i / 50) + 1}: ${error.message}`);
    } else {
      nuevos += data?.length || 0;
    }
    duplicados += batch.length - (data?.length || 0);
  }

  revalidatePath("/contable/conciliacion");
  revalidatePath("/inicio");
  return { nuevos, duplicados, errores };
}

// ─── Match Automático ───────────────────────────────────────────────────

export type MatchResult = {
  matched: number;
  details: Array<{
    cartola_id: number;
    comprobante_id: number;
    monto: number;
    fecha_cartola: string;
    receptor: string;
    tipo_match: "exacto" | "combinado";
    docs: string;
  }>;
  error: string | null;
};

export type MatchDocAlternativo = { tipoDoc: string; numDoc: string; saldo: number; cuenta: string };

export type MatchPreviewItem = {
  cartola_id: number;
  descripcion: string;
  monto: number;
  fecha: string;
  rut: string;
  esAbono: boolean;
  tipo_match: "exacto" | "combinado";
  docs: string;
  categoria_flujo: string;
  docsAlternativos: MatchDocAlternativo[];
  lineas: Array<{
    cuenta_codigo: string;
    cuenta_nombre: string;
    debe: number;
    haber: number;
    glosa: string;
    auxiliar_rut: string;
    tipo_doc: string;
    num_doc: string;
  }>;
};

export type MatchPreviewResult = {
  items: MatchPreviewItem[];
  error: string | null;
};

function validarDVRut(rut: string): boolean {
  const limpio = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 2) return false;
  const cuerpo = limpio.slice(0, -1);
  const dvIngresado = limpio.slice(-1);

  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = suma % 11;
  let dvCalculado: string;
  if (resto === 0) dvCalculado = "0";
  else if (resto === 1) dvCalculado = "K";
  else dvCalculado = String(11 - resto);

  return dvIngresado === dvCalculado;
}

function extraerRUTDeDescripcion(desc: string): string {
  if (!desc) return "";
  const str = String(desc);

  // 1) Formato con puntos y guión: XX.XXX.XXX-X
  const m1 = str.match(/(\d{1,2}\.\d{3}\.\d{3}-[\dkK])/);
  if (m1 && validarDVRut(m1[1])) return m1[1].replace(/\./g, "").toUpperCase();

  // 2) Formato con guión sin puntos: XXXXXXXX-X
  const m2 = str.match(/(\d{7,8}-[\dkK])/i);
  if (m2 && validarDVRut(m2[1])) return m2[1].toUpperCase();

  // 3) Precedido por "RUT"
  const m3 = str.match(/RUT[:\s]+(\d[\d.\s]{5,10}[\dkK])/i);
  if (m3) {
    let candidate = m3[1].replace(/[\.\s]/g, "");
    if (!candidate.includes("-") && candidate.length >= 8) {
      candidate = candidate.slice(0, -1) + "-" + candidate.slice(-1);
    }
    if (validarDVRut(candidate)) return candidate.toUpperCase();
  }

  // 4) Número RAW al inicio (banco pone RUT del origen sin formato)
  //    Ej: "0126662203 Transf." → 12666220-3
  const m4 = str.match(/^0*(\d{7,9}[\dkK])\b/i);
  if (m4) {
    let raw = m4[1];
    if (!raw.includes("-") && raw.length >= 8) {
      raw = raw.slice(0, -1) + "-" + raw.slice(-1);
    }
    if (validarDVRut(raw)) return raw.toUpperCase();
  }

  return "";
}

// Shared matching logic: finds matches without creating comprobantes
async function findMatches(anio: number, mes: number, banco?: string) {
  const supabase = await createClient();
  const config = await getConfig();
  const ctaClientes = config.CUENTA_CLIENTES || "1-1-03-001";
  const ctaClientesBol = config.CUENTA_CLIENTES_BOLETAS || "1-1-03-002";
  const ctaProveedores = config.CUENTA_PROVEEDORES || "2-1-02-001";
  const ctaHonorarios = config.CUENTA_HONORARIOS_PAGAR || "2-1-04-001";
  const ctaCxpReceptores = config.CUENTA_CXP_RECEPTORES || "2-1-05-003";

  const cuentasCXC = [ctaClientes, ctaClientesBol].filter(Boolean);
  const cuentasCXP = [ctaProveedores, ctaHonorarios, ctaCxpReceptores].filter(Boolean);
  const todasCuentasDoc = [...cuentasCXC, ...cuentasCXP];

  let cartolaQuery = supabase
    .from("cartolas")
    .select("id, fecha, monto, cargo_abono, descripcion, num_doc, cuenta_banco")
    .eq("anio", anio).eq("mes", mes).eq("contabilizado", false);
  if (banco) cartolaQuery = cartolaQuery.eq("cuenta_banco", banco);
  const { data: cartolaRows } = await cartolaQuery;
  if (!cartolaRows || cartolaRows.length === 0) return { proposals: [], config };

  type PendienteMov = { id: number; fecha: string; monto: number; esAbono: boolean; descripcion: string; rut: string; cuenta_banco: string };
  const pendientes: PendienteMov[] = [];
  const rutsNecesarios = new Set<string>();
  for (const row of cartolaRows) {
    const rut = extraerRUTDeDescripcion(row.descripcion || "");
    if (!rut) continue;
    rutsNecesarios.add(rut);
    pendientes.push({ id: row.id, fecha: row.fecha || "", monto: Math.abs(Number(row.monto) || 0), esAbono: row.cargo_abono === "A", descripcion: row.descripcion || "", rut, cuenta_banco: row.cuenta_banco || "CTE-SANTANDER" });
  }
  if (pendientes.length === 0) return { proposals: [], config };

  const { data: movsDoc } = await supabase.from("mov_contables")
    .select("cuenta_codigo, debe, haber, auxiliar_rut, tipo_doc, num_doc, tipo_doc_ref, num_doc_ref, comprobantes!inner(estado)")
    .in("cuenta_codigo", todasCuentasDoc).in("auxiliar_rut", Array.from(rutsNecesarios)).eq("comprobantes.estado", "VIGENTE");
  if (!movsDoc || movsDoc.length === 0) return { proposals: [], config };

  const { data: planCtas } = await supabase.from("plan_cuentas").select("codigo, tipo, nombre").in("codigo", [...todasCuentasDoc, config.CUENTA_BANCO || "1-1-01-002", config.CUENTA_BANCO_MP || "1-1-01-003"]);
  const ctaTipos: Record<string, string> = {};
  const ctaNombres: Record<string, string> = {};
  for (const c of planCtas || []) { ctaTipos[c.codigo] = c.tipo; ctaNombres[c.codigo] = c.nombre || ""; }

  type DocPendiente = { tipoDoc: string; numDoc: string; saldo: number; cuenta: string };
  const docsTemp: Record<string, { cargos: number; abonos: number; tipoDoc: string; numDoc: string; cuenta: string; rut: string }> = {};
  for (const m of movsDoc) {
    const auxRut = (m.auxiliar_rut || "").toUpperCase();
    if (!rutsNecesarios.has(auxRut)) continue;
    const docTipo = m.tipo_doc_ref || m.tipo_doc || "";
    const docNum = m.num_doc_ref || m.num_doc || "";
    if (!docTipo || !docNum) continue;
    const clave = `${auxRut}|${m.cuenta_codigo}|${docTipo}|${docNum}`;
    if (!docsTemp[clave]) docsTemp[clave] = { cargos: 0, abonos: 0, tipoDoc: docTipo, numDoc: docNum, cuenta: m.cuenta_codigo, rut: auxRut };
    docsTemp[clave].cargos += Number(m.debe) || 0;
    docsTemp[clave].abonos += Number(m.haber) || 0;
  }

  const docsPorRUT: Record<string, { CXC: DocPendiente[]; CXP: DocPendiente[] }> = {};
  for (const d of Object.values(docsTemp)) {
    const esActivo = ctaTipos[d.cuenta] === "A";
    const saldo = esActivo ? (d.cargos - d.abonos) : (d.abonos - d.cargos);
    if (Math.abs(saldo) < 1) continue;
    if (!docsPorRUT[d.rut]) docsPorRUT[d.rut] = { CXC: [], CXP: [] };
    const doc: DocPendiente = { tipoDoc: d.tipoDoc, numDoc: d.numDoc, saldo: Math.abs(saldo), cuenta: d.cuenta };
    if (cuentasCXC.includes(d.cuenta)) docsPorRUT[d.rut].CXC.push(doc);
    else docsPorRUT[d.rut].CXP.push(doc);
  }

  type Proposal = {
    mov: PendienteMov;
    matchedDocs: DocPendiente[];
    allExactDocs: DocPendiente[];
    matchTipo: "exacto" | "combinado";
    docsDesc: string;
    glosa: string;
    categoriaFlujo: string;
    cuentaDocUsada: string;
    ctaBancoMov: string;
  };

  const proposals: Proposal[] = [];
  const usedCartolas = new Set<number>();
  const porRUT: Record<string, PendienteMov[]> = {};
  for (const p of pendientes) { if (!porRUT[p.rut]) porRUT[p.rut] = []; porRUT[p.rut].push(p); }

  for (const rut of Object.keys(porRUT)) {
    const rutDocs = docsPorRUT[rut];
    if (!rutDocs) continue;
    for (const mov of porRUT[rut]) {
      if (usedCartolas.has(mov.id)) continue;
      const docsPool = mov.esAbono ? rutDocs.CXC : rutDocs.CXP;
      if (!docsPool || docsPool.length === 0) continue;
      let categoriaFlujo = mov.esAbono ? "1.01" : "1.04";
      let matchedDocs: DocPendiente[] | null = null;
      let allExactDocs: DocPendiente[] = [];
      let matchTipo: "exacto" | "combinado" = "exacto";
      const exactMatches = docsPool.filter((d) => Math.abs(d.saldo - mov.monto) < 1);
      if (exactMatches.length > 0) {
        matchedDocs = [exactMatches[0]];
        allExactDocs = exactMatches.length > 1 ? exactMatches : [];
        const idx = docsPool.indexOf(exactMatches[0]);
        if (idx >= 0) docsPool.splice(idx, 1);
      } else {
        const sorted = docsPool.slice().sort((a, b) => b.saldo - a.saldo);
        let acum = 0;
        const combo: { doc: DocPendiente; idx: number }[] = [];
        for (let i = 0; i < sorted.length; i++) { if (acum + sorted[i].saldo <= mov.monto + 1) { acum += sorted[i].saldo; combo.push({ doc: sorted[i], idx: docsPool.indexOf(sorted[i]) }); } if (Math.abs(acum - mov.monto) < 1) break; }
        if (combo.length > 0 && Math.abs(acum - mov.monto) < 1) { matchedDocs = combo.map((c) => c.doc); matchTipo = "combinado"; const indices = combo.map((c) => c.idx).filter((i) => i >= 0).sort((a, b) => b - a); for (const idx of indices) docsPool.splice(idx, 1); }
      }
      if (!matchedDocs) continue;
      const docsDesc = matchedDocs.map((d) => `${d.tipoDoc} ${d.numDoc}`).join(", ");
      const cuentaDocUsada = matchedDocs[0].cuenta || (mov.esAbono ? ctaClientes : ctaProveedores);
      if (!mov.esAbono && cuentaDocUsada === ctaHonorarios) categoriaFlujo = "1.06";
      const glosa = `${mov.esAbono ? "Cobranza" : "Pago"} ${docsDesc}`;
      const ctaBancoMov = mov.cuenta_banco === "CTE-MP" ? (config.CUENTA_BANCO_MP || "1-1-01-003") : (config.CUENTA_BANCO || "1-1-01-002");
      usedCartolas.add(mov.id);
      proposals.push({ mov, matchedDocs, allExactDocs, matchTipo, docsDesc, glosa, categoriaFlujo, cuentaDocUsada, ctaBancoMov });
    }
  }
  return { proposals, config, ctaNombres };
}

export async function previewMatchAutomatico(anio: number, mes: number, banco?: string): Promise<MatchPreviewResult> {
  await requireRol("contador");
  const { proposals, ctaNombres } = await findMatches(anio, mes, banco);
  const nombres = ctaNombres || {};

  const items: MatchPreviewItem[] = proposals.map((p) => {
    const lineas: MatchPreviewItem["lineas"] = [];
    lineas.push({
      cuenta_codigo: p.ctaBancoMov,
      cuenta_nombre: nombres[p.ctaBancoMov] || "",
      debe: p.mov.esAbono ? p.mov.monto : 0,
      haber: p.mov.esAbono ? 0 : p.mov.monto,
      glosa: p.glosa,
      auxiliar_rut: "",
      tipo_doc: "", num_doc: "",
    });
    for (const doc of p.matchedDocs) {
      lineas.push({
        cuenta_codigo: p.cuentaDocUsada,
        cuenta_nombre: nombres[p.cuentaDocUsada] || "",
        debe: p.mov.esAbono ? 0 : doc.saldo,
        haber: p.mov.esAbono ? doc.saldo : 0,
        glosa: p.glosa,
        auxiliar_rut: p.mov.rut,
        tipo_doc: doc.tipoDoc, num_doc: doc.numDoc,
      });
    }
    return {
      cartola_id: p.mov.id, descripcion: p.mov.descripcion, monto: p.mov.monto,
      fecha: p.mov.fecha, rut: p.mov.rut, esAbono: p.mov.esAbono,
      tipo_match: p.matchTipo, docs: p.docsDesc, categoria_flujo: p.categoriaFlujo,
      docsAlternativos: p.allExactDocs,
      lineas,
    };
  });

  return { items, error: null };
}

export async function confirmarMatchAutomatico(
  anio: number, mes: number, cartolaIds: number[], banco?: string,
  categorias?: Record<number, string>,
  docSelections?: Record<number, { tipoDoc: string; numDoc: string }>
): Promise<MatchResult> {
  await requireRol("contador");
  const supabase = await createClient();
  const { proposals, config } = await findMatches(anio, mes, banco);
  const selectedIds = new Set(cartolaIds);
  const selected = proposals.filter((p) => selectedIds.has(p.mov.id));

  const matches: MatchResult["details"] = [];

  for (const p of selected) {
    const flujo = categorias?.[p.mov.id] || p.categoriaFlujo || "";
    const sel = docSelections?.[p.mov.id];
    let docsToUse = p.matchedDocs;
    if (sel && p.allExactDocs.length > 0) {
      const found = p.allExactDocs.find((d) => d.tipoDoc === sel.tipoDoc && d.numDoc === sel.numDoc);
      if (found) docsToUse = [found];
    }
    const docsDesc = docsToUse.map((d) => `${d.tipoDoc} ${d.numDoc}`).join(", ");
    const glosa = `${p.mov.esAbono ? "Cobranza" : "Pago"} ${docsDesc}`;
    type Linea = { cuenta_codigo: string; debe: number; haber: number; glosa: string; auxiliar_rut: string; tipo_doc: string; num_doc: string; fecha_doc: string | null; tipo_doc_ref: string; num_doc_ref: string; categoria_flujo: string };
    const lineas: Linea[] = [];
    lineas.push({ cuenta_codigo: p.ctaBancoMov, debe: p.mov.esAbono ? p.mov.monto : 0, haber: p.mov.esAbono ? 0 : p.mov.monto, glosa: glosa, auxiliar_rut: "", tipo_doc: "", num_doc: "", fecha_doc: null, tipo_doc_ref: "", num_doc_ref: "", categoria_flujo: flujo });
    for (const doc of docsToUse) {
      lineas.push({ cuenta_codigo: p.cuentaDocUsada, debe: p.mov.esAbono ? 0 : doc.saldo, haber: p.mov.esAbono ? doc.saldo : 0, glosa: glosa, auxiliar_rut: p.mov.rut, tipo_doc: "", num_doc: "", fecha_doc: p.mov.fecha, tipo_doc_ref: doc.tipoDoc, num_doc_ref: doc.numDoc, categoria_flujo: "" });
    }
    const tipoComp = p.mov.esAbono ? "I" : "E";
    const result = await crearComprobante({ tipo: tipoComp, fecha: p.mov.fecha, glosa: glosa, lineas });
    if (result.error) continue;
    await supabase.from("cartolas").update({ contabilizado: true, comprobante_id: result.data!.id, categoria_flujo: flujo }).eq("id", p.mov.id);
    matches.push({ cartola_id: p.mov.id, comprobante_id: result.data!.id, monto: p.mov.monto, fecha_cartola: p.mov.fecha, receptor: p.mov.rut, tipo_match: p.matchTipo, docs: docsDesc });
  }

  if (matches.length > 0) revalidatePath("/contable/conciliacion");
  return { matched: matches.length, details: matches, error: null };
}

// Legacy function kept for compatibility
export async function matchAutomatico(anio: number, mes: number, banco?: string): Promise<MatchResult> {
  const preview = await previewMatchAutomatico(anio, mes, banco);
  if (preview.error) return { matched: 0, details: [], error: preview.error };
  if (preview.items.length === 0) return { matched: 0, details: [], error: null };
  const allIds = preview.items.map((i) => i.cartola_id);
  return confirmarMatchAutomatico(anio, mes, allIds, banco);
}

// ─── Match Marketplace (depósitos TBK) ─────────────────────────────────

export type MarketplaceMatchReceptor = {
  rut: string;
  nombre: string;
  base: number;
  ordenes: string[];
};

export type MarketplaceMatchTotales = {
  bruto: number;
  base: number;
  comision: number;
  costoPlat: number;
  depositoNeto: number;
  txCount: number;
};

export type MarketplaceMatchPreview = {
  receptores: MarketplaceMatchReceptor[];
  totales: MarketplaceMatchTotales;
  fecha_abono: string;
  lineas: Array<{
    cuenta_codigo: string;
    cuenta_nombre: string;
    debe: number;
    haber: number;
    glosa: string;
    auxiliar_rut: string;
    tipo_doc: string;
    num_doc: string;
    tipo_doc_ref: string;
    num_doc_ref: string;
  }>;
  error: string | null;
};

export async function previewMatchMarketplace(fechaAbono: string, montoCartola?: number): Promise<MarketplaceMatchPreview> {
  await requireRol("contador");
  const supabase = await createClient();
  const config = await getConfig();

  const ctaBanco = config.CUENTA_BANCO || "1-1-01-002";
  const ctaAntProv = config.CUENTA_ANTICIPO_PROV || "1-1-04-002";
  const ctaCxpReceptores = config.CUENTA_CXP_RECEPTORES || "2-1-05-003";
  const ctaAntClientes = config.CUENTA_ANTICIPO_CLIENTES || "2-1-05-002";

  const { data: txs } = await supabase
    .from("marketplace_transacciones")
    .select("orden_id, receptor_rut, receptor_nombre, monto_bruto, base_receptor, comision_nl_bruta, costo_plataforma")
    .eq("fecha_abono_tbk", fechaAbono)
    .neq("estado", "ANULADO");

  if (!txs || txs.length === 0) {
    return { receptores: [], totales: { bruto: 0, base: 0, comision: 0, costoPlat: 0, depositoNeto: 0, txCount: 0 }, fecha_abono: fechaAbono, lineas: [], error: "No hay transacciones marketplace para esta fecha de abono" };
  }

  const porReceptor: Record<string, MarketplaceMatchReceptor> = {};
  let totalBruto = 0, totalBase = 0, totalComision = 0;

  for (const tx of txs) {
    const bruto = Number(tx.monto_bruto);
    const base = Number(tx.base_receptor);
    const comision = Number(tx.comision_nl_bruta);
    totalBruto += bruto;
    totalBase += base;
    totalComision += comision;

    if (!porReceptor[tx.receptor_rut]) {
      porReceptor[tx.receptor_rut] = { rut: tx.receptor_rut, nombre: tx.receptor_nombre || tx.receptor_rut, base: 0, ordenes: [] };
    }
    porReceptor[tx.receptor_rut].base += base;
    porReceptor[tx.receptor_rut].ordenes.push(tx.orden_id);
  }

  const depositoReal = montoCartola ?? (totalBruto - totalComision);
  const costoTBKReal = totalBruto - depositoReal;
  const receptores = Object.values(porReceptor);

  const { data: planCtas } = await supabase
    .from("plan_cuentas")
    .select("codigo, nombre")
    .in("codigo", [ctaBanco, ctaAntProv, ctaCxpReceptores, ctaAntClientes]);
  const nombres: Record<string, string> = {};
  for (const c of planCtas || []) nombres[c.codigo] = c.nombre || "";

  const lineas: MarketplaceMatchPreview["lineas"] = [];

  lineas.push({
    cuenta_codigo: ctaBanco, cuenta_nombre: nombres[ctaBanco] || "",
    debe: depositoReal, haber: 0,
    glosa: `Depósito TBK ${fechaAbono} (${txs.length} tx)`,
    auxiliar_rut: "", tipo_doc: "", num_doc: "",
    tipo_doc_ref: "", num_doc_ref: "",
  });

  // Numeración MYYYY (ej: 32026 = marzo 2026)
  const [abonoY, abonoM] = fechaAbono.split("-").map(Number);
  const numDocPeriodo = `${abonoM}${abonoY}`;

  if (costoTBKReal > 0) {
    lineas.push({
      cuenta_codigo: ctaAntProv, cuenta_nombre: nombres[ctaAntProv] || "",
      debe: costoTBKReal, haber: 0,
      glosa: `Anticipo comisión TBK ${fechaAbono}`,
      auxiliar_rut: "96689310-9", tipo_doc: "AN", num_doc: numDocPeriodo,
      tipo_doc_ref: "AN", num_doc_ref: numDocPeriodo,
    });
  }

  for (const r of receptores) {
    lineas.push({
      cuenta_codigo: ctaCxpReceptores, cuenta_nombre: nombres[ctaCxpReceptores] || "",
      debe: 0, haber: r.base,
      glosa: `CxP ${r.nombre}`,
      auxiliar_rut: r.rut, tipo_doc: "LQ", num_doc: numDocPeriodo,
      tipo_doc_ref: "LQ", num_doc_ref: numDocPeriodo,
    });
  }

  // Anticipo clientes: por comprador (abogado) si hay datos, sino por receptor
  const { data: txsDetalle } = await supabase
    .from("marketplace_transacciones")
    .select("receptor_rut, comision_nl_bruta, comprador_rut, comprador_nombre")
    .eq("fecha_abono_tbk", fechaAbono)
    .neq("estado", "ANULADO");

  const porComprador: Record<string, { rut: string; nombre: string; comision: number }> = {};
  for (const tx of txsDetalle || []) {
    const cRut = tx.comprador_rut || tx.receptor_rut;
    const cNombre = tx.comprador_nombre || "";
    if (!porComprador[cRut]) porComprador[cRut] = { rut: cRut, nombre: cNombre, comision: 0 };
    porComprador[cRut].comision += Number(tx.comision_nl_bruta) || 0;
  }

  const compradores = Object.values(porComprador).filter((c) => c.comision > 0);
  if (compradores.length > 0) {
    for (const c of compradores) {
      lineas.push({
        cuenta_codigo: ctaAntClientes, cuenta_nombre: nombres[ctaAntClientes] || "",
        debe: 0, haber: c.comision,
        glosa: `Anticipo comisión NL — ${c.nombre || c.rut}`,
        auxiliar_rut: c.rut, tipo_doc: "AN", num_doc: numDocPeriodo,
        tipo_doc_ref: "AN", num_doc_ref: numDocPeriodo,
      });
    }
  } else {
    lineas.push({
      cuenta_codigo: ctaAntClientes, cuenta_nombre: nombres[ctaAntClientes] || "",
      debe: 0, haber: totalComision,
      glosa: `Anticipo comisión NL ${fechaAbono}`,
      auxiliar_rut: "", tipo_doc: "AN", num_doc: numDocPeriodo,
      tipo_doc_ref: "AN", num_doc_ref: numDocPeriodo,
    });
  }

  return {
    receptores,
    totales: { bruto: totalBruto, base: totalBase, comision: totalComision, costoPlat: costoTBKReal, depositoNeto: depositoReal, txCount: txs.length },
    fecha_abono: fechaAbono,
    lineas,
    error: null,
  };
}

export type MarketplaceBulkItem = {
  cartola_id: number;
  fecha: string;
  monto_cartola: number;
  descripcion: string;
  preview: MarketplaceMatchPreview;
  diferencia: number;
};

export type MarketplaceBulkPreview = {
  items: MarketplaceBulkItem[];
  error: string | null;
};

export async function previewMatchMarketplaceBulk(anio: number, mes: number, banco?: string): Promise<MarketplaceBulkPreview> {
  await requireRol("contador");
  const supabase = await createClient();

  let query = supabase
    .from("cartolas")
    .select("id, fecha, monto, cargo_abono, descripcion, cuenta_banco")
    .eq("anio", anio).eq("mes", mes).eq("contabilizado", false).eq("cargo_abono", "A");
  if (banco) query = query.eq("cuenta_banco", banco);

  const { data: cartolaRows } = await query;
  if (!cartolaRows || cartolaRows.length === 0) return { items: [], error: null };

  const tbkMovs = cartolaRows.filter((r) => /transbank|webpay|tbk/i.test(r.descripcion || ""));
  if (tbkMovs.length === 0) return { items: [], error: null };

  const items: MarketplaceBulkItem[] = [];

  for (const mov of tbkMovs) {
    if (!mov.fecha) continue;
    const montoCartola = Math.abs(Number(mov.monto) || 0);
    const preview = await previewMatchMarketplace(mov.fecha, montoCartola);
    if (preview.error || preview.lineas.length === 0) continue;

    const diferencia = 0;

    items.push({
      cartola_id: mov.id,
      fecha: mov.fecha,
      monto_cartola: montoCartola,
      descripcion: mov.descripcion || "",
      preview,
      diferencia,
    });
  }

  return { items, error: null };
}

export async function confirmarMatchMarketplaceBulk(
  items: Array<{ cartola_id: number; fecha_abono: string }>,
  categoriaFlujo: string
) {
  await requireRol("contador");
  const resultados: Array<{ cartola_id: number; ok: boolean; comprobante_id?: number; error?: string }> = [];

  for (const item of items) {
    const res = await contabilizarMarketplace(item.cartola_id, item.fecha_abono, categoriaFlujo);
    resultados.push({
      cartola_id: item.cartola_id,
      ok: !res.error,
      comprobante_id: res.data?.id,
      error: res.error || undefined,
    });
  }

  revalidatePath("/contable/conciliacion");
  return { resultados, total: resultados.filter((r) => r.ok).length };
}

export async function contabilizarMarketplace(cartolaId: number, fechaAbono: string, categoriaFlujo: string) {
  await requireRol("contador");
  const supabase = await createClient();
  const config = await getConfig();

  const { data: mov } = await supabase.from("cartolas").select("*").eq("id", cartolaId).single();
  if (!mov) return { error: "Movimiento no encontrado" };
  if (mov.contabilizado) return { error: "Ya está contabilizado" };

  const montoCartola = Math.abs(Number(mov.monto) || 0);
  const preview = await previewMatchMarketplace(fechaAbono, montoCartola);
  if (preview.error) return { error: preview.error };
  if (preview.lineas.length === 0) return { error: "Sin transacciones para contabilizar" };

  const totalDebe = preview.lineas.reduce((s, l) => s + l.debe, 0);
  const totalHaber = preview.lineas.reduce((s, l) => s + l.haber, 0);
  if (Math.abs(totalDebe - totalHaber) > 1) return { error: `Asiento descuadrado: Debe ${totalDebe} vs Haber ${totalHaber}` };

  const lineasComp = preview.lineas.map((l, i) => ({
    cuenta_codigo: l.cuenta_codigo,
    debe: l.debe,
    haber: l.haber,
    glosa: l.glosa,
    auxiliar_rut: l.auxiliar_rut,
    tipo_doc: l.tipo_doc,
    num_doc: l.num_doc,
    fecha_doc: mov.fecha,
    tipo_doc_ref: l.tipo_doc_ref || "",
    num_doc_ref: l.num_doc_ref || "",
    categoria_flujo: i === 0 ? (categoriaFlujo || "1.12") : "",
  }));

  const result = await crearComprobante({
    tipo: "I",
    fecha: mov.fecha,
    glosa: `Marketplace TBK — ${preview.totales.txCount} tx — ${fechaAbono}`,
    lineas: lineasComp,
  });

  if (result.error) return { error: result.error };

  await supabase
    .from("cartolas")
    .update({ contabilizado: true, comprobante_id: result.data!.id, categoria_flujo: categoriaFlujo || "1.01" })
    .eq("id", cartolaId);

  revalidatePath("/contable/conciliacion");
  return { data: result.data, error: null };
}

// ─── Documentos pendientes para un auxiliar ─────────────────────────────

export async function getDocsPendientesAuxiliar(cuentaCodigo: string, auxiliarRut: string) {
  const supabase = await createClient();

  const { data: cuenta } = await supabase
    .from("plan_cuentas")
    .select("tipo")
    .eq("codigo", cuentaCodigo)
    .single();

  if (!cuenta) return { docs: [] };
  const deudor = cuenta.tipo === "A" || cuenta.tipo === "G";

  const { data: movs } = await supabase
    .from("mov_contables")
    .select("tipo_doc, num_doc, debe, haber, tipo_doc_ref, num_doc_ref, comprobantes!inner(estado)")
    .eq("cuenta_codigo", cuentaCodigo)
    .eq("auxiliar_rut", auxiliarRut)
    .eq("comprobantes.estado", "VIGENTE")
    .neq("tipo_doc", "");

  if (!movs || movs.length === 0) return { docs: [] };

  const saldos = new Map<string, number>();
  for (const m of movs) {
    const docKey = `${m.tipo_doc}|${m.num_doc}`;
    const hasRef = m.tipo_doc_ref && m.num_doc_ref;
    const refKey = hasRef ? `${m.tipo_doc_ref}|${m.num_doc_ref}` : docKey;
    const isRegistro = !hasRef;
    const monto = deudor
      ? Number(m.debe) - Number(m.haber)
      : Number(m.haber) - Number(m.debe);

    if (isRegistro) saldos.set(docKey, (saldos.get(docKey) || 0) + monto);
    else saldos.set(refKey, (saldos.get(refKey) || 0) + monto);
  }

  return {
    docs: Array.from(saldos.entries())
      .filter(([, saldo]) => Math.abs(saldo) > 0.01)
      .map(([key, saldo]) => ({
        tipo_doc: key.split("|")[0],
        num_doc: key.split("|")[1],
        saldo: Math.abs(saldo),
      })),
  };
}

export async function getDocsCxpReceptor(rut: string) {
  const config = await getConfig();
  const ctaCxpReceptores = config.CUENTA_CXP_RECEPTORES || "2-1-05-003";
  const result = await getDocsPendientesAuxiliar(ctaCxpReceptores, rut);
  return { ...result, cuenta: ctaCxpReceptores };
}
