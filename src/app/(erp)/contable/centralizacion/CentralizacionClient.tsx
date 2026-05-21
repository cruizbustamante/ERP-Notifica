"use client";

import { useState, useTransition, useRef } from "react";
import { formatMonto, MESES } from "@/lib/contabilidad/core";
import { normalizeRut, formatRut } from "@/lib/rut";
import * as XLSX from "xlsx";
import {
  getResumenCentralizacion,
  getDocumentosPendientes,
  previsualizarCentralizacion,
  centralizarDocumentos,
  anularCentralizacion,
  eliminarCargaPendiente,
  cargarExcelVentas,
  cargarExcelCompras,
  cargarExcelHonorarios,
  cargarExcelTransbank,
  verificarDuplicados,
  buscarAuxiliares,
  upsertRegla,
  deleteRegla,
  type TipoLibro,
  type DocPendiente,
  type DocHonorario,
  type DocTransbank,
  type ReglaCentralizacion,
  type LineaPreview,
  type PreviewCarga,
  type Auxiliar,
} from "./actions";

type Periodo = { anio: number; estado: string };
type Cuenta = { codigo: string; nombre: string };
type MesData = { pendiente: number; centralizado: number; cantPend: number; cantCent: number; neto: number; iva: number };
type Historial = { id: number; tipo: string; periodo: string; fecha: string; comprobante_id: number; registros: number; total_debe: number; total_haber: number; estado: string; anio: number; mes: number };
type Resumen = { ventas: Record<number, MesData>; compras: Record<number, MesData>; honorarios: Record<number, MesData>; transbank: Record<number, MesData>; historial: Historial[] };

