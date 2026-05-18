"use client";

import { formatMonto, MESES } from "@/lib/contabilidad/core";
import { crearLibroCorporativo, descargarWorkbook } from "@/lib/excel";
import YearSelector from "@/components/YearSelector";

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
  periodos: { anio: number; estado: string }[];
};

const COLORES: Record<string, string> = {
  OPERACIONAL: "text-blue-700",
  "INVERSIÓN": "text-purple-700",
  FINANCIAMIENTO: "text-amber-700",
  "SIN CLASIFICAR": "text-gray-500",
};

export default function FlujoEfectivoClient({ anio, categorias, saldoInicial, totalAbonos, totalCargos, periodos }: Props) {
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

  const right: { horizontal: "right"; vertical: "middle" } = { horizontal: "right", vertical: "middle" };

  const descargarExcel = async () => {
    const mesCols = mesLabels.map((m) => ({
      key: m.toLowerCase().slice(0, 3), header: m.slice(0, 3), width: 12, numFmt: "#,##0", alignment: right,
    }));

    const rows: Record<string, unknown>[] = [];

    // Saldo Inicial
    const siRow: Record<string, unknown> = { concepto: "SALDO INICIAL", total: saldoInicial };
    mesLabels.forEach((m) => { siRow[m.toLowerCase().slice(0, 3)] = ""; });
    rows.push(siRow);

    // Categorías
    for (const cat of categorias) {
      const r: Record<string, unknown> = { concepto: cat.categoria, total: cat.total };
      mesLabels.forEach((m, i) => { r[m.toLowerCase().slice(0, 3)] = cat.porMes[i] || ""; });
      rows.push(r);
    }

    // Flujo Neto
    const fnRow: Record<string, unknown> = { concepto: "FLUJO NETO", total: flujoNeto };
    mesLabels.forEach((m, i) => { fnRow[m.toLowerCase().slice(0, 3)] = flujoNetoMes[i] || ""; });
    rows.push(fnRow);

    // Saldo Acumulado
    const saRow: Record<string, unknown> = { concepto: "SALDO ACUMULADO", total: saldoFinal };
    mesLabels.forEach((m, i) => { saRow[m.toLowerCase().slice(0, 3)] = saldoAcumulado[i]; });
    rows.push(saRow);

    const wb = crearLibroCorporativo({
      titulo: "ESTADO DE FLUJO DE EFECTIVO",
      periodo: `Enero a Diciembre ${anio}`,
      hoja: "EFE",
      columnas: [
        { key: "concepto", header: "Concepto", width: 22 },
        ...mesCols,
        { key: "total", header: "Total", width: 16, numFmt: "#,##0", alignment: right },
      ],
      datos: rows,
    });

    await descargarWorkbook(wb, `Flujo_Efectivo_${anio}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900">Flujo de Efectivo</h1>
            <p className="text-gray-500 mt-1 text-sm">Movimiento de caja — {anio}</p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <YearSelector anio={anio} periodos={periodos} />
            <button onClick={descargarExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700">
              Descargar Excel
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-gray-500">Saldo Inicial</p>
          <p className="text-lg sm:text-xl font-bold font-mono text-gray-700">{formatMonto(saldoInicial)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-gray-500">Total Ingresos</p>
          <p className="text-lg sm:text-xl font-bold font-mono text-green-600">{formatMonto(totalAbonos)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-gray-500">Total Egresos</p>
          <p className="text-lg sm:text-xl font-bold font-mono text-red-600">{formatMonto(totalCargos)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-gray-500">Saldo Final</p>
          <p className={`text-lg sm:text-xl font-bold font-mono ${saldoFinal >= 0 ? "text-blue-600" : "text-red-600"}`}>{formatMonto(saldoFinal)}</p>
        </div>
      </div>

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

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b bg-gray-50">
              <th className="px-4 py-2 text-left font-medium sticky left-0 bg-gray-50">Categoria</th>
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

            <tr className="border-t-2 border-gray-400 bg-blue-50 font-bold">
              <td className="px-4 py-2">FLUJO NETO</td>
              {flujoNetoMes.map((v, i) => (
                <td key={i} className={`px-2 py-2 text-right font-mono text-xs ${v < 0 ? "text-red-600" : "text-blue-600"}`}>
                  {v !== 0 ? formatMonto(v) : ""}
                </td>
              ))}
              <td className={`px-4 py-2 text-right font-mono ${flujoNeto < 0 ? "text-red-600" : "text-blue-600"}`}>{formatMonto(flujoNeto)}</td>
            </tr>

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
