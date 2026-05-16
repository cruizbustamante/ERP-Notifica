"use client";

import { formatMonto, MESES } from "@/lib/contabilidad/core";

type FilaEERR = { codigo: string; nombre: string; tipo: string; nivel: number; porMes: number[]; total: number };

export default function EstadoResultadosClient({
  anio, filas, totalIngresos, totalGastos,
}: {
  anio: number;
  filas: FilaEERR[];
  totalIngresos: number;
  totalGastos: number;
}) {
  const resultado = totalIngresos - totalGastos;
  const ingresosFilas = filas.filter((f) => f.tipo === "I");
  const gastosFilas = filas.filter((f) => f.tipo === "G");

  const Section = ({ titulo, items, totalLabel, total, colorTotal }: {
    titulo: string; items: FilaEERR[]; totalLabel: string; total: number; colorTotal: string;
  }) => (
    <>
      <tr className="bg-gray-100">
        <td colSpan={14} className="px-4 py-2 font-bold text-gray-800">{titulo}</td>
      </tr>
      {items.map((f) => (
        <tr key={f.codigo} className={`border-b ${f.nivel < 4 ? "bg-gray-50 font-medium" : "hover:bg-gray-50"}`}>
          <td className="px-4 py-1" style={{ paddingLeft: `${(f.nivel - 1) * 16 + 16}px` }}>
            <span className="font-mono text-xs">{f.codigo}</span>
            <span className="ml-2">{f.nombre}</span>
          </td>
          {f.porMes.map((v, i) => (
            <td key={i} className="px-2 py-1 text-right font-mono text-xs">{v !== 0 ? formatMonto(v) : ""}</td>
          ))}
          <td className="px-4 py-1 text-right font-mono font-medium">{formatMonto(f.total)}</td>
        </tr>
      ))}
      <tr className="border-b-2 border-gray-300 bg-gray-50 font-bold">
        <td className="px-4 py-2">{totalLabel}</td>
        {Array(12).fill(0).map((_, i) => {
          const sum = items.filter((f) => f.nivel === 4).reduce((s, f) => s + f.porMes[i], 0);
          return <td key={i} className="px-2 py-2 text-right font-mono text-xs">{sum !== 0 ? formatMonto(sum) : ""}</td>;
        })}
        <td className={`px-4 py-2 text-right font-mono ${colorTotal}`}>{formatMonto(total)}</td>
      </tr>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900">Estado de Resultados</h1>
        <p className="text-gray-500 mt-1">Enero a Diciembre {anio}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
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
          <p className={`text-xl font-bold font-mono ${resultado >= 0 ? "text-blue-600" : "text-red-600"}`}>
            {formatMonto(resultado)} <span className="text-sm font-normal">{resultado >= 0 ? "Utilidad" : "Pérdida"}</span>
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b bg-gray-50">
              <th className="px-4 py-2 text-left font-medium sticky left-0 bg-gray-50">Cuenta</th>
              {MESES.slice(1).map((m) => (
                <th key={m} className="px-2 py-2 text-right font-medium text-xs">{m.slice(0, 3)}</th>
              ))}
              <th className="px-4 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            <Section titulo="INGRESOS" items={ingresosFilas} totalLabel="Total Ingresos" total={totalIngresos} colorTotal="text-green-600" />
            <Section titulo="COSTOS Y GASTOS" items={gastosFilas} totalLabel="Total Gastos" total={totalGastos} colorTotal="text-red-600" />

            <tr className="border-t-2 border-gray-400 bg-blue-50 font-bold text-lg">
              <td className="px-4 py-3">RESULTADO DEL EJERCICIO</td>
              {Array(12).fill(0).map((_, i) => {
                const ing = ingresosFilas.filter((f) => f.nivel === 4).reduce((s, f) => s + f.porMes[i], 0);
                const gas = gastosFilas.filter((f) => f.nivel === 4).reduce((s, f) => s + f.porMes[i], 0);
                const res = ing - gas;
                return <td key={i} className={`px-2 py-3 text-right font-mono text-xs ${res >= 0 ? "text-blue-600" : "text-red-600"}`}>{res !== 0 ? formatMonto(res) : ""}</td>;
              })}
              <td className={`px-4 py-3 text-right font-mono ${resultado >= 0 ? "text-blue-600" : "text-red-600"}`}>{formatMonto(resultado)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
