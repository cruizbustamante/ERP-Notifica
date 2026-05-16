"use client";

import { useState, useMemo, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TIPOS_COMPROBANTE, formatNumero } from "@/lib/contabilidad/core";
import { crearComprobante, getDocumentosAbiertos } from "../actions";

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

type Props = {
  cuentas: Cuenta[];
  tiposDoc: TipoDoc[];
  auxiliares: Auxiliar[];
};

function emptyLinea(key: number): Linea {
  return {
    key,
    cuenta_codigo: "",
    cuenta_nombre: "",
    debe: 0,
    haber: 0,
    glosa: "",
    auxiliar_rut: "",
    auxiliar_nombre: "",
    tipo_doc: "",
    num_doc: "",
    fecha_doc: "",
    referencia: "",
    usa_auxiliar: false,
    usa_documento: false,
    modo_doc: "SIN_DOC",
    docs_abiertos: [],
  };
}

export default function NuevoComprobanteClient({
  cuentas,
  tiposDoc,
  auxiliares,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tipo, setTipo] = useState("I");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [glosa, setGlosa] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([
    emptyLinea(1),
    emptyLinea(2),
  ]);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const nextKey = useRef(3);

  const totalDebe = useMemo(
    () => lineas.reduce((s, l) => s + l.debe, 0),
    [lineas]
  );
  const totalHaber = useMemo(
    () => lineas.reduce((s, l) => s + l.haber, 0),
    [lineas]
  );
  const diff = totalDebe - totalHaber;
  const cuadrado = Math.abs(diff) < 0.01;

  const updateLinea = useCallback(
    (key: number, patch: Partial<Linea>) => {
      setLineas((prev) =>
        prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
      );
    },
    []
  );

  function addLinea() {
    setLineas((prev) => [...prev, emptyLinea(nextKey.current++)]);
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
      auxiliar_rut: "",
      auxiliar_nombre: "",
      tipo_doc: "",
      num_doc: "",
      fecha_doc: "",
      referencia: "",
      modo_doc: cuenta.usa_documento === "X" ? "REGISTRO" : "SIN_DOC",
      docs_abiertos: [],
    });
  }

  function handleSelectAuxiliar(key: number, aux: Auxiliar) {
    updateLinea(key, {
      auxiliar_rut: aux.rut,
      auxiliar_nombre: aux.razon_social,
    });
  }

  async function handleModoDoc(linea: Linea, modo: "REGISTRO" | "REBAJA") {
    updateLinea(linea.key, { modo_doc: modo, referencia: "" });
    if (modo === "REBAJA" && linea.cuenta_codigo && linea.auxiliar_rut) {
      const result = await getDocumentosAbiertos(
        linea.cuenta_codigo,
        linea.auxiliar_rut
      );
      updateLinea(linea.key, { docs_abiertos: result.data || [] });
    }
  }

  async function handleSubmit() {
    if (!glosa.trim()) {
      setMessage({ type: "error", text: "Ingrese una glosa" });
      return;
    }
    startTransition(async () => {
      const result = await crearComprobante({
        tipo,
        fecha,
        glosa: glosa.trim(),
        lineas: lineas.map((l) => ({
          cuenta_codigo: l.cuenta_codigo,
          debe: l.debe,
          haber: l.haber,
          glosa: l.glosa,
          auxiliar_rut: l.auxiliar_rut,
          tipo_doc: l.tipo_doc,
          num_doc: l.num_doc,
          fecha_doc: l.fecha_doc || null,
          referencia:
            l.modo_doc === "REBAJA" ? l.referencia : "",
        })),
      });
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        setTimeout(() => setMessage(null), 4000);
      } else {
        router.push("/contable/comprobantes");
      }
    });
  }

  return (
    <div className="space-y-3 sm:space-y-4 max-w-full overflow-hidden">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">
              Nuevo Comprobante
            </h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-0.5">
              Ingreso de comprobante contable
            </p>
          </div>
          <Link
            href="/contable/comprobantes"
            className="text-gray-500 hover:text-gray-700 text-xs sm:text-sm font-medium px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition shrink-0"
          >
            Cancelar
          </Link>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Cabecera */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Tipo
            </label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-700"
            >
              {Object.entries(TIPOS_COMPROBANTE)
                .filter(([k]) => ["I", "E", "T"].includes(k))
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Fecha
            </label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Glosa
            </label>
            <input
              type="text"
              value={glosa}
              onChange={(e) => setGlosa(e.target.value)}
              placeholder="Descripción del comprobante"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700"
            />
          </div>
        </div>
      </div>

      {/* Líneas */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Líneas del comprobante
          </span>
          <button
            type="button"
            onClick={addLinea}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
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
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center mb-4">
          <div>
            <div className="text-xs text-gray-500 uppercase">Total Debe</div>
            <div className="text-sm sm:text-base font-bold font-mono text-green-600">
              ${formatNumero(totalDebe)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase">Total Haber</div>
            <div className="text-sm sm:text-base font-bold font-mono text-red-600">
              ${formatNumero(totalHaber)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase">Diferencia</div>
            <div
              className={`text-sm sm:text-base font-bold font-mono ${
                cuadrado ? "text-gray-400" : "text-orange-600"
              }`}
            >
              ${formatNumero(Math.abs(diff))}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || !cuadrado}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition text-sm"
        >
          {isPending ? "Guardando..." : "Guardar Comprobante"}
        </button>
      </div>
    </div>
  );
}

/* ─── Línea Row ─── */

function LineaRow({
  linea,
  idx,
  cuentas,
  tiposDoc,
  auxiliares,
  onSelectCuenta,
  onSelectAuxiliar,
  onUpdate,
  onModoDoc,
  onRemove,
  canRemove,
}: {
  linea: Linea;
  idx: number;
  cuentas: Cuenta[];
  tiposDoc: TipoDoc[];
  auxiliares: Auxiliar[];
  onSelectCuenta: (c: Cuenta) => void;
  onSelectAuxiliar: (a: Auxiliar) => void;
  onUpdate: (patch: Partial<Linea>) => void;
  onModoDoc: (modo: "REGISTRO" | "REBAJA") => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [cuentaSearch, setCuentaSearch] = useState("");
  const [cuentaOpen, setCuentaOpen] = useState(false);
  const [auxSearch, setAuxSearch] = useState("");
  const [auxOpen, setAuxOpen] = useState(false);
  const cuentaRef = useRef<HTMLDivElement>(null);
  const auxRef = useRef<HTMLDivElement>(null);

  const filteredCuentas = useMemo(() => {
    if (!cuentaSearch) return cuentas.slice(0, 20);
    const q = cuentaSearch.toLowerCase();
    return cuentas
      .filter(
        (c) =>
          c.codigo.includes(q) || c.nombre.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [cuentas, cuentaSearch]);

  const filteredAux = useMemo(() => {
    if (!auxSearch) return auxiliares.slice(0, 20);
    const q = auxSearch.toLowerCase();
    return auxiliares
      .filter(
        (a) =>
          a.rut.includes(q) || a.razon_social.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [auxiliares, auxSearch]);

  return (
    <div className="p-3 sm:p-4 space-y-2">
      {/* Row header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400">
          Línea {idx + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Eliminar
          </button>
        )}
      </div>

      {/* Cuenta search */}
      <div className="relative" ref={cuentaRef}>
        <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
          Cuenta
        </label>
        {linea.cuenta_codigo ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-gray-900">
              {linea.cuenta_codigo}
            </span>
            <span className="text-sm text-gray-600 truncate">
              {linea.cuenta_nombre}
            </span>
            <button
              type="button"
              onClick={() => {
                onSelectCuenta({
                  codigo: "",
                  nombre: "",
                  tipo: "",
                  usa_auxiliar: "",
                  usa_documento: "",
                });
                setCuentaSearch("");
              }}
              className="text-xs text-gray-400 hover:text-gray-600 ml-auto shrink-0"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={cuentaSearch}
              onChange={(e) => {
                setCuentaSearch(e.target.value);
                setCuentaOpen(true);
              }}
              onFocus={() => setCuentaOpen(true)}
              placeholder="Buscar cuenta..."
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700"
            />
            {cuentaOpen && filteredCuentas.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredCuentas.map((c) => (
                  <button
                    key={c.codigo}
                    type="button"
                    onClick={() => {
                      onSelectCuenta(c);
                      setCuentaOpen(false);
                      setCuentaSearch("");
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-sm flex gap-2"
                  >
                    <span className="font-mono text-gray-500 shrink-0">
                      {c.codigo}
                    </span>
                    <span className="text-gray-700 truncate">{c.nombre}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Debe / Haber */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
            Debe
          </label>
          <input
            type="number"
            min="0"
            value={linea.debe || ""}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              onUpdate({ debe: v, haber: v > 0 ? 0 : linea.haber });
            }}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono text-gray-700"
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
            Haber
          </label>
          <input
            type="number"
            min="0"
            value={linea.haber || ""}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              onUpdate({ haber: v, debe: v > 0 ? 0 : linea.debe });
            }}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono text-gray-700"
            placeholder="0"
          />
        </div>
      </div>

      {/* Glosa línea */}
      <div>
        <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
          Glosa
        </label>
        <input
          type="text"
          value={linea.glosa}
          onChange={(e) => onUpdate({ glosa: e.target.value })}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700"
          placeholder="Detalle de la línea"
        />
      </div>

      {/* Auxiliar */}
      {linea.usa_auxiliar && (
        <div className="relative" ref={auxRef}>
          <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
            Auxiliar (RUT)
          </label>
          {linea.auxiliar_rut ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-gray-900">
                {linea.auxiliar_rut}
              </span>
              <span className="text-sm text-gray-600 truncate">
                {linea.auxiliar_nombre}
              </span>
              <button
                type="button"
                onClick={() => {
                  onUpdate({
                    auxiliar_rut: "",
                    auxiliar_nombre: "",
                    docs_abiertos: [],
                    referencia: "",
                  });
                  setAuxSearch("");
                }}
                className="text-xs text-gray-400 hover:text-gray-600 ml-auto shrink-0"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={auxSearch}
                onChange={(e) => {
                  setAuxSearch(e.target.value);
                  setAuxOpen(true);
                }}
                onFocus={() => setAuxOpen(true)}
                placeholder="Buscar por RUT o nombre..."
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700"
              />
              {auxOpen && filteredAux.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredAux.map((a) => (
                    <button
                      key={a.rut}
                      type="button"
                      onClick={() => {
                        onSelectAuxiliar(a);
                        setAuxOpen(false);
                        setAuxSearch("");
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-sm flex gap-2"
                    >
                      <span className="font-mono text-gray-500 shrink-0">
                        {a.rut}
                      </span>
                      <span className="text-gray-700 truncate">
                        {a.razon_social}
                      </span>
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
        <div className="space-y-2 bg-gray-50 rounded-lg p-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onModoDoc("REGISTRO")}
              className={`text-[11px] px-2 py-1 rounded font-medium transition ${
                linea.modo_doc === "REGISTRO"
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-gray-200 text-gray-500 hover:bg-gray-300"
              }`}
            >
              Registro
            </button>
            <button
              type="button"
              onClick={() => onModoDoc("REBAJA")}
              className={`text-[11px] px-2 py-1 rounded font-medium transition ${
                linea.modo_doc === "REBAJA"
                  ? "bg-orange-100 text-orange-700"
                  : "bg-gray-200 text-gray-500 hover:bg-gray-300"
              }`}
            >
              Rebaja
            </button>
          </div>

          {linea.modo_doc === "REGISTRO" && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
                  Tipo Doc
                </label>
                <select
                  value={linea.tipo_doc}
                  onChange={(e) => onUpdate({ tipo_doc: e.target.value })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs bg-white text-gray-700"
                >
                  <option value="">--</option>
                  {tiposDoc.map((td) => (
                    <option key={td.codigo} value={td.codigo}>
                      {td.abreviatura}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
                  N° Doc
                </label>
                <input
                  type="text"
                  value={linea.num_doc}
                  onChange={(e) => onUpdate({ num_doc: e.target.value })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-gray-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
                  Fecha Doc
                </label>
                <input
                  type="date"
                  value={linea.fecha_doc}
                  onChange={(e) => onUpdate({ fecha_doc: e.target.value })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-gray-700"
                />
              </div>
            </div>
          )}

          {linea.modo_doc === "REBAJA" && (
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
                Documento a rebajar
              </label>
              {linea.docs_abiertos.length > 0 ? (
                <select
                  value={linea.referencia}
                  onChange={(e) => {
                    const ref = e.target.value;
                    const parts = ref.split("|");
                    onUpdate({
                      referencia: ref,
                      tipo_doc: parts[0] || "",
                      num_doc: parts[1] || "",
                    });
                  }}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs bg-white text-gray-700"
                >
                  <option value="">Seleccione documento...</option>
                  {linea.docs_abiertos.map((d) => (
                    <option
                      key={`${d.tipo_doc}|${d.num_doc}`}
                      value={`${d.tipo_doc}|${d.num_doc}`}
                    >
                      {d.tipo_doc} {d.num_doc} — Saldo: $
                      {formatNumero(d.saldo)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-gray-400 italic">
                  {linea.auxiliar_rut
                    ? "No hay documentos abiertos"
                    : "Seleccione auxiliar primero"}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
