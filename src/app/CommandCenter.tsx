"use client";

import Link from "next/link";

type Props = {
  anio: number;
  stats: {
    comprobantes: number;
    ventas: number;
    compras: number;
    cartolaPendiente: number;
    ventasPendiente: number;
    comprasPendiente: number;
  };
};

const MODULES = [
  {
    area: "Contable",
    color: "from-indigo-500 to-indigo-700",
    items: [
      { label: "Comprobantes", href: "/contable/comprobantes", desc: "Ingresos, egresos y traspasos" },
      { label: "Centralización", href: "/contable/centralizacion", desc: "Ventas y compras → contabilidad" },
      { label: "Conciliación", href: "/contable/conciliacion", desc: "Cartola bancaria" },
      { label: "Libro Mayor", href: "/contable/libro-mayor", desc: "Movimientos por cuenta" },
      { label: "Balance", href: "/contable/balance", desc: "8 columnas" },
      { label: "Plan de Cuentas", href: "/contable/plan-cuentas", desc: "Estructura contable" },
    ],
  },
  {
    area: "Comercial",
    color: "from-emerald-500 to-emerald-700",
    items: [
      { label: "Clientes", href: "/comercial/clientes", desc: "Ficha y gestión comercial" },
      { label: "Facturación", href: "/comercial/facturacion", desc: "Documentos emitidos" },
      { label: "Cuentas por Cobrar", href: "/comercial/cxc", desc: "Documentos pendientes" },
      { label: "Cobranza", href: "/comercial/cobranza", desc: "Gestión por antigüedad" },
      { label: "Suscripciones", href: "/comercial/suscripciones", desc: "Ingresos recurrentes" },
    ],
  },
  {
    area: "Gestión Financiera",
    color: "from-amber-500 to-orange-600",
    items: [
      { label: "Dashboard", href: "/gestion/dashboard", desc: "KPIs y panorama general" },
      { label: "Estado Resultados", href: "/gestion/estado-resultados", desc: "Ingresos vs gastos mensual" },
      { label: "Situación Financiera", href: "/gestion/situacion-financiera", desc: "Balance general" },
      { label: "Indicadores", href: "/gestion/indicadores", desc: "Ratios financieros" },
      { label: "Rentabilidad", href: "/gestion/rentabilidad", desc: "Márgenes y composición" },
    ],
  },
];

export default function CommandCenter({ anio, stats }: Props) {
  const pendientes = stats.ventasPendiente + stats.comprasPendiente + stats.cartolaPendiente;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Centro de Comando</h1>
        <p className="text-gray-500 mt-1">Notifica Legal SpA — {anio}</p>
      </div>

      {/* Alertas / Pendientes */}
      {pendientes > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-amber-800 mb-3">Tareas Pendientes</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {stats.ventasPendiente > 0 && (
              <Link href="/contable/centralizacion" className="flex items-center gap-3 bg-white rounded-lg p-3 border border-amber-100 hover:border-amber-300 transition">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <span className="text-lg font-bold text-amber-700">{stats.ventasPendiente}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Ventas sin centralizar</p>
                  <p className="text-xs text-gray-500">Requiere acción</p>
                </div>
              </Link>
            )}
            {stats.comprasPendiente > 0 && (
              <Link href="/contable/centralizacion" className="flex items-center gap-3 bg-white rounded-lg p-3 border border-amber-100 hover:border-amber-300 transition">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <span className="text-lg font-bold text-amber-700">{stats.comprasPendiente}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Compras sin centralizar</p>
                  <p className="text-xs text-gray-500">Requiere acción</p>
                </div>
              </Link>
            )}
            {stats.cartolaPendiente > 0 && (
              <Link href="/contable/conciliacion" className="flex items-center gap-3 bg-white rounded-lg p-3 border border-amber-100 hover:border-amber-300 transition">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <span className="text-lg font-bold text-amber-700">{stats.cartolaPendiente}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Cartola sin contabilizar</p>
                  <p className="text-xs text-gray-500">Requiere acción</p>
                </div>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Comprobantes</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.comprobantes}</p>
          <p className="text-xs text-gray-400">vigentes {anio}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Ventas SII</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.ventas}</p>
          <p className="text-xs text-gray-400">documentos {anio}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Compras SII</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.compras}</p>
          <p className="text-xs text-gray-400">documentos {anio}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Pendientes</p>
          <p className={`text-2xl font-bold ${pendientes > 0 ? "text-amber-600" : "text-green-600"} mt-1`}>{pendientes}</p>
          <p className="text-xs text-gray-400">por procesar</p>
        </div>
      </div>

      {/* Module tiles */}
      {MODULES.map((mod) => (
        <div key={mod.area}>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">{mod.area}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {mod.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 hover:shadow-md transition-all group"
              >
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${mod.color} flex items-center justify-center mb-3 group-hover:scale-105 transition-transform shadow-sm`}>
                  <span className="text-white text-xs font-bold">{item.label[0]}</span>
                </div>
                <p className="text-sm font-medium text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
