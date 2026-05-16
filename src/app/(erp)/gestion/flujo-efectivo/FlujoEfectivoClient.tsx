"use client";

import { formatMonto, MESES } from "@/lib/contabilidad/core";

type CategoriaFlujo = {
  categoria: string;
  porMes: number[];
  total: number;
};

type Props = {
  anio: number;
  categorias: CategoriaFlujo[];
  saldoInicial: number;
  totalAbonos: number;
  totalCargos: number;
};

const COLORES: Record<string, string> = {
  OPERACIONAL: "text-blue-700",
  INVERSIÓN: "text-purple-700",
  FINANCIAMIENTO: "text-amber-700",
  "SIN CLASIFICAR": "text-gray-500",
};

export default function FlujoEfectivoClient({ anio, categorias, saldoInicial, totalAbonos, totalCargos }: Props) {
  const flujoNeto = totalAbonos - totalCargos;
  const saldoFinal = saldoInicial + flujoNeto;
  const mesLabels = MESES.slice(1);

  const flujoNetoMes = Array(12).fill(0);
  for (const cat of categorias) {
    for (let i = 0; i < 12; i++) flujoNetoMes[i] += cat.porMes[i];
  }

  const saldoAcumulado = Array(12).fill(0);
  let acum = saldoInicial;
  for (let i = 0; i < 12; i++) {
    acum += flujoNetoMes[i];
    saldoAcumulado[i] = acum;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900">Flujo de Efectivo</h1>
        <p className="text-gray-500 mt-1">Movimiento de caja — {anio}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Saldo Inicial</p>
          <p className="text-xl font-bold font-mono text-gray-700">{formatMonto(saldoInicial)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Total Ingresos</p>
          <p className="text-xl font-bold font-mono text-green-600">{formatMonto(totalAbonos)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Total Egresos</p>
          <p className="text-xl font-bold font-mono text-red-600">{formatMonto(totalCargos)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Saldo Final</p>
          <p className={`text-xl font-bold font-mono ${saldoFinal >= 0 ? "text-blue-600" : "text-red-600"}`}>{formatMonto(saldoFinal)}</p>
        </div>
      </div>

      {/* Barra de saldo acumulado */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Saldo bancario mensual</h3>
        <div className="flex items-end gap-1 h-36">
          {saldoAcumulado.map((v, i) => {
            const max = Math.max(...saldoAcumulado.map(Math.abs), 1);
            const pct = Math.abs(v) / max;
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                <div
                  className={`w-full rounded-t min-h-[2px] ${v >= 0 ? "bg-blue-400" : "bg-red-400"}`}
                  style={{ height: `${pct * 100}%` }}
                  title={`${mesLabels[i]}: ${formatMonto(v)}`}
                />
                <span className="text-[10px] text-gray-400 mt-1">{mesLabels[i].slice(0, 3)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabla por categoría */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b bg-gray-50">
              <th className="px-4 py-2 text-left font-medium sticky left-0 bg-gray-50">Categoría</th>
              {mesLabels.map((m) => (
                <th key={m} className="px-2 py-2 text-right font-medium text-xs">{m.slice(0, 3)}</th>
              ))}
              <th className="px-4 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {categorias.map((cat) => (
              <tr key={cat.categoria} className="border-b hover:bg-gray-50">
                <td className={`px-4 py-2 font-medium ${COLORES[cat.categoria] || "text-gray-700"}`}>{cat.categoria}</td>
                {cat.porMes.map((v, i) => (
                  <td key={i} className={`px-2 py-1.5 text-right font-mono text-xs ${v < 0 ? "text-red-600" : ""}`}>
                    {v !== 0 ? formatMonto(v) : ""}
                  </td>
                ))}
                <td className={`px-4 py-2 text-right font-mono font-medium ${cat.total < 0 ? "text-red-600" : ""}`}>{formatMonto(cat.total)}</td>
              </tr>
            ))}

            {/* Flujo neto */}
            <tr className="border-t-2 border-gray-400 bg-blue-50 font-bold">
              <td className="px-4 py-2">FLUJO NETO</td>
              {flujoNetoMes.map((v, i) => (
                <td key={i} className={`px-2 py-2 text-right font-mono text-xs ${v < 0 ? "text-red-600" : "text-blue-600"}`}>
                  {v !== 0 ? formatMonto(v) : ""}
                </td>
              ))}
              <td className={`px-4 py-2 text-right font-mono ${flujoNeto < 0 ? "text-red-600" : "text-blue-600"}`}>{formatMonto(flujoNeto)}</td>
            </tr>

            {/* Saldo acumulado */}
            <tr className="bg-gray-50 font-medium">
              <td className="px-4 py-2 text-gray-600">Saldo acumulado</td>
              {saldoAcumulado.map((v, i) => (
                <td key={i} className={`px-2 py-2 text-right font-mono text-xs ${v < 0 ? "text-red-600" : "text-gray-700"}`}>
                  {formatMonto(v)}
                </td>
              ))}
              <td className={`px-4 py-2 text-right font-mono ${saldoFinal < 0 ? "text-red-600" : "text-gray-900"}`}>{formatMonto(saldoFinal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
