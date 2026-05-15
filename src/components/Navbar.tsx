"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Props = {
  user: { email: string; rol: string; nombre: string };
};

export default function Navbar({ user }: Props) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="bg-indigo-950 text-white px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <a href="/dashboard" className="font-bold text-lg">Notifica Legal</a>
        <div className="flex gap-4 text-sm text-indigo-300">
          <a href="/dashboard" className="hover:text-white transition">Dashboard</a>
          <a href="/contabilidad" className="hover:text-white transition">Contabilidad</a>
          <a href="/conciliacion" className="hover:text-white transition">Conciliación</a>
          <a href="/centralizacion" className="hover:text-white transition">Centralización</a>
          <a href="/clientes" className="hover:text-white transition">Clientes</a>
          <a href="/reportes" className="hover:text-white transition">Reportes</a>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-indigo-300">
          {user.nombre || user.email}
          <span className="ml-2 bg-indigo-800 px-2 py-0.5 rounded text-[10px] uppercase">{user.rol}</span>
        </span>
        <button
          onClick={handleLogout}
          className="text-xs text-indigo-400 hover:text-white transition"
        >
          Cerrar sesión
        </button>
      </div>
    </nav>
  );
}
