"use server";

import { createClient } from "@/lib/supabase/server";
import { crearComprobante } from "../comprobantes/actions";
import { revalidatePath } from "next/cache";

async function getConfig() {
  const supabase = await createClient();
  const { data } = await supabase.from("config").select("clave, valor");
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

// ─── Match Automático ───────────────────────────────────────────────────

export type MatchResult = {
  matched: number;
  details: Array<{
    cartola_id: number;
    comprobante_id: number;
    monto: number;
    fecha_cartola: string;
    fecha_comprobante: string;
    tipo_match: "exacto" | "monto" | "documento";
  }>;
  error: string | null;
};

export async function matchAutomatico(anio: number, mes: number): Promise<MatchResult> {
  const supabase = await createClient();
  const config = await getConfig();
  const ctaBanco = config.CUENTA_BANCO || "1-1-01-002";

  // 1. Get pending cartola movements for this month
  const { data: pendientes } = await supabase
    .from("cartolas")
    .select("id, fecha, monto, cargo_abono, descripcion, num_doc")
    .eq("anio", anio)
    .eq("mes", mes)
    .eq("contabilizado", false);

  if (!pendientes || pendientes.length === 0) {
    return { matched: 0, details: [], error: null };
  }

  // 2. Get mov_contables on bank account for this month that are NOT linked to any cartola
  //    These are comprobantes created manually (not via cartola contabilizar)
  const { data: movsContables } = await supabase
    .from("mov_contables")
    .select("comprobante_id, debe, haber, glosa, num_doc, comprobantes!inner(id, fecha, anio, mes, estado)")
    .eq("cuenta_codigo", ctaBanco)
    .eq("comprobantes.anio", anio)
    .eq("comprobantes.mes", mes)
    .eq("comprobantes.estado", "VIGENTE");

  if (!movsContables || movsContables.length === 0) {
    return { matched: 0, details: [], error: null };
  }

  // 3. Find which comprobante IDs are already linked to a cartola
  const compIds = [...new Set(movsContables.map((m) => m.comprobante_id))];
  const { data: linkedCartolas } = await supabase
    .from("cartolas")
    .select("comprobante_id")
    .in("comprobante_id", compIds)
    .eq("contabilizado", true);

  const linkedCompIds = new Set((linkedCartolas || []).map((c) => c.comprobante_id));

  // Filter to only unlinked accounting movements
  const unlinkedMovs = movsContables.filter((m) => !linkedCompIds.has(m.comprobante_id));

  if (unlinkedMovs.length === 0) {
    return { matched: 0, details: [], error: null };
  }

  // 4. Build candidate list from unlinked movements
  type Candidate = {
    comprobante_id: number;
    monto: number;
    cargo_abono: string;
    fecha: string;
    glosa: string;
    num_doc: string;
    used: boolean;
  };

  const candidates: Candidate[] = unlinkedMovs.map((m) => {
    const comp = m.comprobantes as unknown as { id: number; fecha: string; anio: number; mes: number; estado: string };
    const debe = Number(m.debe) || 0;
    const haber = Number(m.haber) || 0;
    // Bank account: debe = abono (money in), haber = cargo (money out)
    return {
      comprobante_id: m.comprobante_id,
      monto: debe > 0 ? debe : haber,
      cargo_abono: debe > 0 ? "A" : "C",
      fecha: comp.fecha,
      glosa: m.glosa || "",
      num_doc: m.num_doc || "",
      used: false,
    };
  });

  // 5. Matching algorithm
  const matches: MatchResult["details"] = [];
  const usedCartolas = new Set<number>();

  // Helper: date diff in days
  function daysDiff(d1: string, d2: string): number {
    const t1 = new Date(d1 + "T12:00:00").getTime();
    const t2 = new Date(d2 + "T12:00:00").getTime();
    return Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
  }

  // Pass 1: Exact match (same amount + same type + date ±2 days)
  for (const cart of pendientes) {
    if (usedCartolas.has(cart.id)) continue;
    const montoCart = Math.abs(Number(cart.monto));
    const tipoCart = cart.cargo_abono;

    // Find candidates with exact amount, same type, closest date within 2 days
    const exactCandidates = candidates
      .filter((c) => !c.used && Math.abs(c.monto - montoCart) < 1 && c.cargo_abono === tipoCart && daysDiff(cart.fecha || "", c.fecha) <= 2)
      .sort((a, b) => daysDiff(cart.fecha || "", a.fecha) - daysDiff(cart.fecha || "", b.fecha));

    if (exactCandidates.length === 1 || (exactCandidates.length > 0 && daysDiff(cart.fecha || "", exactCandidates[0].fecha) === 0)) {
      const best = exactCandidates[0];
      best.used = true;
      usedCartolas.add(cart.id);
      matches.push({
        cartola_id: cart.id,
        comprobante_id: best.comprobante_id,
        monto: montoCart,
        fecha_cartola: cart.fecha || "",
        fecha_comprobante: best.fecha,
        tipo_match: "exacto",
      });
    }
  }

  // Pass 2: Amount match (same amount + same type, within same month)
  for (const cart of pendientes) {
    if (usedCartolas.has(cart.id)) continue;
    const montoCart = Math.abs(Number(cart.monto));
    const tipoCart = cart.cargo_abono;

    const amountCandidates = candidates
      .filter((c) => !c.used && Math.abs(c.monto - montoCart) < 1 && c.cargo_abono === tipoCart)
      .sort((a, b) => daysDiff(cart.fecha || "", a.fecha) - daysDiff(cart.fecha || "", b.fecha));

    // Only match if there's exactly one candidate for this amount (1:1)
    const allSameAmount = candidates.filter((c) => !c.used && Math.abs(c.monto - montoCart) < 1 && c.cargo_abono === tipoCart);
    const allSameAmountCartolas = pendientes.filter((p) => !usedCartolas.has(p.id) && Math.abs(Math.abs(Number(p.monto)) - montoCart) < 1 && p.cargo_abono === tipoCart);

    if (amountCandidates.length === 1 && allSameAmountCartolas.length === 1) {
      const best = amountCandidates[0];
      best.used = true;
      usedCartolas.add(cart.id);
      matches.push({
        cartola_id: cart.id,
        comprobante_id: best.comprobante_id,
        monto: montoCart,
        fecha_cartola: cart.fecha || "",
        fecha_comprobante: best.fecha,
        tipo_match: "monto",
      });
    }
  }

  // Pass 3: Document match (bank description contains a doc number that exists in candidate)
  for (const cart of pendientes) {
    if (usedCartolas.has(cart.id)) continue;
    const desc = (cart.descripcion || "").toLowerCase();
    const numDocCart = (cart.num_doc || "").trim();
    const tipoCart = cart.cargo_abono;

    if (!numDocCart && !desc) continue;

    for (const cand of candidates) {
      if (cand.used || cand.cargo_abono !== tipoCart) continue;
      const candDoc = (cand.num_doc || "").trim();

      if (candDoc && candDoc.length >= 3) {
        // Check if cartola description or num_doc contains the accounting doc number
        if ((numDocCart && numDocCart === candDoc) || (desc && desc.includes(candDoc.toLowerCase()))) {
          // Verify amounts are close enough (within 10% tolerance for partial payments)
          const montoCart = Math.abs(Number(cart.monto));
          if (Math.abs(cand.monto - montoCart) < 1) {
            cand.used = true;
            usedCartolas.add(cart.id);
            matches.push({
              cartola_id: cart.id,
              comprobante_id: cand.comprobante_id,
              monto: montoCart,
              fecha_cartola: cart.fecha || "",
              fecha_comprobante: cand.fecha,
              tipo_match: "documento",
            });
            break;
          }
        }
      }
    }
  }

  // 6. Save matches to database
  if (matches.length > 0) {
    for (const m of matches) {
      await supabase
        .from("cartolas")
        .update({
          contabilizado: true,
          comprobante_id: m.comprobante_id,
        })
        .eq("id", m.cartola_id);
    }

    revalidatePath("/contable/conciliacion");
  }

  return { matched: matches.length, details: matches, error: null };
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
