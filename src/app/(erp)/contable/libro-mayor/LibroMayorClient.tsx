"use client";

import { useState, useTransition } from "react";
import { formatMonto, MESES } from "@/lib/contabilidad/core";
import { getLibroMayor, getLibroMayorCompleto, type LibroMayorResult } from "./actions";
import * as XLSX from "xlsx";

type Periodo = { anio: number; estado: string };
type Cuenta = { codigo: string; nombre: string; tipo: string };

export default function LibroMayorClient({
  periodos, cuentas, currentYear,
}: {
  periodos: Periodo[];
  cuentas: Cuenta[];
  currentYear: number;
}) {
  const [anio, setAnio] = useState(currentYear);
  const [mesDesde, setMesDesde] = useState(1);
  const [mesHasta, setMesHasta] = useState(12);
  const [cuentaCodigo, setCuentaCodigo] = useState("");
  const [busqCuenta, setBusqCuenta] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [result, setResult] = useState<LibroMayorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const consultar = () => {
    if (!cuentaCodigo) { setError("Seleccione una cuenta"); return; }
    startTransition(async () => {
      const { data, error: err } = await getLibroMayor(cuentaCodigo, anio, mesDesde, mesHasta);
      setResult(data);
      setError(err);
    });
  };

  const descargarCompleto = () => {
    startTransition(async () => {
      const { data, error: err } = await getLibroMayorCompleto(anio, mesDesde, mesHasta);
      if (err || !data || data.length === 0) { setError(err || "Sin datos para exportar"); return; }

      const rows: Record<string, string | number>[] = [];
      for (const cuenta of data) {
        if (cuenta.saldo_anterior !== 0) {
          rows.push({ Cuenta: cuenta.cuenta_codigo, Nombre: cuenta.cuenta_nombre, Fecha: "", Comprobante: "", Auxiliar: "", Documento: "", Debe: "", Haber: "", Saldo: cuenta.saldo_anterior, Glosa: "SALDO ANTERIOR" });
        }
        for (const m of cuenta.movimientos) {
          rows.push({ Cuenta: cuenta.cuenta_codigo, Nombre: cuenta.cuenta_nombre, Fecha: m.fecha, Comprobante: m.comprobante, Auxiliar: m.auxiliar_rut, Documento: m.tipo_doc ? `${m.tipo_doc} ${m.num_doc}` : "", Debe: m.debe || "", Haber: m.haber || "", Saldo: m.saldo, Glosa: m.glosa });
        }
        rows.push({ Cuenta: cuenta.cuenta_codigo, Nombre: cuenta.cuenta_nombre, Fecha: "", Comprobante: "", Auxiliar: "", Documento: "TOTALES", Debe: cuenta.total_debe, Haber: cuenta.total_haber, Saldo: cuenta.saldo_final, Glosa: "" });
        rows.push({} as Record<string, string | number>);
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Libro Mayor");
      XLSX.writeFile(wb, `Libro_Mayor_${anio}_${String(mesDesde).padStart(2,"0")}-${String(mesHasta).padStart(2,"0")}.xlsx`);
    });
  };

  const filtradas = busqCuenta
    ? cuentas.filter((c) => c.codigo.includes(busqCuenta) || c.nombre.toLowerCase().includes(busqCuenta.toLowerCase()))
    : cuentas;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Libro Mayor</h1>
            <p className="text-gray-500 mt-1">Movimientos por cuenta contable</p>
          </div>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Año</label>
            <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {periodos.map((p) => <option key={p.anio} value={p.anio}>{p.anio}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Desde</label>
            <select value={mesDesde} onChange={(e) => setMesDesde(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hasta</label>
            <select value={mesHasta} onChange={(e) => setMesHasta(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[250px]">
            <label className="block text-xs text-gray-500 mb-1">Cuenta</label>
            <div className="relative">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={busqCuenta}
                  onChange={(e) => { setBusqCuenta(e.target.value); setCuentaCodigo(""); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Buscar por código o nombre..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                {cuentaCodigo && (
                  <button onClick={() => { setCuentaCodigo(""); setBusqCuenta(""); setShowDropdown(false); }} className="px-2 text-gray-400 hover:text-gray-600 flex-shrink-0" title="Limpiar">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
              {showDropdown && !cuentaCodigo && (
                <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-lg max-h-64 overflow-y-auto">
                  <div className="sticky top-0 bg-gray-50 px-3 py-1.5 text-xs text-gray-500 border-b">{filtradas.length} cuentas</div>
                  {filtradas.map((c) => (
                    <button
                      key={c.codigo}
                      onClick={() => { setCuentaCodigo(c.codigo); setBusqCuenta(`${c.codigo} — ${c.nombre}`); setShowDropdown(false); }}
                      className="block w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0"
                    >
                      <span className="font-mono text-blue-600">{c.codigo}</span> — {c.nombre}
                    </button>
                  ))}
                  {filtradas.length === 0 && <div className="px-3 py-3 text-sm text-gray-400 text-center">Sin resultados</div>}
                </div>
              )}
            </div>
          </div>
          <button onClick={consultar} disabled={isPending} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {isPending ? "Cargando..." : "Consultar"}
          </button>
          <button onClick={descargarCompleto} disabled={isPending} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50" title="Descarga Excel con todas las cuentas con movimiento">
            {isPending ? "..." : "Descargar todo"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-800 border border-red-200 text-sm">{error}</div>
      )}

      {result && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {/* Header cuenta */}
          <div className="p-4 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-lg font-bold">{result.cuenta_codigo}</span>
                <span className="ml-2 text-gray-600">{result.cuenta_nombre}</span>
                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-200">{result.cuenta_tipo === "A" ? "Activo" : result.cuenta_tipo === "P" ? "Pasivo" : result.cuenta_tipo === "I" ? "Ingreso" : result.cuenta_tipo === "G" ? "Gasto" : "Patrimonio"}</span>
              </div>
              <div className="text-right text-sm">
                <div>Saldo anterior: <span className="font-mono font-medium">{formatMonto(result.saldo_anterior)}</span></div>
                <div>Saldo final: <span className="font-mono font-bold text-lg">{formatMonto(result.saldo_final)}</span></div>
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium">Comp.</th>
                  <th className="px-4 py-2 font-medium">Auxiliar</th>
                  <th className="px-4 py-2 font-medium">Doc</th>
                  <th className="px-4 py-2 font-medium text-right">Debe</th>
                  <th className="px-4 py-2 font-medium text-right">Haber</th>
                  <th className="px-4 py-2 font-medium text-right">Saldo</th>
                  <th className="px-4 py-2 font-medium">Glosa</th>
                </tr>
              </thead>
              <tbody>
                {/* Saldo anterior */}
                {result.saldo_anterior !== 0 && (
                  <tr className="border-b bg-blue-50">
                    <td colSpan={4} className="px-4 py-2 font-medium text-blue-700">Saldo anterior</td>
                    <td className="px-4 py-2 text-right font-mono"></td>
                    <td className="px-4 py-2 text-right font-mono"></td>
                    <td className="px-4 py-2 text-right font-mono font-medium text-blue-700">{formatMonto(result.saldo_anterior)}</td>
                    <td className="px-4 py-2"></td>
                  </tr>
                )}

                {result.movimientos.map((m, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-1.5 whitespace-nowrap">{m.fecha}</td>
                    <td className="px-4 py-1.5 font-mono text-xs">{m.comprobante}</td>
                    <td className="px-4 py-1.5 font-mono text-xs">{m.auxiliar_rut}</td>
                    <td className="px-4 py-1.5 text-xs">{m.tipo_doc && `${m.tipo_doc} ${m.num_doc}`}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{m.debe > 0 ? formatMonto(m.debe) : ""}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{m.haber > 0 ? formatMonto(m.haber) : ""}</td>
                    <td className="px-4 py-1.5 text-right font-mono font-medium">{formatMonto(m.saldo)}</td>
                    <td className="px-4 py-1.5 truncate max-w-[250px] text-gray-600">{m.glosa}</td>
                  </tr>
                ))}

                {/* Totales */}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-medium">
                  <td colSpan={4} className="px-4 py-2">Totales</td>
                  <td className="px-4 py-2 text-right font-mono">{formatMonto(result.total_debe)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatMonto(result.total_haber)}</td>
                  <td className="px-4 py-2 text-right font-mono font-bold">{formatMonto(result.saldo_final)}</td>
                  <td className="px-4 py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {result.movimientos.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">Sin movimientos en el período seleccionado</div>
          )}
        </div>
      )}
    </div>
  );
}
