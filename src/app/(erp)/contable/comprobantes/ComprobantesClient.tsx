"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { TIPOS_COMPROBANTE, formatNumero, MESES } from "@/lib/contabilidad/core";
import { anularComprobante } from "./actions";

type Comprobante = {
  id: number;
  numero: number;
  tipo: string;
  fecha: string;
  glosa: string;
  anio: number;
  mes: number;
  estado: string;
  mov_contables: { debe: number; haber: number }[];
};

type Periodo = { anio: number; estado: string };

type Props = {
  initialData: Comprobante[];
  periodos: Periodo[];
  currentYear: number;
};

export default function ComprobantesClient({
  initialData,
  periodos,
  currentYear,
}: Props) {
  const [comprobantes, setComprobantes] = useState(initialData);
  const [anio, setAnio] = useState(currentYear);
  const [mes, setMes] = useState(0);
  const [tipo, setTipo] = useState("all");
  const [estado, setEstado] = useState("all");
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (anio === currentYear) {
      setComprobantes(initialData);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("comprobantes")
      .select("*, mov_contables(debe, haber)")
      .eq("anio", anio)
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false })
      .then(({ data }) => {
        setComprobantes((data as Comprobante[]) || []);
        setLoading(false);
      });
  }, [anio, currentYear, initialData]);

  const filtered = useMemo(() => {
    return comprobantes
      .filter((c) => {
        if (mes > 0 && c.mes !== mes) return false;
        if (tipo !== "all" && c.tipo !== tipo) return false;
        if (estado !== "all" && c.estado !== estado) return false;
        return true;
      })
      .map((c) => ({
        ...c,
        total_debe:
          c.mov_contables?.reduce(
            (s: number, m: { debe: number }) => s + Number(m.debe),
            0
          ) || 0,
        total_haber:
          c.mov_contables?.reduce(
            (s: number, m: { haber: number }) => s + Number(m.haber),
            0
          ) || 0,
      }));
  }, [comprobantes, mes, tipo, estado]);

  const totales = useMemo(
    () => ({
      debe: filtered.reduce((s, c) => s + c.total_debe, 0),
      haber: filtered.reduce((s, c) => s + c.total_haber, 0),
    }),
    [filtered]
  );

  function handleAnular(comp: {
    id: number;
    numero: number;
    tipo: string;
  }) {
    if (!confirm(`¿Anular comprobante ${comp.tipo}-${comp.numero}?`)) return;
    startTransition(async () => {
      const result = await anularComprobante(comp.id);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "success", text: "Comprobante anulado" });
        const supabase = createClient();
        const { data } = await supabase
          .from("comprobantes")
          .select("*, mov_contables(debe, haber)")
          .eq("anio", anio)
          .order("fecha", { ascending: false })
          .order("numero", { ascending: false });
        setComprobantes((data as Comprobante[]) || []);
      }
      setTimeout(() => setMessage(null), 3000);
    });
  }

  return (
    <div className="space-y-3 sm:space-y-4 max-w-full overflow-hidden">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">
              Comprobantes
            </h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-0.5">
              Ingreso, egreso y traspaso contable
            </p>
          </div>
          <Link
            href="/contable/comprobantes/nuevo"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-medium px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg transition shrink-0"
          >
            + Nuevo
          </Link>
        </div>

        {/* Totales */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4">
          <div className="bg-gray-50 rounded-lg p-2 sm:p-3 text-center">
            <div className="text-base sm:text-lg font-bold text-gray-900">
              {filtered.length}
            </div>
            <div className="text-[10px] sm:text-[11px] text-gray-500 uppercase">
              Comprobantes
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 sm:p-3 text-center">
            <div className="text-xs sm:text-sm font-bold text-green-600 font-mono">
              ${formatNumero(totales.debe)}
            </div>
            <div className="text-[10px] sm:text-[11px] text-gray-500 uppercase">
              Debe
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 sm:p-3 text-center">
            <div className="text-xs sm:text-sm font-bold text-red-600 font-mono">
              ${formatNumero(totales.haber)}
            </div>
            <div className="text-[10px] sm:text-[11px] text-gray-500 uppercase">
              Haber
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-700"
          >
            {periodos.map((p) => (
              <option key={p.anio} value={p.anio}>
                {p.anio} {p.estado === "CERRADO" ? "✗" : ""}
              </option>
            ))}
          </select>
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-700"
          >
            <option value={0}>Mes</option>
            {MESES.slice(1).map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-700"
          >
            <option value="all">Tipo</option>
            {Object.entries(TIPOS_COMPROBANTE).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-700"
          >
            <option value="all">Estado</option>
            <option value="VIGENTE">Vigente</option>
            <option value="ANULADO">Anulado</option>
          </select>
        </div>
        {loading && (
          <div className="text-xs text-gray-400 mt-2">Cargando...</div>
        )}
      </div>

      {/* Message */}
      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="hidden lg:grid lg:grid-cols-[55px_70px_90px_1fr_100px_100px_70px_70px] gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          <span>N&deg;</span>
          <span>Tipo</span>
          <span>Fecha</span>
          <span>Glosa</span>
          <span className="text-right">Debe</span>
          <span className="text-right">Haber</span>
          <span className="text-center">Estado</span>
          <span></span>
        </div>

        <div className="divide-y divide-gray-100">
          {filtered.map((c) => {
            const ti = TIPOS_COMPROBANTE[c.tipo] || TIPOS_COMPROBANTE.T;
            return (
              <div key={c.id}>
                {/* Desktop */}
                <div className="hidden lg:grid lg:grid-cols-[55px_70px_90px_1fr_100px_100px_70px_70px] gap-2 px-4 py-2.5 items-center text-sm hover:bg-gray-50">
                  <Link href={`/contable/comprobantes/${c.id}`} className="font-mono font-medium text-blue-600 hover:text-blue-800 hover:underline">
                    {c.numero}
                  </Link>
                  <span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ti.color}`}
                    >
                      {ti.short}
                    </span>
                  </span>
                  <span className="text-gray-600 text-xs">
                    {new Date(c.fecha + "T12:00:00").toLocaleDateString(
                      "es-CL"
                    )}
                  </span>
                  <span className="text-gray-700 truncate">{c.glosa}</span>
                  <span className="text-right font-mono text-xs">
                    ${formatNumero(c.total_debe)}
                  </span>
                  <span className="text-right font-mono text-xs">
                    ${formatNumero(c.total_haber)}
                  </span>
                  <span className="text-center">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        c.estado === "VIGENTE"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700 line-through"
                      }`}
                    >
                      {c.estado === "VIGENTE" ? "Vig" : "Anul"}
                    </span>
                  </span>
                  <div className="text-center">
                    {c.estado === "VIGENTE" && (
                      <button
                        onClick={() => handleAnular(c)}
                        disabled={isPending}
                        className="text-[10px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 disabled:opacity-50"
                      >
                        Anular
                      </button>
                    )}
                  </div>
                </div>

                {/* Mobile */}
                <div className="lg:hidden px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/contable/comprobantes/${c.id}`} className="font-mono font-bold text-sm text-blue-600 hover:text-blue-800">
                          {c.tipo}-{c.numero}
                        </Link>
                        <span
                          className={`text-[8px] px-1 py-0.5 rounded font-medium ${ti.color}`}
                        >
                          {ti.short}
                        </span>
                        <span
                          className={`text-[8px] px-1 py-0.5 rounded ${
                            c.estado === "VIGENTE"
                              ? "bg-green-50 text-green-600"
                              : "bg-red-50 text-red-600"
                          }`}
                        >
                          {c.estado === "VIGENTE" ? "Vig" : "Anul"}
                        </span>
                      </div>
                      <div className="text-[12px] text-gray-700 mt-0.5 truncate">
                        {c.glosa}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(c.fecha + "T12:00:00").toLocaleDateString(
                          "es-CL"
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-[11px] text-gray-700">
                        D ${formatNumero(c.total_debe)}
                      </div>
                      <div className="font-mono text-[11px] text-gray-700">
                        H ${formatNumero(c.total_haber)}
                      </div>
                      {c.estado === "VIGENTE" && (
                        <button
                          onClick={() => handleAnular(c)}
                          disabled={isPending}
                          className="text-[10px] text-red-400 hover:text-red-600 mt-1"
                        >
                          Anular
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            {loading
              ? "Cargando..."
              : "No hay comprobantes para el período seleccionado"}
          </div>
        )}
      </div>
    </div>
  );
}
