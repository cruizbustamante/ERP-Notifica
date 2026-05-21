"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { formatRut } from "@/lib/rut";
import { MESES } from "@/lib/contabilidad/core";
import YearSelector from "@/components/YearSelector";
import {
  cargarTransacciones,
  cargarDetalleTBK,
  getTransacciones,
  marcarPagado,
  anularTransaccion,
  editarTransaccion,
  marcarBoletaEmitida,
  type TransaccionInput,
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
  boleta_emitida?: boolean;
  boleta_folio?: string;
  boleta_fecha?: string;
  comprador_rut: string | null;
  comprador_nombre: string | null;
  abogado_rut: string | null;
  abogado_nombre: string | null;
  estudio_rut: string | null;
  estudio_nombre: string | null;
  giro_billing: string | null;
  direccion_billing: string | null;
  comuna_billing: string | null;
  email_billing: string | null;
};

type Receptor = { rut: string; nombre: string };
type Auxiliar = { rut: string; nombre: string; email: string };

type KPIs = {
  totalVentas: number;
  totalComBruta: number;
  totalComNeta: number;
  totalIva: number;
  totalCosto: number;
  totalBase: number;
  totalMargen: number;
  totalTx: number;
  boletasPend: number;
  ticketPromedio: number;
  margenPct: number;
  costoPct: number;
  margenPorTx: number;
  porMes: { mes: number; ventas: number; margen: number; tx: number }[];
};

function fmt(n: number) {
  return new Intl.NumberFormat("es-CL").format(Math.round(n));
}

const TABS = ["Transacciones", "Receptores", "Boletas", "Carga"] as const;
type Tab = (typeof TABS)[number];

