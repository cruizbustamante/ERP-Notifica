"use client";

import { formatMonto, MESES } from "@/lib/contabilidad/core";
import { formatRut } from "@/lib/rut";

type ClienteMRR = {
  rut: string;
  razon_social: string;
  porMes: number[];
  totalAnio: number;
  mesesActivos: number;
  promedioMensual: number;
  esRecurrente: boolean;
};

type Props = {
  anio: number;
  clientes: ClienteMRR[];
  mrrPorMes: number[];
  totalMRR: number;
  clientesRecurrentes: number;
  totalClientes: number;
};

export default function SuscripcionesClient({ anio, clientes, mrrPorMes, totalMRR, clientesRecurrentes, totalClientes }: Props) {
  const mesLabels = MESES.slice(1);
  const recurrentes = clientes.filter((c) => c.esRecurrente);
  const noRecurrentes = clientes.filter((c) => !c.esRecurrente);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900">Suscripciones</h1>
        <p className="text-gray-500 mt-1">Análisis de recurrencia de ingresos — {anio}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Ingreso Recurrente</p>
          <p className="text-2xl font-bold font-mono text-green-600">{formatMonto(totalMRR)}</p>
          <p className="text-xs text-gray-400">Clientes con 3+ meses</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Clientes Recurrentes</p>
          <p className="text-2xl font-bold text-blue-600">{clientesRecurrentes}</p>
          <p className="text-xs text-gray-400">de {totalClientes} totales</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Promedio MRR</p>
          <p className="text-2xl font-bold font-mono text-purple-600">
            {formatMonto(clientesRecurrentes > 0 ? totalMRR / clientesRecurrentes : 0)}
          </p>
          <p className="text-xs text-gray-400">por cliente recurrente</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Tasa Recurrencia</p>
          <p className="text-2xl font-bold font-mono text-green-600">
            {totalClientes > 0 ? ((clientesRecurrentes / totalClientes) * 100).toFixed(0) : 0}%
          </p>
        </div>
      </div>

      {/* MRR mensual */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Ingreso recurrente por mes</h3>
        <div className="flex items-end gap-1 h-32">
          {mrrPorMes.map((v, i) => {
            const max = Math.max(...mrrPorMes, 1);
            return (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full rounded-t bg-green-400 min-h-[2px]"
                  style={{ height: `${(v / max) * 100}%` }}
                  title={`${mesLabels[i]}: ${formatMonto(v)}`}
                />
                <span className="text-[10px] text-gray-400 mt-1">{mesLabels[i].slice(0, 3)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabla clientes recurrentes */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b">
          <h3 className="text-sm font-medium text-gray-700">Clientes recurrentes ({recurrentes.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b bg-gray-50">
                <th className="px-4 py-2 text-left font-medium sticky left-0 bg-gray-50">Cliente</th>
                {mesLabels.map((m) => (
                  <th key={m} className="px-2 py-2 text-right font-medium text-xs">{m.slice(0, 3)}</th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Prom.</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {recurrentes.map((c) => (
                <tr key={c.rut} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-1.5 sticky left-0 bg-white">
                    <div className="font-medium">{c.razon_social}</div>
                    <div className="font-mono text-xs text-gray-400">{formatRut(c.rut)}</div>
                  </td>
                  {c.porMes.map((v, i) => (
                    <td key={i} className="px-2 py-1.5 text-right font-mono text-xs">
                      {v > 0 ? formatMonto(v) : <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-purple-600">{formatMonto(c.promedioMensual)}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-medium text-green-600">{formatMonto(c.totalAnio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clientes esporádicos */}
      {noRecurrentes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 border-b">
            <h3 className="text-sm font-medium text-gray-700">Clientes esporádicos ({noRecurrentes.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b bg-gray-50">
                  <th className="px-4 py-2 text-left font-medium">RUT</th>
                  <th className="px-4 py-2 text-left font-medium">Razón Social</th>
                  <th className="px-3 py-2 text-right font-medium">Meses</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {noRecurrentes.map((c) => (
                  <tr key={c.rut} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-1.5 font-mono text-xs">{formatRut(c.rut)}</td>
                    <td className="px-4 py-1.5">{c.razon_social}</td>
                    <td className="px-3 py-1.5 text-right">{c.mesesActivos}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{formatMonto(c.totalAnio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
