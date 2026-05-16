"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Props = {
  user: { email: string; rol: string; nombre: string };
  onMenuToggle: () => void;
};

export default function Topbar({ user, onMenuToggle }: Props) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-1.5 -ml-1 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100 transition"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <h2 className="text-sm font-medium text-gray-700">
          Notifica Legal SpA
        </h2>
        <span className="text-gray-300 hidden sm:inline">|</span>
        <span className="text-xs text-gray-400 hidden sm:inline">
          RUT 78.036.379-7
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-gray-500 hidden sm:inline">
          {user.nombre || user.email.split("@")[0]}
        </span>
        <button
          onClick={handleLogout}
          className="text-xs text-gray-400 hover:text-red-500 transition"
        >
          Salir
        </button>
      </div>
    </header>
  );
}