export default function MarketplaceClient({
  transaccionesIniciales,
  receptores,
  auxiliares,
  kpis,
  anio,
  periodos,
}: {
  transaccionesIniciales: Transaccion[];
  receptores: Receptor[];
  auxiliares: Auxiliar[];
  kpis: KPIs;
  anio: number;
  periodos: { anio: number; estado: string }[];
}) {
  const [transacciones, setTransacciones] = useState(transaccionesIniciales);
  const [vista, setVista] = useState<Tab>("Transacciones");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [filtroReceptor, setFiltroReceptor] = useState("");
  const [filtroPlataforma, setFiltroPlataforma] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [receptorBloqueado, setReceptorBloqueado] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [detalleTx, setDetalleTx] = useState<Transaccion | null>(null);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    setTransacciones(transaccionesIniciales);
    setSeleccionados(new Set());
    setReceptorBloqueado(null);
  }, [anio, transaccionesIniciales]);

  const pendientes = transacciones.filter((t) => t.estado === "PENDIENTE");
  const pagados = transacciones.filter((t) => t.estado === "PAGADO");
  const totalPendiente = pendientes.reduce((s, t) => s + Number(t.base_receptor), 0);
  const totalPagado = pagados.reduce((s, t) => s + Number(t.base_receptor), 0);

  const filtradas = transacciones.filter((t) => {
    if (filtroEstado !== "TODOS" && t.estado !== filtroEstado) return false;
    if (filtroReceptor && t.receptor_rut !== filtroReceptor) return false;
    if (filtroPlataforma && t.plataforma !== filtroPlataforma) return false;
    if (filtroDesde && t.fecha_transaccion < filtroDesde) return false;
    if (filtroHasta && t.fecha_transaccion > filtroHasta) return false;
    return true;
  });

  async function refrescarTransacciones() {
    const fresh = await getTransacciones({});
    if (!fresh.error) setTransacciones(fresh.data as Transaccion[]);
  }

  function toggleSeleccion(id: number) {
    const tx = transacciones.find((t) => t.id === id);
    if (!tx || tx.estado !== "PENDIENTE") return;

    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0) setReceptorBloqueado(null);
      } else {
        if (!receptorBloqueado) setReceptorBloqueado(tx.receptor_rut);
        else if (receptorBloqueado !== tx.receptor_rut) return prev;
        next.add(id);
      }
      return next;
    });
  }

  function limpiarSeleccion() {
    setSeleccionados(new Set());
    setReceptorBloqueado(null);
  }

  function seleccionarTodosMismoReceptor() {
    if (!receptorBloqueado) return;
    const ids = filtradas.filter((t) => t.estado === "PENDIENTE" && t.receptor_rut === receptorBloqueado).map((t) => t.id);
    setSeleccionados(new Set(ids));
  }

  const seleccionInfo = (() => {
    if (seleccionados.size === 0) return null;
    const txs = Array.from(seleccionados).map((id) => transacciones.find((t) => t.id === id)!).filter(Boolean);
    const total = txs.reduce((s, t) => s + Number(t.base_receptor), 0);
    const nombre = txs[0]?.receptor_nombre || "";
    const rut = txs[0]?.receptor_rut || "";
    return { total, nombre, rut, count: txs.length };
  })();

  const resumenReceptores = (() => {
    const mapa: Record<string, {
      rut: string; nombre: string; pendiente: number; pagado: number;
      transacciones: number; bruto: number; comisionNeta: number; costoPlat: number; margen: number;
      ultimaFecha: string | null;
    }> = {};
    for (const t of transacciones) {
      if (t.estado === "ANULADO") continue;
      if (!mapa[t.receptor_rut]) {
        mapa[t.receptor_rut] = {
          rut: t.receptor_rut, nombre: t.receptor_nombre || t.receptor_rut,
          pendiente: 0, pagado: 0, transacciones: 0, bruto: 0,
          comisionNeta: 0, costoPlat: 0, margen: 0, ultimaFecha: null,
        };
      }
      const r = mapa[t.receptor_rut];
      r.transacciones++;
      r.bruto += Number(t.monto_bruto);
      r.comisionNeta += Number(t.comision_nl_neta);
      r.costoPlat += Number(t.costo_plataforma) || Number(t.costo_tbk);
      r.margen += Number(t.comision_nl_neta) - (Number(t.costo_plataforma) || Number(t.costo_tbk));
      if (t.estado === "PENDIENTE") r.pendiente += Number(t.base_receptor);
      else r.pagado += Number(t.base_receptor);
      if (!r.ultimaFecha || t.fecha_transaccion > r.ultimaFecha) r.ultimaFecha = t.fecha_transaccion;
    }
    return Object.values(mapa).sort((a, b) => b.bruto - a.bruto);
  })();

  const pctPendiente = kpis.totalTx > 0 ? Math.round((pendientes.length / (pendientes.length + pagados.length)) * 100) : 0;
  const pctPagado = 100 - pctPendiente;

  const limpiarFiltros = () => {
    setFiltroEstado("TODOS"); setFiltroReceptor(""); setFiltroPlataforma(""); setFiltroDesde(""); setFiltroHasta("");
  };
  const hayFiltros = filtroEstado !== "TODOS" || filtroReceptor || filtroPlataforma || filtroDesde || filtroHasta;

  return (
    <div className="space-y-5">
      {/* ═══ HERO HEADER ═══ */}
      <div className="relative rounded-2xl overflow-hidden shadow-md" style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)" }}>
        <div className="absolute right-[-80px] top-[-80px] w-80 h-80 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)" }} />
        <div className="absolute left-[40%] bottom-[-120px] w-72 h-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.20) 0%, transparent 70%)" }} />
        <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-[32px] font-bold text-white tracking-tight">Marketplace</h1>
            <p className="text-sm text-white/60 mt-1">Gestión de pagos a receptores · Comisiones · Boletas</p>
          </div>
          <YearSelector anio={anio} periodos={periodos} />
        </div>
      </div>

      {/* ═══ TABS ═══ */}
      <div className="flex gap-1 bg-white rounded-xl p-1.5 shadow-sm border border-gray-200 w-fit overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => { setVista(t); if (t !== "Transacciones") limpiarSeleccion(); }}
            className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              vista === t ? "text-white font-semibold shadow-sm" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            }`}
            style={vista === t ? { background: "#1e1b4b" } : undefined}
          >{t}</button>
        ))}
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div className={`px-4 py-3 rounded-xl text-sm flex items-center justify-between ${mensaje.tipo === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          <span>{mensaje.texto}</span>
          <button onClick={() => setMensaje(null)} className="font-bold text-lg leading-none ml-4">&times;</button>
        </div>
      )}

      {/* ═══ TAB: TRANSACCIONES ═══ */}
      {vista === "Transacciones" && (
        <div className="space-y-4 animate-fadeIn">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Total recaudado" value={`$${fmt(kpis.totalVentas)}`} sub={`${kpis.totalTx} transacciones · ${anio}`} accent="primary" />
            <KpiCard label="Por pagar a receptores" value={`$${fmt(totalPendiente)}`} sub={`${pendientes.length} tx pendientes`} accent="amber" />
            <KpiCard label="Ya pagado" value={`$${fmt(totalPagado)}`} sub={`${pagados.length} tx liquidadas`} accent="success" />
            <KpiCard label="Margen neto NL" value={`$${fmt(kpis.totalMargen)}`} sub="Comisión neta − costo TBK/MP" accent="primary" />
            <KpiCard label="Boletas pendientes" value={String(kpis.boletasPend)} sub={`Total $${fmt(kpis.totalComBruta)}`} accent="danger" />
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: "#1e1b8a" }} />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Estado de pago</p>
              <div className="flex items-center gap-3">
                <svg width="52" height="52" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3.5" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#10b981" strokeWidth="3.5"
                    strokeDasharray={`${pctPagado} ${100 - pctPagado}`} strokeDashoffset="0" transform="rotate(-90 18 18)" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f59e0b" strokeWidth="3.5"
                    strokeDasharray={`${pctPendiente} ${100 - pctPendiente}`} strokeDashoffset={`${-pctPagado}`} transform="rotate(-90 18 18)" />
                  <text x="18" y="21" textAnchor="middle" fontSize="9" fontWeight="700" fill="#1e1b4b">{pctPendiente}%</text>
                </svg>
                <div className="flex flex-col gap-1 text-[11px] text-gray-500 font-medium">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Pend.</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Pag.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
              <FilterField label="Receptor">
                <select value={filtroReceptor} onChange={(e) => setFiltroReceptor(e.target.value)} className="field-ctrl">
                  <option value="">Todos los receptores</option>
                  {receptores.map((r) => <option key={r.rut} value={r.rut}>{r.nombre}</option>)}
                </select>
              </FilterField>
              <FilterField label="Estado">
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="field-ctrl">
                  <option value="TODOS">Todos</option>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="PAGADO">Pagado</option>
                  <option value="ANULADO">Anulado</option>
                </select>
              </FilterField>
              <FilterField label="Plataforma">
                <select value={filtroPlataforma} onChange={(e) => setFiltroPlataforma(e.target.value)} className="field-ctrl">
                  <option value="">Todas</option>
                  <option value="TBK">Transbank</option>
                  <option value="MP">Mercado Pago</option>
                </select>
              </FilterField>
              <FilterField label="Desde">
                <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} className="field-ctrl" />
              </FilterField>
              <FilterField label="Hasta">
                <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} className="field-ctrl" />
              </FilterField>
              {hayFiltros && (
                <button onClick={limpiarFiltros} className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Tabla */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between px-4 sm:px-5 py-3 border-b gap-2">
              <span className="text-sm font-semibold text-gray-900">Listado de transacciones</span>
              <div className="flex flex-wrap gap-2">
                <Pill className="bg-gray-100 text-gray-600">{filtradas.length} transacciones</Pill>
                <Pill className="bg-indigo-50 text-indigo-700">${fmt(filtradas.reduce((s, t) => s + (t.estado !== "ANULADO" ? Number(t.monto_bruto) : 0), 0))} bruto</Pill>
                <Pill className="bg-amber-50 text-amber-700">${fmt(filtradas.filter((t) => t.estado === "PENDIENTE").reduce((s, t) => s + Number(t.base_receptor), 0))} pendiente</Pill>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] text-gray-500 border-b bg-gray-50/80 uppercase tracking-wider">
                    <th className="px-3 py-3 w-10"></th>
                    <th className="px-3 py-3 text-left font-semibold">Fecha</th>
                    <th className="px-3 py-3 text-left font-semibold hidden sm:table-cell">Orden</th>
                    <th className="px-3 py-3 text-left font-semibold">Receptor</th>
                    <th className="px-3 py-3 text-left font-semibold hidden lg:table-cell">Estudio / Abogado</th>
                    <th className="px-3 py-3 text-right font-semibold">Bruto</th>
                    <th className="px-3 py-3 text-right font-semibold hidden sm:table-cell">Base</th>
                    <th className="px-3 py-3 text-right font-semibold hidden md:table-cell">Comisión</th>
                    <th className="px-3 py-3 text-center font-semibold hidden sm:table-cell">Plat.</th>
                    <th className="px-3 py-3 text-center font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((t) => {
                    const isCheckable = t.estado === "PENDIENTE" && (!receptorBloqueado || receptorBloqueado === t.receptor_rut);
                    const isSelected = seleccionados.has(t.id);
                    return (
                      <tr key={t.id}
                        className={`border-b border-gray-100 transition cursor-pointer ${isSelected ? "bg-indigo-50/60" : "hover:bg-gray-50/60"}`}
                        onClick={() => { setDetalleTx(t); setEditMode(false); }}
                      >
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          {t.estado === "PENDIENTE" && (
                            <input type="checkbox" checked={isSelected} disabled={!isCheckable}
                              onChange={() => toggleSeleccion(t.id)}
                              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-30" />
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">{new Date(t.fecha_transaccion + "T12:00:00").toLocaleDateString("es-CL")}</td>
                        <td className="px-3 py-3 hidden sm:table-cell">
                          <span className="font-mono text-xs font-semibold" style={{ color: "#1e1b8a" }}>{t.orden_id}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-[13px] text-gray-900 leading-tight">{t.receptor_nombre}</div>
                          <div className="font-mono text-[11px] text-gray-400">{formatRut(t.receptor_rut)}</div>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          {t.estudio_nombre ? (
                            <>
                              <div className="text-[12px] font-medium text-gray-700 leading-tight">{t.estudio_nombre}</div>
                              {t.abogado_nombre && <div className="text-[11px] text-gray-400">{t.abogado_nombre}</div>}
                            </>
                          ) : t.abogado_nombre ? (
                            <div className="text-[12px] text-gray-500">{t.abogado_nombre}</div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs font-semibold tabular-nums">${fmt(Number(t.monto_bruto))}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs tabular-nums hidden sm:table-cell">${fmt(Number(t.base_receptor))}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-indigo-600 hidden md:table-cell">${fmt(Number(t.comision_nl_bruta))}</td>
                        <td className="px-3 py-3 text-center hidden sm:table-cell">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                            t.plataforma === "TBK" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                          }`}>{t.plataforma}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <StatusBadge estado={t.estado} />
                        </td>
                      </tr>
                    );
                  })}
                  {filtradas.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400 text-sm">No hay transacciones con esos filtros</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resumen por receptor (mini cards) */}
          {resumenReceptores.length > 0 && (
            <>
              <p className="text-sm font-semibold text-gray-900">Resumen por Receptor</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {resumenReceptores.slice(0, 8).map((r) => {
                  const hayDeuda = r.pendiente > 0;
                  return (
                    <div key={r.rut} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all">
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div>
                          <p className="text-[13px] font-semibold text-gray-900 leading-tight">{r.nombre}</p>
                          <p className="font-mono text-[11px] text-gray-400 mt-0.5">{formatRut(r.rut)}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase whitespace-nowrap ${
                          hayDeuda ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                        }`}>{hayDeuda ? "Pendiente" : "Al día"}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-medium">Trx</p>
                          <p className="text-sm font-bold tabular-nums">{r.transacciones}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-medium">Por pagar</p>
                          <p className={`text-sm font-bold tabular-nums ${r.pendiente > 0 ? "text-amber-700" : "text-gray-400"}`}>
                            {r.pendiente > 0 ? `$${fmt(r.pendiente)}` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-medium">Pagado</p>
                          <p className="text-sm font-bold tabular-nums text-emerald-600">${fmt(r.pagado)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-medium">Bruto</p>
                          <p className="text-sm font-bold tabular-nums">${fmt(r.bruto)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Spacer para sticky bar */}
          {seleccionados.size > 0 && <div className="h-24" />}
        </div>
      )}

      {/* ═══ STICKY PAYMENT BAR ═══ */}
      {seleccionInfo && vista === "Transacciones" && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6 pointer-events-none">
          <div className="pointer-events-auto bg-white border border-gray-200 rounded-2xl shadow-[0_-8px_32px_rgba(16,24,40,0.10)] px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 max-w-6xl mx-auto">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div>
                <p className="text-[11px] text-gray-500 uppercase font-medium tracking-wider">Receptor</p>
                <p className="text-sm font-semibold text-gray-900">{seleccionInfo.nombre}
                  <span className="font-mono text-xs text-gray-400 ml-2">{formatRut(seleccionInfo.rut)}</span>
                </p>
              </div>
              <div className="pl-4 sm:pl-6 border-l border-gray-200">
                <p className="text-[11px] text-gray-500 uppercase font-medium tracking-wider">Transacciones</p>
                <p className="text-lg font-bold tabular-nums">{seleccionInfo.count}</p>
              </div>
              <div className="pl-4 sm:pl-6 border-l border-gray-200">
                <p className="text-[11px] text-gray-500 uppercase font-medium tracking-wider">Total a transferir</p>
                <p className="text-xl font-bold tabular-nums text-emerald-600">${fmt(seleccionInfo.total)}</p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {receptorBloqueado && (
                <button onClick={seleccionarTodosMismoReceptor}
                  className="text-xs text-indigo-600 font-medium hover:underline whitespace-nowrap">
                  Seleccionar todas
                </button>
              )}
              <button onClick={limpiarSeleccion}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={() => setShowPagoModal(true)}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition flex items-center gap-2 whitespace-nowrap"
                style={{ background: "#1e1b8a" }}>
                Registrar pago
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: RECEPTORES ═══ */}
      {vista === "Receptores" && (
        <div className="space-y-4 animate-fadeIn">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Receptores activos" value={String(resumenReceptores.length)} sub={`de ${receptores.length} registrados`} accent="primary" />
            <KpiCard label="Total diligencias" value={String(kpis.totalTx)} sub={`Completadas en ${anio}`} accent="default" />
            <KpiCard label="Ticket promedio" value={`$${fmt(kpis.ticketPromedio)}`} sub="Por diligencia" accent="default" />
            <KpiCard label="Receptor más activo"
              value={resumenReceptores[0]?.nombre || "—"}
              sub={resumenReceptores[0] ? `${resumenReceptores[0].transacciones} diligencias · $${fmt(resumenReceptores[0].bruto)}` : ""}
              accent="success" smallValue />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Ranking bars */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm lg:col-span-1">
              <p className="text-sm font-semibold text-gray-900 mb-1">Ranking por volumen</p>
              <p className="text-xs text-gray-500 mb-4">Monto total generado · {anio}</p>
              <div className="space-y-2.5">
                {resumenReceptores.slice(0, 8).map((r) => {
                  const maxBruto = resumenReceptores[0]?.bruto || 1;
                  const pct = (r.bruto / maxBruto) * 100;
                  return (
                    <div key={r.rut} className="grid items-center gap-3" style={{ gridTemplateColumns: "120px 1fr 60px" }}>
                      <span className="text-[11.5px] font-semibold text-gray-900 truncate">{r.nombre.split(" ").slice(0, 2).join(" ")}</span>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #4338ca, #6366f1)" }} />
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-right">${fmt(r.bruto / 1000)}k</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Evolución mensual */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm lg:col-span-2">
              <p className="text-sm font-semibold text-gray-900 mb-1">Evolución mensual</p>
              <p className="text-xs text-gray-500 mb-4">Transacciones por mes · {anio}</p>
              {kpis.porMes.length > 0 ? (
                <div>
                  <div className="flex items-end gap-1.5 h-28">
                    {Array.from({ length: 12 }, (_, i) => {
                      const m = kpis.porMes.find((p) => p.mes === i + 1);
                      const tx = m?.tx || 0;
                      const maxTx = Math.max(...kpis.porMes.map((p) => p.tx), 1);
                      const isCurrentMonth = new Date().getMonth() === i && new Date().getFullYear() === anio;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${MESES[i + 1]}: ${tx} tx`}>
                          <div
                            className={`w-full rounded-t min-h-[2px] transition-all ${isCurrentMonth ? "" : ""}`}
                            style={{
                              height: `${Math.max((tx / maxTx) * 100, tx > 0 ? 8 : 2)}%`,
                              background: isCurrentMonth ? "#1e1b8a" : "#eef2ff",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2">
                    {["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map((l, i) => (
                      <span key={i} className="text-[10px] text-gray-400 font-medium flex-1 text-center">{l}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">Sin datos para {anio}</p>
              )}
            </div>
          </div>

          {/* Receptor detail cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {resumenReceptores.map((r, idx) => (
              <div key={r.rut} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[15px] font-bold text-gray-900 tracking-tight">{r.nombre}</p>
                    <p className="font-mono text-xs text-gray-400 mt-0.5">{formatRut(r.rut)}</p>
                  </div>
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
                    style={{ background: "#eef2ff", color: "#1e1b8a" }}>
                    {idx + 1}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">Diligencias</p>
                    <p className="text-base font-bold tabular-nums mt-0.5">{r.transacciones}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">Bruto</p>
                    <p className="text-base font-bold tabular-nums mt-0.5">${fmt(r.bruto)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">Por pagar</p>
                    <p className={`text-base font-bold tabular-nums mt-0.5 ${r.pendiente > 0 ? "text-amber-700" : "text-gray-400"}`}>
                      {r.pendiente > 0 ? `$${fmt(r.pendiente)}` : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[11px] px-2.5 py-0.5 rounded-md bg-gray-100 text-gray-500 font-medium">{r.transacciones} tx</span>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-md font-medium" style={{ background: "#f5f3ff", color: "#1e1b8a" }}>
                    Pagado: ${fmt(r.pagado)}
                  </span>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium">
                    Margen: ${fmt(r.margen)}
                  </span>
                </div>
                {/* Sparkline */}
                {kpis.porMes.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider mb-1">Actividad mensual</p>
                    <div className="flex items-end gap-1 h-9">
                      {Array.from({ length: 12 }, (_, i) => {
                        const mes = i + 1;
                        const txMes = transacciones.filter((t) => t.receptor_rut === r.rut && t.estado !== "ANULADO" && new Date(t.fecha_transaccion + "T12:00:00").getMonth() + 1 === mes).length;
                        const maxR = Math.max(...Array.from({ length: 12 }, (_, j) => transacciones.filter((t) => t.receptor_rut === r.rut && t.estado !== "ANULADO" && new Date(t.fecha_transaccion + "T12:00:00").getMonth() === j).length), 1);
                        const isCurrent = new Date().getMonth() === i && new Date().getFullYear() === anio;
                        return (
                          <div key={i} className="flex-1 rounded-t min-h-[2px]"
                            style={{
                              height: `${Math.max((txMes / maxR) * 100, txMes > 0 ? 12 : 4)}%`,
                              background: isCurrent ? "#1e1b8a" : "#eef2ff",
                            }}
                            title={`${MESES[mes]}: ${txMes}`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[9px] text-gray-400">Ene</span>
                      <span className="text-[9px] text-gray-400">Dic</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {resumenReceptores.length === 0 && (
              <div className="col-span-2 bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">Sin transacciones</div>
            )}
          </div>
        </div>
      )}

      {/* ═══ TAB: BOLETAS ═══ */}
      {vista === "Boletas" && (
        <BoletasTab transacciones={transacciones} anio={anio} kpis={kpis}
          onMarcar={async (ids, folio, fecha) => {
            startTransition(async () => {
              const result = await marcarBoletaEmitida(ids, folio, fecha);
              if (result.error) setMensaje({ tipo: "error", texto: result.error });
              else {
                setMensaje({ tipo: "ok", texto: `${ids.length} boleta(s) marcadas como emitidas` });
                await refrescarTransacciones();
              }
            });
          }}
          isPending={isPending}
        />
      )}

      {/* ═══ TAB: CARGA ═══ */}
      {vista === "Carga" && (
        <div className="space-y-4 animate-fadeIn">
          <CargaPanel auxiliares={auxiliares} onSuccess={(msg) => { setMensaje({ tipo: "ok", texto: msg }); refrescarTransacciones(); }} onError={(msg) => setMensaje({ tipo: "error", texto: msg })} />
          <CargaTBKPanel onSuccess={(msg) => { setMensaje({ tipo: "ok", texto: msg }); refrescarTransacciones(); }} onError={(msg) => setMensaje({ tipo: "error", texto: msg })} />
        </div>
      )}

      {/* ═══ Modal Detalle ═══ */}
      {detalleTx && (
        <DetalleModal tx={detalleTx} editMode={editMode} setEditMode={setEditMode} auxiliares={auxiliares} isPending={isPending}
          onClose={() => { setDetalleTx(null); setEditMode(false); }}
          onSave={async (data) => {
            startTransition(async () => {
              const res = await editarTransaccion(detalleTx.id, data);
              if (res.error) setMensaje({ tipo: "error", texto: res.error });
              else { setMensaje({ tipo: "ok", texto: "Transacción actualizada" }); setDetalleTx(null); setEditMode(false); await refrescarTransacciones(); }
            });
          }}
          onAnular={async () => {
            startTransition(async () => {
              const res = await anularTransaccion(detalleTx.id);
              if (res.error) setMensaje({ tipo: "error", texto: res.error });
              else { setMensaje({ tipo: "ok", texto: "Transacción anulada" }); setDetalleTx(null); setEditMode(false); await refrescarTransacciones(); }
            });
          }}
        />
      )}

      {/* ═══ Modal Pago ═══ */}
      {showPagoModal && seleccionInfo && (
        <PagoModal
          info={seleccionInfo}
          transacciones={Array.from(seleccionados).map((id) => transacciones.find((t) => t.id === id)!).filter(Boolean)}
          onConfirm={async (ref, fecha) => {
            startTransition(async () => {
              const result = await marcarPagado(Array.from(seleccionados), ref, fecha);
              if (result.error) setMensaje({ tipo: "error", texto: result.error });
              else {
                setMensaje({ tipo: "ok", texto: `${seleccionados.size} transacciones marcadas como pagadas` });
                limpiarSeleccion();
                await refrescarTransacciones();
              }
              setShowPagoModal(false);
            });
          }}
          onClose={() => setShowPagoModal(false)}
        />
      )}

      {/* Global styles */}
      <style jsx global>{`
        .field-ctrl {
          width: 100%;
          background: #f8f9fb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          color: #1e1b4b;
          outline: none;
          transition: border 0.15s, box-shadow 0.15s, background 0.15s;
          appearance: none;
        }
        .field-ctrl:hover { background: white; border-color: #d1d5db; }
        .field-ctrl:focus { background: white; border-color: #4338ca; box-shadow: 0 0 0 3px rgba(67,56,202,0.10); }
        select.field-ctrl {
          padding-right: 32px;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M3 4.5l3 3 3-3' stroke='%236b7280' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
          background-repeat: no-repeat;
          background-position: right 10px center;
        }
        .animate-fadeIn { animation: fadeIn 0.25s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slideUp { animation: slideUp 0.3s cubic-bezier(0.22,1,0.36,1); }
        @keyframes slideUp { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

// ─── Shared UI Components ───────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent, smallValue }: { label: string; value: string; sub: string; accent: "primary" | "amber" | "success" | "danger" | "default"; smallValue?: boolean }) {
  const accentColor = { primary: "#1e1b8a", amber: "#b45309", success: "#047857", danger: "#b91c1c", default: "#1e1b8a" }[accent];
  const barColor = { primary: "#1e1b8a", amber: "#f59e0b", success: "#10b981", danger: "#ef4444", default: "#1e1b8a" }[accent];
  const valueColor = { primary: "#1e1b8a", amber: "#b45309", success: "#047857", danger: "#b91c1c", default: "#1e1b4b" }[accent];
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative overflow-hidden hover:shadow-md transition-shadow">
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: barColor }} />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{label}</p>
      <p className={`font-bold tracking-tight leading-tight mb-1 tabular-nums ${smallValue ? "text-sm" : "text-xl"}`} style={{ color: valueColor }}>{value}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${className}`}>{children}</span>;
}

function StatusBadge({ estado }: { estado: string }) {
  const cls = estado === "PENDIENTE" ? "bg-amber-100 text-amber-700" : estado === "PAGADO" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${estado === "PENDIENTE" ? "bg-amber-500" : estado === "PAGADO" ? "bg-emerald-500" : "bg-red-500"}`} />
      {estado}
    </span>
  );
}

// ─── Boletas Tab ────────────────────────────────────────────────────────────

function BoletasTab({ transacciones, anio, kpis, onMarcar, isPending }: {
  transacciones: Transaccion[];
  anio: number;
  kpis: KPIs;
  onMarcar: (ids: number[], folio: string, fecha: string) => void;
  isPending: boolean;
}) {
  const [filtroEstudio, setFiltroEstudio] = useState("");
  const [filtroEstadoBoleta, setFiltroEstadoBoleta] = useState("");
  const [filtroMes, setFiltroMes] = useState(0);
  const [folios, setFolios] = useState<Record<number, string>>({});

  const pendientes = transacciones.filter((t) => t.estado !== "ANULADO" && !t.boleta_emitida);
  const emitidas = transacciones.filter((t) => t.boleta_emitida);
  const totalPendBruto = pendientes.reduce((s, t) => s + Number(t.comision_nl_bruta), 0);
  const totalEmitBruto = emitidas.reduce((s, t) => s + Number(t.comision_nl_bruta), 0);
  const totalNeto = transacciones.filter((t) => t.estado !== "ANULADO").reduce((s, t) => s + Number(t.comision_nl_neta), 0);
  const totalIva = transacciones.filter((t) => t.estado !== "ANULADO").reduce((s, t) => s + Number(t.iva_comision), 0);

  const todasTx = (() => {
    let list = transacciones.filter((t) => t.estado !== "ANULADO");
    if (filtroEstadoBoleta === "PENDIENTE") list = list.filter((t) => !t.boleta_emitida);
    else if (filtroEstadoBoleta === "EMITIDA") list = list.filter((t) => t.boleta_emitida);
    if (filtroEstudio) list = list.filter((t) => (t.estudio_rut || "SIN_ESTUDIO") === filtroEstudio);
    if (filtroMes > 0) list = list.filter((t) => new Date(t.fecha_transaccion + "T12:00:00").getMonth() + 1 === filtroMes);
    return list;
  })();

  // Group by estudio
  const grupos = (() => {
    const mapa: Record<string, { estudioRut: string; estudioNombre: string; abogado: string; txs: Transaccion[] }> = {};
    for (const t of todasTx) {
      const key = t.estudio_rut || "SIN_ESTUDIO";
      if (!mapa[key]) {
        mapa[key] = {
          estudioRut: t.estudio_rut || "",
          estudioNombre: t.estudio_nombre || "Sin estudio asignado",
          abogado: t.abogado_nombre || "",
          txs: [],
        };
      }
      mapa[key].txs.push(t);
    }
    return Object.values(mapa).sort((a, b) => b.txs.reduce((s, t) => s + Number(t.comision_nl_bruta), 0) - a.txs.reduce((s, t) => s + Number(t.comision_nl_bruta), 0));
  })();

  const estudiosUnicos = (() => {
    const mapa = new Map<string, string>();
    for (const t of transacciones) {
      if (t.estudio_rut) mapa.set(t.estudio_rut, t.estudio_nombre || t.estudio_rut);
    }
    return Array.from(mapa, ([rut, nombre]) => ({ rut, nombre }));
  })();

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Pendientes de emisión" value={String(pendientes.length)} sub={`Total $${fmt(totalPendBruto)} bruto`} accent="amber" />
        <KpiCard label="Boletas emitidas" value={String(emitidas.length)} sub={`$${fmt(totalEmitBruto)} facturados`} accent="success" />
        <KpiCard label="Comisión neta YTD" value={`$${fmt(totalNeto)}`} sub="Honorarios sin IVA" accent="default" />
        <KpiCard label="IVA acumulado" value={`$${fmt(totalIva)}`} sub="19% sobre comisión" accent="default" />
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <FilterField label="Estudio / Abogado">
            <select value={filtroEstudio} onChange={(e) => setFiltroEstudio(e.target.value)} className="field-ctrl">
              <option value="">Todos</option>
              {estudiosUnicos.map((e) => <option key={e.rut} value={e.rut}>{e.nombre}</option>)}
            </select>
          </FilterField>
          <FilterField label="Estado boleta">
            <select value={filtroEstadoBoleta} onChange={(e) => setFiltroEstadoBoleta(e.target.value)} className="field-ctrl">
              <option value="">Todas</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="EMITIDA">Emitidas</option>
            </select>
          </FilterField>
          <FilterField label="Mes">
            <select value={filtroMes} onChange={(e) => setFiltroMes(Number(e.target.value))} className="field-ctrl">
              <option value={0}>Todos</option>
              {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </FilterField>
          {(filtroEstudio || filtroEstadoBoleta || filtroMes > 0) && (
            <button onClick={() => { setFiltroEstudio(""); setFiltroEstadoBoleta(""); setFiltroMes(0); }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Grupos por estudio */}
      {grupos.map((g) => {
        const totalGrupo = g.txs.reduce((s, t) => s + Number(t.comision_nl_bruta), 0);
        return (
          <div key={g.estudioRut || "none"} className="overflow-hidden">
            {/* Estudio header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 rounded-t-xl border border-b-0 border-gray-200" style={{ background: "#f5f3ff" }}>
              <div>
                <p className="text-sm font-bold text-gray-900">{g.estudioNombre}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {g.estudioRut && <span className="font-mono font-medium">{formatRut(g.estudioRut)}</span>}
                  {g.abogado && <span> · {g.abogado}</span>}
                  {!g.estudioRut && !g.abogado && "Transacciones sin estudio vinculado"}
                </p>
              </div>
              <span className="text-sm font-bold tabular-nums" style={{ color: "#1e1b8a" }}>${fmt(totalGrupo)}</span>
            </div>

            {/* Table */}
            <div className="border border-gray-200 rounded-b-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-[10px] text-gray-500 border-b bg-white uppercase tracking-wider font-semibold">
                      <th className="px-3 py-2.5 text-left">Fecha</th>
                      <th className="px-3 py-2.5 text-left hidden sm:table-cell">Orden</th>
                      <th className="px-3 py-2.5 text-left">Receptor</th>
                      <th className="px-3 py-2.5 text-right">Bruto</th>
                      <th className="px-3 py-2.5 text-right">Comisión (15%)</th>
                      <th className="px-3 py-2.5 text-right hidden sm:table-cell">Neto</th>
                      <th className="px-3 py-2.5 text-center">Estado</th>
                      <th className="px-3 py-2.5 text-right">Folio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.txs.map((t) => (
                      <tr key={t.id} className={`border-b border-gray-100 hover:bg-gray-50/50 ${t.boleta_emitida ? "bg-emerald-50/30" : ""}`}>
                        <td className="px-3 py-2.5 text-xs text-gray-600">{new Date(t.fecha_transaccion + "T12:00:00").toLocaleDateString("es-CL")}</td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <span className="font-mono text-xs font-semibold" style={{ color: "#1e1b8a" }}>{t.orden_id}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs font-medium text-gray-900">{t.receptor_nombre}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">${fmt(Number(t.monto_bruto))}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums font-semibold text-orange-700">${fmt(Number(t.comision_nl_bruta))}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-indigo-600 hidden sm:table-cell">${fmt(Number(t.comision_nl_neta))}</td>
                        <td className="px-3 py-2.5 text-center">
                          {t.boleta_emitida ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-100 text-emerald-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Emitida
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-amber-100 text-amber-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Pendiente
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {t.boleta_emitida ? (
                            <span className="font-mono text-xs font-semibold text-gray-900">{t.boleta_folio || "—"}</span>
                          ) : (
                            <div className="flex items-center gap-1.5 justify-end">
                              <input type="text" placeholder="Folio"
                                value={folios[t.id] || ""}
                                onChange={(e) => setFolios((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                className="w-20 px-2 py-1 border border-gray-200 rounded-md font-mono text-xs focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200" />
                              <button
                                onClick={() => {
                                  const folio = folios[t.id];
                                  if (!folio) return;
                                  onMarcar([t.id], folio, new Date().toISOString().slice(0, 10));
                                }}
                                disabled={!folios[t.id] || isPending}
                                className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-white disabled:opacity-30 transition"
                                style={{ background: "#1e1b8a" }}
                              >Emitir</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })}
      {grupos.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">Sin transacciones para mostrar</div>
      )}
    </div>
  );
}

// ─── Payment Modal ──────────────────────────────────────────────────────────

function PagoModal({ info, transacciones, onConfirm, onClose }: {
  info: { total: number; nombre: string; rut: string; count: number };
  transacciones: Transaccion[];
  onConfirm: (ref: string, fecha: string) => void;
  onClose: () => void;
}) {
  const [ref, setRef] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl animate-slideUp" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 text-white relative" style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)" }}>
          <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
          <h2 className="text-lg font-semibold">Registrar pago a receptor</h2>
          <p className="text-sm text-white/60 mt-1">Transferencia bancaria por diligencias completadas</p>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-5">
          {/* Receptor */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Receptor</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">{info.nombre}</p>
              <p className="font-mono text-xs text-gray-500 mt-0.5">{formatRut(info.rut)}</p>
            </div>
          </div>

          {/* Transacciones */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Transacciones incluidas</p>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold bg-gray-50 border-b">
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Orden</th>
                    <th className="px-3 py-2 text-right">Base</th>
                  </tr>
                </thead>
                <tbody>
                  {transacciones.map((t) => (
                    <tr key={t.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-2">{new Date(t.fecha_transaccion + "T12:00:00").toLocaleDateString("es-CL")}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: "#1e1b8a" }}>{t.orden_id}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">${fmt(Number(t.base_receptor))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center mt-2.5 px-4 py-3 rounded-lg" style={{ background: "#f5f3ff" }}>
              <span className="text-sm font-semibold text-gray-900">Total a transferir</span>
              <span className="text-xl font-bold tabular-nums" style={{ color: "#1e1b8a" }}>${fmt(info.total)}</span>
            </div>
          </div>

          {/* Detalle pago */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Detalle del pago</p>
            <div className="grid grid-cols-2 gap-3">
              <FilterField label="Fecha de pago">
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="field-ctrl" />
              </FilterField>
              <FilterField label="N° de transferencia">
                <input type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ej: TRF-2026-0142" className="field-ctrl" />
              </FilterField>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition">Cancelar</button>
          <button onClick={() => onConfirm(ref, fecha)} disabled={!ref}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition flex items-center gap-2"
            style={{ background: "#1e1b8a" }}>
            Confirmar pago
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detalle Modal ──────────────────────────────────────────────────────────

function DetalleModal({ tx, editMode, setEditMode, auxiliares, isPending, onClose, onSave, onAnular }: {
  tx: Transaccion;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  auxiliares: Auxiliar[];
  isPending: boolean;
  onClose: () => void;
  onSave: (data: { receptor_rut: string; receptor_nombre: string; monto_bruto: number; plataforma: string; card_type: string; fecha_transaccion: string }) => void;
  onAnular: () => void;
}) {
  const [form, setForm] = useState({
    receptor_rut: tx.receptor_rut,
    receptor_nombre: tx.receptor_nombre || "",
    monto_bruto: Number(tx.monto_bruto),
    plataforma: tx.plataforma || "TBK",
    card_type: tx.plataforma === "TBK" ? (tx.lote_carga ? "Visa Débito" : "") : "",
    fecha_transaccion: tx.fecha_transaccion,
  });
  const [confirmarAnular, setConfirmarAnular] = useState(false);

  const margen = Number(tx.comision_nl_neta) - Number(tx.costo_plataforma);
  const fmtFecha = (f: string | null) => f ? new Date(f + "T12:00:00").toLocaleDateString("es-CL") : "—";

  const Row = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="flex justify-between py-1.5 border-b border-gray-50">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs font-mono font-medium ${color || "text-gray-900"}`}>{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-8 px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden animate-slideUp" onClick={(e) => e.stopPropagation()}>
        <div className="relative px-6 py-4 text-white" style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)" }}>
          <button onClick={onClose} className="absolute top-3 right-4 text-white/60 hover:text-white text-xl font-light">×</button>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${tx.plataforma === "TBK" ? "bg-orange-400/20 text-orange-200" : "bg-sky-400/20 text-sky-200"}`}>
              {tx.plataforma === "TBK" ? "Transbank" : "Mercado Pago"}
            </span>
            <StatusBadge estado={tx.estado} />
          </div>
          <p className="text-lg font-bold mt-2">${fmt(Number(tx.monto_bruto))}</p>
          <p className="text-sm text-white/70">Orden: {tx.orden_id}</p>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
          {!editMode ? (
            <>
              <div>
                <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Receptor</h4>
                <p className="text-sm font-medium text-gray-900">{tx.receptor_nombre}</p>
                <p className="text-xs text-gray-500 font-mono">{formatRut(tx.receptor_rut)}</p>
              </div>

              {(tx.estudio_rut || tx.abogado_rut || tx.comprador_rut) && (
                <div>
                  <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Facturación</h4>
                  {tx.estudio_nombre && <Row label="Estudio" value={`${tx.estudio_nombre}${tx.estudio_rut ? ` (${formatRut(tx.estudio_rut)})` : ""}`} />}
                  {tx.abogado_nombre && <Row label="Abogado" value={`${tx.abogado_nombre}${tx.abogado_rut ? ` (${formatRut(tx.abogado_rut)})` : ""}`} />}
                  {tx.comprador_nombre && !tx.estudio_nombre && <Row label="Comprador" value={`${tx.comprador_nombre}${tx.comprador_rut ? ` (${formatRut(tx.comprador_rut)})` : ""}`} />}
                  {tx.giro_billing && <Row label="Giro" value={tx.giro_billing} />}
                  {tx.direccion_billing && <Row label="Dirección" value={tx.direccion_billing} />}
                  {tx.comuna_billing && <Row label="Comuna" value={tx.comuna_billing} />}
                  {tx.email_billing && <Row label="Email" value={tx.email_billing} />}
                </div>
              )}

              <div>
                <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Desglose</h4>
                <Row label="Fecha" value={fmtFecha(tx.fecha_transaccion)} />
                <Row label="Monto bruto" value={`$${fmt(Number(tx.monto_bruto))}`} />
                <Row label="Base receptor (85%)" value={`$${fmt(Number(tx.base_receptor))}`} color="text-amber-700" />
                <Row label="Comisión NL bruta (15%)" value={`$${fmt(Number(tx.comision_nl_bruta))}`} />
                <Row label="Comisión NL neta" value={`$${fmt(Number(tx.comision_nl_neta))}`} color="text-indigo-600" />
                <Row label="IVA comisión" value={`$${fmt(Number(tx.iva_comision))}`} />
                <Row label="Costo plataforma" value={`-$${fmt(Number(tx.costo_plataforma))}`} color="text-red-500" />
                <div className="flex justify-between py-2 border-t-2 border-gray-200 mt-1">
                  <span className="text-xs font-semibold text-gray-700">Margen neto</span>
                  <span className={`text-sm font-mono font-bold ${margen >= 0 ? "text-green-600" : "text-red-600"}`}>${fmt(margen)}</span>
                </div>
              </div>

              {tx.estado === "PAGADO" && (
                <div>
                  <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Pago</h4>
                  <Row label="Fecha pago" value={fmtFecha(tx.fecha_pago)} />
                  <Row label="Referencia" value={tx.referencia_pago || "—"} />
                </div>
              )}

              {tx.boleta_emitida && (
                <div>
                  <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Boleta</h4>
                  <Row label="Folio" value={tx.boleta_folio || "—"} />
                </div>
              )}

              {tx.lote_carga && <p className="text-[11px] text-gray-400">Lote: {tx.lote_carga}</p>}

              <div className="flex gap-2 pt-2">
                {tx.estado !== "ANULADO" && (
                  <button onClick={() => setEditMode(true)}
                    className="flex-1 text-white py-2 rounded-lg text-sm font-medium transition"
                    style={{ background: "#1e1b8a" }}>Editar</button>
                )}
                {tx.estado === "PENDIENTE" && (
                  <button onClick={() => setConfirmarAnular(true)}
                    className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition font-medium">Anular</button>
                )}
              </div>

              {confirmarAnular && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-red-700 font-medium">¿Confirmar anulación?</p>
                  <p className="text-xs text-red-500">Esta acción no se puede deshacer.</p>
                  <div className="flex gap-2">
                    <button onClick={onAnular} disabled={isPending}
                      className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50">
                      {isPending ? "Anulando..." : "Sí, anular"}
                    </button>
                    <button onClick={() => setConfirmarAnular(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-[11px] text-gray-500 font-medium uppercase">Receptor</label>
                  <select value={form.receptor_rut}
                    onChange={(e) => {
                      const aux = auxiliares.find((a) => a.rut === e.target.value);
                      setForm((p) => ({ ...p, receptor_rut: e.target.value, receptor_nombre: aux?.nombre || p.receptor_nombre }));
                    }}
                    className="field-ctrl mt-1">
                    <option value={form.receptor_rut}>{form.receptor_nombre} ({formatRut(form.receptor_rut)})</option>
                    {auxiliares.filter((a) => a.rut !== form.receptor_rut).map((a) => (
                      <option key={a.rut} value={a.rut}>{a.nombre} ({formatRut(a.rut)})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 font-medium uppercase">Monto bruto</label>
                  <input type="number" value={form.monto_bruto} onChange={(e) => setForm((p) => ({ ...p, monto_bruto: Number(e.target.value) }))} className="field-ctrl mt-1 font-mono" />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 font-medium uppercase">Fecha</label>
                  <input type="date" value={form.fecha_transaccion} onChange={(e) => setForm((p) => ({ ...p, fecha_transaccion: e.target.value }))} className="field-ctrl mt-1" />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 font-medium uppercase">Plataforma</label>
                  <select value={form.plataforma} onChange={(e) => setForm((p) => ({ ...p, plataforma: e.target.value }))} className="field-ctrl mt-1">
                    <option value="TBK">Transbank</option>
                    <option value="MP">Mercado Pago</option>
                  </select>
                </div>
                {form.plataforma === "TBK" && (
                  <div>
                    <label className="text-[11px] text-gray-500 font-medium uppercase">Tipo tarjeta</label>
                    <select value={form.card_type} onChange={(e) => setForm((p) => ({ ...p, card_type: e.target.value }))} className="field-ctrl mt-1">
                      <option value="Visa Débito">Débito</option>
                      <option value="Visa Crédito">Crédito</option>
                    </select>
                  </div>
                )}
              </div>

              {form.monto_bruto > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                  <p className="font-semibold text-gray-600 mb-1">Preview con nuevos valores:</p>
                  <div className="flex justify-between"><span>Base receptor:</span><span className="font-mono text-amber-700">${fmt(Math.round(form.monto_bruto / 1.15))}</span></div>
                  <div className="flex justify-between"><span>Comisión NL bruta:</span><span className="font-mono">${fmt(form.monto_bruto - Math.round(form.monto_bruto / 1.15))}</span></div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => onSave(form)} disabled={isPending}
                  className="flex-1 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition"
                  style={{ background: "#1e1b8a" }}>
                  {isPending ? "Guardando..." : "Guardar cambios"}
                </button>
                <button onClick={() => setEditMode(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Carga Panel ────────────────────────────────────────────────────────────

function CargaPanel({ auxiliares, onSuccess, onError }: { auxiliares: Auxiliar[]; onSuccess: (msg: string) => void; onError: (msg: string) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<TransaccionInput[]>([]);
  const [cargando, setCargando] = useState(false);
  const [stats, setStats] = useState<{ total: number; sinRut: number; plataformas: Record<string, number> } | null>(null);

  function normalizarRut(rut: string): string {
    return rut.replace(/\./g, "").replace(/[–—]/g, "-").trim();
  }

  function resolverReceptor(configRut: string, receptorEmail: string): { rut: string; nombre: string } {
    const rutNorm = normalizarRut(configRut);
    const porRut = auxiliares.find((a) => a.rut === rutNorm);
    if (porRut) return { rut: porRut.rut, nombre: porRut.nombre };
    const porEmail = receptorEmail ? auxiliares.find((a) => a.email && a.email.toLowerCase() === receptorEmail.toLowerCase()) : null;
    if (porEmail) return { rut: porEmail.rut, nombre: porEmail.nombre };
    return { rut: rutNorm, nombre: receptorEmail.split("@")[0] };
  }

  function extraerRutDeConfig(config: string): string {
    const m = config.match(/['"]rut['"]\s*:\s*['"]([^'"]+)['"]/);
    if (!m) return "";
    return m[1].replace(/\./g, "").replace(/[–—]/g, "-");
  }

  const handleFile = useCallback(async (file: File) => {
    setArchivo(file);
    setStats(null);
    try {
      const isExcel = /\.xlsx?$/i.test(file.name);
      if (isExcel) {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

        const rows: TransaccionInput[] = [];
        let sinRut = 0;
        const plataformas: Record<string, number> = {};

        for (const row of data) {
          const id = String(row["id"] ?? "");
          if (!id) continue;
          const totalAmount = Number(row["totalAmount"] ?? 0);
          const amount = Number(row["amount"] ?? 0);
          const monto = totalAmount || Math.round(amount * 1.15);
          if (monto < 100) continue;

          const rutDirecto = String(row["rut_receptor"] ?? "");
          const config = String(row["config"] ?? "");
          const rut = rutDirecto ? normalizarRut(rutDirecto) : extraerRutDeConfig(config);
          if (!rut) sinRut++;

          const pm = String(row["paymentMethod"] ?? "").toLowerCase();
          const plataforma = pm.includes("mercado") ? "MP" : "TBK";
          plataformas[plataforma] = (plataformas[plataforma] || 0) + 1;

          let fecha = "";
          const rawDate = row["transactionDate"];
          if (rawDate instanceof Date) fecha = rawDate.toISOString().slice(0, 10);
          else if (typeof rawDate === "string") {
            const isoMatch = rawDate.match(/\d{4}-\d{2}-\d{2}/);
            fecha = isoMatch ? isoMatch[0] : rawDate.slice(0, 10);
          }
          if (!fecha) continue;

          const receptorEmail = String(row["receptor"] ?? "");
          const resolved = resolverReceptor(rut, receptorEmail);
          const idTbk = String(row["id_tbk"] ?? "");
          const idMp = String(row["id_mp"] ?? "");
          const cardType = String(row["cardType"] ?? row["card_type"] ?? "");
          const estudioRut = String(row["rut_billing"] ?? row["estudio_rut"] ?? "");
          const estudioNombre = String(row["razonsocial_billing"] ?? row["estudio_nombre"] ?? "");
          const giroBilling = String(row["giro_billing"] ?? row["giro"] ?? "");
          const direccionBilling = String(row["direccion_billing"] ?? row["direccion"] ?? "");
          const comunaBilling = String(row["comuna_billing"] ?? "");
          const emailBilling = String(row["email_billing"] ?? "");
          const abogadoRut = String(row["rut_personal"] ?? row["abogado_rut"] ?? "");
          const abogadoNombre = String(row["nombre_personal"] ?? row["abogado_nombre"] ?? "");
          const compradorRut = estudioRut || String(row["buyerRut"] ?? row["comprador_rut"] ?? row["clientRut"] ?? "");
          const compradorNombre = estudioNombre || String(row["buyerName"] ?? row["comprador_nombre"] ?? row["clientName"] ?? row["buyer"] ?? "");

          rows.push({
            orden_id: id,
            fecha_transaccion: fecha,
            receptor_rut: resolved.rut,
            receptor_nombre: resolved.nombre,
            monto_bruto: monto,
            plataforma,
            id_tbk: idTbk || undefined,
            id_mp: idMp || undefined,
            card_type: cardType || undefined,
            comprador_rut: compradorRut ? normalizarRut(compradorRut) : undefined,
            comprador_nombre: compradorNombre.trim() || undefined,
            abogado_rut: abogadoRut ? normalizarRut(abogadoRut) : undefined,
            abogado_nombre: abogadoNombre.trim() || undefined,
            estudio_rut: estudioRut ? normalizarRut(estudioRut) : undefined,
            estudio_nombre: estudioNombre.trim() || undefined,
            giro_billing: giroBilling.trim() || undefined,
            direccion_billing: direccionBilling.trim() || undefined,
            comuna_billing: comunaBilling.trim() || undefined,
            email_billing: emailBilling.trim() || undefined,
          });
        }
        setPreview(rows);
        setStats({ total: data.length, sinRut, plataformas });
        if (rows.length === 0) onError("No se encontraron transacciones válidas en el archivo Excel");
      } else {
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
        if (idxOrden < 0 || idxFecha < 0 || idxMonto < 0) { onError("Archivo inválido: se requieren columnas orden/id, fecha y monto"); return; }
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
          const rutVal = idxRut >= 0 ? vals[idxRut].replace(/\./g, "") : "";
          const csvResolved = resolverReceptor(rutVal, "");
          rows.push({
            orden_id: vals[idxOrden],
            fecha_transaccion: fecha,
            receptor_rut: csvResolved.rut || rutVal,
            receptor_nombre: csvResolved.nombre || (idxNombre >= 0 ? vals[idxNombre] : ""),
            monto_bruto: monto,
          });
        }
        setPreview(rows);
      }
    } catch { onError("Error al procesar el archivo"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onError, auxiliares]);

  async function handleCargar() {
    if (preview.length === 0) return;
    setCargando(true);
    const result = await cargarTransacciones(preview);
    setCargando(false);
    if (result.error) onError(result.error);
    else { onSuccess(`${result.insertados} transacciones cargadas (lote: ${result.lote})`); setPreview([]); setArchivo(null); setStats(null); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
      <h3 className="text-base font-bold text-gray-900">Cargar transacciones</h3>
      <p className="text-sm text-gray-500">Sube el archivo Excel (.xlsx) o CSV con las transacciones del marketplace.</p>
      <div onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-indigo-300 transition cursor-pointer"
        onClick={() => document.getElementById("mkt-file-input")?.click()}>
        <input id="mkt-file-input" type="file" accept=".xlsx,.xls,.csv,.txt,.tsv" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        <svg className="w-10 h-10 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
        <p className="mt-2 text-sm text-gray-500">{archivo ? archivo.name : "Arrastra un archivo Excel o CSV"}</p>
        <p className="text-xs text-gray-400 mt-1">Formatos: .xlsx, .csv, .txt</p>
      </div>

      {stats && preview.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg font-medium">{preview.length} transacciones</span>
          {Object.entries(stats.plataformas).map(([p, n]) => (
            <span key={p} className={`px-3 py-1.5 rounded-lg font-medium ${p === "TBK" ? "bg-orange-50 text-orange-700" : "bg-sky-50 text-sky-700"}`}>
              {p === "TBK" ? "Transbank" : "Mercado Pago"}: {n}
            </span>
          ))}
          {stats.sinRut > 0 && <span className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg font-medium">{stats.sinRut} sin RUT</span>}
        </div>
      )}

      {preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{preview.length} transacciones listas para cargar</span>
            <button onClick={handleCargar} disabled={cargando}
              className="text-white px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50" style={{ background: "#1e1b8a" }}>
              {cargando ? "Cargando..." : "Confirmar carga"}
            </button>
          </div>
          <div className="overflow-x-auto max-h-80 border rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2">ID</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Receptor</th>
                  <th className="px-3 py-2">RUT</th><th className="px-3 py-2 text-center">Plat.</th>
                  <th className="px-3 py-2 text-right">Bruto</th><th className="px-3 py-2 text-right">Base</th><th className="px-3 py-2 text-right">Comisión</th>
                  <th className="px-3 py-2 text-right">Costo Plat.</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 30).map((t, i) => {
                  const base = Math.round(t.monto_bruto / 1.15);
                  const tasaPlat = t.plataforma === "MP" ? 0.0319 : (t.card_type?.toLowerCase().includes("créd") || t.card_type?.toLowerCase().includes("cred")) ? 0.0249 : 0.0149;
                  const costoPlat = Math.round(t.monto_bruto * tasaPlat * 1.19);
                  return (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-mono" style={{ color: "#1e1b8a" }}>{t.orden_id}</td>
                      <td className="px-3 py-1.5">{t.fecha_transaccion}</td>
                      <td className="px-3 py-1.5 font-medium">{t.receptor_nombre}</td>
                      <td className="px-3 py-1.5 font-mono text-gray-500">{t.receptor_rut ? formatRut(t.receptor_rut) : <span className="text-red-400">—</span>}</td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.plataforma === "TBK" ? "bg-orange-100 text-orange-700" : "bg-sky-100 text-sky-700"}`}>
                          {t.plataforma === "TBK" ? "TBK" : "MP"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">${fmt(t.monto_bruto)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-amber-700">${fmt(base)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-indigo-600">${fmt(t.monto_bruto - base)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-red-500">-${fmt(costoPlat)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {preview.length > 30 && <div className="px-3 py-2 text-center text-gray-400 text-xs bg-gray-50">... y {preview.length - 30} más</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Carga TBK Panel ────────────────────────────────────────────────────────

function CargaTBKPanel({ onSuccess, onError }: { onSuccess: (m: string) => void; onError: (m: string) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<Array<{ order_id: string; monto_afecto: number; fecha_abono: string; tipo_tarjeta: string; fecha_venta: string }>>([]);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<{ matched: number; unmatched: number; detalles: Array<{ order_id: string; matched: boolean; orden_id?: string; receptor?: string; monto?: number }> } | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setArchivo(file);
    setPreview([]);
    setResultado(null);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const items: typeof preview = [];
      for (let i = 19; i < rows.length; i += 2) {
        const row = rows[i];
        if (!row || row.length < 18) continue;
        const orderRaw = String(row[9] ?? "").trim();
        if (!orderRaw || orderRaw === " " || !orderRaw.includes("ORDER")) continue;
        const montoAfecto = Math.abs(Number(row[13]) || 0);
        if (montoAfecto === 0) continue;
        const tipoTarjeta = String(row[6] ?? "");
        let fechaVenta = "";
        const fvRaw = String(row[1] ?? "");
        if (fvRaw.includes("/")) {
          const parts = fvRaw.split(" ")[0].split("/");
          if (parts.length === 3) fechaVenta = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
        let fechaAbono = "";
        const faRaw = String(row[17] ?? "");
        if (faRaw.includes("/")) {
          const parts = faRaw.split("/");
          if (parts.length === 3) fechaAbono = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
        if (!fechaAbono) continue;
        items.push({ order_id: orderRaw, monto_afecto: montoAfecto, fecha_abono: fechaAbono, tipo_tarjeta: tipoTarjeta, fecha_venta: fechaVenta });
      }
      setPreview(items);
      if (items.length === 0) onError("No se encontraron transacciones TBK válidas en el archivo");
    } catch { onError("Error al procesar archivo TBK"); }
  }, [onError]);

  async function handleCargar() {
    if (preview.length === 0) return;
    setCargando(true);
    const result = await cargarDetalleTBK(preview);
    setCargando(false);
    if (result.error) { onError(result.error); return; }
    setResultado(result);
    onSuccess(`${result.matched} transacciones vinculadas con marketplace, ${result.unmatched} sin match`);
  }

  const fechasAbono = [...new Set(preview.map((p) => p.fecha_abono))].sort();

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
      <div>
        <h3 className="text-base font-bold text-gray-900">Cargar Detalle Transbank</h3>
        <p className="text-sm text-gray-500 mt-1">Sube la cartola de movimientos nativa de Transbank (.xlsx) para vincular ORDER IDs con fechas de abono.</p>
      </div>
      <div onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-orange-200 rounded-xl p-8 text-center hover:border-orange-400 transition cursor-pointer bg-orange-50/30"
        onClick={() => document.getElementById("tbk-file-input")?.click()}>
        <input id="tbk-file-input" type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        <svg className="w-10 h-10 mx-auto text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        <p className="mt-2 text-sm text-gray-600">{archivo ? archivo.name : "Arrastra cartola Transbank aquí"}</p>
        <p className="text-xs text-gray-400 mt-1">Formato nativo Transbank (.xlsx)</p>
      </div>

      {preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg font-medium">{preview.length} transacciones</span>
            {fechasAbono.map((f) => {
              const n = preview.filter((p) => p.fecha_abono === f).length;
              const total = preview.filter((p) => p.fecha_abono === f).reduce((s, p) => s + p.monto_afecto, 0);
              return <span key={f} className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg font-medium">Abono {f}: {n} tx (${fmt(total)})</span>;
            })}
          </div>
          <div className="overflow-x-auto max-h-60 border rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2">ORDER ID</th>
                  <th className="px-3 py-2">Fecha Venta</th>
                  <th className="px-3 py-2">Tarjeta</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2">Fecha Abono</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-mono text-orange-700 text-[11px]">{p.order_id.replace(/^0+/, "")}</td>
                    <td className="px-3 py-1.5">{p.fecha_venta}</td>
                    <td className="px-3 py-1.5">{p.tipo_tarjeta}</td>
                    <td className="px-3 py-1.5 text-right font-mono">${fmt(p.monto_afecto)}</td>
                    <td className="px-3 py-1.5 font-medium text-indigo-600">{p.fecha_abono}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{preview.length} transacciones listas para vincular</span>
            <button onClick={handleCargar} disabled={cargando}
              className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50">
              {cargando ? "Procesando..." : "Vincular con Marketplace"}
            </button>
          </div>
        </div>
      )}

      {resultado && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex gap-3 text-sm">
            <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg font-medium">{resultado.matched} vinculados</span>
            {resultado.unmatched > 0 && <span className="bg-red-50 text-red-700 px-3 py-1 rounded-lg font-medium">{resultado.unmatched} sin match</span>}
          </div>
          <div className="overflow-x-auto max-h-48 border rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2">ORDER ID</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Orden MKT</th>
                  <th className="px-3 py-2">Receptor</th>
                </tr>
              </thead>
              <tbody>
                {resultado.detalles.map((d, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-mono text-[11px]">{d.order_id.replace(/^0+/, "")}</td>
                    <td className="px-3 py-1.5">
                      {d.matched ? <span className="text-emerald-600 font-medium">Vinculado</span> : <span className="text-red-500 font-medium">Sin match</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-indigo-600">{d.orden_id || "—"}</td>
                    <td className="px-3 py-1.5">{d.receptor || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
