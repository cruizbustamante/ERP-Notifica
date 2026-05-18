"use client";

import { formatMonto, MESES } from "@/lib/contabilidad/core";
import YearSelector from "@/components/YearSelector";

type GrupoGasto = {
  codigo: string;
  nombre: string;
  porMes: number[];
  total: number;
};

type Props = {
  anio: number;
  ingresosPorMes: number[];
  gastosPorMes: number[];
  totalIngresos: number;
  totalGastos: number;
  grupos: GrupoGasto[];
  periodos: { anio: number; estado: string }[];
};

export default function RentabilidadClient({ anio, ingresosPorMes, gastosPorMes, totalIngresos, totalGastos, grupos, periodos }: Props) {
  const resultado = totalIngresos - totalGastos;
  const margenPorMes = ingresosPorMes.map((ing, i) => {
    const gas = gastosPorMes[i];
    return { resultado: ing - gas, margen: ing > 0 ? ((ing - gas) / ing) * 100 : 0 };
  });
  const margenGlobal = totalIngresos > 0 ? (resultado / totalIngresos) * 100 : 0;
  const mesLabels = MESES.slice(1);

  const maxGasto = Math.max(...grupos.map((g) => g.total), 1);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Rentabilidad</h1>
            <p className="text-gray-500 mt-1">Análisis de márgenes — {anio}</p>
          </div>
          <YearSelector anio={anio} periodos={periodos} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Ingresos</p>
          <p className="text-xl font-bold font-mono text-green-600">{formatMonto(totalIngresos)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Gastos</p>
          <p className="text-xl font-bold font-mono text-red-600">{formatMonto(totalGastos)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Resultado</p>
          <p className={`text-xl font-bold font-mono ${resultado >= 0 ? "text-blue-600" : "text-red-600"}`}>{formatMonto(resultado)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Margen Neto</p>
          <p className={`text-xl font-bold font-mono ${margenGlobal >= 0 ? "text-green-600" : "text-red-600"}`}>{margenGlobal.toFixed(1)}%</p>
        </div>
      </div>

      {/* Margen mensual */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b bg-gray-50">
              <th className="px-4 py-2 text-left font-medium sticky left-0 bg-gray-50">Concepto</th>
              {mesLabels.map((m) => (
                <th key={m} className="px-2 py-2 text-right font-medium text-xs">{m.slice(0, 3)}</th>
              ))}
              <th className="px-4 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="px-4 py-2 font-medium text-green-700">Ingresos</td>
              {ingresosPorMes.map((v, i) => (
                <td key={i} className="px-2 py-1.5 text-right font-mono text-xs">{v > 0 ? formatMonto(v) : ""}</td>
              ))}
              <td className="px-4 py-2 text-right font-mono font-medium text-green-600">{formatMonto(totalIngresos)}</td>
            </tr>
            <tr className="border-b">
              <td className="px-4 py-2 font-medium text-red-700">Gastos</td>
              {gastosPorMes.map((v, i) => (
                <td key={i} className="px-2 py-1.5 text-right font-mono text-xs">{v > 0 ? formatMonto(v) : ""}</td>
              ))}
              <td className="px-4 py-2 text-right font-mono font-medium text-red-600">{formatMonto(totalGastos)}</td>
            </tr>
            <tr className="border-b bg-blue-50 font-bold">
              <td className="px-4 py-2">Resultado</td>
              {margenPorMes.map((m, i) => (
                <td key={i} className={`px-2 py-1.5 text-right font-mono text-xs ${m.resultado >= 0 ? "text-blue-600" : "text-red-600"}`}>
                  {m.resultado !== 0 ? formatMonto(m.resultado) : ""}
                </td>
              ))}
              <td className={`px-4 py-2 text-right font-mono ${resultado >= 0 ? "text-blue-600" : "text-red-600"}`}>{formatMonto(resultado)}</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="px-4 py-2 text-gray-600 font-medium">Margen %</td>
              {margenPorMes.map((m, i) => (
                <td key={i} className={`px-2 py-1.5 text-right text-xs font-medium ${m.margen >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {ingresosPorMes[i] > 0 ? `${m.margen.toFixed(0)}%` : ""}
                </td>
              ))}
              <td className={`px-4 py-2 text-right font-medium ${margenGlobal >= 0 ? "text-green-600" : "text-red-600"}`}>{margenGlobal.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Composición de gastos */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Composición de Gastos</h3>
        <div className="space-y-3">
          {grupos.map((g) => {
            const pct = totalGastos > 0 ? (g.total / totalGastos) * 100 : 0;
            return (
              <div key={g.codigo}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700">
                    <span className="font-mono text-xs text-gray-400">{g.codigo}</span>
                    <span className="ml-2">{g.nombre}</span>
                  </span>
                  <span className="font-mono text-sm">{formatMonto(g.total)} <span className="text-xs text-gray-400">({pct.toFixed(1)}%)</span></span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div className="bg-red-400 h-2.5 rounded-full" style={{ width: `${(g.total / maxGasto) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
