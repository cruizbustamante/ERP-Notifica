"use client";

import { useState, useTransition } from "react";
import { formatMonto, MESES, TIPOS_COMPROBANTE } from "@/lib/contabilidad/core";
import { getLibroDiario, type ComprobanteConLineas } from "./actions";

type Periodo = { anio: number; estado: string };

export default function LibroDiarioClient({
  periodos,
  currentYear,
}: {
  periodos: Periodo[];
  currentYear: number;
}) {
  const [anio, setAnio] = useState(currentYear);
  const [mes, setMes] = useState<number | null>(null);
  const [data, setData] = useState<ComprobanteConLineas[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());

  const consultar = () => {
    startTransition(async () => {
      const result = await getLibroDiario(anio, mes);
      setData(result.data);
      setLoaded(true);
      setExpandidos(new Set());
    });
  };

  const toggleExpand = (id: number) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandirTodos = () => {
    if (expandidos.size === data.length) setExpandidos(new Set());
    else setExpandidos(new Set(data.map((c) => c.id)));
  };

  const totalDebe = data.reduce((sum, c) => sum + c.lineas.reduce((s, l) => s + l.debe, 0), 0);
  const totalHaber = data.reduce((sum, c) => sum + c.lineas.reduce((s, l) => s + l.haber, 0), 0);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Libro Diario</h1>
            <p className="text-gray-500 mt-1">Registro cronológico de comprobantes</p>
          </div>
          <div className="flex items-center gap-3">
            <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {periodos.map((p) => <option key={p.anio} value={p.anio}>{p.anio}</option>)}
            </select>
            <select value={mes ?? ""} onChange={(e) => setMes(e.target.value ? Number(e.target.value) : null)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Todo el año</option>
              {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <button onClick={consultar} disabled={isPending} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {isPending ? "Cargando..." : "Consultar"}
            </button>
          </div>
        </div>
      </div>

      {loaded && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="text-sm text-gray-500">
              {data.length} comprobantes · Debe: <span className="font-mono font-medium text-gray-900">{formatMonto(totalDebe)}</span> · Haber: <span className="font-mono font-medium text-gray-900">{formatMonto(totalHaber)}</span>
            </div>
            {data.length > 0 && (
              <button onClick={expandirTodos} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                {expandidos.size === data.length ? "Colapsar todos" : "Expandir todos"}
              </button>
            )}
          </div>

          <div className="divide-y">
            {data.map((c) => {
              const tipoInfo = TIPOS_COMPROBANTE[c.tipo];
              const isOpen = expandidos.has(c.id);
              const cDebe = c.lineas.reduce((s, l) => s + l.debe, 0);
              const cHaber = c.lineas.reduce((s, l) => s + l.haber, 0);

              return (
                <div key={c.id}>
                  <button
                    onClick={() => toggleExpand(c.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left text-sm"
                  >
                    <span className="text-gray-400 text-xs w-4">{isOpen ? "▼" : "▶"}</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${tipoInfo?.color || "bg-gray-100"}`}>
                      {tipoInfo?.short || c.tipo}-{c.numero}
                    </span>
                    <span className="text-gray-500 w-24">{c.fecha}</span>
                    <span className="flex-1 truncate font-medium text-gray-900">{c.glosa}</span>
                    <span className="font-mono text-right w-28">{formatMonto(cDebe)}</span>
                    <span className="font-mono text-right w-28">{formatMonto(cHaber)}</span>
                  </button>

                  {isOpen && (
                    <div className="bg-gray-50 px-4 pb-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left py-1 font-medium w-8">#</th>
                            <th className="text-left py-1 font-medium">Cuenta</th>
                            <th className="text-left py-1 font-medium">Glosa</th>
                            <th className="text-left py-1 font-medium">Auxiliar</th>
                            <th className="text-left py-1 font-medium">Doc</th>
                            <th className="text-right py-1 font-medium w-24">Debe</th>
                            <th className="text-right py-1 font-medium w-24">Haber</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.lineas.map((l) => (
                            <tr key={l.linea} className="border-t border-gray-200">
                              <td className="py-1 text-gray-400">{l.linea}</td>
                              <td className="py-1">
                                <span className="font-mono">{l.cuenta_codigo}</span>
                                <span className="text-gray-500 ml-1">{l.cuenta_nombre}</span>
                              </td>
                              <td className="py-1 text-gray-600 truncate max-w-[200px]">{l.glosa}</td>
                              <td className="py-1 font-mono">{l.auxiliar_rut}</td>
                              <td className="py-1">{l.tipo_doc && `${l.tipo_doc} ${l.num_doc}`}</td>
                              <td className="py-1 text-right font-mono">{l.debe > 0 ? formatMonto(l.debe) : ""}</td>
                              <td className="py-1 text-right font-mono">{l.haber > 0 ? formatMonto(l.haber) : ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {data.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">Sin comprobantes para el período seleccionado</div>
          )}
        </div>
      )}
    </div>
  );
}
