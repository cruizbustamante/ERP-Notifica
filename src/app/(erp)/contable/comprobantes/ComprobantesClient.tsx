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

export default function ComprobantesClient({ initialData, periodos, currentYear }: Props) {
  const [comprobantes, setComprobantes] = useState(initialData);
  const [anio, setAnio] = useState(currentYear);
  const [mes, setMes] = useState(0);
  const [tipo, setTipo] = useState("all");
  const [estado, setEstado] = useState("all");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
    const q = busqueda.toLowerCase().trim();
    return comprobantes
      .filter((c) => {
        if (mes > 0 && c.mes !== mes) return false;
        if (tipo !== "all" && c.tipo !== tipo) return false;
        if (estado !== "all" && c.estado !== estado) return false;
        if (q) {
          const matchNum = String(c.numero).includes(q);
          const matchGlosa = c.glosa.toLowerCase().includes(q);
          const matchTipoNum = `${c.tipo}-${c.numero}`.toLowerCase().includes(q);
          if (!matchNum && !matchGlosa && !matchTipoNum) return false;
        }
        return true;
      })
      .map((c) => ({
        ...c,
        total_debe: c.mov_contables?.reduce((s: number, m: { debe: number }) => s + Number(m.debe), 0) || 0,
        total_haber: c.mov_contables?.reduce((s: number, m: { haber: number }) => s + Number(m.haber), 0) || 0,
      }));
  }, [comprobantes, mes, tipo, estado, busqueda]);

  const totales = useMemo(() => ({
    debe: filtered.reduce((s, c) => s + c.total_debe, 0),
    haber: filtered.reduce((s, c) => s + c.total_haber, 0),
  }), [filtered]);

  function handleAnular(comp: { id: number; numero: number; tipo: string }) {
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
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">Comprobantes</h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-0.5">Ingreso, egreso y traspaso contable</p>
          </div>
          <Link href="/contable/comprobantes/nuevo"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl transition shadow-sm hover:shadow-md shrink-0">
            + Nuevo
          </Link>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4">
          <div className="bg-gray-50 rounded-xl p-2.5 sm:p-3 text-center">
            <div className="text-base sm:text-lg font-bold text-gray-900">{filtered.length}</div>
            <div className="text-[10px] sm:text-[11px] text-gray-500 uppercase font-medium">Comprobantes</div>
          </div>
          <div className="bg-green-50 rounded-xl p-2.5 sm:p-3 text-center">
            <div className="text-xs sm:text-sm font-bold text-green-700 font-mono">${formatNumero(totales.debe)}</div>
            <div className="text-[10px] sm:text-[11px] text-gray-500 uppercase font-medium">Debe</div>
          </div>
          <div className="bg-red-50 rounded-xl p-2.5 sm:p-3 text-center">
            <div className="text-xs sm:text-sm font-bold text-red-700 font-mono">${formatNumero(totales.haber)}</div>
            <div className="text-[10px] sm:text-[11px] text-gray-500 uppercase font-medium">Haber</div>
          </div>
        </div>
      </div>

      {/* Filtros + Búsqueda */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
        {/* Búsqueda */}
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por número o glosa..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition"
          />
          {busqueda && (
            <button onClick={() => setBusqueda("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        {/* Selects */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500/20 transition">
            {periodos.map((p) => (
              <option key={p.anio} value={p.anio}>{p.anio} {p.estado === "CERRADO" ? "✗" : ""}</option>
            ))}
          </select>
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500/20 transition">
            <option value={0}>Todos los meses</option>
            {MESES.slice(1).map((m, i) => (<option key={i + 1} value={i + 1}>{m}</option>))}
          </select>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500/20 transition">
            <option value="all">Todos los tipos</option>
            {Object.entries(TIPOS_COMPROBANTE).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
          </select>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500/20 transition">
            <option value="all">Todos</option>
            <option value="VIGENTE">Vigente</option>
            <option value="ANULADO">Anulado</option>
          </select>
        </div>
        {loading && <div className="text-xs text-indigo-500 mt-2 animate-pulse">Cargando...</div>}
      </div>

      {/* Message */}
      {message && (
        <div className={`px-4 py-3 rounded-xl text-sm ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {message.text}
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Desktop header */}
        <div className="hidden lg:grid lg:grid-cols-[60px_70px_90px_1fr_110px_110px_70px_60px] gap-2 px-5 py-3 bg-gray-50/80 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          <span>N°</span>
          <span>Tipo</span>
          <span>Fecha</span>
          <span>Glosa</span>
          <span className="text-right">Debe</span>
          <span className="text-right">Haber</span>
          <span className="text-center">Estado</span>
          <span></span>
        </div>

        <div className="divide-y divide-gray-50">
          {filtered.map((c) => {
            const ti = TIPOS_COMPROBANTE[c.tipo] || TIPOS_COMPROBANTE.T;
            return (
              <div key={c.id}>
                {/* Desktop */}
                <div className="hidden lg:grid lg:grid-cols-[60px_70px_90px_1fr_110px_110px_70px_60px] gap-2 px-5 py-3 items-center text-sm hover:bg-indigo-50/30 transition-colors">
                  <Link href={`/contable/comprobantes/${c.id}`} className="font-mono font-bold text-indigo-600 hover:text-indigo-800 hover:underline">
                    {c.numero}
                  </Link>
                  <span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${ti.color}`}>{ti.short}</span>
                  </span>
                  <span className="text-gray-500 text-xs">
                    {new Date(c.fecha + "T12:00:00").toLocaleDateString("es-CL")}
                  </span>
                  <Link href={`/contable/comprobantes/${c.id}`} className="text-gray-700 truncate hover:text-indigo-600 transition-colors">
                    {c.glosa}
                  </Link>
                  <span className="text-right font-mono text-xs text-green-700 font-medium">${formatNumero(c.total_debe)}</span>
                  <span className="text-right font-mono text-xs text-red-700 font-medium">${formatNumero(c.total_haber)}</span>
                  <span className="text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${c.estado === "VIGENTE" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700 line-through"}`}>
                      {c.estado === "VIGENTE" ? "Vigente" : "Anulado"}
                    </span>
                  </span>
                  <div className="text-center">
                    {c.estado === "VIGENTE" && (
                      <button onClick={() => handleAnular(c)} disabled={isPending}
                        className="text-[10px] text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50 transition">
                        Anular
                      </button>
                    )}
                  </div>
                </div>

                {/* Mobile */}
                <div className="lg:hidden px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/contable/comprobantes/${c.id}`} className="font-mono font-bold text-sm text-indigo-600 hover:text-indigo-800">
                          {c.tipo}-{c.numero}
                        </Link>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${ti.color}`}>{ti.short}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${c.estado === "VIGENTE" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                          {c.estado === "VIGENTE" ? "Vig" : "Anul"}
                        </span>
                      </div>
                      <Link href={`/contable/comprobantes/${c.id}`} className="text-[12px] text-gray-700 mt-0.5 truncate block hover:text-indigo-600 transition-colors">
                        {c.glosa}
                      </Link>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(c.fecha + "T12:00:00").toLocaleDateString("es-CL")}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-[11px] text-green-700 font-medium">D ${formatNumero(c.total_debe)}</div>
                      <div className="font-mono text-[11px] text-red-700 font-medium">H ${formatNumero(c.total_haber)}</div>
                      {c.estado === "VIGENTE" && (
                        <button onClick={() => handleAnular(c)} disabled={isPending}
                          className="text-[10px] text-red-400 hover:text-red-600 mt-1">
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
          <div className="text-center py-16 text-gray-400">
            <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">{loading ? "Cargando..." : busqueda ? "Sin resultados para la búsqueda" : "No hay comprobantes para el período"}</p>
          </div>
        )}
      </div>
    </div>
  );
}
