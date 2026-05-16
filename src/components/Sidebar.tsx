"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

type Props = {
  user: { email: string; rol: string; nombre: string };
};

type MenuItem = {
  label: string;
  href: string;
};

type MenuSection = {
  area: string;
  icon: string;
  items: MenuItem[];
};

const MENU: MenuSection[] = [
  {
    area: "Contable",
    icon: "C",
    items: [
      { label: "Plan de Cuentas", href: "/contable/plan-cuentas" },
      { label: "Comprobantes", href: "/contable/comprobantes" },
      { label: "Centralización", href: "/contable/centralizacion" },
      { label: "Conciliación Bancaria", href: "/contable/conciliacion" },
      { label: "Libros Tributarios", href: "/contable/libros-tributarios" },
      { label: "Libro Diario", href: "/contable/libro-diario" },
      { label: "Libro Mayor", href: "/contable/libro-mayor" },
      { label: "Balance 8 Columnas", href: "/contable/balance" },
      { label: "Cierre de Ejercicio", href: "/contable/cierre" },
    ],
  },
  {
    area: "Comercial",
    icon: "V",
    items: [
      { label: "Clientes", href: "/comercial/clientes" },
      { label: "Facturación", href: "/comercial/facturacion" },
      { label: "Cuentas por Cobrar", href: "/comercial/cxc" },
      { label: "Cuentas por Pagar", href: "/comercial/cxp" },
      { label: "Cobranza", href: "/comercial/cobranza" },
      { label: "Suscripciones", href: "/comercial/suscripciones" },
    ],
  },
  {
    area: "Gestión Financiera",
    icon: "G",
    items: [
      { label: "Dashboard", href: "/gestion/dashboard" },
      { label: "Estado de Resultados", href: "/gestion/estado-resultados" },
      { label: "Situación Financiera", href: "/gestion/situacion-financiera" },
      { label: "Flujo de Efectivo", href: "/gestion/flujo-efectivo" },
      { label: "Rentabilidad", href: "/gestion/rentabilidad" },
      { label: "Indicadores", href: "/gestion/indicadores" },
      { label: "Cartera", href: "/gestion/cartera" },
    ],
  },
];

export default function Sidebar({ user }: Props) {
  const pathname = usePathname();
  const [openSections, setOpenSections] = useState<string[]>(
    MENU.map((s) => s.area)
  );
  const [collapsed, setCollapsed] = useState(false);

  function toggleSection(area: string) {
    setOpenSections((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  }

  const areaColors: Record<string, string> = {
    Contable: "bg-indigo-500",
    Comercial: "bg-emerald-500",
    "Gestión Financiera": "bg-amber-500",
  };

  return (
    <aside
      className={`fixed top-0 left-0 h-screen bg-[#1e1b4b] text-white flex flex-col transition-all duration-300 z-50 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Header */}
      <div className="px-4 py-5 border-b border-indigo-800 flex items-center justify-between">
        {!collapsed && (
          <div>
            <h1 className="text-lg font-bold tracking-tight">Notifica Legal</h1>
            <p className="text-[11px] text-indigo-300/70">ERP Contable</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-indigo-300 hover:text-white transition p-1"
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        {MENU.map((section) => (
          <div key={section.area} className="mb-1">
            <button
              onClick={() => toggleSection(section.area)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-indigo-900/50 transition ${
                collapsed ? "justify-center" : ""
              }`}
            >
              <span
                className={`w-7 h-7 rounded-lg ${areaColors[section.area]} flex items-center justify-center text-xs font-bold shrink-0`}
              >
                {section.icon}
              </span>
              {!collapsed && (
                <>
                  <span className="text-sm font-semibold text-indigo-100 flex-1">
                    {section.area}
                  </span>
                  <span
                    className={`text-[10px] text-indigo-400 transition-transform ${
                      openSections.includes(section.area) ? "rotate-180" : ""
                    }`}
                  >
                    ▼
                  </span>
                </>
              )}
            </button>

            {!collapsed && openSections.includes(section.area) && (
              <div className="ml-4 border-l border-indigo-700/50 pl-4 py-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block py-1.5 px-2 text-[13px] rounded-md transition ${
                        isActive
                          ? "bg-indigo-600/50 text-white font-medium"
                          : "text-indigo-300/80 hover:text-white hover:bg-indigo-800/40"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* User */}
      {!collapsed && (
        <div className="border-t border-indigo-800 px-4 py-3">
          <div className="text-sm font-medium text-indigo-100 truncate">
            {user.nombre || user.email.split("@")[0]}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] bg-indigo-600/50 text-indigo-200 px-2 py-0.5 rounded uppercase">
              {user.rol}
            </span>
            <span className="text-[10px] text-indigo-400/60 truncate">{user.email}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
