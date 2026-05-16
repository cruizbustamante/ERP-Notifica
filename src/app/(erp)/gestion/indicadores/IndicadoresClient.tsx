"use client";

import { formatMonto, formatNumero } from "@/lib/contabilidad/core";

type Indicador = {
  nombre: string;
  valor: number;
  formato: "pct" | "ratio" | "monto" | "dias";
  color: string;
  descripcion: string;
};

type Props = {
  anio: number;
  indicadores: Indicador[];
  activoCorriente: number;
  activoNoCorriente: number;
  pasivoCorriente: number;
  pasivoNoCorriente: number;
  patrimonio: number;
  ingresos: number;
  gastos: number;
  resultado: number;
};

function formatIndicador(valor: number, formato: string): string {
  switch (formato) {
    case "pct": return `${valor.toFixed(1)}%`;
    case "ratio": return valor.toFixed(2);
    case "monto": return formatMonto(valor);
    case "dias": return `${Math.round(valor)} días`;
    default: return formatNumero(valor);
  }
}

function colorValor(valor: number, nombre: string): string {
  if (nombre.includes("Liquidez")) return valor >= 1 ? "text-green-600" : "text-red-600";
  if (nombre.includes("Endeudamiento")) return valor <= 1 ? "text-green-600" : valor <= 2 ? "text-yellow-600" : "text-red-600";
  if (nombre.includes("Margen") || nombre.includes("ROE") || nombre.includes("ROA")) return valor >= 0 ? "text-green-600" : "text-red-600";
  if (nombre.includes("Capital")) return valor >= 0 ? "text-blue-600" : "text-red-600";
  return "text-gray-900";
}

export default function IndicadoresClient(props: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900">Indicadores Financieros</h1>
        <p className="text-gray-500 mt-1">Ratios clave — {props.anio}</p>
      </div>

      {/* Balance resumido */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 uppercase">Activo Corriente</p>
          <p className="text-lg font-bold font-mono text-blue-600">{formatMonto(props.activoCorriente)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 uppercase">Pasivo Corriente</p>
          <p className="text-lg font-bold font-mono text-red-600">{formatMonto(props.pasivoCorriente)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 uppercase">Patrimonio</p>
          <p className="text-lg font-bold font-mono text-purple-600">{formatMonto(props.patrimonio)}</p>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {props.indicadores.map((ind) => (
          <div key={ind.nombre} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <p className="text-sm text-gray-500 font-medium">{ind.nombre}</p>
            <p className={`text-3xl font-bold font-mono mt-2 ${colorValor(ind.valor, ind.nombre)}`}>
              {formatIndicador(ind.valor, ind.formato)}
            </p>
            <p className="text-xs text-gray-400 mt-2">{ind.descripcion}</p>
          </div>
        ))}
      </div>

      {/* Composición */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Composición del Balance</h3>
        <div className="grid grid-cols-2 gap-8">
          {/* Activos */}
          <div>
            <p className="text-xs text-gray-500 mb-2">ACTIVOS</p>
            <div className="space-y-2">
              <BarRow label="Corriente" monto={props.activoCorriente} total={props.activoCorriente + props.activoNoCorriente} color="bg-blue-400" />
              <BarRow label="No Corriente" monto={props.activoNoCorriente} total={props.activoCorriente + props.activoNoCorriente} color="bg-blue-200" />
            </div>
            <p className="text-sm font-bold mt-2 text-right font-mono">{formatMonto(props.activoCorriente + props.activoNoCorriente)}</p>
          </div>
          {/* Pasivos + Patrimonio */}
          <div>
            <p className="text-xs text-gray-500 mb-2">PASIVO + PATRIMONIO</p>
            <div className="space-y-2">
              <BarRow label="Pasivo Corriente" monto={props.pasivoCorriente} total={props.pasivoCorriente + props.pasivoNoCorriente + props.patrimonio + props.resultado} color="bg-red-400" />
              <BarRow label="Pasivo No Corriente" monto={props.pasivoNoCorriente} total={props.pasivoCorriente + props.pasivoNoCorriente + props.patrimonio + props.resultado} color="bg-red-200" />
              <BarRow label="Patrimonio + Resultado" monto={props.patrimonio + props.resultado} total={props.pasivoCorriente + props.pasivoNoCorriente + props.patrimonio + props.resultado} color="bg-purple-300" />
            </div>
            <p className="text-sm font-bold mt-2 text-right font-mono">{formatMonto(props.pasivoCorriente + props.pasivoNoCorriente + props.patrimonio + props.resultado)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BarRow({ label, monto, total, color }: { label: string; monto: number; total: number; color: string }) {
  const pct = total > 0 ? (monto / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-0.5">
        <span>{label}</span>
        <span className="font-mono">{formatMonto(monto)} ({pct.toFixed(0)}%)</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}
