"use client";

import { useState } from "react";
import { formatMonto } from "@/lib/contabilidad/core";

type DocPendiente = {
  auxiliar_rut: string;
  razon_social: string;
  tipo_doc: string;
  num_doc: string;
  fecha_doc: string | null;
  saldo: number;
  dias: number;
};

type Props = {
  documentos: DocPendiente[];
  totalPendiente: number;
};

function AgingBadge({ dias }: { dias: number }) {
  if (dias <= 30) return <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Al día</span>;
  if (dias <= 60) return <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">31-60d</span>;
  if (dias <= 90) return <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700">61-90d</span>;
  return <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">&gt;90d</span>;
}

export default function CxCClient({ documentos, totalPendiente }: Props) {
  const [buscar, setBuscar] = useState("");

  const vencidos = documentos.filter((d) => d.dias > 30);
  const montoVencido = vencidos.reduce((s, d) => s + d.saldo, 0);

  const filtrados = documentos.filter((d) => {
    if (!buscar) return true;
    const q = buscar.toLowerCase();
    return d.razon_social.toLowerCase().includes(q) || d.auxiliar_rut.includes(q) || d.num_doc.includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900">Cuentas por Cobrar</h1>
        <p className="text-gray-500 mt-1">Documentos pendientes de cobro</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Total Pendiente</p>
          <p className="text-2xl font-bold font-mono text-blue-600">{formatMonto(totalPendiente)}</p>
          <p className="text-xs text-gray-400">{documentos.length} documentos</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Monto Vencido (&gt;30d)</p>
          <p className={`text-2xl font-bold font-mono ${montoVencido > 0 ? "text-red-600" : "text-green-600"}`}>{formatMonto(montoVencido)}</p>
          <p className="text-xs text-gray-400">{vencidos.length} documentos</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Al Día</p>
          <p className="text-2xl font-bold font-mono text-green-600">{formatMonto(totalPendiente - montoVencido)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b">
          <input
            type="text"
            placeholder="Buscar por RUT, razón social o N° documento..."
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b bg-gray-50">
                <th className="px-4 py-2 text-left font-medium">RUT</th>
                <th className="px-4 py-2 text-left font-medium">Razón Social</th>
                <th className="px-3 py-2 text-left font-medium">Tipo</th>
                <th className="px-3 py-2 text-left font-medium">N°</th>
                <th className="px-3 py-2 text-left font-medium">Fecha</th>
                <th className="px-3 py-2 text-right font-medium">Saldo</th>
                <th className="px-3 py-2 text-center font-medium">Antigüedad</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((d, i) => (
                <tr key={`${d.auxiliar_rut}-${d.tipo_doc}-${d.num_doc}-${i}`} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{d.auxiliar_rut}</td>
                  <td className="px-4 py-2">{d.razon_social}</td>
                  <td className="px-3 py-2">{d.tipo_doc}</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.num_doc}</td>
                  <td className="px-3 py-2 text-xs">{d.fecha_doc || "—"}</td>
                  <td className="px-3 py-2 text-right font-mono font-medium">{formatMonto(d.saldo)}</td>
                  <td className="px-3 py-2 text-center"><AgingBadge dias={d.dias} /></td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin documentos pendientes</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {filtrados.length > 0 && (
          <div className="border-t px-4 py-3 flex justify-between font-bold text-sm">
            <span>Total</span>
            <span className="font-mono text-blue-600">{formatMonto(filtrados.reduce((s, d) => s + d.saldo, 0))}</span>
          </div>
        )}
      </div>
    </div>
  );
}
