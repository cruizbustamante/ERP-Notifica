"use client";

import Link from "next/link";
import YearSelector from "@/components/YearSelector";

type Props = {
  anio: number;
  periodos: { anio: number; estado: string }[];
  stats: {
    comprobantes: number;
    ventas: number;
    compras: number;
    cartolaPendiente: number;
    ventasPendiente: number;
    comprasPendiente: number;
    saldoCtaCte: number;
  };
};

const ACCIONES_RAPIDAS = [
  { label: "Nuevo Comprobante", href: "/contable/comprobantes/nuevo", icon: "📋" },
  { label: "Centralizar", href: "/contable/centralizacion", icon: "🔄" },
  { label: "Conciliación", href: "/contable/conciliacion", icon: "🏦" },
  { label: "Ficha Clientes", href: "/comercial/clientes", icon: "👥" },
  { label: "Cobranza", href: "/comercial/cobranza", icon: "💰" },
];

export default function CommandCenter({ anio, periodos, stats }: Props) {
  const pendientes = stats.ventasPendiente + stats.comprasPendiente + stats.cartolaPendiente;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1e1b4b]">📊 Centro de Comando</h1>
          <p className="text-sm text-gray-500 mt-1">Notifica Legal SpA — Período {anio}</p>
        </div>
        <YearSelector anio={anio} periodos={periodos} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="kpi-card bg-white rounded-xl border border-gray-200 p-5 border-l-4 border-l-indigo-600 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-lg">🏦</div>
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Saldo Cta. Cte.</p>
              <p className="text-xl font-bold text-[#1e1b4b]">${stats.saldoCtaCte.toLocaleString("es-CL")}</p>
              <p className="text-[11px] text-gray-400">Banco Santander</p>
            </div>
          </div>
        </div>

        <div className="kpi-card bg-white rounded-xl border border-gray-200 p-5 border-l-4 border-l-blue-500">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-lg">📋</div>
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Comprobantes</p>
              <p className="text-2xl font-bold text-[#1e1b4b]">{stats.comprobantes}</p>
              <p className="text-[11px] text-gray-400">vigentes {anio}</p>
            </div>
          </div>
        </div>

        <div className="kpi-card bg-white rounded-xl border border-gray-200 p-5 border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-lg">📈</div>
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Ventas SII</p>
              <p className="text-2xl font-bold text-[#1e1b4b]">{stats.ventas}</p>
              <p className="text-[11px] text-gray-400">documentos {anio}</p>
            </div>
          </div>
        </div>

        <div className="kpi-card bg-white rounded-xl border border-gray-200 p-5 border-l-4 border-l-amber-500">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-lg">🛒</div>
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Compras SII</p>
              <p className="text-2xl font-bold text-[#1e1b4b]">{stats.compras}</p>
              <p className="text-[11px] text-gray-400">documentos {anio}</p>
            </div>
          </div>
        </div>

        <div className={`kpi-card bg-white rounded-xl border border-gray-200 p-5 border-l-4 ${pendientes > 0 ? "border-l-red-500" : "border-l-green-500"}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${pendientes > 0 ? "bg-red-50" : "bg-green-50"} flex items-center justify-center text-lg`}>
              {pendientes > 0 ? "⚠️" : "✅"}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Pendientes</p>
              <p className={`text-2xl font-bold ${pendientes > 0 ? "text-red-600" : "text-green-600"}`}>{pendientes}</p>
              <p className="text-[11px] text-gray-400">por procesar</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tareas Pendientes */}
        <div className="lg:col-span-2">
          {pendientes > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-amber-50/50">
                <h3 className="text-sm font-semibold text-[#1e1b4b]">⚠️ Tareas Pendientes</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {stats.ventasPendiente > 0 && (
                  <Link href="/contable/centralizacion" className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <span className="text-sm font-bold text-blue-700">{stats.ventasPendiente}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">Ventas sin centralizar</p>
                      <p className="text-xs text-gray-400">Requiere contabilización</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}
                {stats.comprasPendiente > 0 && (
                  <Link href="/contable/centralizacion" className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                      <span className="text-sm font-bold text-amber-700">{stats.comprasPendiente}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">Compras sin centralizar</p>
                      <p className="text-xs text-gray-400">Requiere contabilización</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}
                {stats.cartolaPendiente > 0 && (
                  <Link href="/contable/conciliacion" className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <span className="text-sm font-bold text-purple-700">{stats.cartolaPendiente}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">Cartola sin contabilizar</p>
                      <p className="text-xs text-gray-400">Movimientos bancarios pendientes</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <div className="text-4xl mb-3">✅</div>
              <h3 className="font-semibold text-gray-800">Todo al día</h3>
              <p className="text-sm text-gray-400 mt-1">No hay tareas pendientes por procesar</p>
            </div>
          )}

          {/* Resumen Operacional */}
          <div className="bg-white rounded-xl border border-gray-200 mt-6 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-[#1e1b4b]">📊 Resumen Operacional</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {[
                { label: "Comprobantes vigentes", value: stats.comprobantes, color: "text-[#1e1b4b]" },
                { label: "Documentos de venta", value: stats.ventas, color: "text-emerald-600" },
                { label: "Documentos de compra", value: stats.compras, color: "text-amber-600" },
                { label: "Pendientes por centralizar", value: stats.ventasPendiente + stats.comprasPendiente, color: "text-blue-600" },
                { label: "Cartola por contabilizar", value: stats.cartolaPendiente, color: "text-purple-600" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-gray-600">{item.label}</span>
                  <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Acciones Rápidas */}
        <div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-[#1e1b4b]">🎯 Acciones Rápidas</h3>
            </div>
            <div className="p-3 space-y-1">
              {ACCIONES_RAPIDAS.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-[#f5f6fa] transition group"
                >
                  <span className="text-lg">{a.icon}</span>
                  <span className="text-sm font-medium text-gray-700 group-hover:text-[#1e1b8a]">{a.label}</span>
                  <svg className="w-3.5 h-3.5 text-gray-300 ml-auto group-hover:text-[#1e1b8a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>

          {/* Módulos */}
          <div className="bg-white rounded-xl border border-gray-200 mt-6 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-[#1e1b4b]">🗂️ Módulos</h3>
            </div>
            <div className="p-3 space-y-1">
              {[
                { label: "Contabilidad", href: "/contable/comprobantes", icon: "📋", desc: "Comprobantes, reportes, plan de cuentas" },
                { label: "Gestión Comercial", href: "/comercial/clientes", icon: "💰", desc: "Clientes, facturación, cobranza" },
                { label: "Gestión Financiera", href: "/gestion/dashboard", icon: "📈", desc: "Dashboard, indicadores, rentabilidad" },
              ].map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-[#f5f6fa] transition group"
                >
                  <span className="text-lg">{m.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700 group-hover:text-[#1e1b8a]">{m.label}</p>
                    <p className="text-[11px] text-gray-400">{m.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
