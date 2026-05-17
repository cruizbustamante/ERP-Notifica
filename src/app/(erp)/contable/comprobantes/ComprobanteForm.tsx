"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { TIPOS_COMPROBANTE, formatNumero } from "@/lib/contabilidad/core";
import { formatRut } from "@/lib/rut";
import { getDocumentosAbiertos } from "./actions";

type Cuenta = {
  codigo: string;
  nombre: string;
  tipo: string;
  usa_auxiliar: string;
  usa_documento: string;
};

type TipoDoc = { codigo: string; nombre: string; abreviatura: string };
type Auxiliar = { rut: string; razon_social: string };

type Linea = {
  key: number;
  cuenta_codigo: string;
  cuenta_nombre: string;
  debe: number;
  haber: number;
  glosa: string;
  auxiliar_rut: string;
  auxiliar_nombre: string;
  tipo_doc: string;
  num_doc: string;
  fecha_doc: string;
  referencia: string;
  usa_auxiliar: boolean;
  usa_documento: boolean;
  modo_doc: "REGISTRO" | "REBAJA" | "SIN_DOC";
  docs_abiertos: { tipo_doc: string; num_doc: string; saldo: number }[];
};

export type ComprobanteFormData = {
  tipo: string;
  fecha: string;
  glosa: string;
  lineas: {
    cuenta_codigo: string;
    debe: number;
    haber: number;
    glosa: string;
    auxiliar_rut: string;
    tipo_doc: string;
    num_doc: string;
    fecha_doc: string | null;
    referencia: string;
  }[];
};

type Props = {
  cuentas: Cuenta[];
  tiposDoc: TipoDoc[];
  auxiliares: Auxiliar[];
  modo: "crear" | "editar";
  initialData?: {
    tipo: string;
    fecha: string;
    glosa: string;
    numero?: number;
    lineas: {
      cuenta_codigo: string;
      debe: number;
      haber: number;
      glosa: string;
      auxiliar_rut: string;
      tipo_doc: string;
      num_doc: string;
      fecha_doc: string | null;
      referencia: string;
    }[];
  };
  onSubmit: (data: ComprobanteFormData) => Promise<{ error: string | null }>;
  submitting?: boolean;
};

function buildLinea(key: number, raw?: Props["initialData"] extends undefined ? never : NonNullable<Props["initialData"]>["lineas"][0], cuentas?: Cuenta[], auxiliares?: Auxiliar[]): Linea {
  if (!raw) {
    return {
      key, cuenta_codigo: "", cuenta_nombre: "", debe: 0, haber: 0,
      glosa: "", auxiliar_rut: "", auxiliar_nombre: "", tipo_doc: "",
      num_doc: "", fecha_doc: "", referencia: "", usa_auxiliar: false,
      usa_documento: false, modo_doc: "SIN_DOC", docs_abiertos: [],
    };
  }
  const cuenta = cuentas?.find((c) => c.codigo === raw.cuenta_codigo);
  const aux = auxiliares?.find((a) => a.rut === raw.auxiliar_rut);
  return {
    key,
    cuenta_codigo: raw.cuenta_codigo,
    cuenta_nombre: cuenta?.nombre || "",
    debe: Number(raw.debe) || 0,
    haber: Number(raw.haber) || 0,
    glosa: raw.glosa || "",
    auxiliar_rut: raw.auxiliar_rut || "",
    auxiliar_nombre: aux?.razon_social || raw.auxiliar_rut || "",
    tipo_doc: raw.tipo_doc || "",
    num_doc: raw.num_doc || "",
    fecha_doc: raw.fecha_doc || "",
    referencia: raw.referencia || "",
    usa_auxiliar: cuenta?.usa_auxiliar === "X",
    usa_documento: cuenta?.usa_documento === "X",
    modo_doc: raw.referencia ? "REBAJA" : (cuenta?.usa_documento === "X" ? "REGISTRO" : "SIN_DOC"),
    docs_abiertos: [],
  };
}

