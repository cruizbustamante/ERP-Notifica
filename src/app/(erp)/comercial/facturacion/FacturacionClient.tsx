"use client";

import { useState } from "react";
import { formatMonto, MESES } from "@/lib/contabilidad/core";

type Documento = {
  id: number;
  tipo_dte: number;
  tipo_dte_nombre: string;
  rut_receptor: string;
  razon_social: string;
  folio: string;
  fecha_emision: string;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
  estado_sii: string;
  centralizado: boolean;
};

type ResumenMes = {
  mes: number;
  facturas: number;
  nc: number;
  total: number;
};

type Props = {
  anio: number;
  documentos: Documento[];
  resumenMensual: ResumenMes[];
  totalFacturado: number;
  totalNC: number;
  cantDocs: number;
};

const MAPA_DTE: Record<number, string> = {
  33: "FAC", 34: "FEX", 39: "BV", 41: "BVE", 46: "FC",
  56: "ND", 61: "NC", 110: "FEX", 111: "NCE", 112: "NDE",
};

export default function FacturacionClient({ anio, documentos, resumenMensual, totalFacturado, totalNC, cantDocs }: Props) {
  const [mesFilter, setMesFilter] = useState(0);
  const [buscar, setBuscar] = useState("");

  const filtrados = documentos.filter((d) => {
    if (mesFilter > 0) {
      const docMes = new Date(d.fecha_emision).getMonth() + 1;
      if (docMes !== mesFilter) return false;
    }
    if (buscar) {
      const q = buscar.toLowerCase();
      return d.razon_social.toLowerCase().includes(q) || d.rut_receptor.includes(q) || d.folio.includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900">Facturación</h1>
        <p className="text-gray-500 mt-1">Documentos emitidos — {anio}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Total Facturado</p>
          <p className="text-2xl font-bold font-mono text-green-600">{formatMonto(totalFacturado)}</p>
          <p className="text-xs text-gray-400">{cantDocs} documentos</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Notas de Crédito</p>
          <p className="text-2xl font-bold font-mono text-red-600">{formatMonto(totalNC)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Neto</p>
          <p className="text-2xl font-bold font-mono text-blue-600">{formatMonto(totalFacturado - totalNC)}</p>
        </div>
      </div>

      {/* Resumen mensual */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b bg-gray-50">
              <th className="px-4 py-2 text-left font-medium">Mes</th>
              <th className="px-3 py-2 text-right font-medium">Facturas</th>
              <th className="px-3 py-2 text-right font-medium">NC</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {resumenMensual.filter((r) => r.facturas > 0 || r.nc > 0).map((r) => (
              <tr
                key={r.mes}
                className={`border-b hover:bg-gray-50 cursor-pointer ${mesFilter === r.mes ? "bg-blue-50" : ""}`}
                onClick={() => setMesFilter(mesFilter === r.mes ? 0 : r.mes)}
              >
                <td className="px-4 py-2 font-medium">{MESES[r.mes]}</td>
                <td className="px-3 py-2 text-right">{r.facturas}</td>
                <td className="px-3 py-2 text-right text-red-500">{r.nc || ""}</td>
                <td className="px-4 py-2 text-right font-mono font-medium">{formatMonto(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detalle */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 p-4 border-b">
          <input
            type="text"
            placeholder="Buscar por RUT, razón social o folio..."
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {mesFilter > 0 && (
            <button onClick={() => setMesFilter(0)} className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
              {MESES[mesFilter]} ✕
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b bg-gray-50">
                <th className="px-3 py-2 text-left font-medium">Tipo</th>
                <th className="px-3 py-2 text-left font-medium">Folio</th>
                <th className="px-3 py-2 text-left font-medium">Fecha</th>
                <th className="px-3 py-2 text-left font-medium">RUT</th>
                <th className="px-4 py-2 text-left font-medium">Razón Social</th>
                <th className="px-3 py-2 text-right font-medium">Neto</th>
                <th className="px-3 py-2 text-right font-medium">IVA</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-2 py-2 text-center font-medium">SII</th>
                <th className="px-2 py-2 text-center font-medium">Cent.</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((d) => {
                const isNC = [61, 111].includes(d.tipo_dte);
                return (
                  <tr key={d.id} className={`border-b hover:bg-gray-50 ${isNC ? "bg-red-50/30" : ""}`}>
                    <td className="px-3 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${isNC ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                        {MAPA_DTE[d.tipo_dte] || d.tipo_dte}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs">{d.folio}</td>
                    <td className="px-3 py-1.5 text-xs">{d.fecha_emision}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{d.rut_receptor}</td>
                    <td className="px-4 py-1.5 max-w-[200px] truncate">{d.razon_social}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">{formatMonto(d.monto_neto)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">{formatMonto(d.monto_iva)}</td>
                    <td className={`px-3 py-1.5 text-right font-mono font-medium ${isNC ? "text-red-600" : ""}`}>{formatMonto(d.monto_total)}</td>
                    <td className="px-2 py-1.5 text-center text-xs">{d.estado_sii === "DOK" ? "✓" : d.estado_sii}</td>
                    <td className="px-2 py-1.5 text-center">{d.centralizado ? <span className="text-green-500">●</span> : <span className="text-gray-300">○</span>}</td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Sin documentos</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t px-4 py-2 text-xs text-gray-400">{filtrados.length} documentos</div>
      </div>
    </div>
  );
}
