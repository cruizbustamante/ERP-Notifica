"use client";

import { useState, useTransition, useCallback } from "react";
import { formatRut } from "@/lib/rut";
import {
  cargarTransacciones,
  getTransacciones,
  marcarPagado,
  anularTransaccion,
  getRentabilidadPorPlataforma,
  type TransaccionInput,
  type RentabilidadPlataforma,
} from "./actions";

type Transaccion = {
  id: number;
  orden_id: string;
  fecha_transaccion: string;
  receptor_rut: string;
  receptor_nombre: string | null;
  monto_bruto: number;
  base_receptor: number;
  comision_nl_bruta: number;
  comision_nl_neta: number;
  iva_comision: number;
  costo_tbk: number;
  costo_plataforma: number;
  plataforma: string;
  estado: string;
  fecha_pago: string | null;
  referencia_pago: string | null;
  lote_carga: string | null;
};

type Receptor = { rut: string; nombre: string };

function formatMonto(n: number) {
  return new Intl.NumberFormat("es-CL").format(n);
}

export default function MarketplaceClient({
  transaccionesIniciales,
  receptores,
}: {
  transaccionesIniciales: Transaccion[];
  receptores: Receptor[];
}) {
  const [transacciones, setTransacciones] = useState(transaccionesIniciales);
  const [vista, setVista] = useState<"resumen" | "transacciones" | "carga">("resumen");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [filtroReceptor, setFiltroReceptor] = useState("");
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [showRentabilidad, setShowRentabilidad] = useState(false);
  const [rentabilidad, setRentabilidad] = useState<RentabilidadPlataforma[]>([]);
  const [loadingRent, setLoadingRent] = useState(false);

  const abrirRentabilidad = async () => {
    setLoadingRent(true);
    setShowRentabilidad(true);
    const res = await getRentabilidadPorPlataforma();
    if (!res.error) setRentabilidad(res.data);
    setLoadingRent(false);
  };

  // KPIs
  const pendientes = transacciones.filter((t) => t.estado === "PENDIENTE");
  const pagados = transacciones.filter((t) => t.estado === "PAGADO");
  const totalPendiente = pendientes.reduce((s, t) => s + Number(t.base_receptor), 0);
  const totalPagado = pagados.reduce((s, t) => s + Number(t.base_receptor), 0);
  const comisionTotal = transacciones
    .filter((t) => t.estado !== "ANULADO")
    .reduce((s, t) => s + Number(t.comision_nl_neta), 0);

  const filtradas = transacciones.filter((t) => {
    if (filtroEstado !== "TODOS" && t.estado !== filtroEstado) return false;
    if (filtroReceptor && t.receptor_rut !== filtroReceptor) return false;
    return true;
  });

  async function handleFiltrar() {
    startTransition(async () => {
      const result = await getTransacciones({
        estado: filtroEstado,
        receptor_rut: filtroReceptor || undefined,
      });
      if (!result.error) setTransacciones(result.data as Transaccion[]);
    });
  }

  function toggleSeleccion(id: number) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function seleccionarTodosPendientes() {
    const pendIds = filtradas.filter((t) => t.estado === "PENDIENTE").map((t) => t.id);
    setSeleccionados(new Set(pendIds));
  }

  // Resumen por receptor
  const resumenReceptores = (() => {
    const mapa: Record<string, { rut: string; nombre: string; pendiente: number; pagado: number; transacciones: number }> = {};
    for (const t of transacciones) {
      if (t.estado === "ANULADO") continue;
      if (!mapa[t.receptor_rut]) {
        mapa[t.receptor_rut] = { rut: t.receptor_rut, nombre: t.receptor_nombre || t.receptor_rut, pendiente: 0, pagado: 0, transacciones: 0 };
      }
      const r = mapa[t.receptor_rut];
      r.transacciones++;
      if (t.estado === "PENDIENTE") r.pendiente += Number(t.base_receptor);
      else r.pagado += Number(t.base_receptor);
    }
    return Object.values(mapa).sort((a, b) => b.pendiente - a.pendiente);
  })();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Marketplace</h1>
            <p className="text-sm text-gray-500 mt-0.5">Control de pagos a receptores</p>
          </div>
          <button
            onClick={abrirRentabilidad}
            className="w-full sm:w-auto px-3 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-sm flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            Rentabilidad por plataforma
          </button>
        </div>
        <div className="flex gap-2 mt-3 overflow-x-auto">
          {(["resumen", "transacciones", "carga"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                vista === v
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {v === "resumen" ? "Resumen" : v === "transacciones" ? "Transacciones" : "Cargar datos"}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Por pagar" value={`$${formatMonto(totalPendiente)}`} color="amber" sub={`${pendientes.length} trx`} />
        <KpiCard label="Pagado" value={`$${formatMonto(totalPagado)}`} color="green" sub={`${pagados.length} trx`} />
        <KpiCard label="Comisión NL neta" value={`$${formatMonto(comisionTotal)}`} color="indigo" sub="acumulado" />
        <KpiCard label="Receptores" value={String(resumenReceptores.length)} color="gray" sub="activos" />
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div className={`px-4 py-3 rounded-xl text-sm flex items-center justify-between ${
          mensaje.tipo === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          <span>{mensaje.texto}</span>
          <button onClick={() => setMensaje(null)} className="font-bold text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Vista: Resumen */}
      {vista === "resumen" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50/80 border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Resumen por receptor</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-500 border-b bg-gray-50/50 uppercase tracking-wider">
                  <th className="px-4 py-2.5 font-medium">Receptor</th>
                  <th className="px-4 py-2.5 font-medium">RUT</th>
                  <th className="px-4 py-2.5 font-medium text-center">Trx</th>
                  <th className="px-4 py-2.5 font-medium text-right">Pendiente</th>
                  <th className="px-4 py-2.5 font-medium text-right">Pagado</th>
                  <th className="px-4 py-2.5 font-medium text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {resumenReceptores.map((r) => (
                  <tr key={r.rut} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.nombre}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{formatRut(r.rut)}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{r.transacciones}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-amber-700">
                      {r.pendiente > 0 ? `$${formatMonto(r.pendiente)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">
                      ${formatMonto(r.pagado)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => { setFiltroReceptor(r.rut); setFiltroEstado("PENDIENTE"); setVista("transacciones"); }}
                        className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                      >
                        Ver pendientes
                      </button>
                    </td>
                  </tr>
                ))}
                {resumenReceptores.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin transacciones cargadas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vista: Transacciones */}
      {vista === "transacciones" && (
        <div className="space-y-3">
          {/* Filtros */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[11px] text-gray-500 uppercase font-medium">Estado</label>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="TODOS">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="PAGADO">Pagado</option>
                <option value="ANULADO">Anulado</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 uppercase font-medium">Receptor</label>
              <select
                value={filtroReceptor}
                onChange={(e) => setFiltroReceptor(e.target.value)}
                className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                {receptores.map((r) => (
                  <option key={r.rut} value={r.rut}>{r.nombre} ({formatRut(r.rut)})</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleFiltrar}
              disabled={isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              Filtrar
            </button>
            {seleccionados.size > 0 && (
              <button
                onClick={() => setShowPagoModal(true)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition ml-auto"
              >
                Marcar pagado ({seleccionados.size})
              </button>
            )}
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-gray-500 border-b bg-gray-50/50 uppercase tracking-wider">
                    <th className="px-3 py-2.5 font-medium w-8">
                      <input
                        type="checkbox"
                        onChange={(e) => e.target.checked ? seleccionarTodosPendientes() : setSeleccionados(new Set())}
                        checked={seleccionados.size > 0}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-2.5 font-medium">Fecha</th>
                    <th className="px-3 py-2.5 font-medium">Orden</th>
                    <th className="px-3 py-2.5 font-medium">Receptor</th>
                    <th className="px-3 py-2.5 font-medium text-right">Monto bruto</th>
                    <th className="px-3 py-2.5 font-medium text-right">Base receptor</th>
                    <th className="px-3 py-2.5 font-medium text-right">Comisión NL</th>
                    <th className="px-3 py-2.5 font-medium text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((t) => (
                    <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <td className="px-3 py-2.5">
                        {t.estado === "PENDIENTE" && (
                          <input
                            type="checkbox"
                            checked={seleccionados.has(t.id)}
                            onChange={() => toggleSeleccion(t.id)}
                            className="rounded"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">
                        {new Date(t.fecha_transaccion + "T12:00:00").toLocaleDateString("es-CL")}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-indigo-700">{t.orden_id}</td>
                      <td className="px-3 py-2.5">
                        <div className="text-gray-900 text-xs font-medium">{t.receptor_nombre}</div>
                        <div className="text-gray-400 font-mono text-[11px]">{formatRut(t.receptor_rut)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">${formatMonto(Number(t.monto_bruto))}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-medium text-amber-700">
                        ${formatMonto(Number(t.base_receptor))}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-indigo-600">
                        ${formatMonto(Number(t.comision_nl_neta))}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          t.estado === "PENDIENTE" ? "bg-amber-100 text-amber-700" :
                          t.estado === "PAGADO" ? "bg-green-100 text-green-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {t.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filtradas.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin transacciones</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Vista: Carga */}
      {vista === "carga" && <CargaPanel onSuccess={(msg) => { setMensaje({ tipo: "ok", texto: msg }); setVista("transacciones"); }} onError={(msg) => setMensaje({ tipo: "error", texto: msg })} />}

      {/* Modal rentabilidad */}
      {showRentabilidad && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white z-10 p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900">Rentabilidad por plataforma</h3>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Comision NL vs costo plataforma</p>
              </div>
              <button onClick={() => setShowRentabilidad(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {loadingRent ? (
              <div className="p-12 text-center">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
                <p className="text-sm text-gray-500 mt-3">Calculando...</p>
              </div>
            ) : rentabilidad.length === 0 ? (
              <div className="p-12 text-center text-gray-400">Sin datos de transacciones</div>
            ) : (
              <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                {/* Resumen consolidado */}
                {(() => {
                  const total = rentabilidad.reduce((acc, r) => ({
                    monto_bruto: acc.monto_bruto + r.monto_bruto,
                    comision_nl_neta: acc.comision_nl_neta + r.comision_nl_neta,
                    costo_plataforma: acc.costo_plataforma + r.costo_plataforma,
                    rentabilidad_neta: acc.rentabilidad_neta + r.rentabilidad_neta,
                    transacciones: acc.transacciones + r.transacciones,
                  }), { monto_bruto: 0, comision_nl_neta: 0, costo_plataforma: 0, rentabilidad_neta: 0, transacciones: 0 });

                  return (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                      <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
                        <p className="text-[10px] sm:text-[11px] text-gray-500 uppercase font-medium">Total transado</p>
                        <p className="text-base sm:text-xl font-bold text-gray-900 mt-1">${formatMonto(total.monto_bruto)}</p>
                        <p className="text-[11px] text-gray-400">{total.transacciones} trx</p>
                      </div>
                      <div className="bg-indigo-50 rounded-xl p-3 sm:p-4">
                        <p className="text-[10px] sm:text-[11px] text-indigo-600 uppercase font-medium">Comision NL</p>
                        <p className="text-base sm:text-xl font-bold text-indigo-700 mt-1">${formatMonto(total.comision_nl_neta)}</p>
                      </div>
                      <div className="bg-red-50 rounded-xl p-3 sm:p-4">
                        <p className="text-[10px] sm:text-[11px] text-red-600 uppercase font-medium">Costo plataf.</p>
                        <p className="text-base sm:text-xl font-bold text-red-700 mt-1">${formatMonto(total.costo_plataforma)}</p>
                      </div>
                      <div className={`rounded-xl p-3 sm:p-4 ${total.rentabilidad_neta >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                        <p className={`text-[10px] sm:text-[11px] uppercase font-medium ${total.rentabilidad_neta >= 0 ? "text-green-600" : "text-red-600"}`}>Rent. neta</p>
                        <p className={`text-base sm:text-xl font-bold mt-1 ${total.rentabilidad_neta >= 0 ? "text-green-700" : "text-red-700"}`}>${formatMonto(total.rentabilidad_neta)}</p>
                        <p className="text-[11px] text-gray-400">{total.monto_bruto > 0 ? ((total.rentabilidad_neta / total.monto_bruto) * 100).toFixed(2) : 0}%</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Detalle por plataforma */}
                {rentabilidad.map((r) => {
                  const platLabel: Record<string, string> = { TBK: "Transbank", MP: "Mercado Pago" };
                  const platColor: Record<string, { bg: string; border: string; header: string }> = {
                    TBK: { bg: "bg-orange-50", border: "border-orange-200", header: "bg-orange-100" },
                    MP: { bg: "bg-sky-50", border: "border-sky-200", header: "bg-sky-100" },
                  };
                  const c = platColor[r.plataforma] || platColor.TBK;

                  return (
                    <div key={r.plataforma} className={`rounded-xl border ${c.border} overflow-hidden`}>
                      <div className={`${c.header} px-4 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between`}>
                        <h4 className="font-semibold text-gray-900 text-sm sm:text-base">{platLabel[r.plataforma] || r.plataforma}</h4>
                        <span className="text-[11px] sm:text-xs text-gray-500">{r.transacciones} trx</span>
                      </div>
                      <div className={`${c.bg} p-3 sm:p-5`}>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-y-4 sm:gap-x-6 text-sm">
                          <div>
                            <p className="text-[11px] text-gray-500">Monto bruto</p>
                            <p className="font-mono font-bold text-gray-900 text-sm">${formatMonto(r.monto_bruto)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-500">Comision NL bruta</p>
                            <p className="font-mono font-bold text-indigo-700 text-sm">${formatMonto(r.comision_nl_bruta)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-500">IVA comision</p>
                            <p className="font-mono text-gray-600 text-sm">${formatMonto(r.iva_comision)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-500">Comision NL neta</p>
                            <p className="font-mono font-bold text-indigo-700 text-sm">${formatMonto(r.comision_nl_neta)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-500">Costo {platLabel[r.plataforma] || r.plataforma}</p>
                            <p className="font-mono font-bold text-red-600 text-sm">-${formatMonto(r.costo_plataforma)}</p>
                          </div>
                          <div className={`p-2 rounded-lg ${r.rentabilidad_neta >= 0 ? "bg-green-100" : "bg-red-100"}`}>
                            <p className="text-[11px] text-gray-500">Rentabilidad neta</p>
                            <p className={`font-mono font-bold text-base sm:text-lg ${r.rentabilidad_neta >= 0 ? "text-green-700" : "text-red-700"}`}>
                              ${formatMonto(r.rentabilidad_neta)}
                            </p>
                            <p className="text-[11px] text-gray-500">Margen: {r.margen_pct.toFixed(2)}%</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal pago */}
      {showPagoModal && (
        <PagoModal
          cantidad={seleccionados.size}
          onConfirm={async (ref, fecha) => {
            startTransition(async () => {
              const result = await marcarPagado(Array.from(seleccionados), ref, fecha);
              if (result.error) {
                setMensaje({ tipo: "error", texto: result.error });
              } else {
                setMensaje({ tipo: "ok", texto: `${seleccionados.size} transacciones marcadas como pagadas` });
                setSeleccionados(new Set());
                const fresh = await getTransacciones({ estado: filtroEstado, receptor_rut: filtroReceptor || undefined });
                if (!fresh.error) setTransacciones(fresh.data as Transaccion[]);
              }
              setShowPagoModal(false);
            });
          }}
          onClose={() => setShowPagoModal(false)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  const colors: Record<string, string> = {
    amber: "bg-amber-50 border-amber-100",
    green: "bg-green-50 border-green-100",
    indigo: "bg-indigo-50 border-indigo-100",
    gray: "bg-gray-50 border-gray-100",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.gray}`}>
      <div className="text-[11px] text-gray-500 uppercase font-medium">{label}</div>
      <div className="text-xl font-bold text-gray-900 mt-1">{value}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>
    </div>
  );
}

function PagoModal({ cantidad, onConfirm, onClose }: {
  cantidad: number;
  onConfirm: (ref: string, fecha: string) => void;
  onClose: () => void;
}) {
  const [ref, setRef] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-900">Registrar pago</h3>
        <p className="text-sm text-gray-500">{cantidad} transacciones seleccionadas</p>
        <div>
          <label className="text-xs text-gray-500 font-medium">Fecha de pago</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 font-medium">Referencia (N° transferencia)</label>
          <input type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ej: TEF-001234"
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={() => onConfirm(ref, fecha)} disabled={!ref}
            className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50">
            Confirmar pago
          </button>
        </div>
      </div>
    </div>
  );
}

function CargaPanel({ onSuccess, onError }: { onSuccess: (msg: string) => void; onError: (msg: string) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<TransaccionInput[]>([]);
  const [cargando, setCargando] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setArchivo(file);
    try {
      const text = await file.text();
      const lines = text.trim().split("\n");
      const header = lines[0].toLowerCase();
      const sep = header.includes("\t") ? "\t" : header.includes(";") ? ";" : ",";
      const cols = lines[0].split(sep).map((c) => c.trim().toLowerCase().replace(/['"]/g, ""));

      const idxOrden = cols.findIndex((c) => c.includes("orden") || c.includes("order") || c.includes("id"));
      const idxFecha = cols.findIndex((c) => c.includes("fecha") || c.includes("date"));
      const idxRut = cols.findIndex((c) => c.includes("rut"));
      const idxNombre = cols.findIndex((c) => c.includes("nombre") || c.includes("receptor") || c.includes("comercio"));
      const idxMonto = cols.findIndex((c) => c.includes("monto") || c.includes("amount") || c.includes("total"));

      if (idxOrden < 0 || idxFecha < 0 || idxMonto < 0) {
        onError("Archivo inválido: se requieren columnas orden/id, fecha y monto");
        return;
      }

      const rows: TransaccionInput[] = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(sep).map((v) => v.trim().replace(/['"]/g, ""));
        if (!vals[idxOrden]) continue;

        const montoStr = vals[idxMonto].replace(/[$.]/g, "").replace(",", ".");
        const monto = Math.round(Number(montoStr));
        if (!monto || monto < 1000) continue;

        let fecha = vals[idxFecha];
        if (fecha.includes("/")) {
          const parts = fecha.split("/");
          fecha = parts.length === 3 ? `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}` : fecha;
        }

        rows.push({
          orden_id: vals[idxOrden],
          fecha_transaccion: fecha,
          receptor_rut: idxRut >= 0 ? vals[idxRut].replace(/\./g, "") : "",
          receptor_nombre: idxNombre >= 0 ? vals[idxNombre] : "",
          monto_bruto: monto,
        });
      }

      setPreview(rows);
    } catch {
      onError("Error al procesar el archivo");
    }
  }, [onError]);

  async function handleCargar() {
    if (preview.length === 0) return;
    setCargando(true);
    const result = await cargarTransacciones(preview);
    setCargando(false);
    if (result.error) {
      onError(result.error);
    } else {
      onSuccess(`${result.insertados} transacciones cargadas (lote: ${result.lote})`);
      setPreview([]);
      setArchivo(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
      <h3 className="text-base font-bold text-gray-900">Cargar transacciones</h3>
      <p className="text-sm text-gray-500">
        Sube un archivo CSV/TXT con las transacciones del marketplace. El sistema detectará las columnas automáticamente.
      </p>
      <p className="text-xs text-gray-400">
        Columnas esperadas: orden/id, fecha, monto. Opcionales: rut, nombre/receptor.
      </p>

      {/* Drop zone */}
      <div
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-indigo-300 transition cursor-pointer"
        onClick={() => document.getElementById("mkt-file-input")?.click()}
      >
        <input id="mkt-file-input" type="file" accept=".csv,.txt,.tsv" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        <svg className="w-10 h-10 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="mt-2 text-sm text-gray-500">
          {archivo ? archivo.name : "Arrastra un archivo o haz clic para seleccionar"}
        </p>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">{preview.length} transacciones detectadas</span>
            <button
              onClick={handleCargar}
              disabled={cargando}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50"
            >
              {cargando ? "Cargando..." : "Confirmar carga"}
            </button>
          </div>
          <div className="overflow-x-auto max-h-64 border rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2">Orden</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Receptor</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2 text-right">Base receptor</th>
                  <th className="px-3 py-2 text-right">Comisión NL</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 20).map((t, i) => {
                  const base = Math.round(t.monto_bruto / 1.15);
                  const comision = t.monto_bruto - base;
                  return (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-mono">{t.orden_id}</td>
                      <td className="px-3 py-1.5">{t.fecha_transaccion}</td>
                      <td className="px-3 py-1.5">{t.receptor_nombre || t.receptor_rut}</td>
                      <td className="px-3 py-1.5 text-right font-mono">${formatMonto(t.monto_bruto)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-amber-700">${formatMonto(base)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-indigo-600">${formatMonto(comision)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {preview.length > 20 && (
              <div className="px-3 py-2 text-center text-gray-400 text-xs bg-gray-50">
                ... y {preview.length - 20} más
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
