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

const NAV_AREAS = [
  { label: "Inicio", href: "/inicio", segment: "inicio" },
  { label: "Contable", href: "/contable/comprobantes", segment: "contable" },
  { label: "Comercial", href: "/comercial/clientes", segment: "comercial" },
  { label: "Gestión", href: "/gestion/dashboard", segment: "gestion" },
];

export default function LayoutShell({ user, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => { setMobileNav(false); }, [pathname]);

  const activeSegment = pathname.split("/")[1] || "";

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      {/* Shell Bar */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center h-14 px-4 lg:px-6">
          {/* Mobile menu */}
          <button onClick={() => setMobileNav(!mobileNav)} className="lg:hidden mr-3 p-1.5 -ml-1 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 mr-8">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-sm">
              <span className="text-white text-xs font-bold">NL</span>
            </div>
            <div className="hidden sm:block">
              <span className="text-sm font-semibold text-gray-900">Notifica Legal</span>
              <span className="text-[10px] text-gray-400 ml-2">ERP</span>
            </div>
          </Link>

          {/* Main nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_AREAS.map((area) => {
              const active = area.segment === "" ? activeSegment === "" : activeSegment === area.segment;
              return (
                <Link
                  key={area.href}
                  href={area.href}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    active
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {area.label}
                </Link>
              );
            })}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right side */}
          <div className="flex items-center gap-3">
            <span className="hidden md:block text-xs text-gray-400">78.036.379-7</span>
            <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                <span className="text-xs font-semibold text-indigo-600">
                  {(user.nombre || user.email)[0].toUpperCase()}
                </span>
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-medium text-gray-700">{user.nombre || user.email.split("@")[0]}</p>
                <p className="text-[10px] text-gray-400">{user.rol}</p>
              </div>
              <button onClick={handleLogout} className="ml-2 text-gray-400 hover:text-red-500 transition" title="Salir">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile nav dropdown */}
        {mobileNav && (
          <div className="lg:hidden border-t border-gray-100 px-4 py-2 bg-white shadow-lg">
            {NAV_AREAS.map((area) => {
              const active = area.segment === "" ? activeSegment === "" : activeSegment === area.segment;
              return (
                <Link
                  key={area.href}
                  href={area.href}
                  className={`block px-3 py-2.5 text-sm font-medium rounded-lg ${
                    active ? "bg-indigo-50 text-indigo-700" : "text-gray-600"
                  }`}
                >
                  {area.label}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Content */}
      <main className="p-4 lg:p-6 max-w-[1600px] mx-auto">
        {children}
      </main>
    </div>
  );
}
