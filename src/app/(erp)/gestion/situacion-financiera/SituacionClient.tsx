"use client";

import { formatMonto } from "@/lib/contabilidad/core";

type FilaBG = { codigo: string; nombre: string; tipo: string; nivel: number; saldo: number };

function SeccionBalance({ titulo, items, total, totalLabel, color }: {
  titulo: string; items: FilaBG[]; total: number; totalLabel: string; color: string;
}) {
  return (
    <div>
      <h3 className={`text-lg font-bold ${color} mb-2`}>{titulo}</h3>
      <table className="w-full text-sm mb-4">
        <tbody>
          {items.map((f) => (
            <tr key={f.codigo} className={`border-b ${f.nivel < 4 ? "font-medium bg-gray-50" : "hover:bg-gray-50"}`}>
              <td className="py-1.5" style={{ paddingLeft: `${(f.nivel - 1) * 16}px` }}>
                <span className="font-mono text-xs text-gray-500">{f.codigo}</span>
                <span className="ml-2">{f.nombre}</span>
              </td>
              <td className="py-1.5 text-right font-mono w-32">{formatMonto(f.saldo)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-gray-400 font-bold">
            <td className="py-2">{totalLabel}</td>
            <td className={`py-2 text-right font-mono ${color}`}>{formatMonto(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function SituacionClient({
  anio, filas, totalActivo, totalPasivo, totalPatrimonio, resultadoEjercicio,
}: {
  anio: number;
  filas: FilaBG[];
  totalActivo: number;
  totalPasivo: number;
  totalPatrimonio: number;
  resultadoEjercicio: number;
}) {
  const activos = filas.filter((f) => f.tipo === "A");
  const pasivos = filas.filter((f) => f.tipo === "P");
  const patrimonio = filas.filter((f) => f.tipo === "T");
  const totalPasivoPatrimonio = totalPasivo + totalPatrimonio + resultadoEjercicio;
  const cuadra = Math.abs(totalActivo - totalPasivoPatrimonio) < 2;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900">Situación Financiera</h1>
        <p className="text-gray-500 mt-1">Balance General Clasificado al 31/12/{anio}</p>
      </div>

      {/* Cuadratura */}
      <div className={`p-4 rounded-lg text-sm font-medium ${cuadra ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
        Activo: {formatMonto(totalActivo)} = Pasivo + Patrimonio: {formatMonto(totalPasivoPatrimonio)}
        {cuadra ? " — Cuadra" : " — DESCUADRADO"}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Activos */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <SeccionBalance titulo="ACTIVOS" items={activos} total={totalActivo} totalLabel="Total Activos" color="text-blue-700" />
        </div>

        {/* Pasivo + Patrimonio */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <SeccionBalance titulo="PASIVOS" items={pasivos} total={totalPasivo} totalLabel="Total Pasivos" color="text-red-700" />

          <SeccionBalance titulo="PATRIMONIO" items={patrimonio} total={totalPatrimonio} totalLabel="Total Patrimonio (sin resultado)" color="text-purple-700" />

          {/* Resultado */}
          <div className="border-t pt-3">
            <div className="flex justify-between font-medium">
              <span>Resultado del ejercicio</span>
              <span className={`font-mono ${resultadoEjercicio >= 0 ? "text-green-600" : "text-red-600"}`}>{formatMonto(resultadoEjercicio)}</span>
            </div>
          </div>

          <div className="border-t-2 border-gray-400 pt-3">
            <div className="flex justify-between font-bold text-lg">
              <span>Total Pasivo + Patrimonio</span>
              <span className="font-mono">{formatMonto(totalPasivoPatrimonio)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