export default function CentralizacionClient({
  periodos, cuentasVentas, cuentasGastos, reglas: reglasInit, configCent, currentYear,
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
  const [docsTransbank, setDocsTransbank] = useState<DocTransbank[]>([]);
  const [mesActivo, setMesActivo] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [cuentaContra, setCuentaContra] = useState("");
  const [cuentasPorDoc, setCuentasPorDoc] = useState<Record<number, string>>({});
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "pendiente" | "centralizado">("pendiente");

  // Preview
  const [preview, setPreview] = useState<{ lineas: LineaPreview[]; totalDebe: number; totalHaber: number } | null>(null);
  const [sinRef, setSinRef] = useState<Set<number>>(new Set());

  // Reglas
  const [reglas, setReglas] = useState<ReglaCentralizacion[]>(reglasInit);
  const [vistaReglas, setVistaReglas] = useState(false);
  const [reglaForm, setReglaForm] = useState({ rut: "", razon_social: "", cuenta_codigo: "", descripcion: "" });
  const [auxBusqueda, setAuxBusqueda] = useState("");
  const [auxResultados, setAuxResultados] = useState<Auxiliar[]>([]);
  const [auxBuscando, setAuxBuscando] = useState(false);
  const [auxDropdownOpen, setAuxDropdownOpen] = useState(false);

  // Upload preview modal
  const [uploadPreview, setUploadPreview] = useState<{ tipo: TipoLibro; preview: PreviewCarga; parsedData: Record<string, unknown>[]; periodoArchivo?: { anio: number; mes: number }; mesConfirmado?: number } | null>(null);

  const fileRefs = { ventas: useRef<HTMLInputElement>(null), compras: useRef<HTMLInputElement>(null), honorarios: useRef<HTMLInputElement>(null), transbank: useRef<HTMLInputElement>(null) };

  // ─── Acciones ──────────────────────────────────────────────────────────

  const cargarResumen = () => {
    startTransition(async () => {
      const data = await getResumenCentralizacion(anio);
      setResumen(data);
      setLibroActivo(null);
      setMesActivo(null);
    });
  };

  const cuentaDefaultPorLibro = (tipo: TipoLibro): string => {
    if (tipo === "ventas") return configCent.CENT_CTA_VENTAS || "4-1-01-001";
    if (tipo === "compras") return configCent.CENT_CTA_GASTOS || "5-1-01-001";
    if (tipo === "honorarios") return configCent.CENT_CTA_HONORARIOS_GASTO || "5-1-02-001";
    return "";
  };

  const abrirLibro = (tipo: TipoLibro) => {
    setLibroActivo(tipo);
    setMesActivo(null);
    setDocs([]);
    setDocsHon([]);
    setDocsTransbank([]);
    setVistaReglas(false);
    setCuentaContra(cuentaDefaultPorLibro(tipo));
    setSinRef(new Set());
  };

  const buildCuentasIniciales = (tipo: TipoLibro, documentos: DocPendiente[]) => {
    if (tipo !== "compras") return {};
    const ctaDefault = cuentaDefaultPorLibro("compras");
    const map: Record<number, string> = {};
    for (const d of documentos) {
      const regla = reglas.find((r) => r.rut === d.rut && r.tipo === "COMPRAS");
      map[d.id] = regla?.cuenta_codigo || ctaDefault;
    }
    return map;
  };

  const abrirLibroEnMes = (tipo: TipoLibro, mes: number) => {
    setLibroActivo(tipo);
    setVistaReglas(false);
    setCuentaContra(cuentaDefaultPorLibro(tipo));
    startTransition(async () => {
      setMesActivo(mes);
      const { docs: d, docsHon: h, docsTransbank: t, error } = await getDocumentosPendientes(tipo, anio, mes);
      if (error) { setMensaje({ tipo: "error", texto: error }); return; }
      setDocs(d);
      setDocsHon(h);
      setDocsTransbank(t);
      setSelectedIds(new Set(tipo === "transbank" ? t.map((x) => x.id) : tipo === "honorarios" ? h.map((x) => x.id) : d.map((x) => x.id)));
      setCuentasPorDoc(buildCuentasIniciales(tipo, d));
      setFiltroEstado("pendiente");
      setMensaje(null);
    });
  };

  const cargarDocumentos = (mes: number) => {
    if (!libroActivo) return;
    startTransition(async () => {
      setMesActivo(mes);
      const { docs: d, docsHon: h, docsTransbank: t, error } = await getDocumentosPendientes(libroActivo, anio, mes);
      if (error) { setMensaje({ tipo: "error", texto: error }); return; }
      setDocs(d);
      setDocsHon(h);
      setDocsTransbank(t);
      setSelectedIds(new Set(libroActivo === "transbank" ? t.map((x) => x.id) : libroActivo === "honorarios" ? h.map((x) => x.id) : d.map((x) => x.id)));
      setCuentasPorDoc(buildCuentasIniciales(libroActivo, d));
      setFiltroEstado("pendiente");
      setMensaje(null);
    });
  };

  const generarPreview = () => {
    if (!mesActivo || !libroActivo || selectedIds.size === 0) return;
    let cuenta = "";
    if (libroActivo !== "transbank") {
      const cuentas = libroActivo === "ventas" ? cuentasVentas : cuentasGastos;
      cuenta = cuentaContra || cuentas[0]?.codigo;
      if (!cuenta) { setMensaje({ tipo: "error", texto: "Seleccione cuenta de contrapartida" }); return; }
    }

    startTransition(async () => {
      const ctasDoc = libroActivo === "compras" ? cuentasPorDoc : undefined;
      const sinRefArr = sinRef.size > 0 ? [...sinRef] : undefined;
      const result = await previsualizarCentralizacion(libroActivo, anio, mesActivo, cuenta, [...selectedIds], ctasDoc, sinRefArr);
      if (result.error) { setMensaje({ tipo: "error", texto: result.error }); return; }
      setPreview({ lineas: result.lineas, totalDebe: result.totalDebe, totalHaber: result.totalHaber });
    });
  };

  const confirmarCentralizacion = () => {
    if (!mesActivo || !libroActivo || selectedIds.size === 0) return;
    let cuenta = "";
    if (libroActivo !== "transbank") {
      const cuentas = libroActivo === "ventas" ? cuentasVentas : cuentasGastos;
      cuenta = cuentaContra || cuentas[0]?.codigo;
    }

    startTransition(async () => {
      const ctasDoc = libroActivo === "compras" ? cuentasPorDoc : undefined;
      const sinRefArr = sinRef.size > 0 ? [...sinRef] : undefined;
      const result = await centralizarDocumentos(libroActivo, anio, mesActivo, cuenta, [...selectedIds], ctasDoc, sinRefArr);
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
    const allIds = libroActivo === "transbank" ? docsTransbank.map((d) => d.id) : libroActivo === "honorarios" ? docsHon.map((d) => d.id) : docs.map((d) => d.id);
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

        let parsedData: Record<string, unknown>[];
        if (tipo === "ventas") parsedData = parseSIIVentas(rows);
        else if (tipo === "compras") parsedData = parseSIICompras(rows);
        else if (tipo === "honorarios") parsedData = parseSIIHonorarios(rows);
        else parsedData = parseTransbank(rows);

        if (parsedData.length === 0) { setMensaje({ tipo: "error", texto: "No se encontraron registros válidos en el archivo" }); return; }

        let periodoArchivo: { anio: number; mes: number } | undefined;
        if (tipo === "compras") {
          const match = file.name.match(/(20\d{2})(0[1-9]|1[0-2])(?=[^0-9]|$)/);
          if (match) periodoArchivo = { anio: Number(match[1]), mes: Number(match[2]) };
        }

        const preview = await verificarDuplicados(tipo, parsedData, periodoArchivo?.mes);
        setUploadPreview({ tipo, preview, parsedData, periodoArchivo, mesConfirmado: periodoArchivo?.mes });
      } catch (err) {
        setMensaje({ tipo: "error", texto: `Error parseando archivo: ${err instanceof Error ? err.message : "desconocido"}` });
      }
    });
  };

  const confirmarUpload = () => {
    if (!uploadPreview) return;
    const { tipo, parsedData, mesConfirmado, periodoArchivo } = uploadPreview;
    setUploadPreview(null);

    startTransition(async () => {
      try {
        let result: { nuevos: number; duplicados: number; errores: string[] };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = parsedData as any[];
        if (tipo === "ventas") result = await cargarExcelVentas(data);
        else if (tipo === "compras") result = await cargarExcelCompras(data, mesConfirmado, periodoArchivo?.anio);
        else if (tipo === "honorarios") result = await cargarExcelHonorarios(data);
        else result = await cargarExcelTransbank(data);

        const tipoLabel = tipo === "ventas" ? "Ventas" : tipo === "compras" ? "Compras" : tipo === "honorarios" ? "Honorarios" : "Transbank";
        setMensaje({ tipo: result.errores.length ? "error" : "ok", texto: `${tipoLabel}: ${result.nuevos} nuevos, ${result.duplicados} duplicados${result.errores.length ? ". " + result.errores.join("; ") : ""}` });
        cargarResumen();
      } catch (err) {
        setMensaje({ tipo: "error", texto: `Error cargando: ${err instanceof Error ? err.message : "desconocido"}` });
      }
    });
  };

  const handleEliminarCarga = () => {
    if (!libroActivo || !mesActivo) return;
    const pendientes = libroActivo === "transbank" ? docsTransbank.length : libroActivo === "honorarios" ? docsHon.length : docs.length;
    if (pendientes === 0) { setMensaje({ tipo: "error", texto: "No hay registros pendientes para eliminar" }); return; }
    if (!confirm(`¿Eliminar ${pendientes} registros pendientes de ${MESES[mesActivo]} ${anio}? Solo se eliminan los NO centralizados.`)) return;
    startTransition(async () => {
      const { eliminados, error } = await eliminarCargaPendiente(libroActivo, anio, mesActivo);
      if (error) { setMensaje({ tipo: "error", texto: error }); return; }
      setMensaje({ tipo: "ok", texto: `${eliminados} registros eliminados` });
      cargarDocumentos(mesActivo);
      cargarResumen();
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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleAuxBusqueda = (val: string) => {
    setAuxBusqueda(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 2) { setAuxResultados([]); setAuxDropdownOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setAuxBuscando(true);
      const results = await buscarAuxiliares(val);
      setAuxResultados(results);
      setAuxDropdownOpen(results.length > 0);
      setAuxBuscando(false);
    }, 300);
  };

  const seleccionarAuxiliar = (aux: Auxiliar) => {
    setReglaForm(prev => ({ ...prev, rut: aux.rut, razon_social: aux.razon_social }));
    setAuxBusqueda("");
    setAuxResultados([]);
    setAuxDropdownOpen(false);
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

      {/* ─── Modal Preview Carga Excel ───────────────────────────────────── */}
      {uploadPreview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  Carga {uploadPreview.tipo === "ventas" ? "Ventas" : uploadPreview.tipo === "compras" ? "Compras" : uploadPreview.tipo === "honorarios" ? "Honorarios" : "Transbank"}
                </h2>
                <button onClick={() => setUploadPreview(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
              </div>
              <p className="text-sm text-gray-500 mt-1">{uploadPreview.parsedData.length} registros encontrados en el archivo</p>
              {uploadPreview.tipo === "compras" && uploadPreview.periodoArchivo && (
                <div className="mt-3 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
                  <span className="text-sm text-blue-800 font-medium">Periodo contable:</span>
                  <select
                    value={uploadPreview.mesConfirmado || uploadPreview.periodoArchivo.mes}
                    onChange={(e) => setUploadPreview(prev => prev ? { ...prev, mesConfirmado: Number(e.target.value) } : null)}
                    className="text-sm font-semibold border border-blue-300 rounded-lg px-3 py-1.5 bg-white text-blue-900 focus:ring-2 focus:ring-blue-400 focus:outline-none"
                  >
                    {MESES.map((nombre, i) => i > 0 ? <option key={i} value={i}>{nombre}</option> : null)}
                  </select>
                  <span className="text-sm text-blue-700 font-semibold">{uploadPreview.periodoArchivo.anio}</span>
                </div>
              )}
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-green-700">{uploadPreview.preview.totalNuevos}</div>
                  <div className="text-xs text-green-600 font-medium">Nuevos a registrar</div>
                  <div className="text-sm font-mono text-green-700 mt-1">{formatMonto(uploadPreview.preview.montoNuevos)}</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-amber-700">{uploadPreview.preview.totalDuplicados}</div>
                  <div className="text-xs text-amber-600 font-medium">Duplicados (se omiten)</div>
                  <div className="text-sm font-mono text-amber-700 mt-1">{formatMonto(uploadPreview.preview.montoDuplicados)}</div>
                </div>
              </div>

              {/* Distribución por mes */}
              {Object.keys(uploadPreview.preview.resumenMeses).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Nuevos por mes</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(uploadPreview.preview.resumenMeses)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([mes, cant]) => (
                        <span key={mes} className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-medium border border-blue-200">
                          {MESES[Number(mes)]}: <span className="font-bold">{cant}</span>
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Lista nuevos (primeros 10) */}
              {uploadPreview.preview.totalNuevos > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-green-700 mb-2">Nuevos registros {uploadPreview.preview.totalNuevos > 10 ? `(primeros 10 de ${uploadPreview.preview.totalNuevos})` : ""}</h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-gray-50 text-gray-500"><th className="px-3 py-1.5 text-left">Folio</th><th className="px-3 py-1.5 text-left">RUT</th><th className="px-3 py-1.5 text-left">Razón Social</th><th className="px-3 py-1.5 text-left">Fecha</th><th className="px-3 py-1.5 text-right">Monto</th></tr></thead>
                      <tbody>
                        {uploadPreview.preview.nuevos.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-t border-gray-100 hover:bg-green-50/50">
                            <td className="px-3 py-1.5 font-medium">{r.tipo_dte_nombre ? `${r.tipo_dte_nombre} ${r.folio}` : r.folio}</td>
                            <td className="px-3 py-1.5 font-mono text-gray-600">{r.rut}</td>
                            <td className="px-3 py-1.5 text-gray-700 truncate max-w-[150px]">{r.razon_social}</td>
                            <td className="px-3 py-1.5 text-gray-600">{r.fecha}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{formatMonto(r.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Lista duplicados (primeros 5) */}
              {uploadPreview.preview.totalDuplicados > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-amber-700 mb-2">Duplicados {uploadPreview.preview.totalDuplicados > 5 ? `(primeros 5 de ${uploadPreview.preview.totalDuplicados})` : ""}</h3>
                  <div className="border border-amber-200 rounded-lg overflow-hidden bg-amber-50/30">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-amber-50 text-amber-600"><th className="px-3 py-1.5 text-left">Folio</th><th className="px-3 py-1.5 text-left">RUT</th><th className="px-3 py-1.5 text-left">Razón Social</th><th className="px-3 py-1.5 text-right">Monto</th></tr></thead>
                      <tbody>
                        {uploadPreview.preview.duplicados.slice(0, 5).map((r, i) => (
                          <tr key={i} className="border-t border-amber-100">
                            <td className="px-3 py-1.5 font-medium text-amber-800">{r.tipo_dte_nombre ? `${r.tipo_dte_nombre} ${r.folio}` : r.folio}</td>
                            <td className="px-3 py-1.5 font-mono text-amber-700">{r.rut}</td>
                            <td className="px-3 py-1.5 text-amber-700 truncate max-w-[150px]">{r.razon_social}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-amber-800">{formatMonto(r.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {uploadPreview.preview.totalNuevos === 0 && (
                <div className="text-center py-6 text-amber-700 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-3xl block mb-2">0</span>
                  <p className="font-medium">Todos los registros ya existen en el sistema</p>
                  <p className="text-sm mt-1">No hay nada nuevo que cargar</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setUploadPreview(null)} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50">
                Cancelar
              </button>
              {uploadPreview.preview.totalNuevos > 0 && (
                <button onClick={confirmarUpload} disabled={isPending} className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                  {isPending ? "Cargando..." : `Confirmar carga (${uploadPreview.preview.totalNuevos} docs)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Vista Principal: 3 Cards de Libros ─────────────────────────── */}
      {resumen && !libroActivo && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              { tipo: "ventas" as const, label: "Libro de Ventas", desc: "Facturas, Boletas, NC, ND", icon: "📄", color: "blue" },
              { tipo: "compras" as const, label: "Libro de Compras", desc: "Facturas proveedores, NC, ND", icon: "📋", color: "orange" },
              { tipo: "honorarios" as const, label: "Libro de Honorarios", desc: "Boletas de honorarios", icon: "📝", color: "purple" },
              { tipo: "transbank" as const, label: "Vouchers Transbank", desc: "Pagos tarjeta débito/crédito", icon: "💳", color: "teal" },
            ]).map(({ tipo, label, desc, icon, color }) => {
              const k = calcKpis(resumen[tipo]);
              const colorMap: Record<string, string> = {
                blue: "border-blue-200 bg-blue-50/30",
                orange: "border-orange-200 bg-orange-50/30",
                purple: "border-purple-200 bg-purple-50/30",
                teal: "border-teal-200 bg-teal-50/30",
              };
              const btnColor: Record<string, string> = {
                blue: "bg-blue-600 hover:bg-blue-700",
                orange: "bg-orange-600 hover:bg-orange-700",
                purple: "bg-purple-600 hover:bg-purple-700",
                teal: "bg-teal-600 hover:bg-teal-700",
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
                    { tipo: "transbank" as const, label: "Transbank", colorBg: "bg-teal-100", colorText: "text-teal-700" },
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
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${h.tipo === "VENTAS" ? "bg-blue-100 text-blue-700" : h.tipo === "COMPRAS" ? "bg-orange-100 text-orange-700" : h.tipo === "TRANSBANK" ? "bg-teal-100 text-teal-700" : "bg-purple-100 text-purple-700"}`}>
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
                  {libroActivo === "ventas" ? "Libro de Ventas" : libroActivo === "compras" ? "Libro de Compras" : libroActivo === "honorarios" ? "Libro de Honorarios" : "Vouchers Transbank"}
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
          {mesActivo && libroActivo !== "honorarios" && libroActivo !== "transbank" && (
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
                <select value={cuentaContra} onChange={(e) => {
                  const newCta = e.target.value;
                  setCuentaContra(newCta);
                  if (libroActivo === "compras") {
                    setCuentasPorDoc(prev => {
                      const updated = { ...prev };
                      for (const d of docs) {
                        const tieneRegla = reglas.some((r) => r.rut === d.rut && r.tipo === "COMPRAS");
                        if (!tieneRegla) updated[d.id] = newCta;
                      }
                      return updated;
                    });
                  }
                }} className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
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
                    {docs.map((d, idx) => {
                      const regla = reglas.find((r) => r.rut === d.rut && r.tipo === libroActivo!.toUpperCase());
                      const prev = idx > 0 ? docs[idx - 1] : null;
                      const showSep = prev && prev.tipo_dte_nombre !== d.tipo_dte_nombre;
                      return (
                        <>{showSep && (
                          <tr key={`sep-${d.id}`} className="bg-gray-100">
                            <td colSpan={10} className="py-1.5 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                              {d.esNC ? "Notas de Crédito" : d.esND ? "Notas de Débito" : d.tipo_dte === 39 || d.tipo_dte === 41 ? "Boletas" : d.tipo_dte_nombre}
                            </td>
                          </tr>
                        )}
                        <tr key={d.id} className={`border-b last:border-0 hover:bg-gray-50 ${d.esNC ? "text-red-600" : d.esND ? "text-orange-600" : ""}`}>
                          <td className="py-1.5"><input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleDoc(d.id)} /></td>
                          <td className="py-1.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${d.esNC ? "bg-red-100" : d.esND ? "bg-orange-100" : "bg-blue-100 text-blue-700"}`}>
                              {d.tipo_dte_nombre}
                            </span>
                          </td>
                          <td className="py-1.5 font-mono">{d.folio}</td>
                          <td className="py-1.5 font-mono text-xs">{formatRut(d.rut)}</td>
                          <td className="py-1.5 truncate max-w-[180px]">{d.razon_social}</td>
                          <td className="py-1.5 text-right font-mono">{formatMonto(d.monto_neto)}</td>
                          <td className="py-1.5 text-right font-mono">{formatMonto(d.monto_iva)}</td>
                          <td className="py-1.5 text-right font-mono font-medium">{formatMonto(d.monto_total)}</td>
                          <td className="py-1.5">
                            {libroActivo === "compras" ? (
                              <select
                                value={cuentasPorDoc[d.id] || cuentaContra}
                                onChange={(e) => setCuentasPorDoc(prev => ({ ...prev, [d.id]: e.target.value }))}
                                className={`text-xs border rounded px-1 py-0.5 w-[110px] font-mono ${regla ? "border-purple-300 bg-purple-50" : "border-gray-200"}`}
                              >
                                {cuentasGastos.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo}</option>)}
                              </select>
                            ) : regla ? (
                              <span className="px-1 py-0.5 rounded bg-purple-100 text-purple-700 font-mono text-xs">{regla.cuenta_codigo}</span>
                            ) : null}
                          </td>
                          <td className="py-1.5 text-xs">
                            {d.ref_tipo && d.ref_folio ? (
                              <button
                                type="button"
                                onClick={() => setSinRef((prev) => { const next = new Set(prev); if (next.has(d.id)) next.delete(d.id); else next.add(d.id); return next; })}
                                className={`px-1.5 py-0.5 rounded font-mono transition ${sinRef.has(d.id) ? "bg-gray-100 text-gray-400 line-through" : "bg-indigo-50 text-indigo-700"}`}
                                title={sinRef.has(d.id) ? "Sin referencia — click para reactivar" : "Referencia activa — click para quitar"}
                              >
                                {d.ref_tipo} {d.ref_folio}
                              </button>
                            ) : null}
                          </td>
                        </tr></>
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
                  <div className="flex gap-2">
                    <button onClick={handleEliminarCarga} disabled={isPending} className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50">
                      Eliminar pendientes
                    </button>
                    <button onClick={generarPreview} disabled={isPending || selectedIds.size === 0} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                      {isPending ? "Procesando..." : "Previsualizar asiento"}
                    </button>
                  </div>
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
                          <th className="pb-2 font-medium">Auxiliar</th>
                          <th className="pb-2 font-medium">T.Doc</th>
                          <th className="pb-2 font-medium">N.Doc</th>
                          <th className="pb-2 font-medium">T.Ref</th>
                          <th className="pb-2 font-medium">N.Ref</th>
                          <th className="pb-2 font-medium text-right">Debe</th>
                          <th className="pb-2 font-medium text-right">Haber</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.lineas.map((l, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-white/60">
                            <td className="py-1.5 text-xs font-medium"><span className="font-mono">{l.cuenta_codigo}</span>{l.cuenta_nombre && <span className="text-gray-500 ml-1">— {l.cuenta_nombre}</span>}</td>
                            <td className="py-1.5 text-xs font-mono text-gray-500">{l.auxiliar_rut ? formatRut(l.auxiliar_rut) : ""}</td>
                            <td className="py-1.5 text-xs font-mono text-indigo-600">{l.tipo_doc}</td>
                            <td className="py-1.5 text-xs font-mono text-gray-500">{l.num_doc}</td>
                            <td className="py-1.5 text-xs font-mono text-gray-400">{l.tipo_doc_ref}</td>
                            <td className="py-1.5 text-xs font-mono text-gray-400">{l.num_doc_ref}</td>
                            <td className="py-1.5 text-right font-mono">{l.debe > 0 ? formatMonto(l.debe) : ""}</td>
                            <td className="py-1.5 text-right font-mono">{l.haber > 0 ? formatMonto(l.haber) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-bold">
                          <td colSpan={6} className="py-2 text-right">TOTALES</td>
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
                          <td className="py-1.5 font-mono text-xs">{formatRut(d.rut)}</td>
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
                  <div className="flex gap-2">
                    <button onClick={handleEliminarCarga} disabled={isPending} className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50">
                      Eliminar pendientes
                    </button>
                    <button onClick={generarPreview} disabled={isPending || selectedIds.size === 0} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                      {isPending ? "Procesando..." : "Previsualizar asiento"}
                    </button>
                  </div>
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
                            <td className="py-1.5 text-xs font-medium"><span className="font-mono">{l.cuenta_codigo}</span>{l.cuenta_nombre && <span className="text-gray-500 ml-1">— {l.cuenta_nombre}</span>}</td>
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

          {/* Detalle documentos de un mes - Transbank */}
          {mesActivo && libroActivo === "transbank" && (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setMesActivo(null); setDocsTransbank([]); }} className="text-gray-500 hover:text-gray-700 text-sm">← Volver</button>
                  <h3 className="font-semibold text-gray-900">Transbank — {MESES[mesActivo]} {anio}</h3>
                  <span className="text-sm text-gray-500">{docsTransbank.length} vouchers</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 w-8"><input type="checkbox" checked={selectedIds.size === docsTransbank.length && docsTransbank.length > 0} onChange={toggleAll} /></th>
                      <th className="pb-2 font-medium">Fecha</th>
                      <th className="pb-2 font-medium">N° Operación</th>
                      <th className="pb-2 font-medium">Tipo Tarjeta</th>
                      <th className="pb-2 font-medium text-right">Bruto</th>
                      <th className="pb-2 font-medium text-right">Comisión</th>
                      <th className="pb-2 font-medium text-right">IVA Com.</th>
                      <th className="pb-2 font-medium text-right">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docsTransbank.map((d) => (
                      <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-1.5"><input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleDoc(d.id)} /></td>
                        <td className="py-1.5 text-xs">{d.fecha}</td>
                        <td className="py-1.5 font-mono text-xs">{d.numero_operacion}</td>
                        <td className="py-1.5">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${d.tipo_tarjeta?.toLowerCase().includes("déb") || d.tipo_tarjeta?.toLowerCase().includes("deb") ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                            {d.tipo_tarjeta}
                          </span>
                        </td>
                        <td className="py-1.5 text-right font-mono">{formatMonto(d.monto_bruto)}</td>
                        <td className="py-1.5 text-right font-mono text-amber-600">{formatMonto(d.comision)}</td>
                        <td className="py-1.5 text-right font-mono text-amber-600">{formatMonto(d.iva_comision)}</td>
                        <td className="py-1.5 text-right font-mono font-medium">{formatMonto(d.monto_neto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {docsTransbank.length > 0 && !preview && (
                <div className="flex items-center justify-between bg-teal-50 p-4 rounded-lg border border-teal-200 flex-wrap gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{selectedIds.size}</span> de {docsTransbank.length} · Bruto: <span className="font-mono font-medium">
                      {formatMonto(docsTransbank.filter((d) => selectedIds.has(d.id)).reduce((s, d) => s + d.monto_bruto, 0))}
                    </span> · Comisión: <span className="font-mono font-medium text-amber-600">
                      {formatMonto(docsTransbank.filter((d) => selectedIds.has(d.id)).reduce((s, d) => s + d.comision + d.iva_comision, 0))}
                    </span> · Neto: <span className="font-mono font-medium text-green-600">
                      {formatMonto(docsTransbank.filter((d) => selectedIds.has(d.id)).reduce((s, d) => s + d.monto_neto, 0))}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleEliminarCarga} disabled={isPending} className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50">
                      Eliminar pendientes
                    </button>
                    <button onClick={generarPreview} disabled={isPending || selectedIds.size === 0} className="bg-teal-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                      {isPending ? "Procesando..." : "Previsualizar asiento"}
                    </button>
                  </div>
                </div>
              )}

              {/* Preview del asiento contable */}
              {preview && (
                <div className="border border-indigo-200 bg-indigo-50/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-900">Asiento a generar — Transbank {MESES[mesActivo!]} {anio}</h4>
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
                            <td className="py-1.5 text-xs font-medium"><span className="font-mono">{l.cuenta_codigo}</span>{l.cuenta_nombre && <span className="text-gray-500 ml-1">— {l.cuenta_nombre}</span>}</td>
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

          <div className="bg-gray-50 p-3 rounded-lg space-y-3">
            <div className="relative">
              <label className="block text-xs text-gray-500 mb-1">Buscar proveedor/cliente (RUT o nombre)</label>
              <input
                value={auxBusqueda || (reglaForm.rut ? `${formatRut(reglaForm.rut)} — ${reglaForm.razon_social}` : "")}
                onChange={(e) => { handleAuxBusqueda(e.target.value); if (reglaForm.rut) setReglaForm(p => ({ ...p, rut: "", razon_social: "" })); }}
                onFocus={() => { if (reglaForm.rut) { setAuxBusqueda(""); setReglaForm(p => ({ ...p, rut: "", razon_social: "" })); } }}
                placeholder="Escriba RUT o nombre para buscar..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              {auxBuscando && <span className="absolute right-3 top-8 text-xs text-gray-400">Buscando...</span>}
              {auxDropdownOpen && auxResultados.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {auxResultados.map((a) => (
                    <button
                      key={a.rut}
                      onClick={() => seleccionarAuxiliar(a)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-center gap-3 border-b border-gray-100 last:border-0"
                    >
                      <span className="font-mono text-xs text-gray-500 w-28 shrink-0">{formatRut(a.rut)}</span>
                      <span className="flex-1 truncate">{a.razon_social}</span>
                      <span className="text-xs text-gray-400 shrink-0">{a.tipo}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {reglaForm.rut && (
              <div className="flex items-end gap-2 flex-wrap">
                <div className="bg-white border border-blue-200 rounded-lg px-3 py-2 text-sm flex-1">
                  <span className="font-mono text-xs text-blue-600">{formatRut(reglaForm.rut)}</span>
                  <span className="mx-2 text-gray-400">—</span>
                  <span className="font-medium">{reglaForm.razon_social}</span>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-gray-500 mb-1">Cuenta contable</label>
                  <select value={reglaForm.cuenta_codigo} onChange={(e) => setReglaForm((p) => ({ ...p, cuenta_codigo: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                    <option value="">Seleccionar...</option>
                    {(libroActivo === "ventas" ? cuentasVentas : cuentasGastos).map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nombre}</option>)}
                  </select>
                </div>
                <button onClick={guardarRegla} disabled={isPending || !reglaForm.rut || !reglaForm.cuenta_codigo} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  Agregar
                </button>
              </div>
            )}
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
                    <td className="py-2 font-mono text-xs">{formatRut(r.rut)}</td>
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
      const rut = normalizeRut(col(r, "RUT Receptor"));
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
    const rut = normalizeRut(col(r, "Rut cliente", "RUT Receptor"));
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
    const rut = normalizeRut(col(r, "RUT Proveedor", "Rut Emisor", "RUT Emisor"));
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
        const rut = normalizeRut((r["__EMPTY_3"] || "").trim());
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
          retencion: retencion,
          monto_liquido: liquido || (bruto - retencion),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null && !!r.fecha_emision);
  }

  // Formato CSV con headers normales
  return rows.map((r) => {
    const rut = normalizeRut(col(r, "RUT Emisor", "Rut Emisor", "RUT", "Rut"));
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
      monto_bruto: bruto, retencion: retencion,
      monto_liquido: liquido || (bruto - retencion),
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

// ─── Transbank Vouchers ────────────────────────────────────────────────────
// Expected columns: Fecha, Monto Bruto/Monto, Comisión, IVA Comisión/IVA,
//                   Monto Neto/Neto, N° Operación/Numero Operacion, Tipo Tarjeta

function parseTransbank(rows: Record<string, string>[]) {
  return rows.map((r) => {
    const fecha = parseDate(col(r, "Fecha", "Fecha Pago", "Fecha Venta", "Fecha Transacción", "Fecha Transaccion"));
    const numOp = col(r, "N° Operación", "Numero Operacion", "N° Operacion", "Nro Operacion", "Código Autorización", "Codigo Autorizacion", "N° Voucher");
    const tipoTarjeta = col(r, "Tipo Tarjeta", "Tipo", "Medio de Pago", "Medio Pago");
    const bruto = num(col(r, "Monto Bruto", "Monto", "Monto Venta", "Total", "Monto Total"));
    const comision = num(col(r, "Comisión", "Comision", "Comisión Neta", "Comision Neta", "Descuento"));
    const ivaComision = num(col(r, "IVA Comisión", "IVA Comision", "IVA", "IVA Descuento"));
    const neto = num(col(r, "Monto Neto", "Neto", "Monto Abono", "Abono", "Líquido", "Liquido"));

    // Calculate net if not provided: bruto - comision - ivaComision
    const montoNeto = neto || (bruto - comision - ivaComision);

    return {
      fecha,
      numero_operacion: numOp,
      tipo_tarjeta: tipoTarjeta,
      monto_bruto: bruto,
      comision,
      iva_comision: ivaComision,
      monto_neto: montoNeto,
    };
  }).filter((r) => r.fecha && r.monto_bruto > 0);
}
