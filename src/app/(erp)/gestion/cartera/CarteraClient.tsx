"use client";

import { useState } from "react";
import { formatMonto } from "@/lib/contabilidad/core";
import { formatRut } from "@/lib/rut";

type DocPendiente = {
  auxiliar_rut: string;
  razon_social: string;
  tipo_doc: string;
  num_doc: string;
  fecha_doc: string | null;
  saldo: number;
  dias: number;
};

type ResumenAuxiliar = {
  rut: string;
  razon_social: string;
  total: number;
  al_dia: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  docs: number;
};

type Props = {
  cxc: DocPendiente[];
  cxp: DocPendiente[];
  resumenCxC: ResumenAuxiliar[];
  resumenCxP: ResumenAuxiliar[];
  totalCxC: number;
  totalCxP: number;
};

function AgingBadge({ dias }: { dias: number }) {
  if (dias <= 30) return <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Al día</span>;
  if (dias <= 60) return <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">31-60d</span>;
  if (dias <= 90) return <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700">61-90d</span>;
  return <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">&gt;90d</span>;
}

function TablaResumen({ items, color }: { items: ResumenAuxiliar[]; color: string }) {
  if (items.length === 0) return <p className="text-sm text-gray-400 p-4">Sin documentos pendientes</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-gray-500 border-b bg-gray-50">
          <th className="px-4 py-2 text-left font-medium">RUT</th>
          <th className="px-4 py-2 text-left font-medium">Razón Social</th>
          <th className="px-2 py-2 text-right font-medium">Docs</th>
          <th className="px-2 py-2 text-right font-medium text-green-600">Al día</th>
          <th className="px-2 py-2 text-right font-medium text-yellow-600">31-60</th>
          <th className="px-2 py-2 text-right font-medium text-orange-600">61-90</th>
          <th className="px-2 py-2 text-right font-medium text-red-600">&gt;90</th>
          <th className="px-4 py-2 text-right font-medium">Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((r) => (
          <tr key={r.rut} className="border-b hover:bg-gray-50">
            <td className="px-4 py-1.5 font-mono text-xs">{formatRut(r.rut)}</td>
            <td className="px-4 py-1.5">{r.razon_social}</td>
            <td className="px-2 py-1.5 text-right">{r.docs}</td>
            <td className="px-2 py-1.5 text-right font-mono text-xs">{r.al_dia > 0 ? formatMonto(r.al_dia) : ""}</td>
            <td className="px-2 py-1.5 text-right font-mono text-xs">{r.d31_60 > 0 ? formatMonto(r.d31_60) : ""}</td>
            <td className="px-2 py-1.5 text-right font-mono text-xs">{r.d61_90 > 0 ? formatMonto(r.d61_90) : ""}</td>
            <td className="px-2 py-1.5 text-right font-mono text-xs">{r.d90_plus > 0 ? formatMonto(r.d90_plus) : ""}</td>
            <td className={`px-4 py-1.5 text-right font-mono font-medium ${color}`}>{formatMonto(r.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaDetalle({ docs }: { docs: DocPendiente[] }) {
  if (docs.length === 0) return <p className="text-sm text-gray-400 p-4">Sin documentos pendientes</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-gray-500 border-b bg-gray-50">
          <th className="px-4 py-2 text-left font-medium">RUT</th>
          <th className="px-4 py-2 text-left font-medium">Razón Social</th>
          <th className="px-2 py-2 text-left font-medium">Doc</th>
          <th className="px-2 py-2 text-left font-medium">N°</th>
          <th className="px-2 py-2 text-left font-medium">Fecha</th>
          <th className="px-2 py-2 text-right font-medium">Saldo</th>
          <th className="px-2 py-2 text-center font-medium">Antigüedad</th>
        </tr>
      </thead>
      <tbody>
        {docs.map((d, i) => (
          <tr key={`${d.auxiliar_rut}-${d.tipo_doc}-${d.num_doc}-${i}`} className="border-b hover:bg-gray-50">
            <td className="px-4 py-1.5 font-mono text-xs">{formatRut(d.auxiliar_rut)}</td>
            <td className="px-4 py-1.5">{d.razon_social}</td>
            <td className="px-2 py-1.5">{d.tipo_doc}</td>
            <td className="px-2 py-1.5 font-mono text-xs">{d.num_doc}</td>
            <td className="px-2 py-1.5 text-xs">{d.fecha_doc || "—"}</td>
            <td className="px-2 py-1.5 text-right font-mono">{formatMonto(d.saldo)}</td>
            <td className="px-2 py-1.5 text-center"><AgingBadge dias={d.dias} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CarteraClient({ cxc, cxp, resumenCxC, resumenCxP, totalCxC, totalCxP }: Props) {
  const [vista, setVista] = useState<"CXC" | "CXP">("CXC");
  const [modo, setModo] = useState<"resumen" | "detalle">("resumen");

  const docs = vista === "CXC" ? cxc : cxp;
  const resumen = vista === "CXC" ? resumenCxC : resumenCxP;

  const agingTotals = (items: DocPendiente[]) => ({
    alDia: items.filter((d) => d.dias <= 30).reduce((s, d) => s + d.saldo, 0),
    d31: items.filter((d) => d.dias > 30 && d.dias <= 60).reduce((s, d) => s + d.saldo, 0),
    d61: items.filter((d) => d.dias > 60 && d.dias <= 90).reduce((s, d) => s + d.saldo, 0),
    d90: items.filter((d) => d.dias > 90).reduce((s, d) => s + d.saldo, 0),
  });

  const aging = agingTotals(docs);
  const total = vista === "CXC" ? totalCxC : totalCxP;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900">Cartera</h1>
        <p className="text-gray-500 mt-1">Envejecimiento de cuentas por cobrar y pagar</p>
      </div>

      {/* Resumen CxC / CxP */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Cuentas por Cobrar</p>
          <p className="text-2xl font-bold font-mono text-blue-600">{formatMonto(totalCxC)}</p>
          <p className="text-xs text-gray-400">{cxc.length} documentos</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Cuentas por Pagar</p>
          <p className="text-2xl font-bold font-mono text-red-600">{formatMonto(totalCxP)}</p>
          <p className="text-xs text-gray-400">{cxp.length} documentos</p>
        </div>
      </div>

      {/* Aging bars */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-xs text-green-700 font-medium">Al día (0-30)</p>
          <p className="text-lg font-bold font-mono text-green-700">{formatMonto(aging.alDia)}</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
          <p className="text-xs text-yellow-700 font-medium">31-60 días</p>
          <p className="text-lg font-bold font-mono text-yellow-700">{formatMonto(aging.d31)}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
          <p className="text-xs text-orange-700 font-medium">61-90 días</p>
          <p className="text-lg font-bold font-mono text-orange-700">{formatMonto(aging.d61)}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
          <p className="text-xs text-red-700 font-medium">&gt;90 días</p>
          <p className="text-lg font-bold font-mono text-red-700">{formatMonto(aging.d90)}</p>
        </div>
      </div>

      {/* Tabs + vista */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex gap-2">
            <button onClick={() => setVista("CXC")} className={`px-3 py-1.5 rounded text-sm font-medium ${vista === "CXC" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:text-gray-700"}`}>
              Cuentas por Cobrar ({cxc.length})
            </button>
            <button onClick={() => setVista("CXP")} className={`px-3 py-1.5 rounded text-sm font-medium ${vista === "CXP" ? "bg-red-100 text-red-700" : "text-gray-500 hover:text-gray-700"}`}>
              Cuentas por Pagar ({cxp.length})
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setModo("resumen")} className={`px-3 py-1.5 rounded text-sm ${modo === "resumen" ? "bg-gray-100 font-medium" : "text-gray-500"}`}>
              Por auxiliar
            </button>
            <button onClick={() => setModo("detalle")} className={`px-3 py-1.5 rounded text-sm ${modo === "detalle" ? "bg-gray-100 font-medium" : "text-gray-500"}`}>
              Por documento
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {modo === "resumen" ? (
            <TablaResumen items={resumen} color={vista === "CXC" ? "text-blue-600" : "text-red-600"} />
          ) : (
            <TablaDetalle docs={docs} />
          )}
        </div>

        {total > 0 && (
          <div className="border-t px-4 py-3 flex justify-between font-bold">
            <span>Total {vista === "CXC" ? "Cuentas por Cobrar" : "Cuentas por Pagar"}</span>
            <span className={`font-mono ${vista === "CXC" ? "text-blue-600" : "text-red-600"}`}>{formatMonto(total)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
