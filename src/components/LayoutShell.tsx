"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Props = {
  user: { email: string; rol: string; nombre: string };
  children: React.ReactNode;
};

const NAV_SECTIONS = [
  {
    label: "Dashboard",
    icon: "📊",
    href: "/inicio",
    segment: "inicio",
  },
  {
    label: "Contabilidad",
    icon: "📋",
    href: "/contable/comprobantes",
    segment: "contable",
    children: [
      { label: "Comprobantes", href: "/contable/comprobantes" },
      { label: "Centralización", href: "/contable/centralizacion" },
      { label: "Conciliación", href: "/contable/conciliacion" },
      { label: "Libro Mayor", href: "/contable/libro-mayor" },
      { label: "Balance", href: "/contable/balance" },
      { label: "Plan de Cuentas", href: "/contable/plan-cuentas" },
      { label: "Cierre Anual", href: "/contable/cierre" },
    ],
  },
  {
    label: "Gestión Comercial",
    icon: "💰",
    href: "/comercial/clientes",
    segment: "comercial",
    children: [
      { label: "Ficha Clientes", href: "/comercial/clientes" },
      { label: "Facturación", href: "/comercial/facturacion" },
      { label: "CxC", href: "/comercial/cxc" },
      { label: "CxP", href: "/comercial/cxp" },
      { label: "Cobranza", href: "/comercial/cobranza" },
      { label: "Suscripciones", href: "/comercial/suscripciones" },
    ],
  },
  {
    label: "Gestión Financiera",
    icon: "📈",
    href: "/gestion/dashboard",
    segment: "gestion",
    children: [
      { label: "Dashboard", href: "/gestion/dashboard" },
      { label: "Estado Resultados", href: "/gestion/estado-resultados" },
      { label: "Situación Financiera", href: "/gestion/situacion-financiera" },
      { label: "Flujo Efectivo", href: "/gestion/flujo-efectivo" },
      { label: "Indicadores", href: "/gestion/indicadores" },
      { label: "Rentabilidad", href: "/gestion/rentabilidad" },
      { label: "Cartera", href: "/gestion/cartera" },
    ],
  },
];

export default function LayoutShell({ user, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const activeSegment = pathname.split("/")[1] || "";

  useEffect(() => {
    const section = NAV_SECTIONS.find((s) => s.segment === activeSegment);
    if (section?.children) setExpandedSection(section.segment);
    setSidebarOpen(false);
  }, [pathname, activeSegment]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function toggleSection(segment: string) {
    setExpandedSection((prev) => (prev === segment ? null : segment));
  }

  const initials = (user.nombre || user.email)[0].toUpperCase();

  return (
    <div className="min-h-screen bg-[#f5f6fa]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-50 flex flex-col transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        style={{ width: "var(--sb-w)" }}
      >
        <div className="flex flex-col h-full bg-[#1e1b8a] text-white">
          {/* Logo */}
          <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
            <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur">
              <span className="text-white text-sm font-bold">NL</span>
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">Notifica Legal</div>
              <div className="text-[10px] text-white/50">ERP Contable</div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-3 px-3">
            {NAV_SECTIONS.map((section) => {
              const isActive = activeSegment === section.segment;
              const isExpanded = expandedSection === section.segment;

              if (!section.children) {
                return (
                  <Link
                    key={section.segment}
                    href={section.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm transition-all
                      ${isActive
                        ? "bg-white/15 text-white font-medium"
                        : "text-white/70 hover:bg-white/8 hover:text-white"
                      }`}
                  >
                    <span className="text-base">{section.icon}</span>
                    <span>{section.label}</span>
                  </Link>
                );
              }

              return (
                <div key={section.segment} className="mb-1">
                  <button
                    onClick={() => toggleSection(section.segment)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-sm transition-all
                      ${isActive
                        ? "bg-white/15 text-white font-medium"
                        : "text-white/70 hover:bg-white/8 hover:text-white"
                      }`}
                  >
                    <span className="text-base">{section.icon}</span>
                    <span className="flex-1 text-left">{section.label}</span>
                    <svg
                      className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="ml-4 mt-1 space-y-0.5 border-l border-white/10 pl-3">
                      {section.children.map((child) => {
                        const childActive = pathname === child.href || pathname.startsWith(child.href + "/");
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`block px-3 py-1.5 rounded-md text-[13px] transition-all
                              ${childActive
                                ? "text-[#60a5fa] font-medium bg-white/8"
                                : "text-white/55 hover:text-white/90 hover:bg-white/5"
                              }`}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* User footer */}
          <div className="border-t border-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
                <span className="text-xs font-semibold text-white">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white/90 truncate">
                  {user.nombre || user.email.split("@")[0]}
                </p>
                <p className="text-[10px] text-white/40">{user.rol}</p>
              </div>
              <button
                onClick={handleLogout}
                className="text-white/40 hover:text-red-400 transition p-1"
                title="Salir"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-[240px] min-h-screen">
        {/* Top bar (mobile only + breadcrumb) */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-200/60">
          <div className="flex items-center h-12 px-4 lg:px-6">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden mr-3 p-1.5 -ml-1 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-xs text-gray-400">78.036.379-7 · Notifica Legal SpA</span>
            <div className="flex-1" />
            <span className="text-xs text-gray-500">{new Date().getFullYear()}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6 max-w-[1400px]">
          {children}
        </main>
      </div>
    </div>
  );
}
