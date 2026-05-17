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
    receptor: string;
    tipo_match: "exacto" | "combinado";
    docs: string;
  }>;
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

export async function matchAutomatico(anio: number, mes: number): Promise<MatchResult> {
  const supabase = await createClient();
  const config = await getConfig();
  const ctaBanco = config.CUENTA_BANCO || "1-1-01-002";
  const ctaClientes = config.CUENTA_CLIENTES || "1-1-03-001";
  const ctaClientesBol = config.CUENTA_CLIENTES_BOLETAS || "1-1-03-002";
  const ctaProveedores = config.CUENTA_PROVEEDORES || "2-1-02-001";
  const ctaHonorarios = config.CUENTA_HONORARIOS_PAGAR || "2-1-04-001";

  const cuentasCXC = [ctaClientes, ctaClientesBol].filter(Boolean);
  const cuentasCXP = [ctaProveedores, ctaHonorarios].filter(Boolean);
  const todasCuentasDoc = [...cuentasCXC, ...cuentasCXP];

  // 1. Get pending cartola movements
  const { data: cartolaRows } = await supabase
    .from("cartolas")
    .select("id, fecha, monto, cargo_abono, descripcion, num_doc")
    .eq("anio", anio)
    .eq("mes", mes)
    .eq("contabilizado", false);

  if (!cartolaRows || cartolaRows.length === 0) {
    return { matched: 0, details: [], error: null };
  }

  // 2. Extract RUTs from descriptions
  type PendienteMov = {
    id: number; fecha: string; monto: number; esAbono: boolean;
    descripcion: string; rut: string;
  };

  const pendientes: PendienteMov[] = [];
  const rutsNecesarios = new Set<string>();

  for (const row of cartolaRows) {
    const rut = extraerRUTDeDescripcion(row.descripcion || "");
    if (!rut) continue;
    rutsNecesarios.add(rut);
    pendientes.push({
      id: row.id,
      fecha: row.fecha || "",
      monto: Math.abs(Number(row.monto) || 0),
      esAbono: row.cargo_abono === "A",
      descripcion: row.descripcion || "",
      rut,
    });
  }

  if (pendientes.length === 0) {
    return { matched: 0, details: [], error: null };
  }

  // 3. Get all accounting movements for those RUTs in CXC/CXP accounts
  const { data: movsDoc } = await supabase
    .from("mov_contables")
    .select("cuenta_codigo, debe, haber, auxiliar_rut, tipo_doc, num_doc, referencia, comprobantes!inner(estado)")
    .in("cuenta_codigo", todasCuentasDoc)
    .in("auxiliar_rut", Array.from(rutsNecesarios))
    .eq("comprobantes.estado", "VIGENTE");

  if (!movsDoc || movsDoc.length === 0) {
    return { matched: 0, details: [], error: null };
  }

  // 4. Get plan_cuentas to know account types
  const { data: planCtas } = await supabase
    .from("plan_cuentas")
    .select("codigo, tipo")
    .in("codigo", todasCuentasDoc);

  const ctaTipos: Record<string, string> = {};
  for (const c of planCtas || []) ctaTipos[c.codigo] = c.tipo;

  // 5. Build pending documents map: { rut: { CXC: [docs], CXP: [docs] } }
  type DocPendiente = { tipoDoc: string; numDoc: string; saldo: number; cuenta: string };
  const docsTemp: Record<string, { cargos: number; abonos: number; tipoDoc: string; numDoc: string; cuenta: string; rut: string }> = {};

  for (const m of movsDoc) {
    const auxRut = (m.auxiliar_rut || "").toUpperCase();
    if (!rutsNecesarios.has(auxRut)) continue;

    const refTipo = m.referencia?.split("|")[0] || m.tipo_doc || "";
    const refNum = m.referencia?.split("|")[1] || m.num_doc || "";
    if (!refTipo || !refNum) continue;

    const clave = `${auxRut}|${m.cuenta_codigo}|${refTipo}|${refNum}`;
    if (!docsTemp[clave]) {
      docsTemp[clave] = { cargos: 0, abonos: 0, tipoDoc: refTipo, numDoc: refNum, cuenta: m.cuenta_codigo, rut: auxRut };
    }
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

  // 6. Matching + contabilización
  const matches: MatchResult["details"] = [];
  const usedCartolas = new Set<number>();

  // Group pendientes by RUT
  const porRUT: Record<string, PendienteMov[]> = {};
  for (const p of pendientes) {
    if (!porRUT[p.rut]) porRUT[p.rut] = [];
    porRUT[p.rut].push(p);
  }

  for (const rut of Object.keys(porRUT)) {
    const rutDocs = docsPorRUT[rut];
    if (!rutDocs) continue;

    for (const mov of porRUT[rut]) {
      if (usedCartolas.has(mov.id)) continue;

      const docsPool = mov.esAbono ? rutDocs.CXC : rutDocs.CXP;
      if (!docsPool || docsPool.length === 0) continue;

      const tipoContab = mov.esAbono ? "COBRANZA" : "PAGO";
      const cuentaContra = mov.esAbono ? ctaClientes : ctaProveedores;
      const categoriaFlujo = mov.esAbono ? "OP-COB" : "OP-PROV";

      // a) Exact match: single document = cartola amount
      let matchedDocs: DocPendiente[] | null = null;
      let matchTipo: "exacto" | "combinado" = "exacto";

      const exactIdx = docsPool.findIndex((d) => Math.abs(d.saldo - mov.monto) < 1);
      if (exactIdx >= 0) {
        matchedDocs = [docsPool[exactIdx]];
        docsPool.splice(exactIdx, 1);
      } else {
        // b) Combined match: accumulate docs until sum = amount
        const sorted = docsPool.slice().sort((a, b) => b.saldo - a.saldo);
        let acum = 0;
        const combo: { doc: DocPendiente; idx: number }[] = [];
        for (let i = 0; i < sorted.length; i++) {
          if (acum + sorted[i].saldo <= mov.monto + 1) {
            acum += sorted[i].saldo;
            combo.push({ doc: sorted[i], idx: docsPool.indexOf(sorted[i]) });
          }
          if (Math.abs(acum - mov.monto) < 1) break;
        }
        if (combo.length > 0 && Math.abs(acum - mov.monto) < 1) {
          matchedDocs = combo.map((c) => c.doc);
          matchTipo = "combinado";
          // Remove used docs from pool (reverse order to preserve indices)
          const indices = combo.map((c) => c.idx).filter((i) => i >= 0).sort((a, b) => b - a);
          for (const idx of indices) docsPool.splice(idx, 1);
        }
      }

      if (!matchedDocs) continue;

      // Create comprobante
      const docsDesc = matchedDocs.map((d) => `${d.tipoDoc} ${d.numDoc}`).join(", ");
      const glosa = `${mov.esAbono ? "Cobranza" : "Pago"} ${docsDesc}`;
      const cuentaDocUsada = matchedDocs[0].cuenta || cuentaContra;

      type Linea = {
        cuenta_codigo: string; debe: number; haber: number; glosa: string;
        auxiliar_rut: string; tipo_doc: string; num_doc: string;
        fecha_doc: string | null; referencia: string;
      };

      const lineas: Linea[] = [];

      // Bank line
      lineas.push({
        cuenta_codigo: ctaBanco,
        debe: mov.esAbono ? mov.monto : 0,
        haber: mov.esAbono ? 0 : mov.monto,
        glosa,
        auxiliar_rut: "",
        tipo_doc: "",
        num_doc: "",
        fecha_doc: null,
        referencia: "",
      });

      // One contra line per matched doc (for proper document tracking)
      for (const doc of matchedDocs) {
        lineas.push({
          cuenta_codigo: cuentaDocUsada,
          debe: mov.esAbono ? 0 : doc.saldo,
          haber: mov.esAbono ? doc.saldo : 0,
          glosa,
          auxiliar_rut: rut,
          tipo_doc: doc.tipoDoc,
          num_doc: doc.numDoc,
          fecha_doc: mov.fecha,
          referencia: `${doc.tipoDoc}|${doc.numDoc}`,
        });
      }

      const tipoComp = mov.esAbono ? "I" : "E";
      const result = await crearComprobante({
        tipo: tipoComp,
        fecha: mov.fecha,
        glosa,
        lineas,
      });

      if (result.error) continue;

      // Mark cartola as contabilized
      await supabase
        .from("cartolas")
        .update({
          contabilizado: true,
          comprobante_id: result.data!.id,
          categoria_flujo: categoriaFlujo,
        })
        .eq("id", mov.id);

      usedCartolas.add(mov.id);
      matches.push({
        cartola_id: mov.id,
        comprobante_id: result.data!.id,
        monto: mov.monto,
        fecha_cartola: mov.fecha,
        receptor: rut,
        tipo_match: matchTipo,
        docs: docsDesc,
      });
    }
  }

  if (matches.length > 0) {
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
