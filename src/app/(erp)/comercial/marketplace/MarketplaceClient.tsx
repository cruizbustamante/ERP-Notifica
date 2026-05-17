"use client";

import { useState, useTransition, useCallback } from "react";
import { formatRut } from "@/lib/rut";
import { MESES } from "@/lib/contabilidad/core";
import {
  cargarTransacciones,
  getTransacciones,
  marcarPagado,
  anularTransaccion,
  marcarBoletaEmitida,
  getResumenMensualMKT,
  getComparativoNegocios,
  getRentabilidadPorPlataforma,
  type TransaccionInput,
  type RentabilidadPlataforma,
  type ResumenMensualMKT,
  type ComparativoNegocio,
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
};

type Receptor = { rut: string; nombre: string };

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

const TABS = ["Dashboard", "Receptores", "Transacciones", "Boletas", "Negocio", "Carga"] as const;
type Tab = typeof TABS[number];

export default function MarketplaceClient({
  transaccionesIniciales,
  receptores,
  kpis,
  anio,
}: {
  transaccionesIniciales: Transaccion[];
  receptores: Receptor[];
  kpis: KPIs;
  anio: number;
}) {
  const [transacciones, setTransacciones] = useState(transaccionesIniciales);
  const [vista, setVista] = useState<Tab>("Dashboard");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [filtroReceptor, setFiltroReceptor] = useState("");
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [showPagoModal, setShowPagoModal] = useState(false);

  // Lazy-loaded data
  const [resumenMensual, setResumenMensual] = useState<ResumenMensualMKT[] | null>(null);
  const [comparativo, setComparativo] = useState<ComparativoNegocio[] | null>(null);
  const [rentabilidad, setRentabilidad] = useState<RentabilidadPlataforma[] | null>(null);

  const pendientes = transacciones.filter((t) => t.estado === "PENDIENTE");
  const pagados = transacciones.filter((t) => t.estado === "PAGADO");
  const totalPendiente = pendientes.reduce((s, t) => s + Number(t.base_receptor), 0);
  const totalPagado = pagados.reduce((s, t) => s + Number(t.base_receptor), 0);

  const filtradas = transacciones.filter((t) => {
    if (filtroEstado !== "TODOS" && t.estado !== filtroEstado) return false;
    if (filtroReceptor && t.receptor_rut !== filtroReceptor) return false;
    return true;
  });

  const resumenReceptores = (() => {
    const mapa: Record<string, { rut: string; nombre: string; pendiente: number; pagado: number; transacciones: number; comisionNeta: number; costoPlat: number; margen: number }> = {};
    for (const t of transacciones) {
      if (t.estado === "ANULADO") continue;
      if (!mapa[t.receptor_rut]) {
        mapa[t.receptor_rut] = { rut: t.receptor_rut, nombre: t.receptor_nombre || t.receptor_rut, pendiente: 0, pagado: 0, transacciones: 0, comisionNeta: 0, costoPlat: 0, margen: 0 };
      }
      const r = mapa[t.receptor_rut];
      r.transacciones++;
      r.comisionNeta += Number(t.comision_nl_neta);
      r.costoPlat += Number(t.costo_plataforma) || Number(t.costo_tbk);
      r.margen += Number(t.comision_nl_neta) - (Number(t.costo_plataforma) || Number(t.costo_tbk));
      if (t.estado === "PENDIENTE") r.pendiente += Number(t.base_receptor);
      else r.pagado += Number(t.base_receptor);
    }
    return Object.values(mapa).sort((a, b) => b.margen - a.margen);
  })();

  async function handleTabChange(tab: Tab) {
    setVista(tab);
    if (tab === "Boletas" && !resumenMensual) {
      const res = await getResumenMensualMKT(anio);
      if (!res.error) setResumenMensual(res.data);
    }
    if (tab === "Negocio" && !comparativo) {
      const [comp, rent] = await Promise.all([
        getComparativoNegocios(anio),
        getRentabilidadPorPlataforma(),
      ]);
      if (!comp.error) setComparativo(comp.data);
      if (!rent.error) setRentabilidad(rent.data);
    }
  }

  async function handleFiltrar() {
    startTransition(async () => {
      const result = await getTransacciones({ estado: filtroEstado, receptor_rut: filtroReceptor || undefined });
      if (!result.error) setTransacciones(result.data as Transaccion[]);
    });
  }

  function toggleSeleccion(id: number) {
    setSeleccionados((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  const boletasPendientes = transacciones.filter((t) => t.estado !== "ANULADO" && !t.boleta_emitida);
  const boletasEmitidas = transacciones.filter((t) => t.boleta_emitida);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <h1 className="text-lg sm:text-2xl font-bold text-gray-900">Marketplace</h1>
        <p className="text-sm text-gray-500 mt-0.5">Dashboard CFO — {anio}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto bg-gray-100 rounded-lg p-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => handleTabChange(t)}
            className={`px-3 py-2 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${vista === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
          >{t}</button>
        ))}
      </div>

      {mensaje && (
        <div className={`px-4 py-3 rounded-xl text-sm flex items-center justify-between ${mensaje.tipo === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          <span>{mensaje.texto}</span>
          <button onClick={() => setMensaje(null)} className="font-bold text-lg leading-none">&times;</button>
        </div>
      )}

      {/* ═══ TAB: Dashboard CFO ═══ */}
      {vista === "Dashboard" && (
        <div className="space-y-4">
          {/* KPI Row 1 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <CfoCard label="TOTAL VENTAS YTD" value={`$${fmt(kpis.totalVentas)}`} sub={`${kpis.totalTx} transacciones`} color="bg-blue-50" accent="text-blue-700" />
            <CfoCard label="BOLETAS BRUTO (15%)" value={`$${fmt(kpis.totalComBruta)}`} sub={`${kpis.boletasPend} pendientes de emitir`} color="bg-orange-50" accent="text-orange-700" />
            <CfoCard label="INGRESO NETO (s/IVA)" value={`$${fmt(kpis.totalComNeta)}`} sub={`IVA: $${fmt(kpis.totalIva)}`} color="bg-green-50" accent="text-green-700" />
            <CfoCard label="MARGEN NETO YTD" value={`$${fmt(kpis.totalMargen)}`} sub={`${kpis.margenPct.toFixed(1)}% sobre ventas`} color="bg-indigo-50" accent="text-indigo-700" />
          </div>

          {/* KPI Row 2 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <CfoCard label="TICKET PROMEDIO" value={`$${fmt(kpis.ticketPromedio)}`} sub="Monto medio por Tx" color="bg-gray-50" accent="text-gray-900" />
            <CfoCard label="BASE RECEPTORES" value={`$${fmt(kpis.totalBase)}`} sub="Total transferido" color="bg-blue-50" accent="text-blue-700" />
            <CfoCard label="COSTO PLATAFORMA" value={`$${fmt(kpis.totalCosto)}`} sub={`${kpis.costoPct.toFixed(2)}% sobre ventas`} color="bg-red-50" accent="text-red-700" />
            <CfoCard label="MARGEN POR TX" value={`$${fmt(kpis.margenPorTx)}`} sub="Promedio por transacción" color="bg-green-50" accent="text-green-700" />
          </div>

          {/* Resumen mensual mini */}
          {kpis.porMes.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="p-4 border-b">
                <h3 className="text-sm font-semibold text-gray-700">Resumen Mensual</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b bg-gray-50">
                      <th className="px-4 py-2 text-left font-medium">Mes</th>
                      <th className="px-3 py-2 text-right font-medium">Tx</th>
                      <th className="px-3 py-2 text-right font-medium">Ventas</th>
                      <th className="px-3 py-2 text-right font-medium">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.porMes.map((m) => (
                      <tr key={m.mes} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">{MESES[m.mes]}</td>
                        <td className="px-3 py-2 text-right">{m.tx}</td>
                        <td className="px-3 py-2 text-right font-mono">${fmt(m.ventas)}</td>
                        <td className={`px-3 py-2 text-right font-mono font-medium ${m.margen >= 0 ? "text-green-600" : "text-red-600"}`}>${fmt(m.margen)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-bold">
                      <td className="px-4 py-2">Total</td>
                      <td className="px-3 py-2 text-right">{kpis.totalTx}</td>
                      <td className="px-3 py-2 text-right font-mono">${fmt(kpis.totalVentas)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${kpis.totalMargen >= 0 ? "text-green-600" : "text-red-600"}`}>${fmt(kpis.totalMargen)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Bar chart visual */}
          {kpis.porMes.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Ventas Marketplace</h3>
                <MiniBar data={kpis.porMes.map((m) => m.ventas)} labels={kpis.porMes.map((m) => MESES[m.mes].slice(0, 3))} color="bg-blue-500" />
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Margen Neto</h3>
                <MiniBar data={kpis.porMes.map((m) => m.margen)} labels={kpis.porMes.map((m) => MESES[m.mes].slice(0, 3))} color="bg-green-500" />
              </div>
            </div>
          )}

          {/* Pagos a receptores */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <p className="text-xs text-amber-600 font-medium uppercase">Por pagar</p>
              <p className="text-xl sm:text-2xl font-bold font-mono text-amber-700 mt-1">${fmt(totalPendiente)}</p>
              <p className="text-xs text-amber-500">{pendientes.length} transacciones</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-200 p-4">
              <p className="text-xs text-green-600 font-medium uppercase">Pagado</p>
              <p className="text-xl sm:text-2xl font-bold font-mono text-green-700 mt-1">${fmt(totalPagado)}</p>
              <p className="text-xs text-green-500">{pagados.length} transacciones</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: Receptores ═══ */}
      {vista === "Receptores" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ranking receptores por rentabilidad</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b bg-gray-50/50 uppercase tracking-wider">
                  <th className="px-4 py-2.5 text-left font-medium">Receptor</th>
                  <th className="px-3 py-2.5 text-center font-medium">Trx</th>
                  <th className="px-3 py-2.5 text-right font-medium hidden sm:table-cell">Comisión NL</th>
                  <th className="px-3 py-2.5 text-right font-medium hidden md:table-cell">Costo Plat.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Margen</th>
                  <th className="px-3 py-2.5 text-right font-medium">Pendiente</th>
                  <th className="px-3 py-2.5 text-right font-medium hidden sm:table-cell">Pagado</th>
                </tr>
              </thead>
              <tbody>
                {resumenReceptores.map((r) => (
                  <tr key={r.rut} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.nombre}</div>
                      <div className="text-xs text-gray-400 font-mono">{formatRut(r.rut)}</div>
                    </td>
                    <td className="px-3 py-3 text-center">{r.transacciones}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-indigo-600 hidden sm:table-cell">${fmt(r.comisionNeta)}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-red-500 hidden md:table-cell">-${fmt(r.costoPlat)}</td>
                    <td className={`px-3 py-3 text-right font-mono font-medium ${r.margen >= 0 ? "text-green-600" : "text-red-600"}`}>${fmt(r.margen)}</td>
                    <td className="px-3 py-3 text-right font-mono text-amber-700">{r.pendiente > 0 ? `$${fmt(r.pendiente)}` : "—"}</td>
                    <td className="px-3 py-3 text-right font-mono text-green-600 hidden sm:table-cell">${fmt(r.pagado)}</td>
                  </tr>
                ))}
                {resumenReceptores.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin transacciones</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ TAB: Transacciones ═══ */}
      {vista === "Transacciones" && (
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[11px] text-gray-500 uppercase font-medium">Estado</label>
              <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}
                className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="TODOS">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="PAGADO">Pagado</option>
                <option value="ANULADO">Anulado</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 uppercase font-medium">Receptor</label>
              <select value={filtroReceptor} onChange={(e) => setFiltroReceptor(e.target.value)}
                className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Todos</option>
                {receptores.map((r) => <option key={r.rut} value={r.rut}>{r.nombre}</option>)}
              </select>
            </div>
            <button onClick={handleFiltrar} disabled={isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Filtrar</button>
            {seleccionados.size > 0 && (
              <button onClick={() => setShowPagoModal(true)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium ml-auto">
                Marcar pagado ({seleccionados.size})
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b bg-gray-50/50 uppercase tracking-wider">
                    <th className="px-3 py-2.5 w-8">
                      <input type="checkbox"
                        onChange={(e) => e.target.checked ? setSeleccionados(new Set(filtradas.filter((t) => t.estado === "PENDIENTE").map((t) => t.id))) : setSeleccionados(new Set())}
                        checked={seleccionados.size > 0} className="rounded" />
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium">Fecha</th>
                    <th className="px-3 py-2.5 text-left font-medium hidden sm:table-cell">Orden</th>
                    <th className="px-3 py-2.5 text-left font-medium">Receptor</th>
                    <th className="px-3 py-2.5 text-right font-medium">Bruto</th>
                    <th className="px-3 py-2.5 text-right font-medium hidden sm:table-cell">Base</th>
                    <th className="px-3 py-2.5 text-right font-medium hidden md:table-cell">Comisión</th>
                    <th className="px-3 py-2.5 text-center font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((t) => (
                    <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-2.5">{t.estado === "PENDIENTE" && <input type="checkbox" checked={seleccionados.has(t.id)} onChange={() => toggleSeleccion(t.id)} className="rounded" />}</td>
                      <td className="px-3 py-2.5 text-gray-600 text-xs">{new Date(t.fecha_transaccion + "T12:00:00").toLocaleDateString("es-CL")}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-indigo-700 hidden sm:table-cell">{t.orden_id}</td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs font-medium">{t.receptor_nombre}</div>
                        <div className="text-[11px] text-gray-400 font-mono">{formatRut(t.receptor_rut)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">${fmt(Number(t.monto_bruto))}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-amber-700 hidden sm:table-cell">${fmt(Number(t.base_receptor))}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-indigo-600 hidden md:table-cell">${fmt(Number(t.comision_nl_neta))}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${t.estado === "PENDIENTE" ? "bg-amber-100 text-amber-700" : t.estado === "PAGADO" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{t.estado}</span>
                      </td>
                    </tr>
                  ))}
                  {filtradas.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin transacciones</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="border-t px-4 py-2 text-xs text-gray-400">{filtradas.length} transacciones</div>
          </div>
        </div>
      )}

      {/* ═══ TAB: Boletas ═══ */}
      {vista === "Boletas" && (
        <BoletasTab
          pendientes={boletasPendientes}
          emitidas={boletasEmitidas}
          onMarcar={async (ids, folio, fecha) => {
            startTransition(async () => {
              const result = await marcarBoletaEmitida(ids, folio, fecha);
              if (result.error) setMensaje({ tipo: "error", texto: result.error });
              else {
                setMensaje({ tipo: "ok", texto: `${ids.length} boletas marcadas como emitidas` });
                const fresh = await getTransacciones({});
                if (!fresh.error) setTransacciones(fresh.data as Transaccion[]);
              }
            });
          }}
          isPending={isPending}
        />
      )}

      {/* ═══ TAB: Negocio ═══ */}
      {vista === "Negocio" && (
        <NegocioTab comparativo={comparativo} rentabilidad={rentabilidad} anio={anio} />
      )}

      {/* ═══ TAB: Carga ═══ */}
      {vista === "Carga" && <CargaPanel onSuccess={(msg) => { setMensaje({ tipo: "ok", texto: msg }); setVista("Transacciones"); }} onError={(msg) => setMensaje({ tipo: "error", texto: msg })} />}

      {/* Modal pago */}
      {showPagoModal && (
        <PagoModal
          cantidad={seleccionados.size}
          onConfirm={async (ref, fecha) => {
            startTransition(async () => {
              const result = await marcarPagado(Array.from(seleccionados), ref, fecha);
              if (result.error) setMensaje({ tipo: "error", texto: result.error });
              else {
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

// ─── Sub-components ─────────────────────────────────────────────────────────

function CfoCard({ label, value, sub, color, accent }: { label: string; value: string; sub: string; color: string; accent: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 p-3 sm:p-4 ${color}`}>
      <p className="text-[10px] sm:text-[11px] text-gray-500 uppercase font-semibold tracking-wider">{label}</p>
      <p className={`text-lg sm:text-xl font-bold font-mono mt-1 ${accent}`}>{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

function MiniBar({ data, labels, color }: { data: number[]; labels: string[]; color: string }) {
  const max = Math.max(...data.map(Math.abs), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
          <div className={`w-full rounded-t ${color} min-h-[2px]`} style={{ height: `${(Math.abs(v) / max) * 100}%` }}
            title={`${labels[i]}: $${fmt(v)}`} />
          <span className="text-[9px] text-gray-400 mt-1">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function BoletasTab({ pendientes, emitidas, onMarcar, isPending }: {
  pendientes: Transaccion[];
  emitidas: Transaccion[];
  onMarcar: (ids: number[], folio: string, fecha: string) => void;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [folio, setFolio] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));

  const totalBoletas = pendientes.reduce((s, t) => s + Number(t.comision_nl_bruta), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
          <p className="text-xs text-orange-600 font-medium uppercase">Boletas pendientes</p>
          <p className="text-xl font-bold font-mono text-orange-700 mt-1">{pendientes.length}</p>
          <p className="text-xs text-orange-500">Total: ${fmt(totalBoletas)}</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <p className="text-xs text-green-600 font-medium uppercase">Boletas emitidas</p>
          <p className="text-xl font-bold font-mono text-green-700 mt-1">{emitidas.length}</p>
        </div>
        {selected.size > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <input type="text" placeholder="Folio boleta" value={folio} onChange={(e) => setFolio(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
            <button onClick={() => onMarcar(Array.from(selected), folio, fecha)} disabled={isPending || !folio}
              className="w-full bg-indigo-600 text-white rounded py-1.5 text-sm font-medium disabled:opacity-50">
              Marcar {selected.size} emitidas
            </button>
          </div>
        )}
      </div>

      {pendientes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Transacciones sin boleta</h3>
            <button onClick={() => setSelected(selected.size === pendientes.length ? new Set() : new Set(pendientes.map((t) => t.id)))}
              className="text-xs text-indigo-600 font-medium hover:underline">
              {selected.size === pendientes.length ? "Deseleccionar" : "Seleccionar todas"}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b bg-gray-50 uppercase">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 text-left font-medium">Fecha</th>
                  <th className="px-3 py-2 text-left font-medium">Receptor</th>
                  <th className="px-3 py-2 text-right font-medium">Monto cobrado</th>
                  <th className="px-3 py-2 text-right font-medium">Boleta (15%)</th>
                  <th className="px-3 py-2 text-right font-medium hidden sm:table-cell">Neto s/IVA</th>
                  <th className="px-3 py-2 text-right font-medium hidden sm:table-cell">IVA</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-2"><input type="checkbox" checked={selected.has(t.id)} onChange={() => { const n = new Set(selected); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); setSelected(n); }} className="rounded" /></td>
                    <td className="px-3 py-2 text-xs">{new Date(t.fecha_transaccion + "T12:00:00").toLocaleDateString("es-CL")}</td>
                    <td className="px-3 py-2 text-xs font-medium">{t.receptor_nombre}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">${fmt(Number(t.monto_bruto))}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-bold text-orange-700">${fmt(Number(t.comision_nl_bruta))}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-indigo-600 hidden sm:table-cell">${fmt(Number(t.comision_nl_neta))}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-gray-500 hidden sm:table-cell">${fmt(Number(t.iva_comision))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold text-sm">
                  <td colSpan={4} className="px-3 py-2 text-right">Total boletas:</td>
                  <td className="px-3 py-2 text-right font-mono text-orange-700">${fmt(totalBoletas)}</td>
                  <td className="px-3 py-2 text-right font-mono text-indigo-600 hidden sm:table-cell">${fmt(pendientes.reduce((s, t) => s + Number(t.comision_nl_neta), 0))}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-500 hidden sm:table-cell">${fmt(pendientes.reduce((s, t) => s + Number(t.iva_comision), 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function NegocioTab({ comparativo, rentabilidad, anio }: { comparativo: ComparativoNegocio[] | null; rentabilidad: RentabilidadPlataforma[] | null; anio: number }) {
  if (!comparativo) return <div className="bg-white rounded-xl border p-8 text-center"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div><p className="text-sm text-gray-500 mt-3">Cargando...</p></div>;

  const totalIngresos = comparativo.reduce((s, c) => s + c.ingresos, 0);
  const susc = comparativo.find((c) => c.linea === "Suscripciones");
  const mkt = comparativo.find((c) => c.linea === "Marketplace");
  const suscPct = totalIngresos > 0 ? ((susc?.ingresos || 0) / totalIngresos) * 100 : 0;
  const mktPct = totalIngresos > 0 ? ((mkt?.ingresos || 0) / totalIngresos) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Distribución ingresos */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Distribución de Ingresos — {anio}</h3>
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden flex">
            <div className="bg-blue-500 h-full transition-all" style={{ width: `${suscPct}%` }} title={`Suscripciones: ${suscPct.toFixed(1)}%`} />
            <div className="bg-purple-500 h-full transition-all" style={{ width: `${mktPct}%` }} title={`Marketplace: ${mktPct.toFixed(1)}%`} />
          </div>
        </div>
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-500"></div>
            <span className="text-gray-600">Suscripciones <span className="font-bold">{suscPct.toFixed(1)}%</span></span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-purple-500"></div>
            <span className="text-gray-600">Marketplace <span className="font-bold">{mktPct.toFixed(1)}%</span></span>
          </div>
        </div>
      </div>

      {/* Cards comparativo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {comparativo.map((c) => {
          const isSusc = c.linea === "Suscripciones";
          const color = isSusc ? "blue" : "purple";
          return (
            <div key={c.linea} className={`bg-${color}-50 rounded-xl border border-${color}-200 overflow-hidden`}>
              <div className={`bg-${color}-100 px-4 py-3 flex items-center justify-between`}>
                <h4 className="font-semibold text-gray-900">{c.linea}</h4>
                <span className="text-xs text-gray-500">{c.transacciones} docs</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-gray-500">Ingresos netos</p>
                    <p className={`font-mono font-bold text-lg text-${color}-700`}>${fmt(c.ingresos)}</p>
                  </div>
                  {!isSusc && (
                    <div>
                      <p className="text-[11px] text-gray-500">Costos plataforma</p>
                      <p className="font-mono font-bold text-lg text-red-600">-${fmt(c.costos)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] text-gray-500">Margen</p>
                    <p className={`font-mono font-bold text-lg ${c.margen >= 0 ? "text-green-700" : "text-red-700"}`}>${fmt(c.margen)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500">% del total</p>
                    <p className="font-mono font-bold text-lg text-gray-900">{totalIngresos > 0 ? ((c.ingresos / totalIngresos) * 100).toFixed(1) : 0}%</p>
                  </div>
                </div>

                {/* Mini bar por mes */}
                {c.por_mes.some((m) => m.ingresos > 0) && (
                  <div>
                    <p className="text-[11px] text-gray-500 mb-1">Ingresos mensuales</p>
                    <MiniBar
                      data={c.por_mes.map((m) => m.ingresos)}
                      labels={c.por_mes.map((m) => MESES[m.mes].slice(0, 3))}
                      color={isSusc ? "bg-blue-400" : "bg-purple-400"}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rentabilidad por plataforma */}
      {rentabilidad && rentabilidad.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold text-gray-700">Rentabilidad Marketplace por Plataforma</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b bg-gray-50 uppercase">
                  <th className="px-4 py-2 text-left font-medium">Plataforma</th>
                  <th className="px-3 py-2 text-right font-medium">Trx</th>
                  <th className="px-3 py-2 text-right font-medium">Ventas</th>
                  <th className="px-3 py-2 text-right font-medium hidden sm:table-cell">Comisión NL</th>
                  <th className="px-3 py-2 text-right font-medium hidden sm:table-cell">Costo</th>
                  <th className="px-3 py-2 text-right font-medium">Margen</th>
                  <th className="px-3 py-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {rentabilidad.map((r) => (
                  <tr key={r.plataforma} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">
                      <span className={`px-2 py-0.5 rounded text-xs ${r.plataforma === "TBK" ? "bg-orange-100 text-orange-700" : "bg-sky-100 text-sky-700"}`}>
                        {r.plataforma === "TBK" ? "Transbank" : r.plataforma === "MP" ? "Mercado Pago" : r.plataforma}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{r.transacciones}</td>
                    <td className="px-3 py-2 text-right font-mono">${fmt(r.monto_bruto)}</td>
                    <td className="px-3 py-2 text-right font-mono text-indigo-600 hidden sm:table-cell">${fmt(r.comision_nl_neta)}</td>
                    <td className="px-3 py-2 text-right font-mono text-red-500 hidden sm:table-cell">-${fmt(r.costo_plataforma)}</td>
                    <td className={`px-3 py-2 text-right font-mono font-bold ${r.rentabilidad_neta >= 0 ? "text-green-600" : "text-red-600"}`}>${fmt(r.rentabilidad_neta)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{r.margen_pct.toFixed(2)}%</td>
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

function PagoModal({ cantidad, onConfirm, onClose }: { cantidad: number; onConfirm: (ref: string, fecha: string) => void; onClose: () => void }) {
  const [ref, setRef] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-900">Registrar pago</h3>
        <p className="text-sm text-gray-500">{cantidad} transacciones seleccionadas</p>
        <div>
          <label className="text-xs text-gray-500 font-medium">Fecha de pago</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 font-medium">Referencia (N° transferencia)</label>
          <input type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ej: TEF-001234" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={() => onConfirm(ref, fecha)} disabled={!ref} className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50">Confirmar pago</button>
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
        rows.push({ orden_id: vals[idxOrden], fecha_transaccion: fecha, receptor_rut: idxRut >= 0 ? vals[idxRut].replace(/\./g, "") : "", receptor_nombre: idxNombre >= 0 ? vals[idxNombre] : "", monto_bruto: monto });
      }
      setPreview(rows);
    } catch { onError("Error al procesar el archivo"); }
  }, [onError]);

  async function handleCargar() {
    if (preview.length === 0) return;
    setCargando(true);
    const result = await cargarTransacciones(preview);
    setCargando(false);
    if (result.error) onError(result.error);
    else { onSuccess(`${result.insertados} transacciones cargadas (lote: ${result.lote})`); setPreview([]); setArchivo(null); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
      <h3 className="text-base font-bold text-gray-900">Cargar transacciones</h3>
      <p className="text-sm text-gray-500">Sube un archivo CSV/TXT con las transacciones del marketplace.</p>
      <div onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-indigo-300 transition cursor-pointer"
        onClick={() => document.getElementById("mkt-file-input")?.click()}>
        <input id="mkt-file-input" type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        <svg className="w-10 h-10 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
        <p className="mt-2 text-sm text-gray-500">{archivo ? archivo.name : "Arrastra un archivo o haz clic"}</p>
      </div>

      {preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{preview.length} transacciones detectadas</span>
            <button onClick={handleCargar} disabled={cargando} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50">
              {cargando ? "Cargando..." : "Confirmar carga"}
            </button>
          </div>
          <div className="overflow-x-auto max-h-64 border rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2">Orden</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Receptor</th>
                  <th className="px-3 py-2 text-right">Monto</th><th className="px-3 py-2 text-right">Base</th><th className="px-3 py-2 text-right">Comisión</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 20).map((t, i) => {
                  const base = Math.round(t.monto_bruto / 1.15);
                  return (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-mono">{t.orden_id}</td>
                      <td className="px-3 py-1.5">{t.fecha_transaccion}</td>
                      <td className="px-3 py-1.5">{t.receptor_nombre || t.receptor_rut}</td>
                      <td className="px-3 py-1.5 text-right font-mono">${fmt(t.monto_bruto)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-amber-700">${fmt(base)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-indigo-600">${fmt(t.monto_bruto - base)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {preview.length > 20 && <div className="px-3 py-2 text-center text-gray-400 text-xs bg-gray-50">... y {preview.length - 20} más</div>}
          </div>
        </div>
      )}
    </div>
  );
}
