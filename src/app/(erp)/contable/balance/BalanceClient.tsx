"use client";

import { useState, useTransition } from "react";
import { formatMonto, MESES } from "@/lib/contabilidad/core";
import { getBalance, type FilaBalance } from "./actions";

type Periodo = { anio: number; estado: string };

export default function BalanceClient({
  periodos, currentYear,
}: {
  periodos: Periodo[];
  currentYear: number;
}) {
  const [anio, setAnio] = useState(currentYear);
  const [mesHasta, setMesHasta] = useState(new Date().getMonth() + 1);
  const [filas, setFilas] = useState<FilaBalance[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [soloN4, setSoloN4] = useState(false);

  const consultar = () => {
    startTransition(async () => {
      const { data } = await getBalance(anio, mesHasta);
      setFilas(data);
      setLoaded(true);
    });
  };

  const filasVisibles = soloN4 ? filas.filter((f) => f.nivel === 4) : filas;

  const totales = filas.filter((f) => f.nivel === 4).reduce(
    (t, f) => ({
      debeAnt: t.debeAnt + f.debeAnterior,
      haberAnt: t.haberAnt + f.haberAnterior,
      debePer: t.debePer + f.debePeriodo,
      haberPer: t.haberPer + f.haberPeriodo,
      debeAcum: t.debeAcum + f.debeAcumulado,
      haberAcum: t.haberAcum + f.haberAcumulado,
      sDeudor: t.sDeudor + f.saldoDeudor,
      sAcreedor: t.sAcreedor + f.saldoAcreedor,
    }),
    { debeAnt: 0, haberAnt: 0, debePer: 0, haberPer: 0, debeAcum: 0, haberAcum: 0, sDeudor: 0, sAcreedor: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Balance de Comprobación</h1>
            <p className="text-gray-500 mt-1">Balance de 8 columnas</p>
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Año</label>
            <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {periodos.map((p) => <option key={p.anio} value={p.anio}>{p.anio}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hasta mes</label>
            <select value={mesHasta} onChange={(e) => setMesHasta(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm pb-2">
            <input type="checkbox" checked={soloN4} onChange={(e) => setSoloN4(e.target.checked)} />
            Solo cuentas de movimiento
          </label>
          <button onClick={consultar} disabled={isPending} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {isPending ? "Cargando..." : "Consultar"}
          </button>
        </div>
      </div>

      {loaded && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th rowSpan={2} className="px-3 py-2 text-left font-medium text-gray-700 sticky left-0 bg-gray-50">Cuenta</th>
                <th colSpan={2} className="px-3 py-1 text-center font-medium text-gray-500 border-b">Sumas anteriores</th>
                <th colSpan={2} className="px-3 py-1 text-center font-medium text-gray-500 border-b">Movim. del mes</th>
                <th colSpan={2} className="px-3 py-1 text-center font-medium text-gray-500 border-b">Sumas acumuladas</th>
                <th colSpan={2} className="px-3 py-1 text-center font-medium text-gray-500 border-b">Saldos</th>
              </tr>
              <tr className="bg-gray-50 border-b text-gray-500">
                <th className="px-3 py-1 text-right font-medium w-24">Debe</th>
                <th className="px-3 py-1 text-right font-medium w-24">Haber</th>
                <th className="px-3 py-1 text-right font-medium w-24">Debe</th>
                <th className="px-3 py-1 text-right font-medium w-24">Haber</th>
                <th className="px-3 py-1 text-right font-medium w-24">Debe</th>
                <th className="px-3 py-1 text-right font-medium w-24">Haber</th>
                <th className="px-3 py-1 text-right font-medium w-24">Deudor</th>
                <th className="px-3 py-1 text-right font-medium w-24">Acreedor</th>
              </tr>
            </thead>
            <tbody>
              {filasVisibles.map((f) => {
                const isGroup = f.nivel < 4;
                return (
                  <tr key={f.codigo} className={`border-b ${isGroup ? "bg-gray-50 font-medium" : "hover:bg-gray-50"}`}>
                    <td className={`px-3 py-1 sticky left-0 ${isGroup ? "bg-gray-50" : "bg-white"}`}>
                      <span className="font-mono" style={{ paddingLeft: `${(f.nivel - 1) * 12}px` }}>
                        {f.codigo}
                      </span>
                      <span className="ml-2 text-gray-600">{f.nombre}</span>
                    </td>
                    <td className="px-3 py-1 text-right font-mono">{f.debeAnterior > 0 ? formatMonto(f.debeAnterior) : ""}</td>
                    <td className="px-3 py-1 text-right font-mono">{f.haberAnterior > 0 ? formatMonto(f.haberAnterior) : ""}</td>
                    <td className="px-3 py-1 text-right font-mono">{f.debePeriodo > 0 ? formatMonto(f.debePeriodo) : ""}</td>
                    <td className="px-3 py-1 text-right font-mono">{f.haberPeriodo > 0 ? formatMonto(f.haberPeriodo) : ""}</td>
                    <td className="px-3 py-1 text-right font-mono">{f.debeAcumulado > 0 ? formatMonto(f.debeAcumulado) : ""}</td>
                    <td className="px-3 py-1 text-right font-mono">{f.haberAcumulado > 0 ? formatMonto(f.haberAcumulado) : ""}</td>
                    <td className="px-3 py-1 text-right font-mono text-blue-700">{f.saldoDeudor > 0 ? formatMonto(f.saldoDeudor) : ""}</td>
                    <td className="px-3 py-1 text-right font-mono text-red-700">{f.saldoAcreedor > 0 ? formatMonto(f.saldoAcreedor) : ""}</td>
                  </tr>
                );
              })}

              {/* Totales */}
              <tr className="border-t-2 border-gray-400 bg-gray-100 font-bold">
                <td className="px-3 py-2 sticky left-0 bg-gray-100">TOTALES</td>
                <td className="px-3 py-2 text-right font-mono">{formatMonto(totales.debeAnt)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatMonto(totales.haberAnt)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatMonto(totales.debePer)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatMonto(totales.haberPer)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatMonto(totales.debeAcum)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatMonto(totales.haberAcum)}</td>
                <td className="px-3 py-2 text-right font-mono text-blue-700">{formatMonto(totales.sDeudor)}</td>
                <td className="px-3 py-2 text-right font-mono text-red-700">{formatMonto(totales.sAcreedor)}</td>
              </tr>
            </tbody>
          </table>

          {filasVisibles.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">Sin datos para el período seleccionado</div>
          )}
        </div>
      )}
    </div>
  );
}
