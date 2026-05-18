"use client";

import { useState, useTransition } from "react";
import { formatMonto, MESES } from "@/lib/contabilidad/core";
import { formatRut } from "@/lib/rut";
import {
  getMovimientosAuxiliar,
  getDocsPendientes,
  type InformeAuxiliarResult,
  type DocPendiente,
} from "./actions";
import { crearLibroCorporativo, descargarWorkbook } from "@/lib/excel";

type Periodo = { anio: number; estado: string };
type Cuenta = { codigo: string; nombre: string; tipo: string; usa_documento: string | null };
type Auxiliar = { rut: string; razon_social: string };

type ViewMode = "movimientos" | "pendientes";

export default function InformeAuxiliaresClient({
  periodos,
  cuentas,
  auxiliares,
  currentYear,
}: {
  periodos: Periodo[];
  cuentas: Cuenta[];
  auxiliares: Auxiliar[];
  currentYear: number;
}) {
  const [anio, setAnio] = useState(currentYear);
  const [mesDesde, setMesDesde] = useState(1);
  const [mesHasta, setMesHasta] = useState(12);
  const [cuentaCodigo, setCuentaCodigo] = useState("");
  const [busqCuenta, setBusqCuenta] = useState("");
  const [showCuentaDropdown, setShowCuentaDropdown] = useState(false);
  const [auxiliarRut, setAuxiliarRut] = useState("");
  const [busqAuxiliar, setBusqAuxiliar] = useState("");
  const [showAuxiliarDropdown, setShowAuxiliarDropdown] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("movimientos");
  const [result, setResult] = useState<InformeAuxiliarResult | null>(null);
  const [docsPendientes, setDocsPendientes] = useState<DocPendiente[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const consultar = () => {
    if (!cuentaCodigo) {
      setError("Seleccione una cuenta");
      return;
    }
    if (!auxiliarRut) {
      setError("Seleccione un auxiliar");
      return;
    }
    setError(null);

    if (viewMode === "movimientos") {
      startTransition(async () => {
        const { data, error: err } = await getMovimientosAuxiliar(
          cuentaCodigo,
          auxiliarRut,
          anio,
          mesDesde,
          mesHasta
        );
        setResult(data);
        setDocsPendientes([]);
        setError(err);
      });
    } else {
      startTransition(async () => {
        const { data, error: err } = await getDocsPendientes(
          cuentaCodigo,
          auxiliarRut
        );
        setDocsPendientes(data || []);
        setResult(null);
        setError(err);
      });
    }
  };

  const descargarExcel = () => {
    if (viewMode === "movimientos" && result) {
      const periodo =
        mesDesde === mesHasta
          ? `${MESES[mesDesde]} ${anio}`
          : `${MESES[mesDesde]} a ${MESES[mesHasta]} ${anio}`;

      const wb = crearLibroCorporativo({
        titulo: `Informe Auxiliar — ${result.cuenta_codigo} ${result.cuenta_nombre} — ${formatRut(result.auxiliar_rut)} ${result.auxiliar_nombre}`,
        periodo,
        hoja: "Auxiliar",
        columnas: [
          { key: "fecha", header: "Fecha", width: 12 },
          { key: "comprobante", header: "Comp.", width: 12 },
          { key: "tipo_doc", header: "Tipo Doc", width: 10 },
          { key: "num_doc", header: "N° Doc", width: 12 },
          { key: "tipo_doc_ref", header: "Ref Tipo", width: 10 },
          { key: "num_doc_ref", header: "Ref N°", width: 12 },
          {
            key: "debe",
            header: "Debe",
            width: 16,
            numFmt: "#,##0",
            alignment: { horizontal: "right", vertical: "middle" },
          },
          {
            key: "haber",
            header: "Haber",
            width: 16,
            numFmt: "#,##0",
            alignment: { horizontal: "right", vertical: "middle" },
          },
          {
            key: "saldo",
            header: "Saldo",
            width: 16,
            numFmt: "#,##0",
            alignment: { horizontal: "right", vertical: "middle" },
          },
          { key: "glosa", header: "Glosa", width: 30 },
        ],
        datos: result.movimientos.map((m) => ({
          fecha: m.fecha,
          comprobante: m.comprobante,
          tipo_doc: m.tipo_doc,
          num_doc: m.num_doc,
          tipo_doc_ref: m.tipo_doc_ref,
          num_doc_ref: m.num_doc_ref,
          debe: m.debe || "",
          haber: m.haber || "",
          saldo: m.saldo,
          glosa: m.glosa,
        })),
        totales: {
          debe: result.total_debe,
          haber: result.total_haber,
          saldo: result.saldo_final,
        },
        totalesLabel: "TOTALES",
      });

      descargarWorkbook(
        wb,
        `Auxiliar_${result.cuenta_codigo}_${result.auxiliar_rut}_${anio}.xlsx`
      );
    } else if (viewMode === "pendientes" && docsPendientes.length > 0) {
      const cuentaSel = cuentas.find((c) => c.codigo === cuentaCodigo);
      const auxSel = auxiliares.find((a) => a.rut === auxiliarRut);

      const wb = crearLibroCorporativo({
        titulo: `Saldos Pendientes — ${cuentaCodigo} ${cuentaSel?.nombre || ""} — ${formatRut(auxiliarRut)} ${auxSel?.razon_social || ""}`,
        periodo: "Todos los periodos",
        hoja: "Saldos Pendientes",
        columnas: [
          { key: "tipo_doc", header: "Tipo Doc", width: 12 },
          { key: "num_doc", header: "N° Doc", width: 14 },
          { key: "fecha_doc", header: "Fecha", width: 12 },
          {
            key: "monto_original",
            header: "Monto Original",
            width: 18,
            numFmt: "#,##0",
            alignment: { horizontal: "right", vertical: "middle" },
          },
          {
            key: "rebajas",
            header: "Rebajas",
            width: 16,
            numFmt: "#,##0",
            alignment: { horizontal: "right", vertical: "middle" },
          },
          {
            key: "saldo",
            header: "Saldo Pendiente",
            width: 18,
            numFmt: "#,##0",
            alignment: { horizontal: "right", vertical: "middle" },
          },
        ],
        datos: docsPendientes.map((d) => ({
          tipo_doc: d.tipo_doc,
          num_doc: d.num_doc,
          fecha_doc: d.fecha_doc || "",
          monto_original: d.monto_original,
          rebajas: d.rebajas,
          saldo: d.saldo,
        })),
        totales: {
          monto_original: docsPendientes.reduce(
            (s, d) => s + d.monto_original,
            0
          ),
          rebajas: docsPendientes.reduce((s, d) => s + d.rebajas, 0),
          saldo: docsPendientes.reduce((s, d) => s + d.saldo, 0),
        },
        totalesLabel: "TOTALES",
      });

      descargarWorkbook(
        wb,
        `Saldos_Pendientes_${cuentaCodigo}_${auxiliarRut}.xlsx`
      );
    }
  };

  const cuentasFiltradas = busqCuenta
    ? cuentas.filter(
        (c) =>
          c.codigo.includes(busqCuenta) ||
          c.nombre.toLowerCase().includes(busqCuenta.toLowerCase())
      )
    : cuentas;

  const auxiliaresFiltrados = busqAuxiliar
    ? auxiliares.filter(
        (a) =>
          a.rut.includes(busqAuxiliar) ||
          a.razon_social.toLowerCase().includes(busqAuxiliar.toLowerCase())
      )
    : auxiliares;

  const hasResults =
    (viewMode === "movimientos" && result) ||
    (viewMode === "pendientes" && docsPendientes.length > 0);

  return (
    <div className="space-y-4">
      {/* Header + Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Informe Auxiliares
            </h1>
            <p className="text-gray-500 mt-1">
              Movimientos por cuenta y auxiliar
            </p>
          </div>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          {/* Year */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Ano</label>
            <select
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {periodos.map((p) => (
                <option key={p.anio} value={p.anio}>
                  {p.anio}
                </option>
              ))}
            </select>
          </div>

          {/* Mes desde */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Desde</label>
            <select
              value={mesDesde}
              onChange={(e) => setMesDesde(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              disabled={viewMode === "pendientes"}
            >
              {MESES.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Mes hasta */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hasta</label>
            <select
              value={mesHasta}
              onChange={(e) => setMesHasta(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              disabled={viewMode === "pendientes"}
            >
              {MESES.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Cuenta search */}
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-gray-500 mb-1">Cuenta</label>
            <div className="relative">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={busqCuenta}
                  onChange={(e) => {
                    setBusqCuenta(e.target.value);
                    setCuentaCodigo("");
                    setShowCuentaDropdown(true);
                  }}
                  onFocus={() => setShowCuentaDropdown(true)}
                  placeholder="Buscar por codigo o nombre..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                {cuentaCodigo && (
                  <button
                    onClick={() => {
                      setCuentaCodigo("");
                      setBusqCuenta("");
                      setShowCuentaDropdown(false);
                    }}
                    className="px-2 text-gray-400 hover:text-gray-600 flex-shrink-0"
                    title="Limpiar"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
              {showCuentaDropdown && !cuentaCodigo && (
                <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-lg max-h-64 overflow-y-auto">
                  <div className="sticky top-0 bg-gray-50 px-3 py-1.5 text-xs text-gray-500 border-b">
                    {cuentasFiltradas.length} cuentas
                  </div>
                  {cuentasFiltradas.map((c) => (
                    <button
                      key={c.codigo}
                      onClick={() => {
                        setCuentaCodigo(c.codigo);
                        setBusqCuenta(`${c.codigo} — ${c.nombre}`);
                        setShowCuentaDropdown(false);
                      }}
                      className="block w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0"
                    >
                      <span className="font-mono text-blue-600">
                        {c.codigo}
                      </span>{" "}
                      — {c.nombre}
                    </button>
                  ))}
                  {cuentasFiltradas.length === 0 && (
                    <div className="px-3 py-3 text-sm text-gray-400 text-center">
                      Sin resultados
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Auxiliar search */}
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-gray-500 mb-1">
              Auxiliar
            </label>
            <div className="relative">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={busqAuxiliar}
                  onChange={(e) => {
                    setBusqAuxiliar(e.target.value);
                    setAuxiliarRut("");
                    setShowAuxiliarDropdown(true);
                  }}
                  onFocus={() => setShowAuxiliarDropdown(true)}
                  placeholder="Buscar por RUT o nombre..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                {auxiliarRut && (
                  <button
                    onClick={() => {
                      setAuxiliarRut("");
                      setBusqAuxiliar("");
                      setShowAuxiliarDropdown(false);
                    }}
                    className="px-2 text-gray-400 hover:text-gray-600 flex-shrink-0"
                    title="Limpiar"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
              {showAuxiliarDropdown && !auxiliarRut && (
                <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-lg max-h-64 overflow-y-auto">
                  <div className="sticky top-0 bg-gray-50 px-3 py-1.5 text-xs text-gray-500 border-b">
                    {auxiliaresFiltrados.length} auxiliares
                  </div>
                  {auxiliaresFiltrados.map((a) => (
                    <button
                      key={a.rut}
                      onClick={() => {
                        setAuxiliarRut(a.rut);
                        setBusqAuxiliar(
                          `${formatRut(a.rut)} — ${a.razon_social}`
                        );
                        setShowAuxiliarDropdown(false);
                      }}
                      className="block w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0"
                    >
                      <span className="font-mono text-indigo-600">
                        {formatRut(a.rut)}
                      </span>{" "}
                      — {a.razon_social}
                    </button>
                  ))}
                  {auxiliaresFiltrados.length === 0 && (
                    <div className="px-3 py-3 text-sm text-gray-400 text-center">
                      Sin resultados
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* View mode toggle + action buttons */}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setViewMode("movimientos")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                viewMode === "movimientos"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Movimientos
            </button>
            <button
              onClick={() => setViewMode("pendientes")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                viewMode === "pendientes"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Saldos pendientes
            </button>
          </div>

          <button
            onClick={consultar}
            disabled={isPending}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "Cargando..." : "Consultar"}
          </button>

          {hasResults && (
            <button
              onClick={descargarExcel}
              disabled={isPending}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              title="Descargar Excel"
            >
              {isPending ? "..." : "Descargar Excel"}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-800 border border-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Results - Movimientos mode */}
      {viewMode === "movimientos" && result && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {/* Header */}
          <div className="p-4 border-b bg-gray-50">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-mono text-lg font-bold">
                  {result.cuenta_codigo}
                </span>
                <span className="ml-2 text-gray-600">
                  {result.cuenta_nombre}
                </span>
                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-200">
                  {result.cuenta_tipo === "A"
                    ? "Activo"
                    : result.cuenta_tipo === "P"
                    ? "Pasivo"
                    : result.cuenta_tipo === "I"
                    ? "Ingreso"
                    : result.cuenta_tipo === "G"
                    ? "Gasto"
                    : "Patrimonio"}
                </span>
              </div>
              <div className="text-sm">
                <span className="font-mono text-indigo-600 font-medium">
                  {formatRut(result.auxiliar_rut)}
                </span>
                <span className="ml-2 text-gray-600">
                  {result.auxiliar_nombre}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="text-sm text-gray-500">
                Saldo anterior:{" "}
                <span className="font-mono font-medium text-gray-700">
                  {formatMonto(result.saldo_anterior)}
                </span>
              </div>
              <div className="text-sm">
                Saldo final:{" "}
                <span className="font-mono font-bold text-lg text-gray-900">
                  {formatMonto(result.saldo_final)}
                </span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium">Comp.</th>
                  <th className="px-4 py-2 font-medium">Tipo Doc</th>
                  <th className="px-4 py-2 font-medium">N&#176; Doc</th>
                  <th className="px-4 py-2 font-medium">Ref Tipo</th>
                  <th className="px-4 py-2 font-medium">Ref N&#176;</th>
                  <th className="px-4 py-2 font-medium text-right">Debe</th>
                  <th className="px-4 py-2 font-medium text-right">Haber</th>
                  <th className="px-4 py-2 font-medium text-right">Saldo</th>
                  <th className="px-4 py-2 font-medium">Glosa</th>
                </tr>
              </thead>
              <tbody>
                {/* Saldo anterior row */}
                {(result.saldo_anterior !== 0 ||
                  ["1", "2", "3"].includes(
                    result.cuenta_codigo.charAt(0)
                  )) && (
                  <tr className="border-b bg-blue-50">
                    <td
                      colSpan={6}
                      className="px-4 py-2 font-medium text-blue-700"
                    >
                      {["1", "2", "3"].includes(result.cuenta_codigo.charAt(0))
                        ? "Saldo inicial"
                        : "Saldo anterior"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono"></td>
                    <td className="px-4 py-2 text-right font-mono"></td>
                    <td className="px-4 py-2 text-right font-mono font-medium text-blue-700">
                      {formatMonto(result.saldo_anterior)}
                    </td>
                    <td className="px-4 py-2"></td>
                  </tr>
                )}

                {result.movimientos.map((m, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-1.5 whitespace-nowrap">{m.fecha}</td>
                    <td className="px-4 py-1.5 font-mono text-xs">
                      {m.comprobante}
                    </td>
                    <td className="px-4 py-1.5 text-xs">{m.tipo_doc}</td>
                    <td className="px-4 py-1.5 text-xs">{m.num_doc}</td>
                    <td className="px-4 py-1.5 text-xs">
                      {m.tipo_doc_ref || "—"}
                    </td>
                    <td className="px-4 py-1.5 text-xs">
                      {m.num_doc_ref || "—"}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono">
                      {m.debe > 0 ? formatMonto(m.debe) : ""}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono">
                      {m.haber > 0 ? formatMonto(m.haber) : ""}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono font-medium">
                      {formatMonto(m.saldo)}
                    </td>
                    <td className="px-4 py-1.5 truncate max-w-[250px] text-gray-600">
                      {m.glosa}
                    </td>
                  </tr>
                ))}

                {/* Totals */}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-medium">
                  <td colSpan={6} className="px-4 py-2">
                    Totales
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatMonto(result.total_debe)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatMonto(result.total_haber)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-bold">
                    {formatMonto(result.saldo_final)}
                  </td>
                  <td className="px-4 py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {result.movimientos.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">
              Sin movimientos en el periodo seleccionado
            </div>
          )}
        </div>
      )}

      {/* Results - Saldos pendientes mode */}
      {viewMode === "pendientes" && docsPendientes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {/* Header */}
          <div className="p-4 border-b bg-gray-50">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-mono text-lg font-bold">
                  {cuentaCodigo}
                </span>
                <span className="ml-2 text-gray-600">
                  {cuentas.find((c) => c.codigo === cuentaCodigo)?.nombre}
                </span>
              </div>
              <div className="text-sm">
                <span className="font-mono text-indigo-600 font-medium">
                  {formatRut(auxiliarRut)}
                </span>
                <span className="ml-2 text-gray-600">
                  {auxiliares.find((a) => a.rut === auxiliarRut)?.razon_social}
                </span>
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-500">
              {docsPendientes.length} documento
              {docsPendientes.length !== 1 ? "s" : ""} con saldo pendiente —
              Total:{" "}
              <span className="font-mono font-bold text-lg text-gray-900">
                {formatMonto(
                  docsPendientes.reduce((s, d) => s + d.saldo, 0)
                )}
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="px-4 py-2 font-medium">Tipo Doc</th>
                  <th className="px-4 py-2 font-medium">N&#176; Doc</th>
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium text-right">
                    Monto Original
                  </th>
                  <th className="px-4 py-2 font-medium text-right">Rebajas</th>
                  <th className="px-4 py-2 font-medium text-right">
                    Saldo Pendiente
                  </th>
                </tr>
              </thead>
              <tbody>
                {docsPendientes.map((d, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-1.5 text-xs font-medium">
                      {d.tipo_doc}
                    </td>
                    <td className="px-4 py-1.5 text-xs">{d.num_doc}</td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      {d.fecha_doc || "—"}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono">
                      {formatMonto(d.monto_original)}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono text-orange-600">
                      {d.rebajas > 0 ? formatMonto(d.rebajas) : "—"}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono font-medium">
                      {formatMonto(d.saldo)}
                    </td>
                  </tr>
                ))}

                {/* Totals */}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-medium">
                  <td colSpan={3} className="px-4 py-2">
                    Totales
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatMonto(
                      docsPendientes.reduce((s, d) => s + d.monto_original, 0)
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-orange-600">
                    {formatMonto(
                      docsPendientes.reduce((s, d) => s + d.rebajas, 0)
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-bold">
                    {formatMonto(
                      docsPendientes.reduce((s, d) => s + d.saldo, 0)
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state for pendientes */}
      {viewMode === "pendientes" &&
        docsPendientes.length === 0 &&
        !error &&
        !isPending &&
        auxiliarRut &&
        cuentaCodigo && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-500 text-sm">
            Sin documentos con saldo pendiente para esta cuenta y auxiliar
          </div>
        )}
    </div>
  );
}
