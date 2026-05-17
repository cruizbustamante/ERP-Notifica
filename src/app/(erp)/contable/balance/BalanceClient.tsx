"use client";

import { useState, useTransition } from "react";
import { formatMonto, MESES } from "@/lib/contabilidad/core";
import { getBalance, type BalanceResult } from "./actions";
import { crearLibroCorporativo, descargarWorkbook } from "@/lib/excel";

type Periodo = { anio: number; estado: string };

export default function BalanceClient({
  periodos, currentYear,
}: {
  periodos: Periodo[];
  currentYear: number;
}) {
  const [anio, setAnio] = useState(currentYear);
  const [mesHasta, setMesHasta] = useState(new Date().getMonth() + 1);
  const [result, setResult] = useState<BalanceResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [soloN4, setSoloN4] = useState(false);

  const consultar = () => {
    startTransition(async () => {
      const { data } = await getBalance(anio, mesHasta);
      setResult(data);
      setLoaded(true);
    });
  };

  if (!result && loaded) return null;

  const filas = result?.filas || [];
  const totales = result?.totales || { debitos: 0, creditos: 0, deudor: 0, acreedor: 0, activo: 0, pasivo: 0, perdida: 0, ganancia: 0 };
  const filasVisibles = soloN4 ? filas.filter((f) => f.nivel === 4) : filas;

  const tgActivo = totales.activo + (result?.pgActivo || 0);
  const tgPasivo = totales.pasivo + (result?.pgPasivo || 0);
  const tgPerdida = totales.perdida + (result?.pgPerdida || 0);
  const tgGanancia = totales.ganancia + (result?.pgGanancia || 0);

  const cuadraDebCred = Math.abs(totales.debitos - totales.creditos) < 2;
  const cuadraDeudAcr = Math.abs(totales.deudor - totales.acreedor) < 2;
  const cuadraInv = Math.abs(tgActivo - tgPasivo) < 2;
  const cuadraRes = Math.abs(tgPerdida - tgGanancia) < 2;

  const right: { horizontal: "right"; vertical: "middle" } = { horizontal: "right", vertical: "middle" };

  const descargarExcel = async () => {
    if (!result) return;
    const periodo = `Enero a ${MESES[mesHasta]} ${anio}`;
    const n4 = filas.filter((f) => f.nivel === 4);

    const datos = n4.map((f) => ({
      codigo: f.codigo,
      nombre: f.nombre,
      debitos: f.debitos || "",
      creditos: f.creditos || "",
      deudor: f.deudor || "",
      acreedor: f.acreedor || "",
      activo: f.activo || "",
      pasivo: f.pasivo || "",
      perdida: f.perdida || "",
      ganancia: f.ganancia || "",
    }));

    const wb = crearLibroCorporativo({
      titulo: "BALANCE DE COMPROBACION 8 COLUMNAS",
      periodo,
      hoja: "Balance 8 Col",
      columnas: [
        { key: "codigo", header: "Código", width: 14 },
        { key: "nombre", header: "Cuenta", width: 30 },
        { key: "debitos", header: "Débitos", width: 16, numFmt: "#,##0", alignment: right },
        { key: "creditos", header: "Créditos", width: 16, numFmt: "#,##0", alignment: right },
        { key: "deudor", header: "Deudor", width: 16, numFmt: "#,##0", alignment: right },
        { key: "acreedor", header: "Acreedor", width: 16, numFmt: "#,##0", alignment: right },
        { key: "activo", header: "Activo", width: 16, numFmt: "#,##0", alignment: right },
        { key: "pasivo", header: "Pasivo", width: 16, numFmt: "#,##0", alignment: right },
        { key: "perdida", header: "Pérdida", width: 16, numFmt: "#,##0", alignment: right },
        { key: "ganancia", header: "Ganancia", width: 16, numFmt: "#,##0", alignment: right },
      ],
      datos,
      totales: {
        codigo: "Sub-Totales",
        debitos: totales.debitos,
        creditos: totales.creditos,
        deudor: totales.deudor,
        acreedor: totales.acreedor,
        activo: totales.activo,
        pasivo: totales.pasivo,
        perdida: totales.perdida,
        ganancia: totales.ganancia,
      },
    });

    const ws = wb.getWorksheet("Balance 8 Col")!;
    const lastDataRow = 6 + n4.length;
    const pgRow = lastDataRow + 1;
    const tgRow = lastDataRow + 2;

    // PG row
    const rPG = ws.getRow(pgRow);
    rPG.getCell(1).value = "Pérdidas / Ganancias";
    rPG.getCell(7).value = result.pgActivo || "";
    rPG.getCell(8).value = result.pgPasivo || "";
    rPG.getCell(9).value = result.pgPerdida || "";
    rPG.getCell(10).value = result.pgGanancia || "";
    for (let ci = 1; ci <= 10; ci++) {
      const cell = rPG.getCell(ci);
      cell.font = { name: "Calibri", size: 10, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
      cell.border = { top: { style: "thin", color: { argb: "FFD0D0D0" } }, bottom: { style: "thin", color: { argb: "FFD0D0D0" } }, left: { style: "thin", color: { argb: "FFD0D0D0" } }, right: { style: "thin", color: { argb: "FFD0D0D0" } } };
      if (ci >= 3) { cell.alignment = right; cell.numFmt = "#,##0"; }
    }
    rPG.height = 22;

    // Total General row
    const rTG = ws.getRow(tgRow);
    rTG.getCell(1).value = "TOTAL GENERAL";
    rTG.getCell(3).value = totales.debitos;
    rTG.getCell(4).value = totales.creditos;
    rTG.getCell(5).value = totales.deudor;
    rTG.getCell(6).value = totales.acreedor;
    rTG.getCell(7).value = tgActivo;
    rTG.getCell(8).value = tgPasivo;
    rTG.getCell(9).value = tgPerdida;
    rTG.getCell(10).value = tgGanancia;
    for (let ci = 1; ci <= 10; ci++) {
      const cell = rTG.getCell(ci);
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
      cell.border = { top: { style: "medium", color: { argb: "FF1F3864" } }, bottom: { style: "medium", color: { argb: "FF1F3864" } }, left: { style: "thin", color: { argb: "FF1F3864" } }, right: { style: "thin", color: { argb: "FF1F3864" } } };
      if (ci >= 3) { cell.alignment = right; cell.numFmt = "#,##0"; }
    }
    rTG.height = 26;

    await descargarWorkbook(wb, `Balance_8Col_${anio}_${String(mesHasta).padStart(2, "0")}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900">Balance de Comprobacion</h1>
            <p className="text-gray-500 mt-1 text-sm">8 Columnas — Formato SII</p>
          </div>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Ano</label>
            <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {periodos.map((p) => <option key={p.anio} value={p.anio}>{p.anio}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hasta mes</label>
            <select value={mesHasta} onChange={(e) => setMesHasta(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm pb-2">
            <input type="checkbox" checked={soloN4} onChange={(e) => setSoloN4(e.target.checked)} className="rounded" />
            Solo movimiento
          </label>
          <button onClick={consultar} disabled={isPending} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {isPending ? "Cargando..." : "Consultar"}
          </button>
          {loaded && filas.length > 0 && (
            <button onClick={descargarExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700">
              Descargar Excel
            </button>
          )}
        </div>
      </div>

      {loaded && filas.length > 0 && (
        <>
          {/* Cuadratura */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <CuadCheck label="Debitos = Creditos" ok={cuadraDebCred} a={totales.debitos} b={totales.creditos} />
            <CuadCheck label="Deudor = Acreedor" ok={cuadraDeudAcr} a={totales.deudor} b={totales.acreedor} />
            <CuadCheck label="Activo = Pasivo" ok={cuadraInv} a={tgActivo} b={tgPasivo} />
            <CuadCheck label="Perdida = Ganancia" ok={cuadraRes} a={tgPerdida} b={tgGanancia} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#1F3864] text-white">
                  <th rowSpan={2} className="px-3 py-2 text-left font-medium sticky left-0 bg-[#1F3864] min-w-[220px]">Cuenta Contable</th>
                  <th colSpan={2} className="px-3 py-1 text-center font-medium border-b border-white/20">Valores Acumulados</th>
                  <th colSpan={2} className="px-3 py-1 text-center font-medium border-b border-white/20">Saldos</th>
                  <th colSpan={2} className="px-3 py-1 text-center font-medium border-b border-white/20">Inventario</th>
                  <th colSpan={2} className="px-3 py-1 text-center font-medium border-b border-white/20">Resultados</th>
                </tr>
                <tr className="bg-[#2B4A8C] text-white/90 text-[11px]">
                  <th className="px-3 py-1.5 text-right font-medium w-[110px]">Debitos</th>
                  <th className="px-3 py-1.5 text-right font-medium w-[110px]">Creditos</th>
                  <th className="px-3 py-1.5 text-right font-medium w-[110px]">Deudor</th>
                  <th className="px-3 py-1.5 text-right font-medium w-[110px]">Acreedor</th>
                  <th className="px-3 py-1.5 text-right font-medium w-[110px]">Activo</th>
                  <th className="px-3 py-1.5 text-right font-medium w-[110px]">Pasivo</th>
                  <th className="px-3 py-1.5 text-right font-medium w-[110px]">Perdida</th>
                  <th className="px-3 py-1.5 text-right font-medium w-[110px]">Ganancia</th>
                </tr>
              </thead>
              <tbody>
                {filasVisibles.map((f, idx) => {
                  const isGroup = f.nivel < 4;
                  return (
                    <tr key={f.codigo} className={`border-b ${isGroup ? "bg-gray-50 font-medium" : idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50/30`}>
                      <td className={`px-3 py-1 sticky left-0 ${isGroup ? "bg-gray-50" : idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                        <span className="font-mono text-[11px]" style={{ paddingLeft: `${(f.nivel - 1) * 12}px` }}>
                          {f.codigo}
                        </span>
                        <span className="ml-2 text-gray-600">{f.nombre}</span>
                      </td>
                      <td className="px-3 py-1 text-right font-mono">{f.debitos > 0 ? formatMonto(f.debitos) : ""}</td>
                      <td className="px-3 py-1 text-right font-mono">{f.creditos > 0 ? formatMonto(f.creditos) : ""}</td>
                      <td className="px-3 py-1 text-right font-mono text-blue-700">{f.deudor > 0 ? formatMonto(f.deudor) : ""}</td>
                      <td className="px-3 py-1 text-right font-mono text-red-700">{f.acreedor > 0 ? formatMonto(f.acreedor) : ""}</td>
                      <td className="px-3 py-1 text-right font-mono text-emerald-700">{f.activo > 0 ? formatMonto(f.activo) : ""}</td>
                      <td className="px-3 py-1 text-right font-mono text-orange-700">{f.pasivo > 0 ? formatMonto(f.pasivo) : ""}</td>
                      <td className="px-3 py-1 text-right font-mono text-red-600">{f.perdida > 0 ? formatMonto(f.perdida) : ""}</td>
                      <td className="px-3 py-1 text-right font-mono text-green-600">{f.ganancia > 0 ? formatMonto(f.ganancia) : ""}</td>
                    </tr>
                  );
                })}

                {/* Sub-Totales */}
                <tr className="border-t-2 border-gray-400 bg-gray-100 font-bold">
                  <td className="px-3 py-2 sticky left-0 bg-gray-100">SUB-TOTALES</td>
                  <td className="px-3 py-2 text-right font-mono">{formatMonto(totales.debitos)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatMonto(totales.creditos)}</td>
                  <td className="px-3 py-2 text-right font-mono text-blue-700">{formatMonto(totales.deudor)}</td>
                  <td className="px-3 py-2 text-right font-mono text-red-700">{formatMonto(totales.acreedor)}</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-700">{formatMonto(totales.activo)}</td>
                  <td className="px-3 py-2 text-right font-mono text-orange-700">{formatMonto(totales.pasivo)}</td>
                  <td className="px-3 py-2 text-right font-mono text-red-600">{formatMonto(totales.perdida)}</td>
                  <td className="px-3 py-2 text-right font-mono text-green-600">{formatMonto(totales.ganancia)}</td>
                </tr>

                {/* Pérdidas / Ganancias */}
                <tr className="bg-amber-50 font-bold">
                  <td className="px-3 py-2 sticky left-0 bg-amber-50">PERDIDAS / GANANCIAS</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-700">{(result?.pgActivo || 0) > 0 ? formatMonto(result!.pgActivo) : ""}</td>
                  <td className="px-3 py-2 text-right font-mono text-orange-700">{(result?.pgPasivo || 0) > 0 ? formatMonto(result!.pgPasivo) : ""}</td>
                  <td className="px-3 py-2 text-right font-mono text-red-600">{(result?.pgPerdida || 0) > 0 ? formatMonto(result!.pgPerdida) : ""}</td>
                  <td className="px-3 py-2 text-right font-mono text-green-600">{(result?.pgGanancia || 0) > 0 ? formatMonto(result!.pgGanancia) : ""}</td>
                </tr>

                {/* Total General */}
                <tr className="bg-[#1F3864] text-white font-bold text-sm">
                  <td className="px-3 py-2.5 sticky left-0 bg-[#1F3864]">TOTAL GENERAL</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatMonto(totales.debitos)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatMonto(totales.creditos)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatMonto(totales.deudor)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatMonto(totales.acreedor)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatMonto(tgActivo)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatMonto(tgPasivo)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatMonto(tgPerdida)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatMonto(tgGanancia)}</td>
                </tr>
              </tbody>
            </table>

            {filasVisibles.length === 0 && (
              <div className="p-8 text-center text-gray-500 text-sm">Sin datos para el periodo seleccionado</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CuadCheck({ label, ok, a, b }: { label: string; ok: boolean; a: number; b: number }) {
  return (
    <div className={`rounded-lg border p-2.5 text-xs ${ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
      <div className={`font-medium ${ok ? "text-green-700" : "text-red-700"}`}>{label} {ok ? "OK" : "DESCUADRADO"}</div>
      <div className="font-mono text-gray-600 mt-0.5">{formatMonto(a)} / {formatMonto(b)}</div>
    </div>
  );
}
