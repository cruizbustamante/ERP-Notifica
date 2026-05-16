"use client";

import { formatMonto, MESES } from "@/lib/contabilidad/core";

type Props = {
  anio: number;
  mes: number;
  ingresosPorMes: number[];
  gastosPorMes: number[];
  ventasPorMes: number[];
  totalIngresos: number;
  totalGastos: number;
  totalVentas: number;
  noCentralizadosVentas: { cant: number; monto: number };
  noCentralizadosCompras: { cant: number; monto: number };
  cartolaPend: { cant: number; abonos: number; cargos: number };
};

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold font-mono mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function BarChart({ data, labels, color }: { data: number[]; labels: string[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center">
          <div
            className={`w-full rounded-t ${color} min-h-[2px]`}
            style={{ height: `${(v / max) * 100}%` }}
            title={`${labels[i]}: ${formatMonto(v)}`}
          />
          <span className="text-[10px] text-gray-400 mt-1">{labels[i].slice(0, 3)}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardClient(props: Props) {
  const resultado = props.totalIngresos - props.totalGastos;
  const margen = props.totalIngresos > 0 ? (resultado / props.totalIngresos) * 100 : 0;
  const mesLabels = MESES.slice(1);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Ejecutivo</h1>
        <p className="text-gray-500 mt-1">Indicadores clave — {props.anio}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Ingresos acumulados" value={formatMonto(props.totalIngresos)} color="text-green-600" />
        <KpiCard label="Gastos acumulados" value={formatMonto(props.totalGastos)} color="text-red-600" />
        <KpiCard
          label="Resultado"
          value={formatMonto(resultado)}
          sub={`Margen: ${margen.toFixed(1)}%`}
          color={resultado >= 0 ? "text-blue-600" : "text-red-600"}
        />
        <KpiCard label="Ventas SII" value={formatMonto(props.totalVentas)} color="text-gray-900" />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Ingresos por mes</h3>
          <BarChart data={props.ingresosPorMes} labels={mesLabels} color="bg-green-500" />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Gastos por mes</h3>
          <BarChart data={props.gastosPorMes} labels={mesLabels} color="bg-red-400" />
        </div>
      </div>

      {/* Alertas pendientes */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Pendientes</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className={`p-4 rounded-lg border ${props.noCentralizadosVentas.cant > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
            <p className="font-medium">Ventas sin centralizar</p>
            <p className="text-2xl font-bold font-mono mt-1">{props.noCentralizadosVentas.cant}</p>
            <p className="text-xs text-gray-500">{formatMonto(props.noCentralizadosVentas.monto)}</p>
          </div>
          <div className={`p-4 rounded-lg border ${props.noCentralizadosCompras.cant > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
            <p className="font-medium">Compras sin centralizar</p>
            <p className="text-2xl font-bold font-mono mt-1">{props.noCentralizadosCompras.cant}</p>
            <p className="text-xs text-gray-500">{formatMonto(props.noCentralizadosCompras.monto)}</p>
          </div>
          <div className={`p-4 rounded-lg border ${props.cartolaPend.cant > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
            <p className="font-medium">Cartola sin contabilizar</p>
            <p className="text-2xl font-bold font-mono mt-1">{props.cartolaPend.cant}</p>
            <p className="text-xs text-gray-500">Abonos: {formatMonto(props.cartolaPend.abonos)} · Cargos: {formatMonto(props.cartolaPend.cargos)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
