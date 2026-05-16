"use client";

import { useState, useTransition, useCallback } from "react";
import { formatMonto, MESES } from "@/lib/contabilidad/core";
import {
  getResumenCartola,
  getMovimientosCartola,
  contabilizarMovimiento,
  anularContabilizacion,
  getDocsPendientesAuxiliar,
  cargarCartolaSantander,
  type MovCartola,
  type ContabilizarInput,
} from "./actions";

type Periodo = { anio: number; estado: string };
type Cuenta = { codigo: string; nombre: string; tipo: string; usa_auxiliar: string; usa_documento: string };
type Auxiliar = { rut: string; razon_social: string };
type MesData = { abonos: number; cargos: number; pend: number; cont: number };
type DocPend = { tipo_doc: string; num_doc: string; saldo: number };
type Dashboard = {
  saldo: number;
  totalMovs: number;
  pendientes: number;
  contabilizados: number;
  totalAbonos: number;
  totalCargos: number;
  porMes: Record<number, MesData>;
};

export default function ConciliacionClient({
  periodos, cuentas, auxiliares, currentYear, dashboard,
}: {
  periodos: Periodo[];
  cuentas: Cuenta[];
  auxiliares: Auxiliar[];
  currentYear: number;
  dashboard: Dashboard;
}) {
  const [anio, setAnio] = useState(currentYear);
  const [resumen, setResumen] = useState<Record<number, MesData>>(dashboard.porMes);
  const [movimientos, setMovimientos] = useState<MovCartola[]>([]);
  const [mesActivo, setMesActivo] = useState<number | null>(null);
  const [vista, setVista] = useState<"dashboard" | "movimientos" | "contabilizar" | "upload">("dashboard");
  const [movActivo, setMovActivo] = useState<MovCartola | null>(null);
  const [soloNoCont, setSoloNoCont] = useState(true);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saldoActual, setSaldoActual] = useState(dashboard.saldo);
  const [stats, setStats] = useState(dashboard);

  // Upload state
  const [uploadResult, setUploadResult] = useState<{ nuevos: number; duplicados: number; errores: string[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Form contabilizar
  const [formTipo, setFormTipo] = useState<"COBRANZA" | "PAGO" | "GASTO" | "INGRESO">("GASTO");
  const [formCuenta, setFormCuenta] = useState("");
  const [formAuxiliar, setFormAuxiliar] = useState("");
  const [formGlosa, setFormGlosa] = useState("");
  const [formTipoDoc, setFormTipoDoc] = useState("");
  const [formNumDoc, setFormNumDoc] = useState("");
  const [formReferencia, setFormReferencia] = useState("");
  const [formCategoria, setFormCategoria] = useState("3");
  const [docsPend, setDocsPend] = useState<DocPend[]>([]);
  const [busqAux, setBusqAux] = useState("");

  const cargarResumen = (year?: number) => {
    const y = year || anio;
    startTransition(async () => {
      const data = await getResumenCartola(y);
      setResumen(data);
      setVista("dashboard");
      setMovimientos([]);
      setMesActivo(null);
    });
  };

  const cargarMovimientos = (mes: number) => {
    startTransition(async () => {
      setMesActivo(mes);
      const { movimientos: m, error } = await getMovimientosCartola(anio, mes, soloNoCont);
      if (error) { setMensaje({ tipo: "error", texto: error }); return; }
      setMovimientos(m);
      setVista("movimientos");
      setMensaje(null);
    });
  };

  const abrirContabilizar = (mov: MovCartola) => {
    setMovActivo(mov);
    const esAbono = mov.cargo_abono === "A";
    setFormTipo(esAbono ? "COBRANZA" : "PAGO");
    setFormGlosa(mov.descripcion);
    setFormTipoDoc("");
    setFormNumDoc("");
    setFormReferencia("");
    setFormCategoria(esAbono ? "1" : "2");
    setFormCuenta("");
    setFormAuxiliar(mov.rut_extraido || "");
    setBusqAux(mov.rut_extraido || "");
    setDocsPend([]);
    setVista("contabilizar");
  };

  const buscarDocs = () => {
    if (!formCuenta || !formAuxiliar) return;
    startTransition(async () => {
      const { docs } = await getDocsPendientesAuxiliar(formCuenta, formAuxiliar);
      setDocsPend(docs);
    });
  };

  const ejecutarContab = () => {
    if (!movActivo || !formCuenta) {
      setMensaje({ tipo: "error", texto: "Seleccione cuenta de contrapartida" });
      return;
    }
    const cta = cuentas.find((c) => c.codigo === formCuenta);
    if (cta?.usa_auxiliar === "X" && !formAuxiliar) {
      setMensaje({ tipo: "error", texto: "Esta cuenta requiere auxiliar" });
      return;
    }

    const input: ContabilizarInput = {
      cartola_id: movActivo.id,
      tipo_contab: formTipo,
      cuenta_contra: formCuenta,
      auxiliar_rut: formAuxiliar,
      glosa: formGlosa,
      tipo_doc: formTipoDoc,
      num_doc: formNumDoc,
      referencia: formReferencia,
      categoria_flujo: formCategoria,
    };

    startTransition(async () => {
      const res = await contabilizarMovimiento(input);
      if (res.error) {
        setMensaje({ tipo: "error", texto: res.error });
      } else {
        setMensaje({ tipo: "ok", texto: `Contabilizado OK — Comprobante ${res.data?.numero}` });
        if (mesActivo) cargarMovimientos(mesActivo);
        setVista("movimientos");
      }
    });
  };

  const ejecutarAnulacion = (id: number) => {
    if (!confirm("¿Anular contabilización de este movimiento?")) return;
    startTransition(async () => {
      const res = await anularContabilizacion(id);
      if (res.error) {
        setMensaje({ tipo: "error", texto: res.error });
      } else {
        setMensaje({ tipo: "ok", texto: "Contabilización anulada" });
        if (mesActivo) cargarMovimientos(mesActivo);
      }
    });
  };

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setMensaje({ tipo: "error", texto: "Solo se aceptan archivos Excel (.xlsx)" });
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

      // Find header row (contains "MONTO" and "DESCRIPCIÓN")
      let headerIdx = -1;
      for (let i = 0; i < Math.min(20, rows.length); i++) {
        const row = rows[i]?.map((c) => String(c || "").toUpperCase()) || [];
        if (row.some((c) => c.includes("MONTO")) && row.some((c) => c.includes("DESCRIPCI"))) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx === -1) {
        setMensaje({ tipo: "error", texto: "No se encontró la fila de encabezados en el Excel" });
        setUploading(false);
        return;
      }

      // Parse data rows
      const dataRows = rows.slice(headerIdx + 1).filter((r) => r && r.length >= 7 && r[2]);

      const movimientos: Array<{
        monto: number;
        descripcion: string;
        fecha: string;
        saldo: number;
        num_doc: string;
        sucursal: string;
        cargo_abono: string;
      }> = [];

      for (const row of dataRows) {
        const montoRaw = String(row[0] || "").replace(/\./g, "").replace(",", ".");
        const monto = Math.abs(parseFloat(montoRaw) || 0);
        if (monto === 0) continue;

        const descripcion = String(row[1] || "").trim();
        const fechaRaw = String(row[2] || "").trim();
        const saldoRaw = String(row[3] || "").replace(/\./g, "").replace(",", ".");
        const saldo = parseFloat(saldoRaw) || 0;
        const numDoc = String(row[4] || "").trim();
        const sucursal = String(row[5] || "").trim();
        const cargoAbono = String(row[6] || "").trim().toUpperCase();

        // Parse date DD/MM/YYYY → YYYY-MM-DD
        const parts = fechaRaw.split("/");
        if (parts.length !== 3) continue;
        const fecha = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;

        movimientos.push({
          monto,
          descripcion,
          fecha,
          saldo,
          num_doc: numDoc,
          sucursal,
          cargo_abono: cargoAbono === "A" ? "A" : "C",
        });
      }

      if (movimientos.length === 0) {
        setMensaje({ tipo: "error", texto: "No se encontraron movimientos válidos en el archivo" });
        setUploading(false);
        return;
      }

      // Send to server action
      const result = await cargarCartolaSantander(movimientos);
      setUploadResult(result);

      if (result.nuevos > 0) {
        setMensaje({ tipo: "ok", texto: `Cargados ${result.nuevos} movimientos nuevos. ${result.duplicados} duplicados omitidos.` });
        cargarResumen();
      } else {
        setMensaje({ tipo: "ok", texto: `Todos los ${result.duplicados} movimientos ya existían. Sin cambios.` });
      }
    } catch (err) {
      setMensaje({ tipo: "error", texto: `Error procesando archivo: ${err}` });
    }
    setUploading(false);
  }, [anio]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const cuentasFiltradas = formTipo === "COBRANZA"
    ? cuentas.filter((c) => c.tipo === "A" && c.usa_auxiliar === "X")
    : formTipo === "PAGO"
      ? cuentas.filter((c) => c.tipo === "P" && c.usa_auxiliar === "X")
      : formTipo === "GASTO"
        ? cuentas.filter((c) => c.tipo === "G")
        : cuentas.filter((c) => c.tipo === "I");

  const auxFiltrados = busqAux
    ? auxiliares.filter((a) => a.rut.includes(busqAux) || a.razon_social.toLowerCase().includes(busqAux.toLowerCase())).slice(0, 10)
    : [];

  const porcentajeContab = stats.totalMovs > 0 ? Math.round((stats.contabilizados / stats.totalMovs) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Conciliación Bancaria</h1>
            <p className="text-gray-500 mt-1">Banco Santander · Cta. Cte. 0-000-9698176-7</p>
          </div>
          <div className="flex items-center gap-3">
            <select value={anio} onChange={(e) => { setAnio(Number(e.target.value)); cargarResumen(Number(e.target.value)); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {periodos.map((p) => <option key={p.anio} value={p.anio}>{p.anio}</option>)}
            </select>
            <button onClick={() => setVista("upload")} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              Cargar Cartola
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Saldo Cartola</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${saldoActual.toLocaleString("es-CL")}</p>
          <p className="text-xs text-gray-400 mt-1">Último movimiento</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pendientes</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.pendientes}</p>
          <p className="text-xs text-gray-400 mt-1">Por contabilizar</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contabilizados</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.contabilizados}</p>
          <p className="text-xs text-gray-400 mt-1">{porcentajeContab}% del total</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Abonos {anio}</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">${(stats.totalAbonos / 1000000).toFixed(1)}M</p>
          <p className="text-xs text-gray-400 mt-1">Ingresos totales</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cargos {anio}</p>
          <p className="text-xl font-bold text-red-600 mt-1">${(stats.totalCargos / 1000000).toFixed(1)}M</p>
          <p className="text-xs text-gray-400 mt-1">Egresos totales</p>
        </div>
      </div>

      {mensaje && (
        <div className={`p-4 rounded-lg text-sm flex items-center justify-between ${mensaje.tipo === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          <span>{mensaje.texto}</span>
          <button onClick={() => setMensaje(null)} className="font-bold text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Upload View */}
      {vista === "upload" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Cargar Cartola Santander</h3>
              <p className="text-sm text-gray-500 mt-1">Sube el archivo Excel descargado desde OffBanking. Solo se agregarán movimientos nuevos.</p>
            </div>
            <button onClick={() => setVista("dashboard")} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${dragOver ? "border-emerald-400 bg-emerald-50" : "border-gray-300 hover:border-gray-400"}`}
          >
            {uploading ? (
              <div className="space-y-3">
                <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto"></div>
                <p className="text-sm text-gray-600">Procesando archivo...</p>
              </div>
            ) : (
              <>
                <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-600 mt-4 font-medium">Arrastra el archivo Excel aquí</p>
                <p className="text-sm text-gray-400 mt-1">o haz clic para seleccionar</p>
                <label className="inline-block mt-4 px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-emerald-700">
                  Seleccionar archivo
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
                </label>
              </>
            )}
          </div>

          {uploadResult && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <h4 className="font-medium text-gray-900">Resultado de la carga</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                  <span>Nuevos: <strong>{uploadResult.nuevos}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-gray-300"></span>
                  <span>Duplicados omitidos: <strong>{uploadResult.duplicados}</strong></span>
                </div>
              </div>
              {uploadResult.errores.length > 0 && (
                <div className="text-xs text-red-600 mt-2">
                  {uploadResult.errores.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <strong>Formato esperado:</strong> Excel de Santander con columnas MONTO, DESCRIPCIÓN MOVIMIENTO, FECHA, SALDO, N° DOCUMENTO, SUCURSAL, CARGO/ABONO.
            El sistema detecta automáticamente la fila de encabezados y descarta duplicados por huella MD5.
          </div>
        </div>
      )}

      {/* Dashboard - Resumen por mes */}
      {vista === "dashboard" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Resumen mensual {anio}</h3>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Pendientes
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> Contabilizados
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="px-6 py-3 text-left font-medium">Mes</th>
                  <th className="px-4 py-3 text-center font-medium">Pendientes</th>
                  <th className="px-4 py-3 text-right font-medium">Abonos pend.</th>
                  <th className="px-4 py-3 text-right font-medium">Cargos pend.</th>
                  <th className="px-4 py-3 text-center font-medium">Contabilizados</th>
                  <th className="px-4 py-3 text-center font-medium">Avance</th>
                  <th className="px-6 py-3 text-center font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const d = resumen[m];
                  if (!d || (d.pend === 0 && d.cont === 0)) return null;
                  const total = d.pend + d.cont;
                  const pct = total > 0 ? Math.round((d.cont / total) * 100) : 0;
                  return (
                    <tr key={m} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-900">{MESES[m]}</td>
                      <td className="px-4 py-3 text-center">
                        {d.pend > 0 ? <span className="inline-flex items-center justify-center w-8 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">{d.pend}</span> : <span className="text-gray-300">0</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600">{d.abonos > 0 ? formatMonto(d.abonos) : "-"}</td>
                      <td className="px-4 py-3 text-right font-mono text-red-500">{d.cargos > 0 ? formatMonto(d.cargos) : "-"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">{d.cont}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                          </div>
                          <span className="text-xs text-gray-500 w-8">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <button onClick={() => cargarMovimientos(m)} disabled={isPending} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors">
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lista movimientos */}
      {vista === "movimientos" && mesActivo && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => { setVista("dashboard"); setMovimientos([]); }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h3 className="font-semibold text-gray-900">{MESES[mesActivo]} {anio}</h3>
                <p className="text-xs text-gray-500">{movimientos.length} movimientos</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={soloNoCont} onChange={(e) => { setSoloNoCont(e.target.checked); cargarMovimientos(mesActivo); }} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              <span className="text-gray-600">Solo pendientes</span>
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left font-medium">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium">Descripción</th>
                  <th className="px-4 py-3 text-right font-medium">Monto</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo</th>
                  <th className="px-4 py-3 text-center font-medium">Tipo</th>
                  <th className="px-4 py-3 text-left font-medium">RUT</th>
                  <th className="px-4 py-3 text-center font-medium">Estado</th>
                  <th className="px-4 py-3 text-center font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {movimientos.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{m.fecha}</td>
                    <td className="px-4 py-2.5 max-w-[280px] truncate text-gray-900" title={m.descripcion}>{m.descripcion}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold whitespace-nowrap ${m.cargo_abono === "A" ? "text-emerald-600" : "text-red-500"}`}>
                      {m.cargo_abono === "A" ? "+" : "-"}{formatMonto(Math.abs(m.monto))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-500 whitespace-nowrap">{formatMonto(m.saldo)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${m.cargo_abono === "A" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {m.cargo_abono === "A" ? "ABONO" : "CARGO"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{m.rut_extraido}</td>
                    <td className="px-4 py-2.5 text-center">
                      {m.contabilizado
                        ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">OK</span>
                        : <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Pend.</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {!m.contabilizado ? (
                        <button onClick={() => abrirContabilizar(m)} className="px-2.5 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 transition-colors">
                          Contabilizar
                        </button>
                      ) : (
                        <button onClick={() => ejecutarAnulacion(m.id)} disabled={isPending} className="px-2.5 py-1 bg-red-50 text-red-600 rounded text-xs font-medium hover:bg-red-100 transition-colors">
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {movimientos.length === 0 && (
            <div className="p-12 text-center text-gray-400">No hay movimientos para este mes.</div>
          )}
        </div>
      )}

      {/* Form contabilizar */}
      {vista === "contabilizar" && movActivo && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setVista("movimientos")} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h3 className="text-lg font-semibold text-gray-900">Contabilizar movimiento</h3>
          </div>

          {/* Info movimiento */}
          <div className={`p-4 rounded-xl border-l-4 ${movActivo.cargo_abono === "A" ? "border-l-emerald-500 bg-emerald-50" : "border-l-red-500 bg-red-50"}`}>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500 text-xs uppercase">Fecha</span>
                <p className="font-semibold text-gray-900">{movActivo.fecha}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase">Monto</span>
                <p className={`font-mono font-bold text-lg ${movActivo.cargo_abono === "A" ? "text-emerald-700" : "text-red-700"}`}>
                  {movActivo.cargo_abono === "A" ? "+" : "-"}${Math.abs(movActivo.monto).toLocaleString("es-CL")}
                </p>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase">Tipo</span>
                <p className="font-semibold text-gray-900">{movActivo.cargo_abono === "A" ? "ABONO" : "CARGO"}</p>
              </div>
              <div className="col-span-3">
                <span className="text-gray-500 text-xs uppercase">Descripción</span>
                <p className="font-medium text-gray-900">{movActivo.descripcion}</p>
              </div>
            </div>
          </div>

          {/* Tipo contabilización */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tipo de contabilización</label>
            <div className="grid grid-cols-4 gap-2">
              {(["COBRANZA", "PAGO", "GASTO", "INGRESO"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setFormTipo(t); setFormCuenta(""); setFormAuxiliar(""); setDocsPend([]); }}
                  className={`py-2.5 px-3 rounded-lg text-sm font-medium border transition-colors ${formTipo === t ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Cuenta contrapartida</label>
              <select value={formCuenta} onChange={(e) => setFormCuenta(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400">
                <option value="">Seleccionar...</option>
                {(cuentasFiltradas.length > 0 ? cuentasFiltradas : cuentas).map((c) => (
                  <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nombre}</option>
                ))}
              </select>
            </div>

            <div className="relative">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Auxiliar (RUT)</label>
              <input
                type="text"
                value={busqAux}
                onChange={(e) => { setBusqAux(e.target.value); setFormAuxiliar(e.target.value); }}
                placeholder="Buscar por RUT o nombre..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              />
              {busqAux && auxFiltrados.length > 0 && (
                <div className="absolute z-10 w-full border border-gray-200 rounded-lg mt-1 max-h-40 overflow-y-auto text-sm bg-white shadow-lg">
                  {auxFiltrados.map((a) => (
                    <button key={a.rut} onClick={() => { setFormAuxiliar(a.rut); setBusqAux(a.rut); }} className="block w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-gray-50 last:border-0">
                      <span className="font-mono text-indigo-600">{a.rut}</span> <span className="text-gray-600">— {a.razon_social}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tipo Doc</label>
              <input value={formTipoDoc} onChange={(e) => setFormTipoDoc(e.target.value)} placeholder="FAC, BV, NC..." className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">N° Doc</label>
              <input value={formNumDoc} onChange={(e) => setFormNumDoc(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Referencia</label>
              <input value={formReferencia} onChange={(e) => setFormReferencia(e.target.value)} placeholder="FAC|12345" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
            </div>
          </div>

          {/* Docs pendientes */}
          {formCuenta && formAuxiliar && (
            <div>
              <button onClick={buscarDocs} disabled={isPending} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium mb-2 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                Buscar documentos pendientes
              </button>
              {docsPend.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-gray-500 text-xs uppercase"><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-left">N° Doc</th><th className="px-3 py-2 text-right">Saldo</th><th className="px-3 py-2"></th></tr></thead>
                    <tbody>
                      {docsPend.map((d) => (
                        <tr key={`${d.tipo_doc}-${d.num_doc}`} className="border-t hover:bg-indigo-50 cursor-pointer transition-colors" onClick={() => { setFormTipoDoc(d.tipo_doc); setFormNumDoc(d.num_doc); setFormReferencia(`${d.tipo_doc}|${d.num_doc}`); }}>
                          <td className="px-3 py-2">{d.tipo_doc}</td>
                          <td className="px-3 py-2 font-mono">{d.num_doc}</td>
                          <td className="px-3 py-2 text-right font-mono font-medium">{formatMonto(d.saldo)}</td>
                          <td className="px-3 py-2 text-indigo-600 text-xs font-medium">Usar</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Glosa</label>
              <input value={formGlosa} onChange={(e) => setFormGlosa(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Categoría flujo</label>
              <select value={formCategoria} onChange={(e) => setFormCategoria(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400">
                <option value="1">Cobranza</option>
                <option value="2">Pagos proveedores</option>
                <option value="3">Gastos operacionales</option>
                <option value="4">Honorarios</option>
                <option value="5">Retiros/Distribuciones</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={ejecutarContab}
              disabled={isPending || !formCuenta}
              className="bg-indigo-600 text-white px-8 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-colors"
            >
              {isPending ? "Procesando..." : "Contabilizar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
