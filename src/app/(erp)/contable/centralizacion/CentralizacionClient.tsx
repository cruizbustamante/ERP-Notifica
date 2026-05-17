"use client";

import { useState, useTransition, useRef } from "react";
import { formatMonto, MESES } from "@/lib/contabilidad/core";
import * as XLSX from "xlsx";
import {
  getResumenCentralizacion,
  getDocumentosPendientes,
  previsualizarCentralizacion,
  centralizarDocumentos,
  anularCentralizacion,
  cargarExcelVentas,
  cargarExcelCompras,
  cargarExcelHonorarios,
  upsertRegla,
  deleteRegla,
  type TipoLibro,
  type DocPendiente,
  type DocHonorario,
  type ReglaCentralizacion,
  type LineaPreview,
} from "./actions";

type Periodo = { anio: number; estado: string };
type Cuenta = { codigo: string; nombre: string };
type MesData = { pendiente: number; centralizado: number; cantPend: number; cantCent: number; neto: number; iva: number };
type Historial = { id: number; tipo: string; periodo: string; fecha: string; comprobante_id: number; registros: number; total_debe: number; total_haber: number; estado: string; anio: number; mes: number };
type Resumen = { ventas: Record<number, MesData>; compras: Record<number, MesData>; honorarios: Record<number, MesData>; historial: Historial[] };

