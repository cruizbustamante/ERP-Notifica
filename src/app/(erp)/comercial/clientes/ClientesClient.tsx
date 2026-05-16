"use client";

import { useState } from "react";
import { formatMonto } from "@/lib/contabilidad/core";

type Cliente = {
  rut: string;
  razon_social: string;
  giro: string;
  email: string;
  telefono: string;
  comuna: string;
  totalVentas: number;
  cantDocs: number;
  ultimaVenta: string | null;
  saldoPendiente: number;
};

type Props = {
  clientes: Cliente[];
  totalClientes: number;
  totalVentasGlobal: number;
  clientesConDeuda: number;
};

export default function ClientesClient({ clientes, totalClientes, totalVentasGlobal, clientesConDeuda }: Props) {
  const [buscar, setBuscar] = useState("");
  const [ordenar, setOrdenar] = useState<"ventas" | "nombre" | "deuda">("ventas");

  const filtrados = clientes
    .filter((c) => {
      const q = buscar.toLowerCase();
      return !q || c.razon_social.toLowerCase().includes(q) || c.rut.includes(q);
    })
    .sort((a, b) => {
      if (ordenar === "ventas") return b.totalVentas - a.totalVentas;
      if (ordenar === "deuda") return b.saldoPendiente - a.saldoPendiente;
      return a.razon_social.localeCompare(b.razon_social);
    });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
        <p className="text-gray-500 mt-1">Ficha comercial y gestión de clientes</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Total Clientes</p>
          <p className="text-2xl font-bold text-gray-900">{totalClientes}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Ventas Totales</p>
          <p className="text-2xl font-bold font-mono text-green-600">{formatMonto(totalVentasGlobal)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Clientes con Deuda</p>
          <p className={`text-2xl font-bold ${clientesConDeuda > 0 ? "text-amber-600" : "text-green-600"}`}>{clientesConDeuda}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 p-4 border-b">
          <input
            type="text"
            placeholder="Buscar por RUT o razón social..."
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select value={ordenar} onChange={(e) => setOrdenar(e.target.value as "ventas" | "nombre" | "deuda")} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="ventas">Mayor ventas</option>
            <option value="deuda">Mayor deuda</option>
            <option value="nombre">Alfabético</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b bg-gray-50">
                <th className="px-4 py-2 text-left font-medium">RUT</th>
                <th className="px-4 py-2 text-left font-medium">Razón Social</th>
                <th className="px-3 py-2 text-left font-medium">Giro</th>
                <th className="px-3 py-2 text-left font-medium">Contacto</th>
                <th className="px-2 py-2 text-right font-medium">Docs</th>
                <th className="px-3 py-2 text-right font-medium">Ventas</th>
                <th className="px-3 py-2 text-right font-medium">Deuda</th>
                <th className="px-3 py-2 text-left font-medium">Última Vta.</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.rut} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{c.rut}</td>
                  <td className="px-4 py-2 font-medium">{c.razon_social}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 max-w-[200px] truncate">{c.giro}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {c.email && <div>{c.email}</div>}
                    {c.telefono && <div>{c.telefono}</div>}
                  </td>
                  <td className="px-2 py-2 text-right">{c.cantDocs}</td>
                  <td className="px-3 py-2 text-right font-mono text-green-600">{formatMonto(c.totalVentas)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${c.saldoPendiente > 0 ? "text-amber-600 font-medium" : "text-gray-400"}`}>
                    {c.saldoPendiente > 0 ? formatMonto(c.saldoPendiente) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{c.ultimaVenta || "—"}</td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t px-4 py-2 text-xs text-gray-400">
          {filtrados.length} de {clientes.length} clientes
        </div>
      </div>
    </div>
  );
}
