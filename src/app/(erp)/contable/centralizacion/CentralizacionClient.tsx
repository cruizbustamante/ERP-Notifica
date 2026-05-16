"use client";

import { useState, useTransition, useCallback } from "react";
import { formatMonto, MESES } from "@/lib/contabilidad/core";
import {
  getResumenCentralizacion,
  getDocumentosPendientes,
  centralizarDocumentos,
  anularCentralizacion,
  type DocPendiente,
} from "./actions";

type Periodo = { anio: number; estado: string };
type Cuenta = { codigo: string; nombre: string };
type MesData = { pendiente: number; centralizado: number; cantPend: number; cantCent: number; neto: number; iva: number };
type Historial = { id: number; tipo: string; periodo: string; fecha: string; comprobante_id: number; registros: number; total_debe: number; total_haber: number; estado: string; anio: number; mes: number };

export default function CentralizacionClient({
  periodos,
  cuentasVentas,
  cuentasGastos,
  currentYear,
}: {
  periodos: Periodo[];
  cuentasVentas: Cuenta[];
  cuentasGastos: Cuenta[];
  currentYear: number;
}) {
  const [anio, setAnio] = useState(currentYear);
  const [tab, setTab] = useState<"ventas" | "compras">("ventas");
  const [resumen, setResumen] = useState<{ ventas: Record<number, MesData>; compras: Record<number, MesData>; historial: Historial[] } | null>(null);
  const [docs, setDocs] = useState<DocPendiente[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [mesActivo, setMesActivo] = useState<number | null>(null);
  const [cuentaContra, setCuentaContra] = useState("");
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [vista, setVista] = useState<"resumen" | "detalle">("resumen");

  const cargarResumen = useCallback(() => {
    startTransition(async () => {
      const data = await getResumenCentralizacion(anio);
      setResumen(data);
      setVista("resumen");
      setDocs([]);
      setMesActivo(null);
    });
  }, [anio]);

  const cargarDocumentos = (mes: number) => {
    startTransition(async () => {
      setMesActivo(mes);
      const { docs: d, error } = await getDocumentosPendientes(tab, anio, mes);
      if (error) { setMensaje({ tipo: "error", texto: error }); return; }
      setDocs(d);
      setSelectedIds(new Set(d.map((x) => x.id)));
      setVista("detalle");
      setMensaje(null);
    });
  };

  const ejecutarCentralizacion = () => {
    if (!mesActivo || selectedIds.size === 0) return;
    const cuenta = cuentaContra || (tab === "ventas" ? cuentasVentas[0]?.codigo : cuentasGastos[0]?.codigo);
    if (!cuenta) { setMensaje({ tipo: "error", texto: "Seleccione cuenta de contrapartida" }); return; }

    startTransition(async () => {
      const result = await centralizarDocumentos(tab, anio, mesActivo, cuenta, [...selectedIds]);
      if (result.error) {
        setMensaje({ tipo: "error", texto: result.error });
      } else {
        const d = result.data!;
        setMensaje({ tipo: "ok", texto: `Centralización OK: Comprobante T-${d.comprobante?.numero ?? ""}, ${d.documentos} docs, Debe ${formatMonto(d.totalDebe)}` });
        cargarResumen();
      }
    });
  };

  const ejecutarAnulacion = (id: number) => {
    if (!confirm("¿Anular esta centralización? Se anulará el comprobante asociado.")) return;
    startTransition(async () => {
      const result = await anularCentralizacion(id);
      if (result.error) {
        setMensaje({ tipo: "error", texto: result.error });
      } else {
        setMensaje({ tipo: "ok", texto: "Centralización anulada" });
        cargarResumen();
      }
    });
  };

  const toggleDoc = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === docs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(docs.map((d) => d.id)));
  };

  const datosMes = resumen ? (tab === "ventas" ? resumen.ventas : resumen.compras) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Centralización</h1>
            <p className="text-gray-500 mt-1">Documentos tributarios SII → Comprobantes contables</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {periodos.map((p) => (
                <option key={p.anio} value={p.anio}>
                  {p.anio} {p.estado !== "ABIERTO" ? "(Cerrado)" : ""}
                </option>
              ))}
            </select>
            <button
              onClick={cargarResumen}
              disabled={isPending}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? "Cargando..." : "Consultar"}
            </button>
          </div>
        </div>
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div className={`p-4 rounded-lg text-sm ${mensaje.tipo === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {mensaje.texto}
          <button onClick={() => setMensaje(null)} className="float-right font-bold">×</button>
        </div>
      )}

      {resumen && (
        <>
          {/* Tabs */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex border-b">
              {(["ventas", "compras"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setVista("resumen"); setDocs([]); setMesActivo(null); }}
                  className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                >
                  {t === "ventas" ? "Ventas" : "Compras"}
                </button>
              ))}
            </div>

            {vista === "resumen" && datosMes && (
              <div className="p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 font-medium">Mes</th>
                      <th className="pb-2 font-medium text-right">Pendientes</th>
                      <th className="pb-2 font-medium text-right">Monto Pend.</th>
                      <th className="pb-2 font-medium text-right">Centralizados</th>
                      <th className="pb-2 font-medium text-right">Monto Cent.</th>
                      <th className="pb-2 font-medium text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                      const d = datosMes[m];
                      if (!d || (d.cantPend === 0 && d.cantCent === 0)) return null;
                      return (
                        <tr key={m} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2 font-medium">{MESES[m]}</td>
                          <td className="py-2 text-right">{d.cantPend}</td>
                          <td className="py-2 text-right font-mono">{formatMonto(d.pendiente)}</td>
                          <td className="py-2 text-right text-green-600">{d.cantCent}</td>
                          <td className="py-2 text-right text-green-600 font-mono">{formatMonto(d.centralizado)}</td>
                          <td className="py-2 text-center">
                            {d.cantPend > 0 && (
                              <button
                                onClick={() => cargarDocumentos(m)}
                                disabled={isPending}
                                className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                              >
                                Centralizar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Detalle documentos */}
            {vista === "detalle" && mesActivo && (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button onClick={() => { setVista("resumen"); setDocs([]); }} className="text-gray-500 hover:text-gray-700 text-sm">
                      ← Volver
                    </button>
                    <h3 className="font-semibold text-gray-900">
                      {tab === "ventas" ? "Ventas" : "Compras"} — {MESES[mesActivo]} {anio}
                    </h3>
                    <span className="text-sm text-gray-500">{docs.length} documentos</span>
                  </div>
                </div>

                {/* Cuenta contrapartida */}
                <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                    Cuenta {tab === "ventas" ? "Ventas" : "Gastos"}:
                  </label>
                  <select
                    value={cuentaContra}
                    onChange={(e) => setCuentaContra(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  >
                    {(tab === "ventas" ? cuentasVentas : cuentasGastos).map((c) => (
                      <option key={c.codigo} value={c.codigo}>
                        {c.codigo} — {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tabla documentos */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="pb-2 w-8">
                          <input type="checkbox" checked={selectedIds.size === docs.length && docs.length > 0} onChange={toggleAll} />
                        </th>
                        <th className="pb-2 font-medium">Tipo</th>
                        <th className="pb-2 font-medium">Folio</th>
                        <th className="pb-2 font-medium">RUT</th>
                        <th className="pb-2 font-medium">Razón Social</th>
                        <th className="pb-2 font-medium text-right">Neto</th>
                        <th className="pb-2 font-medium text-right">IVA</th>
                        <th className="pb-2 font-medium text-right">Total</th>
                        <th className="pb-2 font-medium">Ref</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map((d) => (
                        <tr key={d.id} className={`border-b last:border-0 hover:bg-gray-50 ${d.esNC ? "text-red-600" : d.esND ? "text-orange-600" : ""}`}>
                          <td className="py-1.5">
                            <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleDoc(d.id)} />
                          </td>
                          <td className="py-1.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${d.esNC ? "bg-red-100" : d.esND ? "bg-orange-100" : "bg-blue-100 text-blue-700"}`}>
                              {d.tipo_dte_nombre}
                            </span>
                          </td>
                          <td className="py-1.5 font-mono">{d.folio}</td>
                          <td className="py-1.5 font-mono text-xs">{d.rut}</td>
                          <td className="py-1.5 truncate max-w-[200px]">{d.razon_social}</td>
                          <td className="py-1.5 text-right font-mono">{formatMonto(d.monto_neto)}</td>
                          <td className="py-1.5 text-right font-mono">{formatMonto(d.monto_iva)}</td>
                          <td className="py-1.5 text-right font-mono font-medium">{formatMonto(d.monto_total)}</td>
                          <td className="py-1.5 text-xs text-gray-500">
                            {d.ref_tipo && d.ref_folio ? `${d.ref_tipo} ${d.ref_folio}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Resumen selección */}
                {docs.length > 0 && (
                  <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="text-sm">
                      <span className="font-medium">{selectedIds.size}</span> de {docs.length} documentos seleccionados
                      {" · "}
                      Total: <span className="font-mono font-medium">
                        {formatMonto(
                          docs.filter((d) => selectedIds.has(d.id)).reduce((sum, d) => sum + d.monto_total * (d.esNC ? -1 : 1), 0)
                        )}
                      </span>
                    </div>
                    <button
                      onClick={ejecutarCentralizacion}
                      disabled={isPending || selectedIds.size === 0}
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isPending ? "Procesando..." : "Centralizar seleccionados"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Historial */}
          {vista === "resumen" && resumen.historial.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Historial de centralizaciones</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 font-medium">Tipo</th>
                    <th className="pb-2 font-medium">Período</th>
                    <th className="pb-2 font-medium text-right">Docs</th>
                    <th className="pb-2 font-medium text-right">Debe</th>
                    <th className="pb-2 font-medium text-right">Haber</th>
                    <th className="pb-2 font-medium">Estado</th>
                    <th className="pb-2 font-medium text-center">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.historial.map((h) => (
                    <tr key={h.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2">{h.tipo}</td>
                      <td className="py-2">{h.mes ? `${MESES[h.mes]} ${h.anio}` : h.periodo}</td>
                      <td className="py-2 text-right">{h.registros}</td>
                      <td className="py-2 text-right font-mono">{formatMonto(h.total_debe || 0)}</td>
                      <td className="py-2 text-right font-mono">{formatMonto(h.total_haber || 0)}</td>
                      <td className="py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${h.estado === "ACTIVO" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {h.estado}
                        </span>
                      </td>
                      <td className="py-2 text-center">
                        {h.estado === "ACTIVO" && (
                          <button
                            onClick={() => ejecutarAnulacion(h.id)}
                            disabled={isPending}
                            className="text-red-600 hover:text-red-800 text-xs font-medium"
                          >
                            Anular
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Estado inicial */}
      {!resumen && !isPending && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center text-gray-500">
          Seleccione un año y presione <span className="font-medium text-gray-700">Consultar</span> para ver el resumen de centralización.
        </div>
      )}
    </div>
  );
}
