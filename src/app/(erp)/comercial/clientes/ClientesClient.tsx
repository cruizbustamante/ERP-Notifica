"use client";

import { useState } from "react";
import { formatMonto } from "@/lib/contabilidad/core";

type Cliente = {
  rut: string;
  razon_social: string;
  giro: string;
  email: string;
  telefono: string;
  comuna: string;
  totalVentas: number;
  cantDocs: number;
  ultimaVenta: string | null;
  saldoPendiente: number;
};

type FichaComercial = {
  rut: string;
  razon_social: string;
  email: string;
  giro: string;
  direccion: string;
  telefono: string;
  facturacion_tipo: string;
  tipo_doc: string;
  plan: string;
  valor_plan: number;
  fecha_inicio: string;
  estado: string;
  notas: string;
};

type Props = {
  clientes: Cliente[];
  fichas: FichaComercial[];
  totalClientes: number;
  totalVentasGlobal: number;
  clientesConDeuda: number;
};

function avatarColor(name: string) {
  const colors = [
    "bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-purple-600",
    "bg-rose-600", "bg-cyan-600", "bg-indigo-600", "bg-teal-600",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function ClientesClient({ clientes, fichas, totalClientes, totalVentasGlobal, clientesConDeuda }: Props) {
  const [buscar, setBuscar] = useState("");
  const [ordenar, setOrdenar] = useState<"ventas" | "nombre" | "deuda">("ventas");
  const [tab, setTab] = useState<"todos" | "activos" | "inactivos" | "deuda">("todos");
  const [selectedRut, setSelectedRut] = useState<string | null>(null);

  const fichaMap = new Map(fichas.map((f) => [f.rut, f]));

  const filtrados = clientes
    .filter((c) => {
      if (tab === "activos") {
        const f = fichaMap.get(c.rut);
        if (!f || f.estado !== "ACTIVO") return false;
      }
      if (tab === "inactivos") {
        const f = fichaMap.get(c.rut);
        if (!f || f.estado !== "INACTIVO") return false;
      }
      if (tab === "deuda") return c.saldoPendiente > 0;
      const q = buscar.toLowerCase();
      return !q || c.razon_social.toLowerCase().includes(q) || c.rut.includes(q);
    })
    .filter((c) => {
      if (!buscar) return true;
      const q = buscar.toLowerCase();
      return c.razon_social.toLowerCase().includes(q) || c.rut.includes(q);
    })
    .sort((a, b) => {
      if (ordenar === "ventas") return b.totalVentas - a.totalVentas;
      if (ordenar === "deuda") return b.saldoPendiente - a.saldoPendiente;
      return a.razon_social.localeCompare(b.razon_social);
    });

  const selected = selectedRut ? clientes.find((c) => c.rut === selectedRut) : null;
  const selectedFicha = selectedRut ? fichaMap.get(selectedRut) : null;
  const activos = fichas.filter((f) => f.estado === "ACTIVO").length;
  const inactivos = fichas.filter((f) => f.estado === "INACTIVO").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1e1b4b]">📋 Ficha Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestión comercial y datos de clientes</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card bg-white rounded-xl border border-gray-200 p-4 border-l-4 border-l-purple-500">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">👥 Receptores Vigentes</p>
          <p className="text-2xl font-bold text-[#1e1b4b] mt-1">{activos}</p>
        </div>
        <div className="kpi-card bg-white rounded-xl border border-gray-200 p-4 border-l-4 border-l-emerald-500">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">📈 Ventas Totales</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1 font-mono">{formatMonto(totalVentasGlobal)}</p>
        </div>
        <div className="kpi-card bg-white rounded-xl border border-gray-200 p-4 border-l-4 border-l-blue-500">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">🆕 Total Clientes</p>
          <p className="text-2xl font-bold text-[#1e1b4b] mt-1">{totalClientes}</p>
        </div>
        <div className={`kpi-card bg-white rounded-xl border border-gray-200 p-4 border-l-4 ${clientesConDeuda > 0 ? "border-l-amber-500" : "border-l-green-500"}`}>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">💰 Con Deuda CxC</p>
          <p className={`text-2xl font-bold mt-1 ${clientesConDeuda > 0 ? "text-amber-600" : "text-green-600"}`}>{clientesConDeuda}</p>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-3 pb-0 border-b border-gray-100 overflow-x-auto">
          {([
            { key: "todos", label: "Todos", count: clientes.length },
            { key: "activos", label: "Activos", count: activos },
            { key: "inactivos", label: "Inactivos", count: inactivos },
            { key: "deuda", label: "Con Deuda", count: clientesConDeuda },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                tab === t.key
                  ? "border-[#1e1b8a] text-[#1e1b8a]"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {t.label}
              <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                t.key === "deuda" && t.count > 0
                  ? "bg-amber-100 text-amber-700"
                  : tab === t.key ? "bg-[#e8e7f8] text-[#1e1b8a]" : "bg-gray-100 text-gray-500"
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 bg-[#fafbfd]">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por RUT o razón social..."
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5]"
            />
          </div>
          <select
            value={ordenar}
            onChange={(e) => setOrdenar(e.target.value as "ventas" | "nombre" | "deuda")}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#4f46e5]"
          >
            <option value="ventas">Mayor ventas</option>
            <option value="deuda">Mayor deuda</option>
            <option value="nombre">Alfabético</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>RUT</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Facturación</th>
                <th className="text-right">Tarifa UF</th>
                <th className="text-right">Deuda CxC</th>
                <th className="text-right">Docs</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c, i) => {
                const ficha = fichaMap.get(c.rut);
                const estado = ficha?.estado || "—";
                const isInactive = estado === "INACTIVO";
                return (
                  <tr
                    key={c.rut}
                    className={`cursor-pointer ${isInactive ? "opacity-55" : ""}`}
                    onClick={() => setSelectedRut(c.rut)}
                  >
                    <td className="text-center text-gray-400">{i + 1}</td>
                    <td className="font-mono text-xs">{c.rut}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full ${avatarColor(c.razon_social)} flex items-center justify-center flex-shrink-0`}>
                          <span className="text-xs font-bold text-white">{c.razon_social[0]}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{c.razon_social}</p>
                          {c.email && <p className="text-[11px] text-gray-400 truncate">{c.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${estado === "ACTIVO" ? "badge-active" : estado === "INACTIVO" ? "badge-inactive" : ""}`}>
                        {estado}
                      </span>
                    </td>
                    <td>
                      {ficha?.facturacion_tipo && (
                        <span className={`badge ${ficha.facturacion_tipo === "Mes Anticipado" ? "badge-anticipado" : "badge-vencido"}`}>
                          {ficha.facturacion_tipo === "Mes Anticipado" ? "Anticipado" : "Vencido"}
                        </span>
                      )}
                    </td>
                    <td className="text-right font-mono text-sm">
                      {ficha?.valor_plan ? `${ficha.valor_plan} UF` : "—"}
                    </td>
                    <td className={`text-right font-mono text-sm ${c.saldoPendiente > 0 ? "text-amber-600 font-semibold" : "text-gray-400"}`}>
                      {c.saldoPendiente > 0 ? formatMonto(c.saldoPendiente) : "—"}
                    </td>
                    <td className="text-right">{c.cantDocs || "—"}</td>
                    <td>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedRut(c.rut); }}
                        className="text-[#4f46e5] hover:text-[#1e1b8a] text-xs font-medium"
                      >
                        Ver ficha
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-gray-400">Sin resultados</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t px-4 py-2 text-xs text-gray-400 bg-[#fafbfd]">
          {filtrados.length} de {clientes.length} clientes
        </div>
      </div>

      {/* Modal Detalle Cliente */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-10 px-4" onClick={() => setSelectedRut(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden animate-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header - Gradient */}
            <div className="relative px-6 py-5 text-white" style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)" }}>
              <button
                onClick={() => setSelectedRut(null)}
                className="absolute top-4 right-4 text-white/60 hover:text-white text-xl"
              >×</button>
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-full ${avatarColor(selected.razon_social)} flex items-center justify-center ring-3 ring-white/20`}>
                  <span className="text-xl font-bold text-white">{selected.razon_social[0]}</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold">{selected.razon_social}</h2>
                  <p className="text-sm text-white/70">{selected.rut}</p>
                  <div className="flex gap-2 mt-1">
                    {selectedFicha && (
                      <>
                        <span className={`badge ${selectedFicha.estado === "ACTIVO" ? "badge-active" : "badge-inactive"}`}>
                          {selectedFicha.estado}
                        </span>
                        {selectedFicha.facturacion_tipo && (
                          <span className={`badge ${selectedFicha.facturacion_tipo === "Mes Anticipado" ? "badge-anticipado" : "badge-vencido"}`}>
                            {selectedFicha.facturacion_tipo}
                          </span>
                        )}
                        {selectedFicha.plan && (
                          <span className="badge badge-info">{selectedFicha.plan}</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-4 border-b border-gray-100">
              <div className="text-center py-3 border-r border-gray-100">
                <p className="text-[10px] text-gray-400 uppercase font-semibold">Tarifa</p>
                <p className="text-lg font-bold text-[#1e1b4b]">{selectedFicha?.valor_plan || 0} UF</p>
              </div>
              <div className="text-center py-3 border-r border-gray-100">
                <p className="text-[10px] text-gray-400 uppercase font-semibold">Ventas</p>
                <p className="text-lg font-bold text-emerald-600 font-mono">{formatMonto(selected.totalVentas)}</p>
              </div>
              <div className="text-center py-3 border-r border-gray-100">
                <p className="text-[10px] text-gray-400 uppercase font-semibold">Deuda CxC</p>
                <p className={`text-lg font-bold font-mono ${selected.saldoPendiente > 0 ? "text-amber-600" : "text-green-600"}`}>
                  {selected.saldoPendiente > 0 ? formatMonto(selected.saldoPendiente) : "$0"}
                </p>
              </div>
              <div className="text-center py-3">
                <p className="text-[10px] text-gray-400 uppercase font-semibold">Documentos</p>
                <p className="text-lg font-bold text-[#1e1b4b]">{selected.cantDocs}</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto max-h-[45vh]">
              {selected.saldoPendiente > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-3">
                  <span className="text-lg">⚠️</span>
                  <div>
                    <p className="text-sm font-semibold text-red-800">Deuda pendiente: {formatMonto(selected.saldoPendiente)}</p>
                    <p className="text-xs text-red-600">Cliente con saldo por cobrar</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <div>
                  <p className="text-[11px] text-gray-400 uppercase font-semibold mb-3">👤 Datos del Cliente</p>
                  <div className="space-y-2">
                    <InfoRow label="RUT" value={selected.rut} />
                    <InfoRow label="Razón Social" value={selected.razon_social} />
                    <InfoRow label="Giro" value={selectedFicha?.giro || selected.giro || "—"} />
                    <InfoRow label="Dirección" value={selectedFicha?.direccion || "—"} />
                    <InfoRow label="Email" value={selectedFicha?.email || selected.email || "—"} />
                    <InfoRow label="Teléfono" value={selectedFicha?.telefono || selected.telefono || "—"} />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 uppercase font-semibold mb-3">💰 Datos Comerciales</p>
                  <div className="space-y-2">
                    <InfoRow label="Plan" value={selectedFicha?.plan || "—"} />
                    <InfoRow label="Tarifa Suscripción" value={selectedFicha?.valor_plan ? `${selectedFicha.valor_plan} UF` : "—"} />
                    <InfoRow label="Facturación" value={selectedFicha?.facturacion_tipo || "—"} />
                    <InfoRow label="Tipo Doc." value={selectedFicha?.tipo_doc || "—"} />
                    <InfoRow label="Fecha Ingreso" value={selectedFicha?.fecha_inicio || "—"} />
                    <InfoRow label="Estado" value={selectedFicha?.estado || "—"} />
                  </div>
                </div>
              </div>

              {selectedFicha?.notas && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <p className="text-[11px] text-gray-400 uppercase font-semibold mb-1">📝 Notas</p>
                  <p className="text-sm text-gray-700">{selectedFicha.notas}</p>
                </div>
              )}

              {selected.ultimaVenta && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-[11px] text-blue-400 uppercase font-semibold mb-1">📅 Última Venta</p>
                  <p className="text-sm text-blue-700">{selected.ultimaVenta}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-6 py-3 flex justify-end gap-3 bg-[#fafbfd]">
              <button
                onClick={() => setSelectedRut(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-gray-400 w-28 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  );
}
