"use server";

import { createClient } from "@/lib/supabase/server";
import { crearComprobante } from "../comprobantes/actions";
import { revalidatePath } from "next/cache";

async function getConfig() {
  const supabase = await createClient();
  const { data } = await supabase.from("config_contable").select("clave, valor");
  const map: Record<string, string> = {};
  for (const r of data || []) map[r.clave] = r.valor;
  return map;
}

// ─── Resumen cartola ────────────────────────────────────────────────────

export async function getResumenCartola(anio: number) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("cartolas")
    .select("mes, monto, tipo, contabilizado, cargo_abono")
    .eq("anio", anio);

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

export async function getMovimientosCartola(anio: number, mes: number, soloNoCont = false) {
  const supabase = await createClient();

  let query = supabase
    .from("cartolas")
    .select("*")
    .eq("anio", anio)
    .eq("mes", mes)
    .order("fecha", { ascending: false });

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
  referencia: string;
  categoria_flujo: string;
};

export async function contabilizarMovimiento(input: ContabilizarInput) {
  const supabase = await createClient();
  const config = await getConfig();
  const ctaBanco = config.CUENTA_BANCO || "1-1-01-002";

  // Leer movimiento
  const { data: mov } = await supabase
    .from("cartolas")
    .select("*")
    .eq("id", input.cartola_id)
    .single();

  if (!mov) return { error: "Movimiento no encontrado" };
  if (mov.contabilizado) return { error: "Ya está contabilizado" };

  const monto = Math.abs(Number(mov.monto) || 0);
  const esAbono = (mov.cargo_abono === "A" || mov.tipo === "ABONO");
  const fecha = mov.fecha;

  if (monto === 0) return { error: "Monto es $0" };

  // Construir líneas del comprobante
  type Linea = {
    cuenta_codigo: string; debe: number; haber: number; glosa: string;
    auxiliar_rut: string; tipo_doc: string; num_doc: string;
    fecha_doc: string | null; referencia: string;
  };

  const lineas: Linea[] = [];

  // Línea Banco
  lineas.push({
    cuenta_codigo: ctaBanco,
    debe: esAbono ? monto : 0,
    haber: esAbono ? 0 : monto,
    glosa: input.glosa || mov.descripcion,
    auxiliar_rut: "",
    tipo_doc: "",
    num_doc: "",
    fecha_doc: null,
    referencia: "",
  });

  // Línea contrapartida
  lineas.push({
    cuenta_codigo: input.cuenta_contra,
    debe: esAbono ? 0 : monto,
    haber: esAbono ? monto : 0,
    glosa: input.glosa || mov.descripcion,
    auxiliar_rut: input.auxiliar_rut || "",
    tipo_doc: input.tipo_doc || "",
    num_doc: input.num_doc || "",
    fecha_doc: fecha,
    referencia: input.referencia || "",
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
  const supabase = await createClient();
  const errores: string[] = [];
  let nuevos = 0;
  let duplicados = 0;

  // Generate MD5 huellas and prepare records
  const { createHash } = await import("crypto");

  const records = movimientos.map((m) => {
    const huellaStr = `${m.monto}|${m.descripcion}|${m.fecha}|${m.num_doc}|${m.cargo_abono}`;
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
  return { nuevos, duplicados, errores };
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
    .select("tipo_doc, num_doc, debe, haber, referencia, comprobantes!inner(estado)")
    .eq("cuenta_codigo", cuentaCodigo)
    .eq("auxiliar_rut", auxiliarRut)
    .eq("comprobantes.estado", "VIGENTE")
    .neq("tipo_doc", "");

  if (!movs || movs.length === 0) return { docs: [] };

  const saldos = new Map<string, number>();
  for (const m of movs) {
    const docKey = `${m.tipo_doc}|${m.num_doc}`;
    const refKey = m.referencia || docKey;
    const isRegistro = !m.referencia || m.referencia === docKey;
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
