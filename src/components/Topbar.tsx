"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Props = {
  user: { email: string; rol: string; nombre: string };
};

export default function Topbar({ user }: Props) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-medium text-gray-700">
          Notifica Legal SpA
        </h2>
        <span className="text-gray-300">|</span>
        <span className="text-xs text-gray-400">RUT 78.036.379-7</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-gray-500">
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
