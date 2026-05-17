"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);
  const [modoRecuperar, setModoRecuperar] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/inicio");
    });
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Credenciales incorrectas");
      setLoading(false);
      return;
    }

    router.push("/inicio");
    router.refresh();
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault();
    if (!email) { setError("Ingrese su email"); return; }
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    setLoading(false);
    if (error) { setError(error.message); return; }
    setMensaje("Se envió un enlace de recuperación a su email");
  }

  return (
    <div className="min-h-screen flex">
      {/* Panel izquierdo - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#1e1b8a] flex-col items-center justify-center relative">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e1b8a] via-[#2522a8] to-[#1a1770]" />
        <div className="relative z-10 text-center px-12">
          <Image src="/icon-sidebar.png" alt="NL" width={80} height={80} className="mx-auto mb-6" priority />
          <h1 className="text-white text-3xl font-bold mb-2">Notifica Legal</h1>
          <p className="text-white/50 text-sm">Sistema Contable Integrado</p>
          <div className="mt-12 grid grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-white/80 text-2xl font-bold">ERP</div>
              <div className="text-white/30 text-[10px] uppercase tracking-wider mt-1">Contable</div>
            </div>
            <div>
              <div className="text-white/80 text-2xl font-bold">SII</div>
              <div className="text-white/30 text-[10px] uppercase tracking-wider mt-1">Integrado</div>
            </div>
            <div>
              <div className="text-white/80 text-2xl font-bold">360</div>
              <div className="text-white/30 text-[10px] uppercase tracking-wider mt-1">Gestión</div>
            </div>
          </div>
        </div>
        <p className="absolute bottom-6 text-white/20 text-xs">Notifica Legal SpA — {new Date().getFullYear()}</p>
      </div>

      {/* Panel derecho - Login */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-[380px]">
          {/* Logo mobile */}
          <div className="lg:hidden text-center mb-8">
            <Image src="/logo-square.png" alt="Notifica Legal" width={160} height={160} className="mx-auto" priority />
          </div>

          {/* Título */}
          <div className="mb-8 lg:mb-10">
            <h2 className="text-2xl font-bold text-gray-900 lg:text-3xl">Bienvenido</h2>
            <p className="text-gray-400 mt-1 text-sm">Ingresa tus credenciales para continuar</p>
          </div>

          {!modoRecuperar ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1e1b8a] focus:border-transparent outline-none text-gray-900 transition-all shadow-sm"
                  placeholder="usuario@notificalegal.cl"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1e1b8a] focus:border-transparent outline-none text-gray-900 transition-all shadow-sm"
                  placeholder="••••••••"
                  required
                />
              </div>

              {error && (
                <p className="text-red-600 text-sm bg-red-50 px-4 py-2.5 rounded-xl border border-red-100">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1e1b8a] hover:bg-[#16146b] text-white font-semibold py-3.5 rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-indigo-900/20 hover:shadow-indigo-900/30 mt-2"
              >
                {loading ? "Ingresando..." : "Ingresar"}
              </button>

              <button
                type="button"
                onClick={() => { setModoRecuperar(true); setError(""); setMensaje(""); }}
                className="w-full text-sm text-gray-400 hover:text-[#1e1b8a] transition-colors pt-1"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </form>
          ) : (
            <form onSubmit={handleRecuperar} className="space-y-5">
              <p className="text-sm text-gray-500">Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1e1b8a] focus:border-transparent outline-none text-gray-900 transition-all shadow-sm"
                  placeholder="usuario@notificalegal.cl"
                  required
                />
              </div>

              {error && (
                <p className="text-red-600 text-sm bg-red-50 px-4 py-2.5 rounded-xl border border-red-100">{error}</p>
              )}
              {mensaje && (
                <p className="text-green-700 text-sm bg-green-50 px-4 py-2.5 rounded-xl border border-green-100">{mensaje}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1e1b8a] hover:bg-[#16146b] text-white font-semibold py-3.5 rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-indigo-900/20"
              >
                {loading ? "Enviando..." : "Enviar enlace"}
              </button>

              <button
                type="button"
                onClick={() => { setModoRecuperar(false); setError(""); setMensaje(""); }}
                className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors pt-1"
              >
                Volver al login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
