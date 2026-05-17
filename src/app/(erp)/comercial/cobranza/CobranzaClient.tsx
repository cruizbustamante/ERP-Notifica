"use client";

import { formatMonto } from "@/lib/contabilidad/core";
import { formatRut } from "@/lib/rut";

type ClienteCobranza = {
  rut: string;
  razon_social: string;
  email: string;
  telefono: string;
  totalDeuda: number;
  docs: number;
  diasMax: number;
  nivel: "NORMAL" | "ALERTA" | "CRÍTICO" | "JUDICIAL";
};

type Props = {
  clientes: ClienteCobranza[];
  totalDeuda: number;
  totalNormal: number;
  totalAlerta: number;
  totalCritico: number;
};

const NIVELES = {
  NORMAL: { label: "Normal (0-30d)", bg: "bg-green-50 border-green-200", text: "text-green-700", badge: "bg-green-100 text-green-700" },
  ALERTA: { label: "Alerta (31-60d)", bg: "bg-yellow-50 border-yellow-200", text: "text-yellow-700", badge: "bg-yellow-100 text-yellow-700" },
  "CRÍTICO": { label: "Crítico (61-90d)", bg: "bg-orange-50 border-orange-200", text: "text-orange-700", badge: "bg-orange-100 text-orange-700" },
  JUDICIAL: { label: "Judicial (>90d)", bg: "bg-red-50 border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-700" },
};

function SeccionNivel({ nivel, clientes }: { nivel: keyof typeof NIVELES; clientes: ClienteCobranza[] }) {
  const config = NIVELES[nivel];
  const total = clientes.reduce((s, c) => s + c.totalDeuda, 0);

  if (clientes.length === 0) return null;

  return (
    <div className={`rounded-xl border shadow-sm ${config.bg}`}>
      <div className="flex items-center justify-between p-4 border-b border-current/10">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs font-bold ${config.badge}`}>{config.label}</span>
          <span className="text-sm text-gray-600">{clientes.length} clientes</span>
        </div>
        <span className={`font-bold font-mono ${config.text}`}>{formatMonto(total)}</span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 border-b">
            <th className="px-4 py-2 text-left font-medium">RUT</th>
            <th className="px-4 py-2 text-left font-medium">Razón Social</th>
            <th className="px-3 py-2 text-left font-medium">Contacto</th>
            <th className="px-2 py-2 text-right font-medium">Docs</th>
            <th className="px-2 py-2 text-right font-medium">Días</th>
            <th className="px-4 py-2 text-right font-medium">Deuda</th>
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => (
            <tr key={c.rut} className="border-b last:border-b-0 hover:bg-white/50">
              <td className="px-4 py-2 font-mono text-xs">{formatRut(c.rut)}</td>
              <td className="px-4 py-2 font-medium">{c.razon_social}</td>
              <td className="px-3 py-2 text-xs text-gray-600">
                {c.email && <div>{c.email}</div>}
                {c.telefono && <div>{c.telefono}</div>}
              </td>
              <td className="px-2 py-2 text-right">{c.docs}</td>
              <td className="px-2 py-2 text-right font-mono text-xs">{c.diasMax}</td>
              <td className={`px-4 py-2 text-right font-mono font-medium ${config.text}`}>{formatMonto(c.totalDeuda)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CobranzaClient({ clientes, totalDeuda, totalNormal, totalAlerta, totalCritico }: Props) {
  const porNivel = {
    JUDICIAL: clientes.filter((c) => c.nivel === "JUDICIAL"),
    "CRÍTICO": clientes.filter((c) => c.nivel === "CRÍTICO"),
    ALERTA: clientes.filter((c) => c.nivel === "ALERTA"),
    NORMAL: clientes.filter((c) => c.nivel === "NORMAL"),
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900">Cobranza</h1>
        <p className="text-gray-500 mt-1">Gestión de cobranza por niveles de antigüedad</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Deuda Total</p>
          <p className="text-2xl font-bold font-mono text-gray-900">{formatMonto(totalDeuda)}</p>
          <p className="text-xs text-gray-400">{clientes.length} clientes</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 shadow-sm p-4">
          <p className="text-sm text-green-700">Normal</p>
          <p className="text-xl font-bold font-mono text-green-600">{formatMonto(totalNormal)}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 shadow-sm p-4">
          <p className="text-sm text-yellow-700">Alerta</p>
          <p className="text-xl font-bold font-mono text-yellow-600">{formatMonto(totalAlerta)}</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 shadow-sm p-4">
          <p className="text-sm text-red-700">Crítico + Judicial</p>
          <p className="text-xl font-bold font-mono text-red-600">{formatMonto(totalCritico)}</p>
        </div>
      </div>

      <div className="space-y-4">
        <SeccionNivel nivel="JUDICIAL" clientes={porNivel.JUDICIAL} />
        <SeccionNivel nivel="CRÍTICO" clientes={porNivel["CRÍTICO"]} />
        <SeccionNivel nivel="ALERTA" clientes={porNivel.ALERTA} />
        <SeccionNivel nivel="NORMAL" clientes={porNivel.NORMAL} />
      </div>

      {clientes.length === 0 && (
        <div className="bg-green-50 rounded-xl border border-green-200 p-8 text-center">
          <p className="text-green-700 font-medium">Sin cuentas por cobrar pendientes</p>
        </div>
      )}
    </div>
  );
}