export default function CentralizacionClient({
  periodos, cuentasVentas, cuentasGastos, reglas: reglasInit, currentYear,
}: {
  periodos: Periodo[];
  cuentasVentas: Cuenta[];
  cuentasGastos: Cuenta[];
  reglas: ReglaCentralizacion[];
  configCent: Record<string, string>;
  currentYear: number;
}) {
  const [anio, setAnio] = useState(currentYear);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  // Detalle de un libro
  const [libroActivo, setLibroActivo] = useState<TipoLibro | null>(null);
  const [docs, setDocs] = useState<DocPendiente[]>([]);
  const [docsHon, setDocsHon] = useState<DocHonorario[]>([]);
  const [mesActivo, setMesActivo] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [cuentaContra, setCuentaContra] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "pendiente" | "centralizado">("pendiente");

  // Preview
  const [preview, setPreview] = useState<{ lineas: LineaPreview[]; totalDebe: number; totalHaber: number } | null>(null);

  // Reglas
  const [reglas, setReglas] = useState<ReglaCentralizacion[]>(reglasInit);
  const [vistaReglas, setVistaReglas] = useState(false);
  const [reglaForm, setReglaForm] = useState({ rut: "", razon_social: "", cuenta_codigo: "", descripcion: "" });

  const fileRefs = { ventas: useRef<HTMLInputElement>(null), compras: useRef<HTMLInputElement>(null), honorarios: useRef<HTMLInputElement>(null) };

  // ─── Acciones ──────────────────────────────────────────────────────────

  const cargarResumen = () => {
    startTransition(async () => {
      const data = await getResumenCentralizacion(anio);
      setResumen(data);
      setLibroActivo(null);
      setMesActivo(null);
    });
  };

  const abrirLibro = (tipo: TipoLibro) => {
    setLibroActivo(tipo);
    setMesActivo(null);
    setDocs([]);
    setDocsHon([]);
    setVistaReglas(false);
  };

  const abrirLibroEnMes = (tipo: TipoLibro, mes: number) => {
    setLibroActivo(tipo);
    setVistaReglas(false);
    startTransition(async () => {
      setMesActivo(mes);
      const { docs: d, docsHon: h, error } = await getDocumentosPendientes(tipo, anio, mes);
      if (error) { setMensaje({ tipo: "error", texto: error }); return; }
      setDocs(d);
      setDocsHon(h);
      setSelectedIds(new Set(tipo === "honorarios" ? h.map((x) => x.id) : d.map((x) => x.id)));
      setFiltroEstado("pendiente");
      setMensaje(null);
    });
  };

  const cargarDocumentos = (mes: number) => {
    if (!libroActivo) return;
    startTransition(async () => {
      setMesActivo(mes);
      const { docs: d, docsHon: h, error } = await getDocumentosPendientes(libroActivo, anio, mes);
      if (error) { setMensaje({ tipo: "error", texto: error }); return; }
      setDocs(d);
      setDocsHon(h);
      setSelectedIds(new Set(libroActivo === "honorarios" ? h.map((x) => x.id) : d.map((x) => x.id)));
      setFiltroEstado("pendiente");
      setMensaje(null);
    });
  };

  const generarPreview = () => {
    if (!mesActivo || !libroActivo || selectedIds.size === 0) return;
    const cuentas = libroActivo === "ventas" ? cuentasVentas : cuentasGastos;
    const cuenta = cuentaContra || cuentas[0]?.codigo;
    if (!cuenta) { setMensaje({ tipo: "error", texto: "Seleccione cuenta de contrapartida" }); return; }

    startTransition(async () => {
      const result = await previsualizarCentralizacion(libroActivo, anio, mesActivo, cuenta, [...selectedIds]);
      if (result.error) { setMensaje({ tipo: "error", texto: result.error }); return; }
      setPreview({ lineas: result.lineas, totalDebe: result.totalDebe, totalHaber: result.totalHaber });
    });
  };

  const confirmarCentralizacion = () => {
    if (!mesActivo || !libroActivo || selectedIds.size === 0) return;
    const cuentas = libroActivo === "ventas" ? cuentasVentas : cuentasGastos;
    const cuenta = cuentaContra || cuentas[0]?.codigo;

    startTransition(async () => {
      const result = await centralizarDocumentos(libroActivo, anio, mesActivo, cuenta, [...selectedIds]);
      if (result.error) {
        setMensaje({ tipo: "error", texto: result.error });
      } else {
        const d = result.data!;
        setMensaje({ tipo: "ok", texto: `Centralizado: Comprobante T-${d.comprobante?.numero ?? ""}, ${d.documentos} docs, Debe ${formatMonto(d.totalDebe)}` });
        setPreview(null);
        cargarResumen();
      }
    });
  };

  const ejecutarAnulacion = (id: number) => {
    if (!confirm("¿Anular esta centralización? Se anulará el comprobante asociado.")) return;
    startTransition(async () => {
      const result = await anularCentralizacion(id);
      if (result.error) setMensaje({ tipo: "error", texto: result.error });
      else { setMensaje({ tipo: "ok", texto: "Centralización anulada" }); cargarResumen(); }
    });
  };

  const toggleDoc = (id: number) => {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleAll = () => {
    const allIds = libroActivo === "honorarios" ? docsHon.map((d) => d.id) : docs.map((d) => d.id);
    setSelectedIds(selectedIds.size === allIds.length ? new Set() : new Set(allIds));
  };

  // ─── Upload Excel ──────────────────────────────────────────────────────

  const handleUpload = (tipo: TipoLibro) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    startTransition(async () => {
      try {
        let rows: Record<string, string>[];
        const isCSV = file.name.toLowerCase().endsWith(".csv");

        if (isCSV) {
          const text = await file.text();
          rows = parseCSV(text);
        } else {
          const buffer = await file.arrayBuffer();
          const wb = XLSX.read(buffer, { cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { raw: false });
        }

        if (rows.length === 0) { setMensaje({ tipo: "error", texto: "Archivo vacío o sin datos" }); return; }

        let result: { nuevos: number; duplicados: number; errores: string[] };
        if (tipo === "ventas") result = await cargarExcelVentas(parseSIIVentas(rows));
        else if (tipo === "compras") result = await cargarExcelCompras(parseSIICompras(rows));
        else result = await cargarExcelHonorarios(parseSIIHonorarios(rows));

        const tipoLabel = tipo === "ventas" ? "Ventas" : tipo === "compras" ? "Compras" : "Honorarios";
        setMensaje({ tipo: result.errores.length ? "error" : "ok", texto: `${tipoLabel}: ${result.nuevos} nuevos, ${result.duplicados} duplicados${result.errores.length ? ". " + result.errores.join("; ") : ""}` });
        cargarResumen();
      } catch (err) {
        setMensaje({ tipo: "error", texto: `Error parseando archivo: ${err instanceof Error ? err.message : "desconocido"}` });
      }
    });
  };

  // ─── Reglas ────────────────────────────────────────────────────────────

  const guardarRegla = () => {
    if (!reglaForm.rut || !reglaForm.cuenta_codigo || !libroActivo) return;
    startTransition(async () => {
      const res = await upsertRegla({ tipo: libroActivo.toUpperCase(), ...reglaForm });
      if (res.error) setMensaje({ tipo: "error", texto: res.error });
      else {
        setMensaje({ tipo: "ok", texto: "Regla guardada" });
        setReglaForm({ rut: "", razon_social: "", cuenta_codigo: "", descripcion: "" });
        setReglas((prev) => [...prev, { id: Date.now(), tipo: libroActivo.toUpperCase(), estado: "S", ...reglaForm }]);
      }
    });
  };

  const eliminarRegla = (id: number) => {
    startTransition(async () => {
      const res = await deleteRegla(id);
      if (res.error) setMensaje({ tipo: "error", texto: res.error });
      else setReglas((prev) => prev.filter((r) => r.id !== id));
    });
  };

  // ─── Computed ──────────────────────────────────────────────────────────

  function calcKpis(data: Record<number, MesData>) {
    return Object.values(data).reduce(
      (a, m) => ({ total: a.total + m.cantPend + m.cantCent, pend: a.pend + m.cantPend, cent: a.cent + m.cantCent, montoPend: a.montoPend + m.pendiente, montoCent: a.montoCent + m.centralizado }),
      { total: 0, pend: 0, cent: 0, montoPend: 0, montoCent: 0 }
    );
  }

  const reglasLibro = libroActivo ? reglas.filter((r) => r.tipo === libroActivo.toUpperCase()) : [];

  // ─── RENDER ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Centralización</h1>
            <p className="text-gray-500 mt-1">Libros tributarios SII → Comprobantes contables</p>
          </div>
          <div className="flex items-center gap-3">
            <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {periodos.map((p) => <option key={p.anio} value={p.anio}>{p.anio} {p.estado !== "ABIERTO" ? "(Cerrado)" : ""}</option>)}
            </select>
            <button onClick={cargarResumen} disabled={isPending} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {isPending ? "Cargando..." : "Consultar"}
            </button>
          </div>
        </div>
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div className={`p-4 rounded-lg text-sm ${mensaje.tipo === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {mensaje.texto}
          <button onClick={() => setMensaje(null)} className="float-right font-bold">×</button>
        </div>
      )}

      {/* ─── Vista Principal: 3 Cards de Libros ─────────────────────────── */}
      {resumen && !libroActivo && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {([
              { tipo: "ventas" as const, label: "Libro de Ventas", desc: "Facturas, Boletas, NC, ND", icon: "📄", color: "blue" },
              { tipo: "compras" as const, label: "Libro de Compras", desc: "Facturas proveedores, NC, ND", icon: "📋", color: "orange" },
              { tipo: "honorarios" as const, label: "Libro de Honorarios", desc: "Boletas de honorarios", icon: "📝", color: "purple" },
            ]).map(({ tipo, label, desc, icon, color }) => {
              const k = calcKpis(resumen[tipo]);
              const colorMap: Record<string, string> = {
                blue: "border-blue-200 bg-blue-50/30",
                orange: "border-orange-200 bg-orange-50/30",
                purple: "border-purple-200 bg-purple-50/30",
              };
              const btnColor: Record<string, string> = {
                blue: "bg-blue-600 hover:bg-blue-700",
                orange: "bg-orange-600 hover:bg-orange-700",
                purple: "bg-purple-600 hover:bg-purple-700",
              };
              return (
                <div key={tipo} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${k.total > 0 ? colorMap[color] : ""}`}>
                  <div className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-2xl">{icon}</span>
                      <div>
                        <h3 className="font-semibold text-gray-900">{label}</h3>
                        <p className="text-xs text-gray-500">{desc}</p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="text-center bg-white rounded-lg p-2 border border-gray-100">
                        <div className="text-lg font-bold text-gray-900">{k.total}</div>
                        <div className="text-[10px] text-gray-500 uppercase">Total</div>
                      </div>
                      <div className="text-center bg-white rounded-lg p-2 border border-gray-100">
                        <div className="text-lg font-bold text-amber-600">{k.pend}</div>
                        <div className="text-[10px] text-gray-500 uppercase">Pendientes</div>
                      </div>
                      <div className="text-center bg-white rounded-lg p-2 border border-gray-100">
                        <div className="text-lg font-bold text-green-600">{k.cent}</div>
                        <div className="text-[10px] text-gray-500 uppercase">Centralizados</div>
                      </div>
                    </div>

                    {k.total > 0 && (
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-4 px-1">
                        <span>Pend: <span className="font-mono font-medium text-gray-700">{formatMonto(k.montoPend)}</span></span>
                        <span>Cent: <span className="font-mono font-medium text-green-600">{formatMonto(k.montoCent)}</span></span>
                      </div>
                    )}

                    {/* Barra de progreso */}
                    {k.total > 0 && (
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                        <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${Math.round((k.cent / k.total) * 100)}%` }} />
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button onClick={() => abrirLibro(tipo)} className={`flex-1 text-white px-3 py-2 rounded-lg text-sm font-medium ${btnColor[color]}`}>
                        {k.total > 0 ? "Ver Libro" : "Entrar"}
                      </button>
                      <input ref={fileRefs[tipo]} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload(tipo)} className="hidden" />
                      <button
                        onClick={() => fileRefs[tipo].current?.click()}
                        disabled={isPending}
                        className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                        title={`Cargar Excel ${label}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grilla Mensual */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Vista Mensual — {anio}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="pb-2 text-left font-medium w-28">Libro</th>
                    {Array.from({ length: 12 }, (_, i) => (
                      <th key={i} className="pb-2 font-medium text-center px-1">{MESES[i + 1]?.slice(0, 3)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    { tipo: "ventas" as const, label: "Ventas", colorBg: "bg-blue-100", colorText: "text-blue-700" },
                    { tipo: "compras" as const, label: "Compras", colorBg: "bg-orange-100", colorText: "text-orange-700" },
                    { tipo: "honorarios" as const, label: "Honorarios", colorBg: "bg-purple-100", colorText: "text-purple-700" },
                  ]).map(({ tipo, label, colorBg, colorText }) => (
                    <tr key={tipo} className="border-b last:border-0">
                      <td className="py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colorBg} ${colorText}`}>{label}</span>
                      </td>
                      {Array.from({ length: 12 }, (_, i) => {
                        const m = i + 1;
                        const d = resumen[tipo][m];
                        const hasDocs = d && (d.cantPend > 0 || d.cantCent > 0);
                        const todoCent = d && d.cantPend === 0 && d.cantCent > 0;
                        const parcial = d && d.cantPend > 0 && d.cantCent > 0;
                        return (
                          <td key={m} className="py-2 text-center px-1">
                            {hasDocs ? (
                              <button
                                onClick={() => abrirLibroEnMes(tipo, m)}
                                className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-[10px] font-bold transition-all hover:scale-110 ${
                                  todoCent ? "bg-green-100 text-green-700 ring-1 ring-green-300" :
                                  parcial ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300" :
                                  "bg-red-50 text-red-600 ring-1 ring-red-200"
                                }`}
                                title={`${label} ${MESES[m]}: ${d.cantPend} pend, ${d.cantCent} cent`}
                              >
                                {todoCent ? "✓" : d.cantPend}
                              </button>
                            ) : (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center gap-4 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 ring-1 ring-green-300"></span> Completo</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 ring-1 ring-amber-300"></span> Parcial</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 ring-1 ring-red-200"></span> Pendiente</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded text-gray-300">—</span> Sin datos</span>
            </div>
          </div>

          {/* Historial */}
          {resumen.historial.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Historial de centralizaciones — {anio}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 font-medium">Libro</th>
                      <th className="pb-2 font-medium">Período</th>
                      <th className="pb-2 font-medium text-right">Docs</th>
                      <th className="pb-2 font-medium text-right">Debe</th>
                      <th className="pb-2 font-medium text-right">Haber</th>
                      <th className="pb-2 font-medium">Estado</th>
                      <th className="pb-2 font-medium text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.historial.map((h) => (
                      <tr key={h.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${h.tipo === "VENTAS" ? "bg-blue-100 text-blue-700" : h.tipo === "COMPRAS" ? "bg-orange-100 text-orange-700" : "bg-purple-100 text-purple-700"}`}>
                            {h.tipo}
                          </span>
                        </td>
                        <td className="py-2">{h.mes ? `${MESES[h.mes]} ${h.anio}` : h.periodo}</td>
                        <td className="py-2 text-right">{h.registros}</td>
                        <td className="py-2 text-right font-mono">{formatMonto(h.total_debe || 0)}</td>
                        <td className="py-2 text-right font-mono">{formatMonto(h.total_haber || 0)}</td>
                        <td className="py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${h.estado === "ACTIVO" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{h.estado}</span>
                        </td>
                        <td className="py-2 text-center">
                          {h.estado === "ACTIVO" && (
                            <button onClick={() => ejecutarAnulacion(h.id)} disabled={isPending} className="text-red-600 hover:text-red-800 text-xs font-medium">Anular</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Vista Detalle de un Libro ───────────────────────────────────── */}
      {resumen && libroActivo && !vistaReglas && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {/* Header del libro */}
          <div className="p-4 border-b flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setLibroActivo(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {libroActivo === "ventas" ? "Libro de Ventas" : libroActivo === "compras" ? "Libro de Compras" : "Libro de Honorarios"}
                </h2>
                <p className="text-xs text-gray-500">{anio}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setVistaReglas(true)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700">
                Reglas ({reglasLibro.length})
              </button>
              <input ref={fileRefs[libroActivo]} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload(libroActivo)} className="hidden" />
              <button
                onClick={() => fileRefs[libroActivo!].current?.click()}
                disabled={isPending}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Cargar Excel
              </button>
            </div>
          </div>

          {/* Resumen mensual */}
          {!mesActivo && (
            <div className="p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 font-medium">Mes</th>
                    <th className="pb-2 font-medium text-right">Pendientes</th>
                    <th className="pb-2 font-medium text-right">Monto Pend.</th>
                    <th className="pb-2 font-medium text-right">Centralizados</th>
                    <th className="pb-2 font-medium text-right">Monto Cent.</th>
                    <th className="pb-2 font-medium text-center">Estado</th>
                    <th className="pb-2 font-medium text-center">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                    const d = resumen[libroActivo][m];
                    if (!d || (d.cantPend === 0 && d.cantCent === 0)) return null;
                    const todoCent = d.cantPend === 0 && d.cantCent > 0;
                    return (
                      <tr key={m} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-2.5 font-medium">{MESES[m]}</td>
                        <td className="py-2.5 text-right">{d.cantPend > 0 ? <span className="text-amber-600 font-medium">{d.cantPend}</span> : <span className="text-gray-300">0</span>}</td>
                        <td className="py-2.5 text-right font-mono">{d.pendiente ? formatMonto(d.pendiente) : ""}</td>
                        <td className="py-2.5 text-right text-green-600">{d.cantCent}</td>
                        <td className="py-2.5 text-right text-green-600 font-mono">{d.centralizado ? formatMonto(d.centralizado) : ""}</td>
                        <td className="py-2.5 text-center">
                          {todoCent ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Completo</span>
                          ) : d.cantPend > 0 ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Pendiente</span>
                          ) : null}
                        </td>
                        <td className="py-2.5 text-center">
                          {d.cantPend > 0 ? (
                            <button onClick={() => cargarDocumentos(m)} disabled={isPending} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                              Centralizar
                            </button>
                          ) : (
                            <button onClick={() => cargarDocumentos(m)} disabled={isPending} className="text-gray-400 hover:text-gray-600 text-xs">
                              Ver
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {Object.values(resumen[libroActivo]).every((d) => d.cantPend === 0 && d.cantCent === 0) && (
                    <tr><td colSpan={7} className="py-8 text-center text-gray-400">Sin documentos cargados. Use el botón <span className="font-medium text-emerald-600">Cargar Excel</span> para importar documentos del SII.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Detalle documentos de un mes - Ventas/Compras */}
          {mesActivo && libroActivo !== "honorarios" && (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setMesActivo(null); setDocs([]); }} className="text-gray-500 hover:text-gray-700 text-sm">← Volver</button>
                  <h3 className="font-semibold text-gray-900">{MESES[mesActivo]} {anio}</h3>
                  <span className="text-sm text-gray-500">{docs.length} documentos</span>
                </div>
              </div>

              {/* Cuenta contrapartida */}
              <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg flex-wrap">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  Cuenta {libroActivo === "ventas" ? "Ingresos" : "Gastos"} (por defecto):
                </label>
                <select value={cuentaContra} onChange={(e) => setCuentaContra(e.target.value)} className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                  {(libroActivo === "ventas" ? cuentasVentas : cuentasGastos).map((c) => (
                    <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Tabla */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 w-8"><input type="checkbox" checked={selectedIds.size === docs.length && docs.length > 0} onChange={toggleAll} /></th>
                      <th className="pb-2 font-medium">Tipo</th>
                      <th className="pb-2 font-medium">Folio</th>
                      <th className="pb-2 font-medium">RUT</th>
                      <th className="pb-2 font-medium">Razón Social</th>
                      <th className="pb-2 font-medium text-right">Neto</th>
                      <th className="pb-2 font-medium text-right">IVA</th>
                      <th className="pb-2 font-medium text-right">Total</th>
                      <th className="pb-2 font-medium">Cta.</th>
                      <th className="pb-2 font-medium">Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d) => {
                      const regla = reglas.find((r) => r.rut === d.rut && r.tipo === libroActivo!.toUpperCase());
                      return (
                        <tr key={d.id} className={`border-b last:border-0 hover:bg-gray-50 ${d.esNC ? "text-red-600" : d.esND ? "text-orange-600" : ""}`}>
                          <td className="py-1.5"><input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleDoc(d.id)} /></td>
                          <td className="py-1.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${d.esNC ? "bg-red-100" : d.esND ? "bg-orange-100" : "bg-blue-100 text-blue-700"}`}>
                              {d.tipo_dte_nombre}
                            </span>
                          </td>
                          <td className="py-1.5 font-mono">{d.folio}</td>
                          <td className="py-1.5 font-mono text-xs">{d.rut}</td>
                          <td className="py-1.5 truncate max-w-[180px]">{d.razon_social}</td>
                          <td className="py-1.5 text-right font-mono">{formatMonto(d.monto_neto)}</td>
                          <td className="py-1.5 text-right font-mono">{formatMonto(d.monto_iva)}</td>
                          <td className="py-1.5 text-right font-mono font-medium">{formatMonto(d.monto_total)}</td>
                          <td className="py-1.5 text-xs">
                            {regla && <span className="px-1 py-0.5 rounded bg-purple-100 text-purple-700 font-mono">{regla.cuenta_codigo}</span>}
                          </td>
                          <td className="py-1.5 text-xs text-gray-500">{d.ref_tipo && d.ref_folio ? `${d.ref_tipo} ${d.ref_folio}` : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {docs.length > 0 && !preview && (
                <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-200 flex-wrap gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{selectedIds.size}</span> de {docs.length} seleccionados · Total: <span className="font-mono font-medium">
                      {formatMonto(docs.filter((d) => selectedIds.has(d.id)).reduce((sum, d) => sum + d.monto_total * (d.esNC ? -1 : 1), 0))}
                    </span>
                  </div>
                  <button onClick={generarPreview} disabled={isPending || selectedIds.size === 0} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    {isPending ? "Procesando..." : "Previsualizar asiento"}
                  </button>
                </div>
              )}

              {/* Preview del asiento contable */}
              {preview && (
                <div className="border border-indigo-200 bg-indigo-50/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-900">Asiento a generar — {libroActivo === "ventas" ? "Ventas" : libroActivo === "compras" ? "Compras" : "Honorarios"} {MESES[mesActivo!]} {anio}</h4>
                    <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600 text-sm">Cerrar</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="pb-2 font-medium">Cuenta</th>
                          <th className="pb-2 font-medium">Glosa</th>
                          <th className="pb-2 font-medium">Auxiliar</th>
                          <th className="pb-2 font-medium text-right">Debe</th>
                          <th className="pb-2 font-medium text-right">Haber</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.lineas.map((l, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-white/60">
                            <td className="py-1.5 font-mono text-xs font-medium">{l.cuenta_codigo}</td>
                            <td className="py-1.5 text-xs truncate max-w-[220px]">{l.glosa}</td>
                            <td className="py-1.5 text-xs font-mono text-gray-500">{l.auxiliar_rut || ""}</td>
                            <td className="py-1.5 text-right font-mono">{l.debe > 0 ? formatMonto(l.debe) : ""}</td>
                            <td className="py-1.5 text-right font-mono">{l.haber > 0 ? formatMonto(l.haber) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-bold">
                          <td colSpan={3} className="py-2 text-right">TOTALES</td>
                          <td className="py-2 text-right font-mono">{formatMonto(preview.totalDebe)}</td>
                          <td className="py-2 text-right font-mono">{formatMonto(preview.totalHaber)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className={`text-xs font-medium ${Math.abs(preview.totalDebe - preview.totalHaber) <= 1 ? "text-green-600" : "text-red-600"}`}>
                      {Math.abs(preview.totalDebe - preview.totalHaber) <= 1 ? "Cuadrado" : `Descuadre: ${formatMonto(Math.abs(preview.totalDebe - preview.totalHaber))}`}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => setPreview(null)} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50">
                        Cancelar
                      </button>
                      <button onClick={confirmarCentralizacion} disabled={isPending || Math.abs(preview.totalDebe - preview.totalHaber) > 1} className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                        {isPending ? "Contabilizando..." : "Confirmar y contabilizar"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Detalle documentos de un mes - Honorarios */}
          {mesActivo && libroActivo === "honorarios" && (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setMesActivo(null); setDocsHon([]); }} className="text-gray-500 hover:text-gray-700 text-sm">← Volver</button>
                  <h3 className="font-semibold text-gray-900">Honorarios — {MESES[mesActivo]} {anio}</h3>
                  <span className="text-sm text-gray-500">{docsHon.length} boletas</span>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg flex-wrap">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Cuenta Gasto Honorarios:</label>
                <select value={cuentaContra} onChange={(e) => setCuentaContra(e.target.value)} className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                  {cuentasGastos.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nombre}</option>)}
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 w-8"><input type="checkbox" checked={selectedIds.size === docsHon.length && docsHon.length > 0} onChange={toggleAll} /></th>
                      <th className="pb-2 font-medium">Folio</th>
                      <th className="pb-2 font-medium">RUT</th>
                      <th className="pb-2 font-medium">Razón Social</th>
                      <th className="pb-2 font-medium">Fecha</th>
                      <th className="pb-2 font-medium text-right">Bruto</th>
                      <th className="pb-2 font-medium text-right">Retención</th>
                      <th className="pb-2 font-medium text-right">Líquido</th>
                      <th className="pb-2 font-medium">Cta.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docsHon.map((d) => {
                      const regla = reglas.find((r) => r.rut === d.rut && r.tipo === "HONORARIOS");
                      return (
                        <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-1.5"><input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleDoc(d.id)} /></td>
                          <td className="py-1.5 font-mono">{d.folio}</td>
                          <td className="py-1.5 font-mono text-xs">{d.rut}</td>
                          <td className="py-1.5 truncate max-w-[200px]">{d.razon_social}</td>
                          <td className="py-1.5 text-xs">{d.fecha_emision}</td>
                          <td className="py-1.5 text-right font-mono">{formatMonto(d.monto_bruto)}</td>
                          <td className="py-1.5 text-right font-mono text-amber-600">{formatMonto(d.retencion)}</td>
                          <td className="py-1.5 text-right font-mono font-medium">{formatMonto(d.monto_liquido)}</td>
                          <td className="py-1.5 text-xs">
                            {regla && <span className="px-1 py-0.5 rounded bg-purple-100 text-purple-700 font-mono">{regla.cuenta_codigo}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {docsHon.length > 0 && !preview && (
                <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-200 flex-wrap gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{selectedIds.size}</span> de {docsHon.length} · Bruto: <span className="font-mono font-medium">
                      {formatMonto(docsHon.filter((d) => selectedIds.has(d.id)).reduce((s, d) => s + d.monto_bruto, 0))}
                    </span> · Ret: <span className="font-mono font-medium text-amber-600">
                      {formatMonto(docsHon.filter((d) => selectedIds.has(d.id)).reduce((s, d) => s + d.retencion, 0))}
                    </span>
                  </div>
                  <button onClick={generarPreview} disabled={isPending || selectedIds.size === 0} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    {isPending ? "Procesando..." : "Previsualizar asiento"}
                  </button>
                </div>
              )}

              {/* Preview del asiento contable */}
              {preview && (
                <div className="border border-indigo-200 bg-indigo-50/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-900">Asiento a generar — Honorarios {MESES[mesActivo!]} {anio}</h4>
                    <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600 text-sm">Cerrar</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="pb-2 font-medium">Cuenta</th>
                          <th className="pb-2 font-medium">Glosa</th>
                          <th className="pb-2 font-medium">Auxiliar</th>
                          <th className="pb-2 font-medium text-right">Debe</th>
                          <th className="pb-2 font-medium text-right">Haber</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.lineas.map((l, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-white/60">
                            <td className="py-1.5 font-mono text-xs font-medium">{l.cuenta_codigo}</td>
                            <td className="py-1.5 text-xs truncate max-w-[220px]">{l.glosa}</td>
                            <td className="py-1.5 text-xs font-mono text-gray-500">{l.auxiliar_rut || ""}</td>
                            <td className="py-1.5 text-right font-mono">{l.debe > 0 ? formatMonto(l.debe) : ""}</td>
                            <td className="py-1.5 text-right font-mono">{l.haber > 0 ? formatMonto(l.haber) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-bold">
                          <td colSpan={3} className="py-2 text-right">TOTALES</td>
                          <td className="py-2 text-right font-mono">{formatMonto(preview.totalDebe)}</td>
                          <td className="py-2 text-right font-mono">{formatMonto(preview.totalHaber)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className={`text-xs font-medium ${Math.abs(preview.totalDebe - preview.totalHaber) <= 1 ? "text-green-600" : "text-red-600"}`}>
                      {Math.abs(preview.totalDebe - preview.totalHaber) <= 1 ? "Cuadrado" : `Descuadre: ${formatMonto(Math.abs(preview.totalDebe - preview.totalHaber))}`}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => setPreview(null)} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50">
                        Cancelar
                      </button>
                      <button onClick={confirmarCentralizacion} disabled={isPending || Math.abs(preview.totalDebe - preview.totalHaber) > 1} className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                        {isPending ? "Contabilizando..." : "Confirmar y contabilizar"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Vista Reglas ────────────────────────────────────────────────── */}
      {resumen && libroActivo && vistaReglas && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setVistaReglas(false)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h3 className="font-semibold text-gray-900">Reglas de Centralización — {libroActivo === "ventas" ? "Ventas" : libroActivo === "compras" ? "Compras" : "Honorarios"}</h3>
              <p className="text-xs text-gray-500">Asigne una cuenta contable específica por proveedor/cliente. Se usa en vez de la cuenta por defecto.</p>
            </div>
          </div>

          <div className="flex items-end gap-2 bg-gray-50 p-3 rounded-lg flex-wrap">
            <div>
              <label className="block text-xs text-gray-500 mb-1">RUT</label>
              <input value={reglaForm.rut} onChange={(e) => setReglaForm((p) => ({ ...p, rut: e.target.value }))} placeholder="12.345.678-9" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-32" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Razón Social</label>
              <input value={reglaForm.razon_social} onChange={(e) => setReglaForm((p) => ({ ...p, razon_social: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-40" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">Cuenta contable</label>
              <select value={reglaForm.cuenta_codigo} onChange={(e) => setReglaForm((p) => ({ ...p, cuenta_codigo: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                <option value="">Seleccionar...</option>
                {(libroActivo === "ventas" ? cuentasVentas : cuentasGastos).map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nombre}</option>)}
              </select>
            </div>
            <button onClick={guardarRegla} disabled={isPending || !reglaForm.rut || !reglaForm.cuenta_codigo} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              Agregar
            </button>
          </div>

          {reglasLibro.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">RUT</th>
                  <th className="pb-2 font-medium">Razón Social</th>
                  <th className="pb-2 font-medium">Cuenta</th>
                  <th className="pb-2 font-medium text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {reglasLibro.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 font-mono text-xs">{r.rut}</td>
                    <td className="py-2">{r.razon_social}</td>
                    <td className="py-2 font-mono text-xs">{r.cuenta_codigo}</td>
                    <td className="py-2 text-center">
                      <button onClick={() => eliminarRegla(r.id)} className="text-red-600 hover:text-red-800 text-xs">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-center text-gray-400 text-sm py-4">Sin reglas definidas</p>
          )}
        </div>
      )}

      {/* Estado inicial */}
      {!resumen && !isPending && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center text-gray-500">
          Seleccione un año y presione <span className="font-medium text-gray-700">Consultar</span> para ver los libros tributarios.
        </div>
      )}
    </div>
  );
}

// ─── CSV Parser (semicolon-delimited SII format) ───────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(";").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(";");
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim(); });
    return obj;
  }).filter((r) => Object.values(r).some((v) => v));
}

const MAPA_DTE: Record<number, string> = {
  33: "FAC", 34: "FEX", 39: "BV", 41: "BVE",
  46: "FC", 48: "VT", 52: "GD", 56: "ND", 61: "NC",
  110: "FEX", 111: "NCE", 112: "NDE",
};

function parseDate(val: string): string {
  const s = (val || "").trim();
  // "02/05/2026" or "02/05/2026 16:07:12"
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function num(val: string | undefined): number {
  const s = (val || "0").replace(/\./g, "").replace(",", ".");
  return Number(s) || 0;
}

function col(r: Record<string, string>, ...names: string[]): string {
  for (const n of names) { if (r[n] !== undefined && r[n] !== "") return r[n]; }
  return "";
}

// ─── Ventas SII (facturas + boletas, auto-detecta formato) ──────────────

function parseSIIVentas(rows: Record<string, string>[]) {
  if (rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  // Boletas: no tienen "Nro", empiezan con "Tipo Doc;RUT Receptor;Fecha Docto;..."
  const esBoletas = !keys.includes("Nro") && keys.includes("Tipo Doc") && keys.includes("RUT Receptor");

  if (esBoletas) {
    return rows.map((r) => {
      const tipoDte = num(r["Tipo Doc"]);
      const folio = col(r, "Folio");
      const fecha = parseDate(col(r, "Fecha Docto"));
      const rut = col(r, "RUT Receptor");
      return {
        tipo_dte: tipoDte,
        tipo_dte_nombre: MAPA_DTE[tipoDte] || `DTE${tipoDte}`,
        folio,
        rut_receptor: rut,
        razon_social: "",
        fecha_emision: fecha,
        monto_exento: num(col(r, "Monto Exento", " Monto Exento")),
        monto_neto: num(col(r, "Monto Neto")),
        monto_iva: num(col(r, "Monto IVA")),
        monto_total: num(col(r, "Monto Total")) || 0,
      };
    }).filter((r) => r.folio && r.fecha_emision && r.monto_total);
  }

  // Facturas/NC/ND: tienen "Nro;Tipo Doc;Tipo Venta;Rut cliente;Razon Social;Folio;..."
  return rows.map((r) => {
    const tipoDte = num(col(r, "Tipo Doc"));
    const folio = col(r, "Folio");
    const fecha = parseDate(col(r, "Fecha Docto"));
    const rut = col(r, "Rut cliente", "RUT Receptor");
    const razon = col(r, "Razon Social", "Razón Social");
    const tipoDocRef = num(col(r, "Tipo Docto. Referencia"));
    const folioDocRef = col(r, "Folio Docto. Referencia");
    return {
      tipo_dte: tipoDte,
      tipo_dte_nombre: MAPA_DTE[tipoDte] || `DTE${tipoDte}`,
      folio,
      rut_receptor: rut,
      razon_social: razon,
      fecha_emision: fecha,
      monto_exento: num(col(r, "Monto Exento")),
      monto_neto: num(col(r, "Monto Neto")),
      monto_iva: num(col(r, "Monto IVA")),
      monto_total: num(col(r, "Monto total", "Monto Total")),
      tipo_doc_ref: tipoDocRef || undefined,
      folio_doc_ref: folioDocRef || undefined,
    };
  }).filter((r) => r.folio && r.fecha_emision);
}

// ─── Compras SII ────────────────────────────────────────────────────────

function parseSIICompras(rows: Record<string, string>[]) {
  return rows.map((r) => {
    const tipoDte = num(col(r, "Tipo Doc"));
    const folio = col(r, "Folio");
    const fechaDocto = parseDate(col(r, "Fecha Docto"));
    const fechaRecepcion = parseDate(col(r, "Fecha Recepcion", "Fecha Recepción"));
    const rut = col(r, "RUT Proveedor", "Rut Emisor", "RUT Emisor");
    const razon = col(r, "Razon Social", "Razón Social");
    return {
      tipo_dte: tipoDte,
      tipo_dte_nombre: MAPA_DTE[tipoDte] || `DTE${tipoDte}`,
      folio,
      rut_emisor: rut,
      razon_social: razon,
      fecha_emision: fechaDocto,
      fecha_recepcion: fechaRecepcion || fechaDocto,
      monto_exento: num(col(r, "Monto Exento")),
      monto_neto: num(col(r, "Monto Neto")),
      monto_iva: num(col(r, "Monto IVA Recuperable", "Monto IVA", "IVA")),
      monto_total: num(col(r, "Monto Total", "Monto total")),
    };
  }).filter((r) => r.folio && r.fecha_emision);
}

// ─── Honorarios SII ─────────────────────────────────────────────────────
// XLS del SII: headers desfasados, columnas __EMPTY_*
// Formato: N°(col0), Fecha(__EMPTY), Estado(__EMPTY_1), Fecha Anul(__EMPTY_2),
//          Rut(__EMPTY_3), Nombre(__EMPTY_4), Soc.Prof(__EMPTY_5),
//          Brutos(__EMPTY_6), Retenido(__EMPTY_7), Pagado(__EMPTY_8)
// Solo se importan las VIGENTES

function parseSIIHonorarios(rows: Record<string, string>[]) {
  const keys = Object.keys(rows[0] || {});
  const firstKey = keys[0] || "";

  // Detectar formato XLS del SII (tiene __EMPTY_* como keys)
  const esFormatoSII = keys.some((k) => k.startsWith("__EMPTY"));

  if (esFormatoSII) {
    return rows
      .filter((r) => {
        const estado = (r["__EMPTY_1"] || "").trim().toUpperCase();
        return estado === "VIGENTE";
      })
      .map((r) => {
        const folio = String(r[firstKey] || "").trim();
        const fechaRaw = (r["__EMPTY"] || "").trim();
        const rut = (r["__EMPTY_3"] || "").trim();
        const razon = (r["__EMPTY_4"] || "").trim();
        const bruto = num(r["__EMPTY_6"]);
        const retencion = num(r["__EMPTY_7"]);
        const liquido = num(r["__EMPTY_8"]);

        if (!folio || !rut || isNaN(Number(folio))) return null;

        return {
          rut_emisor: rut,
          razon_social: razon,
          folio,
          fecha_emision: parseDateHon(fechaRaw),
          monto_bruto: bruto,
          retencion: retencion || Math.round(bruto * 0.1375),
          monto_liquido: liquido || (bruto - (retencion || Math.round(bruto * 0.1375))),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null && !!r.fecha_emision);
  }

  // Formato CSV con headers normales
  return rows.map((r) => {
    const rut = col(r, "RUT Emisor", "Rut Emisor", "RUT", "Rut");
    const razon = col(r, "Razon Social", "Razón Social", "Nombre");
    const folio = col(r, "Folio", "N° Boleta", "Nro Boleta");
    const fecha = parseDate(col(r, "Fecha", "Fecha Emision", "Fecha Docto"));
    const bruto = num(col(r, "Monto Bruto", "Bruto", "Total Honorario", "Honorario Bruto"));
    const retencion = num(col(r, "Retención", "Retencion", "Ret.", "Retenido"));
    const liquido = num(col(r, "Monto Líquido", "Liquido", "Monto Liquido", "Neto"));
    const estado = col(r, "Estado").toUpperCase();
    if (estado && estado !== "VIGENTE") return null;
    return {
      rut_emisor: rut, razon_social: razon, folio, fecha_emision: fecha,
      monto_bruto: bruto, retencion: retencion || Math.round(bruto * 0.1375),
      monto_liquido: liquido || (bruto - (retencion || Math.round(bruto * 0.1375))),
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null && !!r.folio && !!r.fecha_emision);
}

// Honorarios dates can be "6/2/26" (short year) or "31/03/2026"
function parseDateHon(val: string): string {
  const s = (val || "").trim();
  // dd/mm/yy (2-digit year)
  const m2 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (m2) {
    const yy = Number(m2[3]);
    const yyyy = yy < 50 ? 2000 + yy : 1900 + yy;
    return `${yyyy}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  }
  return parseDate(s);
}
