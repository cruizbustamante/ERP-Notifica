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
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 to-indigo-800 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <Image src="/logo-login.png" alt="Notifica Legal" width={280} height={158} className="mx-auto mb-3" priority />
          <p className="text-gray-500 text-sm">Sistema Contable Integrado</p>
        </div>

        {!modoRecuperar ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900"
                placeholder="usuario@notificalegal.cl"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50"
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </button>

            <button
              type="button"
              onClick={() => { setModoRecuperar(true); setError(""); setMensaje(""); }}
              className="w-full text-sm text-indigo-600 hover:text-indigo-800"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        ) : (
          <form onSubmit={handleRecuperar} className="space-y-4">
            <p className="text-sm text-gray-600">Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900"
                placeholder="usuario@notificalegal.cl"
                required
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
            {mensaje && (
              <p className="text-green-700 text-sm bg-green-50 px-3 py-2 rounded-lg">{mensaje}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar enlace"}
            </button>

            <button
              type="button"
              onClick={() => { setModoRecuperar(false); setError(""); setMensaje(""); }}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Volver al login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