export default function ComprobanteForm({ cuentas, tiposDoc, auxiliares, modo, initialData, onSubmit, submitting }: Props) {
  const [tipo, setTipo] = useState(initialData?.tipo || "I");
  const [fecha, setFecha] = useState(initialData?.fecha || new Date().toISOString().slice(0, 10));
  const [glosa, setGlosa] = useState(initialData?.glosa || "");
  const [lineas, setLineas] = useState<Linea[]>(() => {
    if (initialData?.lineas && initialData.lineas.length > 0) {
      return initialData.lineas.map((l, i) => buildLinea(i + 1, l, cuentas, auxiliares));
    }
    return [buildLinea(1), buildLinea(2)];
  });
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const nextKey = useRef((initialData?.lineas?.length || 2) + 1);

  const totalDebe = useMemo(() => lineas.reduce((s, l) => s + l.debe, 0), [lineas]);
  const totalHaber = useMemo(() => lineas.reduce((s, l) => s + l.haber, 0), [lineas]);
  const diff = totalDebe - totalHaber;
  const cuadrado = Math.abs(diff) < 0.01;

  const updateLinea = useCallback((key: number, patch: Partial<Linea>) => {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }, []);

  function addLinea() {
    setLineas((prev) => [...prev, buildLinea(nextKey.current++)]);
  }

  function removeLinea(key: number) {
    setLineas((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.key !== key)));
  }

  function handleSelectCuenta(key: number, cuenta: Cuenta) {
    updateLinea(key, {
      cuenta_codigo: cuenta.codigo,
      cuenta_nombre: cuenta.nombre,
      usa_auxiliar: cuenta.usa_auxiliar === "X",
      usa_documento: cuenta.usa_documento === "X",
      auxiliar_rut: "", auxiliar_nombre: "",
      tipo_doc: "", num_doc: "", fecha_doc: "", referencia: "",
      modo_doc: cuenta.usa_documento === "X" ? "REGISTRO" : "SIN_DOC",
      docs_abiertos: [],
    });
  }

  async function handleSelectAuxiliar(key: number, aux: Auxiliar) {
    updateLinea(key, { auxiliar_rut: aux.rut, auxiliar_nombre: aux.razon_social });
    const linea = lineas.find((l) => l.key === key);
    if (linea && linea.modo_doc === "REBAJA" && linea.cuenta_codigo) {
      const result = await getDocumentosAbiertos(linea.cuenta_codigo, aux.rut);
      updateLinea(key, { docs_abiertos: result.data || [] });
    }
  }

  async function handleModoDoc(linea: Linea, modo: "REGISTRO" | "REBAJA") {
    updateLinea(linea.key, { modo_doc: modo, referencia: "" });
    if (modo === "REBAJA" && linea.cuenta_codigo && linea.auxiliar_rut) {
      const result = await getDocumentosAbiertos(linea.cuenta_codigo, linea.auxiliar_rut);
      updateLinea(linea.key, { docs_abiertos: result.data || [] });
    }
  }

  async function handleSubmit() {
    if (!glosa.trim()) { setMessage({ type: "error", text: "Ingrese una glosa" }); return; }
    if (!cuadrado) { setMessage({ type: "error", text: "El comprobante está descuadrado" }); return; }

    const result = await onSubmit({
      tipo, fecha, glosa: glosa.trim(),
      lineas: lineas.map((l) => ({
        cuenta_codigo: l.cuenta_codigo,
        debe: l.debe,
        haber: l.haber,
        glosa: l.glosa,
        auxiliar_rut: l.auxiliar_rut,
        tipo_doc: l.tipo_doc,
        num_doc: l.num_doc,
        fecha_doc: l.fecha_doc || null,
        referencia: l.modo_doc === "REBAJA" ? l.referencia : "",
      })),
    });

    if (result.error) {
      setMessage({ type: "error", text: result.error });
      setTimeout(() => setMessage(null), 5000);
    }
  }

  return (
    <div className="space-y-4">
      {/* Message */}
      {message && (
        <div className={`px-4 py-3 rounded-xl text-sm flex items-center justify-between ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="font-bold text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Cabecera */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Datos del comprobante</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={modo === "editar"}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition disabled:bg-gray-50 disabled:text-gray-500">
              {Object.entries(TIPOS_COMPROBANTE).filter(([k]) => ["I", "E", "T"].includes(k)).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Glosa</label>
            <input type="text" value={glosa} onChange={(e) => setGlosa(e.target.value)} placeholder="Descripción del comprobante"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition" />
          </div>
        </div>
      </div>

      {/* Líneas */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-gray-50/80 border-b border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Líneas del comprobante</span>
          <button type="button" onClick={addLinea} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition">
            + Agregar línea
          </button>
        </div>

        <div className="divide-y divide-gray-100">
          {lineas.map((linea, idx) => (
            <LineaRow
              key={linea.key}
              linea={linea}
              idx={idx}
              cuentas={cuentas}
              tiposDoc={tiposDoc}
              auxiliares={auxiliares}
              onSelectCuenta={(c) => handleSelectCuenta(linea.key, c)}
              onSelectAuxiliar={(a) => handleSelectAuxiliar(linea.key, a)}
              onUpdate={(patch) => updateLinea(linea.key, patch)}
              onModoDoc={(modo) => handleModoDoc(linea, modo)}
              onRemove={() => removeLinea(linea.key)}
              canRemove={lineas.length > 2}
            />
          ))}
        </div>
      </div>

      {/* Cuadratura + Submit */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
        <div className="grid grid-cols-3 gap-3 text-center mb-5">
          <div className="bg-green-50 rounded-xl p-3">
            <div className="text-[10px] text-gray-500 uppercase font-medium">Total Debe</div>
            <div className="text-sm sm:text-lg font-bold font-mono text-green-700 mt-0.5">${formatNumero(totalDebe)}</div>
          </div>
          <div className="bg-red-50 rounded-xl p-3">
            <div className="text-[10px] text-gray-500 uppercase font-medium">Total Haber</div>
            <div className="text-sm sm:text-lg font-bold font-mono text-red-700 mt-0.5">${formatNumero(totalHaber)}</div>
          </div>
          <div className={`rounded-xl p-3 ${cuadrado ? "bg-gray-50" : "bg-orange-50"}`}>
            <div className="text-[10px] text-gray-500 uppercase font-medium">Diferencia</div>
            <div className={`text-sm sm:text-lg font-bold font-mono mt-0.5 ${cuadrado ? "text-gray-400" : "text-orange-600"}`}>
              ${formatNumero(Math.abs(diff))}
            </div>
          </div>
        </div>
        <button type="button" onClick={handleSubmit} disabled={submitting || !cuadrado}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition text-sm shadow-sm hover:shadow-md">
          {submitting ? "Guardando..." : modo === "crear" ? "Guardar Comprobante" : "Guardar Cambios"}
        </button>
      </div>
    </div>
  );
}

/* ─── Línea Row ─── */

function LineaRow({ linea, idx, cuentas, tiposDoc, auxiliares, onSelectCuenta, onSelectAuxiliar, onUpdate, onModoDoc, onRemove, canRemove }: {
  linea: Linea; idx: number; cuentas: Cuenta[]; tiposDoc: TipoDoc[]; auxiliares: Auxiliar[];
  onSelectCuenta: (c: Cuenta) => void; onSelectAuxiliar: (a: Auxiliar) => void;
  onUpdate: (patch: Partial<Linea>) => void; onModoDoc: (modo: "REGISTRO" | "REBAJA") => void;
  onRemove: () => void; canRemove: boolean;
}) {
  const [cuentaSearch, setCuentaSearch] = useState("");
  const [cuentaOpen, setCuentaOpen] = useState(false);
  const [auxSearch, setAuxSearch] = useState("");
  const [auxOpen, setAuxOpen] = useState(false);

  const filteredCuentas = useMemo(() => {
    if (!cuentaSearch) return cuentas.slice(0, 20);
    const q = cuentaSearch.toLowerCase();
    return cuentas.filter((c) => c.codigo.includes(q) || c.nombre.toLowerCase().includes(q)).slice(0, 20);
  }, [cuentas, cuentaSearch]);

  const filteredAux = useMemo(() => {
    if (!auxSearch) return auxiliares.slice(0, 20);
    const q = auxSearch.toLowerCase();
    return auxiliares.filter((a) => a.rut.replace(/\./g, "").includes(q.replace(/\./g, "")) || a.razon_social.toLowerCase().includes(q)).slice(0, 20);
  }, [auxiliares, auxSearch]);

  return (
    <div className="p-4 sm:p-5 space-y-3 hover:bg-gray-50/50 transition-colors">
      {/* Row header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">{idx + 1}</span>
          {linea.cuenta_codigo && (
            <span className="text-xs text-gray-500 font-mono">{linea.cuenta_codigo} — {linea.cuenta_nombre}</span>
          )}
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition">
            Eliminar
          </button>
        )}
      </div>

      {/* Cuenta search */}
      <div className="relative">
        {linea.cuenta_codigo ? (
          <div className="flex items-center gap-2 bg-indigo-50/50 border border-indigo-100 rounded-xl px-3 py-2.5">
            <span className="text-sm font-mono font-medium text-indigo-800">{linea.cuenta_codigo}</span>
            <span className="text-sm text-gray-600 truncate flex-1">{linea.cuenta_nombre}</span>
            <button type="button" onClick={() => {
              onSelectCuenta({ codigo: "", nombre: "", tipo: "", usa_auxiliar: "", usa_documento: "" });
              setCuentaSearch("");
            }} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium shrink-0">
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Cuenta contable</label>
            <input type="text" value={cuentaSearch}
              onChange={(e) => { setCuentaSearch(e.target.value); setCuentaOpen(true); }}
              onFocus={() => setCuentaOpen(true)}
              onBlur={() => setTimeout(() => setCuentaOpen(false), 200)}
              placeholder="Buscar por código o nombre..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition" />
            {cuentaOpen && filteredCuentas.length > 0 && (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                {filteredCuentas.map((c) => (
                  <button key={c.codigo} type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { onSelectCuenta(c); setCuentaOpen(false); setCuentaSearch(""); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-sm flex gap-3 border-b border-gray-50 last:border-0 transition">
                    <span className="font-mono text-indigo-600 shrink-0 font-medium">{c.codigo}</span>
                    <span className="text-gray-700 truncate">{c.nombre}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Debe / Haber / Glosa */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div>
          <label className="block text-[11px] font-medium text-gray-500 mb-1">Debe</label>
          <input type="number" min="0" value={linea.debe || ""} onChange={(e) => {
            const v = Number(e.target.value) || 0;
            onUpdate({ debe: v, haber: v > 0 ? 0 : linea.haber });
          }} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono text-gray-700 focus:ring-2 focus:ring-green-500/20 focus:border-green-400 transition" placeholder="0" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 mb-1">Haber</label>
          <input type="number" min="0" value={linea.haber || ""} onChange={(e) => {
            const v = Number(e.target.value) || 0;
            onUpdate({ haber: v, debe: v > 0 ? 0 : linea.debe });
          }} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono text-gray-700 focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition" placeholder="0" />
        </div>
        <div className="col-span-2 sm:col-span-3">
          <label className="block text-[11px] font-medium text-gray-500 mb-1">Glosa</label>
          <input type="text" value={linea.glosa} onChange={(e) => onUpdate({ glosa: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition" placeholder="Detalle (opcional)" />
        </div>
      </div>

      {/* Auxiliar */}
      {linea.usa_auxiliar && (
        <div className="relative">
          <label className="block text-[11px] font-medium text-gray-500 mb-1">Auxiliar</label>
          {linea.auxiliar_rut ? (
            <div className="flex items-center gap-2 bg-amber-50/50 border border-amber-100 rounded-xl px-3 py-2.5">
              <span className="text-sm font-mono font-medium text-amber-800">{formatRut(linea.auxiliar_rut)}</span>
              <span className="text-sm text-gray-600 truncate flex-1">{linea.auxiliar_nombre}</span>
              <button type="button" onClick={() => {
                onUpdate({ auxiliar_rut: "", auxiliar_nombre: "", docs_abiertos: [], referencia: "" });
                setAuxSearch("");
              }} className="text-xs text-amber-600 hover:text-amber-800 font-medium shrink-0">Cambiar</button>
            </div>
          ) : (
            <>
              <input type="text" value={auxSearch}
                onChange={(e) => { setAuxSearch(e.target.value); setAuxOpen(true); }}
                onFocus={() => setAuxOpen(true)}
                onBlur={() => setTimeout(() => setAuxOpen(false), 200)}
                placeholder="Buscar por RUT o razón social..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition" />
              {auxOpen && filteredAux.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                  {filteredAux.map((a) => (
                    <button key={a.rut} type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { onSelectAuxiliar(a); setAuxOpen(false); setAuxSearch(""); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-amber-50 text-sm flex gap-3 border-b border-gray-50 last:border-0 transition">
                      <span className="font-mono text-amber-700 shrink-0">{formatRut(a.rut)}</span>
                      <span className="text-gray-700 truncate">{a.razon_social}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Documento */}
      {linea.usa_documento && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-2.5 border border-gray-100">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onModoDoc("REGISTRO")}
              className={`text-[11px] px-3 py-1.5 rounded-lg font-medium transition ${linea.modo_doc === "REGISTRO" ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-gray-500 border border-gray-200 hover:border-indigo-300"}`}>
              Registro
            </button>
            <button type="button" onClick={() => onModoDoc("REBAJA")}
              className={`text-[11px] px-3 py-1.5 rounded-lg font-medium transition ${linea.modo_doc === "REBAJA" ? "bg-orange-500 text-white shadow-sm" : "bg-white text-gray-500 border border-gray-200 hover:border-orange-300"}`}>
              Rebaja
            </button>
          </div>

          {linea.modo_doc === "REGISTRO" && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Tipo Doc</label>
                <select value={linea.tipo_doc} onChange={(e) => onUpdate({ tipo_doc: e.target.value })}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500/20 transition">
                  <option value="">--</option>
                  {tiposDoc.map((td) => (<option key={td.codigo} value={td.codigo}>{td.abreviatura}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">N° Doc</label>
                <input type="text" value={linea.num_doc} onChange={(e) => onUpdate({ num_doc: e.target.value })}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs text-gray-700 focus:ring-2 focus:ring-indigo-500/20 transition" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Fecha Doc</label>
                <input type="date" value={linea.fecha_doc} onChange={(e) => onUpdate({ fecha_doc: e.target.value })}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs text-gray-700 focus:ring-2 focus:ring-indigo-500/20 transition" />
              </div>
            </div>
          )}

          {linea.modo_doc === "REBAJA" && (
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Documento a rebajar</label>
              {linea.docs_abiertos.length > 0 ? (
                <select value={linea.referencia} onChange={(e) => {
                  const ref = e.target.value;
                  const parts = ref.split("|");
                  onUpdate({ referencia: ref, tipo_doc: parts[0] || "", num_doc: parts[1] || "" });
                }} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs bg-white text-gray-700 focus:ring-2 focus:ring-orange-500/20 transition">
                  <option value="">Seleccione documento...</option>
                  {linea.docs_abiertos.map((d) => (
                    <option key={`${d.tipo_doc}|${d.num_doc}`} value={`${d.tipo_doc}|${d.num_doc}`}>
                      {d.tipo_doc} {d.num_doc} — Saldo: ${formatNumero(d.saldo)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-gray-400 italic py-1">
                  {linea.auxiliar_rut ? "No hay documentos abiertos" : "Seleccione auxiliar primero"}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
