"use client";

import { useState, useTransition } from "react";
import { formatMonto, MESES } from "@/lib/contabilidad/core";
import { formatRut } from "@/lib/rut";
import { getLibroVentas, getLibroCompras, getLibroHonorarios, type DocTributario, type DocHonorarioTrib } from "./actions";
import { crearLibroCorporativo, descargarWorkbook } from "@/lib/excel";

type Periodo = { anio: number; estado: string };
type Tab = "ventas" | "compras" | "honorarios";

export default function LibrosTributariosClient({
  periodos, currentYear,
}: {
  periodos: Periodo[];
  currentYear: number;
}) {
  const [anio, setAnio] = useState(currentYear);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [tab, setTab] = useState<Tab>("ventas");
  const [docs, setDocs] = useState<DocTributario[]>([]);
  const [docsHon, setDocsHon] = useState<DocHonorarioTrib[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const consultar = () => {
    startTransition(async () => {
      if (tab === "honorarios") {
        const { data } = await getLibroHonorarios(anio, mes);
        setDocsHon(data);
        setDocs([]);
      } else {
        const fn = tab === "ventas" ? getLibroVentas : getLibroCompras;
        const { data } = await fn(anio, mes);
        setDocs(data);
        setDocsHon([]);
      }
      setLoaded(true);
    });
  };

  const totales = docs.reduce(
    (t, d) => ({ exento: t.exento + d.monto_exento, neto: t.neto + d.monto_neto, iva: t.iva + d.monto_iva, total: t.total + d.monto_total }),
    { exento: 0, neto: 0, iva: 0, total: 0 }
  );

  const totalesHon = docsHon.reduce(
    (t, d) => ({ bruto: t.bruto + d.monto_bruto, retencion: t.retencion + d.retencion, liquido: t.liquido + d.monto_liquido }),
    { bruto: 0, retencion: 0, liquido: 0 }
  );

  const descargarExcel = async () => {
    const periodo = `${MESES[mes]} ${anio}`;
    const mesStr = String(mes).padStart(2, "0");
    const right: { horizontal: "right"; vertical: "middle" } = { horizontal: "right", vertical: "middle" };

    if (tab === "honorarios") {
      const wb = crearLibroCorporativo({
        titulo: "LIBRO DE HONORARIOS",
        periodo,
        hoja: "Honorarios",
        columnas: [
          { key: "folio", header: "Folio", width: 10 },
          { key: "rut", header: "RUT", width: 14 },
          { key: "razon_social", header: "Razón Social", width: 30 },
          { key: "fecha", header: "Fecha", width: 12 },
          { key: "bruto", header: "Bruto", width: 16, numFmt: "#,##0", alignment: right },
          { key: "retencion", header: "Retención", width: 16, numFmt: "#,##0", alignment: right },
          { key: "liquido", header: "Líquido", width: 16, numFmt: "#,##0", alignment: right },
          { key: "centralizado", header: "Cent.", width: 8 },
        ],
        datos: docsHon.map((d) => ({
          folio: d.folio, rut: d.rut, razon_social: d.razon_social,
          fecha: d.fecha_emision || "", bruto: d.monto_bruto,
          retencion: d.retencion, liquido: d.monto_liquido,
          centralizado: d.centralizado ? "Sí" : "No",
        })),
        totales: {
          folio: `TOTALES (${docsHon.length})`, bruto: totalesHon.bruto,
          retencion: totalesHon.retencion, liquido: totalesHon.liquido,
        },
      });
      await descargarWorkbook(wb, `Libro_Honorarios_${anio}_${mesStr}.xlsx`);
    } else {
      const nombre = tab === "ventas" ? "VENTAS" : "COMPRAS";
      const wb = crearLibroCorporativo({
        titulo: `LIBRO DE ${nombre}`,
        periodo,
        hoja: tab === "ventas" ? "Ventas" : "Compras",
        columnas: [
          { key: "tipo", header: "Tipo", width: 12 },
          { key: "folio", header: "Folio", width: 10 },
          { key: "fecha", header: "Fecha", width: 12 },
          { key: "rut", header: "RUT", width: 14 },
          { key: "razon_social", header: "Razón Social", width: 30 },
          { key: "exento", header: "Exento", width: 14, numFmt: "#,##0", alignment: right },
          { key: "neto", header: "Neto", width: 14, numFmt: "#,##0", alignment: right },
          { key: "iva", header: "IVA", width: 14, numFmt: "#,##0", alignment: right },
          { key: "total", header: "Total", width: 16, numFmt: "#,##0", alignment: right },
          { key: "centralizado", header: "Cent.", width: 8 },
        ],
        datos: docs.map((d) => ({
          tipo: d.tipo_dte_nombre, folio: d.folio, fecha: d.fecha_emision || "",
          rut: d.rut, razon_social: d.razon_social, exento: d.monto_exento,
          neto: d.monto_neto, iva: d.monto_iva, total: d.monto_total,
          centralizado: d.centralizado ? "Sí" : "No",
        })),
        totales: {
          tipo: `TOTALES (${docs.length})`, exento: totales.exento,
          neto: totales.neto, iva: totales.iva, total: totales.total,
        },
      });
      await descargarWorkbook(wb, `Libro_${tab === "ventas" ? "Ventas" : "Compras"}_${anio}_${mesStr}.xlsx`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Libros Tributarios</h1>
            <p className="text-gray-500 mt-1">Registro de ventas, compras y honorarios SII</p>
          </div>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Año</label>
            <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {periodos.map((p) => <option key={p.anio} value={p.anio}>{p.anio}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mes</label>
            <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            {(["ventas", "compras", "honorarios"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setLoaded(false); }}
                className={`px-4 py-2 text-sm font-medium ${tab === t ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
              >
                {t === "ventas" ? "Ventas" : t === "compras" ? "Compras" : "Honorarios"}
              </button>
            ))}
          </div>
          <button onClick={consultar} disabled={isPending} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {isPending ? "Cargando..." : "Consultar"}
          </button>
          {loaded && (docs.length > 0 || docsHon.length > 0) && (
            <button onClick={descargarExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700">
              Descargar Excel
            </button>
          )}
        </div>
      </div>

      {/* Tabla Ventas/Compras */}
      {loaded && tab !== "honorarios" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <div className="p-4 border-b flex items-center justify-between">
            <span className="text-sm text-gray-500">{docs.length} documentos — {MESES[mes]} {anio}</span>
            <span className="text-sm font-medium">Total: <span className="font-mono">{formatMonto(totales.total)}</span></span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Folio</th>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">RUT</th>
                <th className="px-3 py-2 font-medium">Razón Social</th>
                <th className="px-3 py-2 font-medium text-right">Exento</th>
                <th className="px-3 py-2 font-medium text-right">Neto</th>
                <th className="px-3 py-2 font-medium text-right">IVA</th>
                <th className="px-3 py-2 font-medium text-right">Total</th>
                <th className="px-3 py-2 font-medium text-center">Cent.</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-1.5">
                    <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">{d.tipo_dte_nombre}</span>
                  </td>
                  <td className="px-3 py-1.5 font-mono">{d.folio}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{d.fecha_emision}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{formatRut(d.rut)}</td>
                  <td className="px-3 py-1.5 truncate max-w-[200px]">{d.razon_social}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{d.monto_exento > 0 ? formatMonto(d.monto_exento) : ""}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatMonto(d.monto_neto)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatMonto(d.monto_iva)}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-medium">{formatMonto(d.monto_total)}</td>
                  <td className="px-3 py-1.5 text-center">
                    {d.centralizado
                      ? <span className="text-green-600 text-xs font-medium">Si</span>
                      : <span className="text-gray-400 text-xs">No</span>}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-medium">
                <td colSpan={5} className="px-3 py-2">TOTALES ({docs.length} docs)</td>
                <td className="px-3 py-2 text-right font-mono">{formatMonto(totales.exento)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatMonto(totales.neto)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatMonto(totales.iva)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatMonto(totales.total)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
          {docs.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">Sin documentos para el período seleccionado</div>
          )}
        </div>
      )}

      {/* Tabla Honorarios */}
      {loaded && tab === "honorarios" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <div className="p-4 border-b flex items-center justify-between">
            <span className="text-sm text-gray-500">{docsHon.length} boletas — {MESES[mes]} {anio}</span>
            <span className="text-sm font-medium">Bruto: <span className="font-mono">{formatMonto(totalesHon.bruto)}</span> · Ret: <span className="font-mono text-amber-600">{formatMonto(totalesHon.retencion)}</span></span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="px-3 py-2 font-medium">Folio</th>
                <th className="px-3 py-2 font-medium">RUT</th>
                <th className="px-3 py-2 font-medium">Razón Social</th>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium text-right">Bruto</th>
                <th className="px-3 py-2 font-medium text-right">Retención</th>
                <th className="px-3 py-2 font-medium text-right">Líquido</th>
                <th className="px-3 py-2 font-medium text-center">Cent.</th>
              </tr>
            </thead>
            <tbody>
              {docsHon.map((d) => (
                <tr key={d.id} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-mono">{d.folio}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{formatRut(d.rut)}</td>
                  <td className="px-3 py-1.5 truncate max-w-[200px]">{d.razon_social}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{d.fecha_emision}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatMonto(d.monto_bruto)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-amber-600">{formatMonto(d.retencion)}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-medium">{formatMonto(d.monto_liquido)}</td>
                  <td className="px-3 py-1.5 text-center">
                    {d.centralizado
                      ? <span className="text-green-600 text-xs font-medium">Si</span>
                      : <span className="text-gray-400 text-xs">No</span>}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-medium">
                <td colSpan={4} className="px-3 py-2">TOTALES ({docsHon.length} boletas)</td>
                <td className="px-3 py-2 text-right font-mono">{formatMonto(totalesHon.bruto)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatMonto(totalesHon.retencion)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatMonto(totalesHon.liquido)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
          {docsHon.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">Sin boletas de honorarios para el período seleccionado</div>
          )}
        </div>
      )}
    </div>
  );
}
