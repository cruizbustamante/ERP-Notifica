"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { formatMonto, MESES } from "@/lib/contabilidad/core";
import { formatRut } from "@/lib/rut";
import {
  getResumenCartola,
  getMovimientosCartola,
  contabilizarMovimiento,
  anularContabilizacion,
  getDocsPendientesAuxiliar,
  cargarCartolaSantander,
  cargarCartolaMP,
  previewMatchAutomatico,
  confirmarMatchAutomatico,
  previewMatchMarketplace,
  contabilizarMarketplace,
  previewMatchMarketplaceBulk,
  confirmarMatchMarketplaceBulk,
  type MovCartola,
  type ContabilizarInput,
  type MatchResult,
  type MatchPreviewItem,
  type MatchDocAlternativo,
  type MarketplaceMatchPreview,
  type MarketplaceBulkItem,
  type BancoInfo,
  getSaldosBancos,
} from "./actions";

type Periodo = { anio: number; estado: string };
type Cuenta = { codigo: string; nombre: string; tipo: string; usa_auxiliar: string; usa_documento: string };
type Auxiliar = { rut: string; razon_social: string };
type MesData = { abonos: number; cargos: number; pend: number; cont: number };
type DocPend = { tipo_doc: string; num_doc: string; saldo: number };
type CategoriaFlujo = { id: number; codigo: string; nombre: string; tipo: string; flujo: string; orden: number };
type SaldoBanco = { saldo: number; totalMovs: number; pendientes: number; contabilizados: number; totalAbonos: number; totalCargos: number };

export default function ConciliacionClient({
  periodos, cuentas, auxiliares, categoriasFlujo, currentYear,
  bancos, saldosPorBanco: initialSaldos, saldoConsolidado: initialConsolidado, porMesPorBanco: initialPorMes,
}: {
  periodos: Periodo[];
  cuentas: Cuenta[];
  auxiliares: Auxiliar[];
  categoriasFlujo: CategoriaFlujo[];
  currentYear: number;
  bancos: BancoInfo[];
  saldosPorBanco: Record<string, SaldoBanco>;
  saldoConsolidado: number;
  porMesPorBanco: Record<string, Record<number, MesData>>;
}) {
  const [anio, setAnio] = useState(currentYear);
  const [bancoActivo, setBancoActivo] = useState(bancos[0]?.id || "CTE-SANTANDER");
  const [resumen, setResumen] = useState<Record<number, MesData>>(initialPorMes[bancoActivo] || {});
  const [saldos, setSaldos] = useState(initialSaldos);
  const [consolidado, setConsolidado] = useState(initialConsolidado);
  useEffect(() => { setSaldos(initialSaldos); }, [initialSaldos]);
  useEffect(() => { setConsolidado(initialConsolidado); }, [initialConsolidado]);
  const [movimientos, setMovimientos] = useState<MovCartola[]>([]);
  const [mesActivo, setMesActivo] = useState<number | null>(null);
  const [vista, setVista] = useState<"dashboard" | "movimientos" | "contabilizar" | "upload">("dashboard");
  const [movActivo, setMovActivo] = useState<MovCartola | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const [uploadResult, setUploadResult] = useState<{ nuevos: number; duplicados: number; errores: string[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [formTipo, setFormTipo] = useState<"COBRANZA" | "PAGO" | "GASTO" | "INGRESO">("GASTO");
  const [formCuenta, setFormCuenta] = useState("");
  const [formAuxiliar, setFormAuxiliar] = useState("");
  const [formGlosa, setFormGlosa] = useState("");
  const [formTipoDoc, setFormTipoDoc] = useState("");
  const [formNumDoc, setFormNumDoc] = useState("");
  const [formTipoDocRef, setFormTipoDocRef] = useState("");
  const [formNumDocRef, setFormNumDocRef] = useState("");
  const [formCategoria, setFormCategoria] = useState("");
  const [docsPend, setDocsPend] = useState<DocPend[]>([]);
  const [busqAux, setBusqAux] = useState("");

  const [filtroEstado, setFiltroEstado] = useState<"todos" | "pendientes" | "contabilizados">("todos");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "abonos" | "cargos">("todos");
  const [busqueda, setBusqueda] = useState("");
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchPreview, setMatchPreview] = useState<MatchPreviewItem[] | null>(null);
  const [mktPreview, setMktPreview] = useState<MarketplaceMatchPreview | null>(null);
  const [mktLoading, setMktLoading] = useState(false);
  const [mktBulkPreview, setMktBulkPreview] = useState<MarketplaceBulkItem[] | null>(null);
  const [mktBulkLoading, setMktBulkLoading] = useState(false);

  const bancoInfo = bancos.find((b) => b.id === bancoActivo) || bancos[0];
  const stats = saldos[bancoActivo] || { saldo: 0, totalMovs: 0, pendientes: 0, contabilizados: 0, totalAbonos: 0, totalCargos: 0 };
  const porcentajeContab = stats.totalMovs > 0 ? Math.round((stats.contabilizados / stats.totalMovs) * 100) : 0;

  const cambiarBanco = (id: string) => {
    setBancoActivo(id);
    setResumen(initialPorMes[id] || {});
    setMovimientos([]);
    setMesActivo(null);
    setVista("dashboard");
  };

  const ejecutarMatchAutomatico = () => {
    if (!mesActivo) return;
    setMatchLoading(true);
    setMatchResult(null);
    setMatchPreview(null);
    startTransition(async () => {
      const result = await previewMatchAutomatico(anio, mesActivo, bancoActivo);
      setMatchLoading(false);
      if (result.error) {
        setMensaje({ tipo: "error", texto: result.error });
      } else if (result.items.length > 0) {
        setMatchPreview(result.items);
      } else {
        setMensaje({ tipo: "ok", texto: "No se encontraron coincidencias para conciliar automáticamente" });
      }
    });
  };

  const confirmarMatch = () => {
    if (!mesActivo || !matchPreview) return;
    setMatchLoading(true);
    startTransition(async () => {
      const ids = matchPreview.map((i) => i.cartola_id);
      const cats: Record<number, string> = {};
      const docSels: Record<number, { tipoDoc: string; numDoc: string }> = {};
      for (const item of matchPreview) {
        cats[item.cartola_id] = item.categoria_flujo;
        if (item.docsAlternativos.length > 0) {
          const selectedDoc = item.lineas.find((l) => l.tipo_doc);
          if (selectedDoc) docSels[item.cartola_id] = { tipoDoc: selectedDoc.tipo_doc, numDoc: selectedDoc.num_doc };
        }
      }
      const result = await confirmarMatchAutomatico(anio, mesActivo, ids, bancoActivo, cats, docSels);
      setMatchResult(result);
      setMatchPreview(null);
      setMatchLoading(false);
      if (result.error) {
        setMensaje({ tipo: "error", texto: result.error });
      } else if (result.matched > 0) {
        setMensaje({ tipo: "ok", texto: `${result.matched} movimiento${result.matched > 1 ? "s" : ""} conciliado${result.matched > 1 ? "s" : ""} automáticamente` });
        cargarMovimientos(mesActivo);
      }
    });
  };

  const cargarResumen = (year?: number) => {
    const y = year || anio;
    startTransition(async () => {
      const [data, saldoData] = await Promise.all([
        getResumenCartola(y, bancoActivo),
        getSaldosBancos(),
      ]);
      setResumen(data);
      setSaldos(saldoData.saldosPorBanco);
      setConsolidado(saldoData.consolidado);
      setVista("dashboard");
      setMovimientos([]);
      setMesActivo(null);
    });
  };

  const cargarMovimientos = (mes: number) => {
    startTransition(async () => {
      setMesActivo(mes);
      const { movimientos: m, error } = await getMovimientosCartola(anio, mes, false, bancoActivo);
      if (error) { setMensaje({ tipo: "error", texto: error }); return; }
      setMovimientos(m);
      setVista("movimientos");
      setMensaje(null);
      setFiltroEstado("todos");
      setFiltroTipo("todos");
      setBusqueda("");
      setSeleccionados(new Set());
    });
  };

  const abrirContabilizar = (mov: MovCartola) => {
    setMovActivo(mov);
    const esAbono = mov.cargo_abono === "A";
    setFormTipo(esAbono ? "COBRANZA" : "PAGO");
    setFormGlosa(mov.descripcion);
    setFormTipoDoc("");
    setFormNumDoc("");
    setFormTipoDocRef("");
    setFormNumDocRef("");
    setFormCategoria(esAbono ? "1.01" : "1.04");
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
    if (!formCategoria) {
      setMensaje({ tipo: "error", texto: "Debe seleccionar categoría de flujo de efectivo" });
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
      tipo_doc_ref: formTipoDocRef,
      num_doc_ref: formNumDocRef,
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
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (bancoActivo === "CTE-MP") {
        // Parser Mercado Pago
        let headerIdx = -1;
        for (let i = 0; i < Math.min(20, rows.length); i++) {
          const row = rows[i]?.map((c) => String(c ?? "").toUpperCase()) || [];
          if (row.some((c) => c.includes("OPERACI")) && row.some((c) => c.includes("NETO"))) {
            headerIdx = i;
            break;
          }
        }
        if (headerIdx === -1) {
          setMensaje({ tipo: "error", texto: "No se encontraron encabezados de Mercado Pago en el Excel" });
          setUploading(false);
          return;
        }

        const headers = (rows[headerIdx] as string[]).map((c) => String(c ?? "").toUpperCase());
        const idxOpId = headers.findIndex((c) => c.includes("OPERACI") && c.includes("MERCADO"));
        const idxTipoPago = headers.findIndex((c) => c.includes("MEDIO") && c.includes("PAGO"));
        const idxTipoOp = headers.findIndex((c) => c.includes("TIPO") && c.includes("OPERACI"));
        const idxValor = headers.findIndex((c) => c.includes("VALOR") && c.includes("COMPRA"));
        const idxFecha = headers.findIndex((c) => c.includes("FECHA") && c.includes("LIBERACI"));
        const idxComision = headers.findIndex((c) => c.includes("COMISION") || c.includes("IVA"));
        const idxNeto = headers.findIndex((c) => c.includes("NETO"));

        if (idxOpId < 0 || idxNeto < 0) {
          setMensaje({ tipo: "error", texto: "Columnas requeridas no encontradas (ID Operación, Monto Neto)" });
          setUploading(false);
          return;
        }

        const movs: Array<{
          op_id: string; tipo_pago: string; tipo_operacion: string;
          valor_compra: number; fecha: string; comisiones: number; monto_neto: number;
        }> = [];

        for (const row of rows.slice(headerIdx + 1)) {
          const arr = row as unknown[];
          if (!arr || arr.length < 3) continue;
          const opId = String(arr[idxOpId] || "").trim();
          if (!opId) continue;

          const montoNeto = Number(String(arr[idxNeto] || "0").replace(/,/g, "."));
          if (montoNeto === 0) continue;

          let fecha = "";
          const fechaRaw = String(arr[idxFecha >= 0 ? idxFecha : 4] || "");
          if (fechaRaw.includes("T")) {
            fecha = fechaRaw.split("T")[0];
          } else if (fechaRaw.includes("/")) {
            const parts = fechaRaw.split("/");
            if (parts.length === 3) fecha = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
          } else {
            fecha = fechaRaw.slice(0, 10);
          }
          if (!fecha || fecha.length < 10) continue;

          movs.push({
            op_id: opId,
            tipo_pago: String(arr[idxTipoPago >= 0 ? idxTipoPago : 1] || ""),
            tipo_operacion: String(arr[idxTipoOp >= 0 ? idxTipoOp : 2] || ""),
            valor_compra: Number(String(arr[idxValor >= 0 ? idxValor : 3] || "0").replace(/,/g, ".")),
            fecha,
            comisiones: Number(String(arr[idxComision >= 0 ? idxComision : 5] || "0").replace(/,/g, ".")),
            monto_neto: montoNeto,
          });
        }

        if (movs.length === 0) {
          setMensaje({ tipo: "error", texto: "No se encontraron movimientos válidos en el archivo MP" });
          setUploading(false);
          return;
        }

        const result = await cargarCartolaMP(movs);
        setUploadResult(result);
        if (result.nuevos > 0) {
          setMensaje({ tipo: "ok", texto: `Cargados ${result.nuevos} movimientos MP. ${result.duplicados} duplicados omitidos.` });
          cargarResumen();
        } else {
          setMensaje({ tipo: "ok", texto: `Todos los ${result.duplicados} movimientos MP ya existían.` });
        }
      } else {
        // Parser Santander (existente)
        let headerIdx = -1;
        for (let i = 0; i < Math.min(20, rows.length); i++) {
          const row = rows[i]?.map((c) => String(c ?? "").toUpperCase()) || [];
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

        const dataRows = rows.slice(headerIdx + 1).filter((r) => r && r.length >= 7 && r[2]);

        const movs: Array<{
          monto: number; descripcion: string; fecha: string;
          saldo: number; num_doc: string; sucursal: string; cargo_abono: string;
        }> = [];

        for (const row of dataRows) {
          const monto = Math.abs(Number(row[0]) || 0);
          if (monto === 0) continue;

          const descripcion = String(row[1] || "").trim();
          const fechaCell = row[2];
          const saldo = Math.abs(Number(row[3]) || 0);
          const numDoc = String(row[4] || "").trim();
          const sucursal = String(row[5] || "").trim();
          const cargoAbono = String(row[6] || "").trim().toUpperCase();

          let fecha = "";
          if (fechaCell instanceof Date) {
            const d = fechaCell;
            fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          } else {
            const parts = String(fechaCell || "").trim().split("/");
            if (parts.length !== 3) continue;
            fecha = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
          }
          if (!fecha) continue;

          movs.push({
            monto, descripcion, fecha, saldo,
            num_doc: numDoc, sucursal,
            cargo_abono: cargoAbono === "A" ? "A" : "C",
          });
        }

        if (movs.length === 0) {
          setMensaje({ tipo: "error", texto: "No se encontraron movimientos válidos en el archivo" });
          setUploading(false);
          return;
        }

        const result = await cargarCartolaSantander(movs);
        setUploadResult(result);

        if (result.nuevos > 0) {
          setMensaje({ tipo: "ok", texto: `Cargados ${result.nuevos} movimientos nuevos. ${result.duplicados} duplicados omitidos.` });
          cargarResumen();
        } else {
          setMensaje({ tipo: "ok", texto: `Todos los ${result.duplicados} movimientos ya existían. Sin cambios.` });
        }
      }
    } catch (err) {
      setMensaje({ tipo: "error", texto: `Error procesando archivo: ${err}` });
    }
    setUploading(false);
  }, [anio, bancoActivo]);

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
    ? auxiliares.filter((a) => a.rut.replace(/\./g, "").includes(busqAux.replace(/\./g, "")) || a.razon_social.toLowerCase().includes(busqAux.toLowerCase())).slice(0, 10)
    : [];

  const movsFiltrados = movimientos.filter((m) => {
    if (filtroEstado === "pendientes" && m.contabilizado) return false;
    if (filtroEstado === "contabilizados" && !m.contabilizado) return false;
    if (filtroTipo === "abonos" && m.cargo_abono !== "A") return false;
    if (filtroTipo === "cargos" && m.cargo_abono === "A") return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return m.descripcion.toLowerCase().includes(q) || m.rut_extraido.toLowerCase().includes(q) || String(m.monto).includes(q);
    }
    return true;
  });

  const mesStats = {
    total: movimientos.length,
    pendientes: movimientos.filter((m) => !m.contabilizado).length,
    contabilizados: movimientos.filter((m) => m.contabilizado).length,
    abonos: movimientos.filter((m) => m.cargo_abono === "A"),
    cargos: movimientos.filter((m) => m.cargo_abono !== "A"),
    totalAbonos: movimientos.filter((m) => m.cargo_abono === "A").reduce((s, m) => s + Math.abs(m.monto), 0),
    totalCargos: movimientos.filter((m) => m.cargo_abono !== "A").reduce((s, m) => s + Math.abs(m.monto), 0),
  };

  const toggleSeleccion = (id: number) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleTodos = () => {
    const pendFiltrados = movsFiltrados.filter((m) => !m.contabilizado);
    if (seleccionados.size === pendFiltrados.length && pendFiltrados.length > 0) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(pendFiltrados.map((m) => m.id)));
    }
  };

  const bancoColors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    "CTE-SANTANDER": { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", icon: "text-red-500" },
    "CTE-MP": { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-700", icon: "text-sky-500" },
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Conciliacion Bancaria</h1>
            <p className="text-gray-500 text-sm mt-0.5">Saldo consolidado: <span className="font-semibold text-gray-900">${consolidado.toLocaleString("es-CL")}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <select value={anio} onChange={(e) => { setAnio(Number(e.target.value)); cargarResumen(Number(e.target.value)); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-shrink-0">
              {periodos.map((p) => <option key={p.anio} value={p.anio}>{p.anio}</option>)}
            </select>
            <button onClick={() => setVista("upload")} className="bg-emerald-600 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-1.5 whitespace-nowrap">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              <span className="hidden sm:inline">Cargar</span> Cartola
            </button>
          </div>
        </div>

        {/* Selector de banco */}
        <div className="flex gap-2 mt-4">
          {bancos.map((b) => {
            const c = bancoColors[b.id] || bancoColors["CTE-SANTANDER"];
            const s = saldos[b.id];
            const active = bancoActivo === b.id;
            return (
              <button
                key={b.id}
                onClick={() => cambiarBanco(b.id)}
                className={`flex-1 rounded-xl border-2 p-3 transition-all text-left ${
                  active ? `${c.bg} ${c.border} ring-2 ring-offset-1 ring-${b.id === "CTE-MP" ? "sky" : "red"}-300` : "bg-white border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${active ? c.text : "text-gray-500"}`}>{b.nombre}</span>
                  {s && s.pendientes > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{s.pendientes} pend</span>
                  )}
                </div>
                <p className={`text-lg font-bold mt-1 ${active ? "text-gray-900" : "text-gray-700"}`}>
                  ${(s?.saldo || 0).toLocaleString("es-CL")}
                </p>
                {b.cuenta && <p className="text-[11px] text-gray-400 mt-0.5">{b.cuenta}</p>}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPIs del banco activo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4 col-span-2 sm:col-span-1">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Saldo {bancoInfo.nombre}</p>
          <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-0.5">${stats.saldo.toLocaleString("es-CL")}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Pendientes</p>
          <p className="text-lg sm:text-2xl font-bold text-amber-600 mt-0.5">{stats.pendientes}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Contabilizados</p>
          <p className="text-lg sm:text-2xl font-bold text-emerald-600 mt-0.5">{stats.contabilizados} <span className="text-xs font-normal text-gray-400">({porcentajeContab}%)</span></p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Abonos {anio}</p>
          <p className="text-lg sm:text-xl font-bold text-emerald-600 mt-0.5">${(stats.totalAbonos / 1000000).toFixed(1)}M</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Cargos {anio}</p>
          <p className="text-lg sm:text-xl font-bold text-red-600 mt-0.5">${(stats.totalCargos / 1000000).toFixed(1)}M</p>
        </div>
      </div>

      {mensaje && (
        <div className={`p-3 sm:p-4 rounded-lg text-sm flex items-center justify-between gap-2 ${mensaje.tipo === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          <span className="break-words min-w-0">{mensaje.texto}</span>
          <button onClick={() => setMensaje(null)} className="font-bold text-lg leading-none flex-shrink-0">&times;</button>
        </div>
      )}

      {/* Upload View */}
      {vista === "upload" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Cargar Cartola {bancoInfo.nombre}</h3>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                {bancoActivo === "CTE-MP"
                  ? "Sube el archivo Excel de liquidación de Mercado Pago (settlement)."
                  : "Sube el archivo Excel de cartola Santander."}
              </p>
            </div>
            <button onClick={() => setVista("dashboard")} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-colors ${dragOver ? "border-emerald-400 bg-emerald-50" : "border-gray-300 hover:border-gray-400"}`}
          >
            {uploading ? (
              <div className="space-y-3">
                <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto"></div>
                <p className="text-sm text-gray-600">Procesando...</p>
              </div>
            ) : (
              <>
                <svg className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-600 mt-3 font-medium text-sm sm:text-base">Arrastra el Excel aquí</p>
                <label className="inline-block mt-3 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-emerald-700">
                  Seleccionar archivo
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
                </label>
              </>
            )}
          </div>

          {uploadResult && (
            <div className="bg-gray-50 rounded-lg p-3 sm:p-4 space-y-2">
              <h4 className="font-medium text-gray-900 text-sm">Resultado</h4>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  Nuevos: <strong>{uploadResult.nuevos}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-300"></span>
                  Duplicados: <strong>{uploadResult.duplicados}</strong>
                </div>
              </div>
              {uploadResult.errores.length > 0 && (
                <div className="text-xs text-red-600 mt-2">
                  {uploadResult.errores.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dashboard - Resumen por mes */}
      {vista === "dashboard" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Resumen mensual {anio} — {bancoInfo.nombre}</h3>
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="px-6 py-3 text-left font-medium">Mes</th>
                  <th className="px-4 py-3 text-center font-medium">Pend.</th>
                  <th className="px-4 py-3 text-right font-medium">Abonos pend.</th>
                  <th className="px-4 py-3 text-right font-medium">Cargos pend.</th>
                  <th className="px-4 py-3 text-center font-medium">Contab.</th>
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

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-gray-100">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const d = resumen[m];
              if (!d || (d.pend === 0 && d.cont === 0)) return null;
              const total = d.pend + d.cont;
              const pct = total > 0 ? Math.round((d.cont / total) * 100) : 0;
              return (
                <button key={m} onClick={() => cargarMovimientos(m)} disabled={isPending} className="w-full px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{MESES[m]}</span>
                    <div className="flex items-center gap-2">
                      {d.pend > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">{d.pend} pend</span>}
                      {d.cont > 0 && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">{d.cont} ok</span>}
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs">
                    {d.abonos > 0 && <span className="text-emerald-600">+{formatMonto(d.abonos)}</span>}
                    {d.cargos > 0 && <span className="text-red-500">-{formatMonto(d.cargos)}</span>}
                    <div className="flex-1 flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }}></div>
                      </div>
                      <span className="text-gray-400">{pct}%</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Lista movimientos */}
      {vista === "movimientos" && mesActivo && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => { setVista("dashboard"); setMovimientos([]); }} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h3 className="font-semibold text-gray-900 text-base sm:text-lg">{MESES[mesActivo]} {anio} — {bancoInfo.nombre}</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-3 border-l-4 border-l-indigo-600">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Saldo {bancoInfo.nombre}</p>
              <p className="text-base sm:text-lg font-bold text-gray-900">${stats.saldo.toLocaleString("es-CL")}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3 border-l-4 border-l-amber-500">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Pendientes</p>
              <p className="text-base sm:text-lg font-bold text-amber-600">{mesStats.pendientes}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3 border-l-4 border-l-emerald-500">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Contabilizados</p>
              <p className="text-base sm:text-lg font-bold text-emerald-600">{mesStats.contabilizados}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3 border-l-4 border-l-blue-500">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Abonos</p>
              <p className="text-base sm:text-lg font-bold text-emerald-600">${mesStats.totalAbonos.toLocaleString("es-CL")}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3 border-l-4 border-l-red-500 col-span-2 sm:col-span-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Cargos</p>
              <p className="text-base sm:text-lg font-bold text-red-600">${mesStats.totalCargos.toLocaleString("es-CL")}</p>
            </div>
          </div>

          {/* Filtros */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                <button onClick={() => setFiltroEstado("todos")} className={`px-2.5 sm:px-3 py-1.5 transition-colors ${filtroEstado === "todos" ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  Todos <span className="ml-0.5 opacity-70">{mesStats.total}</span>
                </button>
                <button onClick={() => setFiltroEstado("pendientes")} className={`px-2.5 sm:px-3 py-1.5 border-x border-gray-200 transition-colors ${filtroEstado === "pendientes" ? "bg-amber-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  Pendientes <span className="ml-0.5 opacity-70">{mesStats.pendientes}</span>
                </button>
                <button onClick={() => setFiltroEstado("contabilizados")} className={`px-2.5 sm:px-3 py-1.5 transition-colors ${filtroEstado === "contabilizados" ? "bg-emerald-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  Contab. <span className="ml-0.5 opacity-70">{mesStats.contabilizados}</span>
                </button>
              </div>

              <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                <button onClick={() => setFiltroTipo("todos")} className={`px-2.5 sm:px-3 py-1.5 transition-colors ${filtroTipo === "todos" ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Todos</button>
                <button onClick={() => setFiltroTipo("abonos")} className={`px-2.5 sm:px-3 py-1.5 border-x border-gray-200 transition-colors ${filtroTipo === "abonos" ? "bg-emerald-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  Abonos <span className="ml-0.5 opacity-70">{mesStats.abonos.length}</span>
                </button>
                <button onClick={() => setFiltroTipo("cargos")} className={`px-2.5 sm:px-3 py-1.5 transition-colors ${filtroTipo === "cargos" ? "bg-red-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  Cargos <span className="ml-0.5 opacity-70">{mesStats.cargos.length}</span>
                </button>
              </div>

              <div className="relative flex-1 min-w-[180px]">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por glosa, RUT o monto..." className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
              </div>

              <button onClick={ejecutarMatchAutomatico} disabled={isPending || matchLoading || mesStats.pendientes === 0}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors whitespace-nowrap flex items-center gap-1.5">
                {matchLoading ? (
                  <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>Buscando...</>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Match Automático</>
                )}
              </button>

              {bancoActivo === "CTE-SANTANDER" && (
                <button onClick={() => {
                  if (!mesActivo) return;
                  setMktBulkLoading(true);
                  setMktBulkPreview(null);
                  startTransition(async () => {
                    const res = await previewMatchMarketplaceBulk(anio, mesActivo, bancoActivo);
                    setMktBulkLoading(false);
                    if (res.error) {
                      setMensaje({ tipo: "error", texto: res.error });
                    } else if (res.items.length > 0) {
                      setMktBulkPreview(res.items);
                    } else {
                      setMensaje({ tipo: "ok", texto: "No se encontraron depósitos TBK con match marketplace para este mes" });
                    }
                  });
                }} disabled={isPending || mktBulkLoading || mesStats.pendientes === 0}
                  className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-700 disabled:opacity-40 transition-colors whitespace-nowrap flex items-center gap-1.5">
                  {mktBulkLoading ? (
                    <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>Buscando...</>
                  ) : (
                    <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Match Marketplace</>
                  )}
                </button>
              )}

              <button onClick={() => { if (seleccionados.size === 0) return; const pendSel = movimientos.filter((m) => seleccionados.has(m.id) && !m.contabilizado); if (pendSel.length > 0) abrirContabilizar(pendSel[0]); }}
                disabled={seleccionados.size === 0} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-40 transition-colors whitespace-nowrap">
                Contabilizar ({seleccionados.size})
              </button>
            </div>
          </div>

          {/* Preview Match Marketplace Bulk */}
          {mktBulkPreview && mktBulkPreview.length > 0 && (
            <div className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-900">Match Marketplace — {mktBulkPreview.length} depósito{mktBulkPreview.length > 1 ? "s" : ""} TBK</h4>
                <button onClick={() => setMktBulkPreview(null)} className="text-gray-400 hover:text-gray-600 text-sm">Cerrar</button>
              </div>

              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {mktBulkPreview.map((item) => (
                  <div key={item.cartola_id} className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">TBK</span>
                        <span className="text-xs text-gray-500">{item.fecha}</span>
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">{item.preview.totales.txCount} tx</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-sm">${formatMonto(item.monto_cartola)}</span>
                        {Math.abs(item.diferencia) > 1 && (
                          <span className="ml-2 text-xs text-amber-600 font-medium">(dif: ${formatMonto(Math.abs(item.diferencia))})</span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 mb-2 truncate">{item.descripcion}</p>

                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {item.preview.receptores.map((r) => (
                        <span key={r.rut} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {r.nombre} <span className="font-mono">${r.base.toLocaleString("es-CL")}</span>
                        </span>
                      ))}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-gray-400 border-b">
                            <th className="pb-1 font-medium">Cuenta</th>
                            <th className="pb-1 font-medium">Auxiliar</th>
                            <th className="pb-1 font-medium">T.Doc</th>
                            <th className="pb-1 font-medium">N.Doc</th>
                            <th className="pb-1 font-medium text-right">Debe</th>
                            <th className="pb-1 font-medium text-right">Haber</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.preview.lineas.map((l, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-1"><span className="font-mono">{l.cuenta_codigo}</span> <span className="text-gray-400">{l.cuenta_nombre}</span></td>
                              <td className="py-1 font-mono text-gray-500">{l.auxiliar_rut ? formatRut(l.auxiliar_rut) : ""}</td>
                              <td className="py-1 font-mono text-indigo-600">{l.tipo_doc}</td>
                              <td className="py-1 font-mono text-gray-500 max-w-[80px] truncate" title={l.num_doc}>{l.num_doc}</td>
                              <td className="py-1 text-right font-mono">{l.debe > 0 ? formatMonto(l.debe) : ""}</td>
                              <td className="py-1 text-right font-mono">{l.haber > 0 ? formatMonto(l.haber) : ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setMktBulkPreview(null)} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50">Cancelar</button>
                <button
                  onClick={() => {
                    startTransition(async () => {
                      const items = mktBulkPreview!.map((i) => ({ cartola_id: i.cartola_id, fecha_abono: i.preview.fecha_abono }));
                      const res = await confirmarMatchMarketplaceBulk(items, "1.01");
                      setMktBulkPreview(null);
                      if (res.total > 0) {
                        setMensaje({ tipo: "ok", texto: `${res.total} depósito${res.total > 1 ? "s" : ""} TBK contabilizado${res.total > 1 ? "s" : ""} con marketplace` });
                        if (mesActivo) cargarMovimientos(mesActivo);
                      } else {
                        setMensaje({ tipo: "error", texto: "No se pudo contabilizar ningún depósito" });
                      }
                    });
                  }}
                  disabled={isPending}
                  className="bg-emerald-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isPending ? "Contabilizando..." : `Confirmar ${mktBulkPreview.length} asiento${mktBulkPreview.length > 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          )}

          {/* Match Result */}
          {matchResult && matchResult.matched > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <h4 className="font-semibold text-indigo-900 text-sm">Match Automático: {matchResult.matched} conciliado{matchResult.matched > 1 ? "s" : ""}</h4>
                </div>
                <button onClick={() => setMatchResult(null)} className="text-indigo-400 hover:text-indigo-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {matchResult.details.map((d, i) => (
                  <div key={i} className="bg-white rounded-lg p-2.5 border border-indigo-100 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-gray-900">${formatMonto(d.monto)}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${d.tipo_match === "exacto" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                        {d.tipo_match === "exacto" ? "Exacto" : "Combinado"}
                      </span>
                    </div>
                    <p className="text-gray-500 mt-1">{d.fecha_cartola} · {d.receptor} · {d.docs}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview Match Automático */}
          {matchPreview && matchPreview.length > 0 && (
            <div className="border border-indigo-200 bg-indigo-50/30 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-900">Previsualización Match Automático — {matchPreview.length} coincidencia{matchPreview.length > 1 ? "s" : ""}</h4>
                <button onClick={() => setMatchPreview(null)} className="text-gray-400 hover:text-gray-600 text-sm">Cerrar</button>
              </div>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {matchPreview.map((item, idx) => (
                  <div key={idx} className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${item.esAbono ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {item.esAbono ? "ABONO" : "CARGO"}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${item.tipo_match === "exacto" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                          {item.tipo_match}
                        </span>
                        <span className="text-xs text-gray-500">{item.fecha}</span>
                        <span className="text-xs text-gray-400 flex items-center gap-1">Flujo:
                          <select value={item.categoria_flujo} onChange={(e) => {
                            setMatchPreview((prev) => prev ? prev.map((p) => p.cartola_id === item.cartola_id ? { ...p, categoria_flujo: e.target.value } : p) : prev);
                          }} className="border border-gray-300 rounded px-1.5 py-0.5 text-xs font-medium text-gray-700 bg-white">
                            {(["OPERACIONAL", "INVERSION", "FINANCIAMIENTO"] as const).map((flujo) => {
                              const items = categoriasFlujo.filter((c) => c.flujo === flujo);
                              if (items.length === 0) return null;
                              const labels = { OPERACIONAL: "Operacional", INVERSION: "Inversión", FINANCIAMIENTO: "Financiamiento" };
                              return (
                                <optgroup key={flujo} label={labels[flujo]}>
                                  {items.map((c) => <option key={c.id} value={c.codigo}>{c.codigo} — {c.nombre}</option>)}
                                </optgroup>
                              );
                            })}
                          </select>
                        </span>
                      </div>
                      <span className="font-mono font-bold text-sm">{formatMonto(item.monto)}</span>
                    </div>
                    <p className="text-xs text-gray-600 mb-2 truncate">{item.descripcion}</p>
                    <p className="text-xs text-gray-500 mb-1">Docs: <strong>{item.docs}</strong> · RUT: <span className="font-mono">{formatRut(item.rut)}</span></p>
                    {item.docsAlternativos.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">
                        <p className="text-[10px] font-semibold text-amber-700 uppercase mb-1">Múltiples documentos con mismo monto — seleccione cuál pagar:</p>
                        <select
                          value={`${item.lineas.find((l) => l.tipo_doc)?.tipo_doc}|${item.lineas.find((l) => l.tipo_doc)?.num_doc}`}
                          onChange={(e) => {
                            const [tipoDoc, numDoc] = e.target.value.split("|");
                            setMatchPreview((prev) => prev ? prev.map((p) => {
                              if (p.cartola_id !== item.cartola_id) return p;
                              const newLineas = p.lineas.map((l) => {
                                if (!l.auxiliar_rut) return l;
                                return { ...l, tipo_doc: tipoDoc, num_doc: numDoc };
                              });
                              return { ...p, docs: `${tipoDoc} ${numDoc}`, lineas: newLineas };
                            }) : prev);
                          }}
                          className="w-full border border-amber-300 rounded px-2 py-1.5 text-xs bg-white font-mono"
                        >
                          {item.docsAlternativos.map((d) => (
                            <option key={`${d.tipoDoc}-${d.numDoc}`} value={`${d.tipoDoc}|${d.numDoc}`}>
                              {d.tipoDoc} {d.numDoc} — ${formatMonto(d.saldo)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-400 border-b">
                          <th className="pb-1 font-medium">Cuenta</th>
                          <th className="pb-1 font-medium">Glosa</th>
                          <th className="pb-1 font-medium">Auxiliar</th>
                          <th className="pb-1 font-medium text-right">Debe</th>
                          <th className="pb-1 font-medium text-right">Haber</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.lineas.map((l, li) => (
                          <tr key={li} className="border-b last:border-0">
                            <td className="py-1"><span className="font-mono">{l.cuenta_codigo}</span>{l.cuenta_nombre && <span className="text-gray-400 ml-1">— {l.cuenta_nombre}</span>}</td>
                            <td className="py-1 truncate max-w-[180px]">{l.glosa}</td>
                            <td className="py-1 font-mono text-gray-500">{l.auxiliar_rut || ""}</td>
                            <td className="py-1 text-right font-mono">{l.debe > 0 ? formatMonto(l.debe) : ""}</td>
                            <td className="py-1 text-right font-mono">{l.haber > 0 ? formatMonto(l.haber) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setMatchPreview(null)} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50">Cancelar</button>
                <button onClick={confirmarMatch} disabled={isPending} className="bg-emerald-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                  {isPending ? "Contabilizando..." : `Confirmar ${matchPreview.length} asiento${matchPreview.length > 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          )}

          {/* Tabla movimientos */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <th className="px-3 py-3 text-center font-medium w-10">
                      <input type="checkbox" checked={seleccionados.size > 0 && seleccionados.size === movsFiltrados.filter((m) => !m.contabilizado).length} onChange={toggleTodos} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    </th>
                    <th className="px-3 py-3 text-left font-medium">Fecha</th>
                    <th className="px-3 py-3 text-left font-medium">Descripción</th>
                    <th className="px-3 py-3 text-right font-medium">Monto</th>
                    <th className="px-3 py-3 text-right font-medium">Saldo</th>
                    <th className="px-3 py-3 text-center font-medium">Estado</th>
                    <th className="px-3 py-3 text-center font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {movsFiltrados.map((m) => (
                    <tr key={m.id} className={`hover:bg-gray-50 transition-colors ${seleccionados.has(m.id) ? "bg-indigo-50/50" : ""}`}>
                      <td className="px-3 py-2.5 text-center">
                        {!m.contabilizado && <input type="checkbox" checked={seleccionados.has(m.id)} onChange={() => toggleSeleccion(m.id)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 text-xs">{m.fecha}</td>
                      <td className="px-3 py-2.5 max-w-[300px] truncate text-gray-900" title={m.descripcion}>{m.descripcion}</td>
                      <td className={`px-3 py-2.5 text-right font-mono font-semibold whitespace-nowrap ${m.cargo_abono === "A" ? "text-emerald-600" : "text-red-500"}`}>
                        {m.cargo_abono === "A" ? "+" : "-"}{formatMonto(Math.abs(m.monto))}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-500 whitespace-nowrap text-xs">{m.saldo > 0 ? formatMonto(m.saldo) : "—"}</td>
                      <td className="px-3 py-2.5 text-center">
                        {m.contabilizado
                          ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">OK</span>
                          : <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Pend.</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        {m.contabilizado && m.comprobante_id && (
                          <a href={`/contable/comprobantes/${m.comprobante_id}`} className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 mr-1" title="Ver comprobante">
                            #{m.comprobante_id}
                          </a>
                        )}
                        {!m.contabilizado ? (
                          <button onClick={() => abrirContabilizar(m)} className="px-2.5 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 transition-colors">Contabilizar</button>
                        ) : (
                          <button onClick={() => ejecutarAnulacion(m.id)} disabled={isPending} className="px-2.5 py-1 bg-red-50 text-red-600 rounded text-xs font-medium hover:bg-red-100 transition-colors">Anular</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {movsFiltrados.map((m) => (
                <div key={m.id} className={`px-4 py-3 space-y-2 ${seleccionados.has(m.id) ? "bg-indigo-50/50" : ""}`}>
                  <div className="flex items-start gap-2">
                    {!m.contabilizado && <input type="checkbox" checked={seleccionados.has(m.id)} onChange={() => toggleSeleccion(m.id)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mt-1 flex-shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900 truncate">{m.descripcion}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{m.fecha}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`font-mono font-semibold text-sm ${m.cargo_abono === "A" ? "text-emerald-600" : "text-red-500"}`}>
                        {m.cargo_abono === "A" ? "+" : "-"}{formatMonto(Math.abs(m.monto))}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${m.cargo_abono === "A" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {m.cargo_abono === "A" ? "ABONO" : "CARGO"}
                      </span>
                      {m.contabilizado
                        ? <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">Contab.</span>
                        : <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">Pendiente</span>}
                      {m.contabilizado && m.comprobante_id && (
                        <a href={`/contable/comprobantes/${m.comprobante_id}`} className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100">#{m.comprobante_id}</a>
                      )}
                    </div>
                    {!m.contabilizado ? (
                      <button onClick={() => abrirContabilizar(m)} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700">Contabilizar</button>
                    ) : (
                      <button onClick={() => ejecutarAnulacion(m.id)} disabled={isPending} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100">Anular</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {movsFiltrados.length === 0 && (
              <div className="p-8 sm:p-12 text-center text-gray-400 text-sm">
                {movimientos.length === 0 ? "No hay movimientos para este mes." : "No hay movimientos que coincidan con los filtros."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Form contabilizar */}
      {vista === "contabilizar" && movActivo && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-4 sm:space-y-5">
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => setVista("movimientos")} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Contabilizar movimiento</h3>
          </div>

          <div className={`p-3 sm:p-4 rounded-xl border-l-4 ${movActivo.cargo_abono === "A" ? "border-l-emerald-500 bg-emerald-50" : "border-l-red-500 bg-red-50"}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-gray-900 font-medium truncate">{movActivo.descripcion}</p>
                <p className="text-xs text-gray-500 mt-0.5">{movActivo.fecha} · {movActivo.cargo_abono === "A" ? "ABONO" : "CARGO"} · {bancoInfo.nombre}</p>
              </div>
              <p className={`font-mono font-bold text-lg sm:text-xl flex-shrink-0 ${movActivo.cargo_abono === "A" ? "text-emerald-700" : "text-red-700"}`}>
                {movActivo.cargo_abono === "A" ? "+" : "-"}${Math.abs(movActivo.monto).toLocaleString("es-CL")}
              </p>
            </div>
          </div>

          {/* Match Marketplace TBK */}
          {movActivo.cargo_abono === "A" && /transbank|webpay|tbk/i.test(movActivo.descripcion) && (
            <div className="border border-orange-200 bg-orange-50/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">TRANSBANK</span>
                  <span className="text-sm font-medium text-gray-700">Depósito marketplace detectado</span>
                </div>
                <button
                  onClick={() => {
                    if (!movActivo.fecha) return;
                    setMktLoading(true);
                    setMktPreview(null);
                    startTransition(async () => {
                      const res = await previewMatchMarketplace(movActivo.fecha!, Math.abs(movActivo.monto));
                      setMktPreview(res);
                      setMktLoading(false);
                    });
                  }}
                  disabled={isPending || mktLoading}
                  className="bg-orange-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {mktLoading ? (
                    <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>Buscando...</>
                  ) : (
                    <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Match Marketplace</>
                  )}
                </button>
              </div>

              {mktPreview && mktPreview.error && (
                <p className="text-sm text-red-600">{mktPreview.error}</p>
              )}

              {mktPreview && !mktPreview.error && mktPreview.lineas.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="bg-orange-100 text-orange-700 px-2.5 py-1 rounded-lg font-medium">{mktPreview.totales.txCount} transacciones</span>
                    <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg font-medium">Bruto: ${mktPreview.totales.bruto.toLocaleString("es-CL")}</span>
                    <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg font-medium">Depósito neto: ${mktPreview.totales.depositoNeto.toLocaleString("es-CL")}</span>
                    <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-lg font-medium">Costo TBK: ${mktPreview.totales.costoPlat.toLocaleString("es-CL")}</span>
                    <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg font-medium">Comisión NL: ${mktPreview.totales.comision.toLocaleString("es-CL")}</span>
                  </div>

                  {mktPreview.receptores.length > 0 && (
                    <div className="text-xs space-y-1">
                      <p className="font-semibold text-gray-600 uppercase text-[10px] tracking-wider">Receptores:</p>
                      {mktPreview.receptores.map((r) => (
                        <div key={r.rut} className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 border border-gray-100">
                          <span><span className="font-mono text-indigo-600">{formatRut(r.rut)}</span> — {r.nombre}</span>
                          <span className="font-mono font-medium">${r.base.toLocaleString("es-CL")}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-400 border-b">
                          <th className="pb-1 font-medium">Cuenta</th>
                          <th className="pb-1 font-medium">Glosa</th>
                          <th className="pb-1 font-medium">Auxiliar</th>
                          <th className="pb-1 font-medium">T.Doc</th>
                          <th className="pb-1 font-medium">N.Doc</th>
                          <th className="pb-1 font-medium text-right">Debe</th>
                          <th className="pb-1 font-medium text-right">Haber</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mktPreview.lineas.map((l, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-1"><span className="font-mono">{l.cuenta_codigo}</span>{l.cuenta_nombre && <span className="text-gray-400 ml-1">— {l.cuenta_nombre}</span>}</td>
                            <td className="py-1 truncate max-w-[150px]">{l.glosa}</td>
                            <td className="py-1 font-mono text-gray-500">{l.auxiliar_rut ? formatRut(l.auxiliar_rut) : ""}</td>
                            <td className="py-1 font-mono text-indigo-600">{l.tipo_doc}</td>
                            <td className="py-1 font-mono text-gray-500 max-w-[100px] truncate" title={l.num_doc}>{l.num_doc}</td>
                            <td className="py-1 text-right font-mono">{l.debe > 0 ? formatMonto(l.debe) : ""}</td>
                            <td className="py-1 text-right font-mono">{l.haber > 0 ? formatMonto(l.haber) : ""}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 font-bold">
                          <td colSpan={5} className="py-1">Total</td>
                          <td className="py-1 text-right font-mono">{formatMonto(mktPreview.lineas.reduce((s, l) => s + l.debe, 0))}</td>
                          <td className="py-1 text-right font-mono">{formatMonto(mktPreview.lineas.reduce((s, l) => s + l.haber, 0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setMktPreview(null)} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50">Cancelar</button>
                    <button
                      onClick={() => {
                        startTransition(async () => {
                          const res = await contabilizarMarketplace(movActivo.id, mktPreview!.fecha_abono, formCategoria || "1.01");
                          if (res.error) {
                            setMensaje({ tipo: "error", texto: res.error });
                          } else {
                            setMensaje({ tipo: "ok", texto: `Marketplace contabilizado — Comprobante #${res.data?.id}` });
                            setMktPreview(null);
                            if (mesActivo) cargarMovimientos(mesActivo);
                            setVista("movimientos");
                          }
                        });
                      }}
                      disabled={isPending}
                      className="bg-emerald-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {isPending ? "Contabilizando..." : "Confirmar asiento"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tipo</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["COBRANZA", "PAGO", "GASTO", "INGRESO"] as const).map((t) => (
                <button key={t} onClick={() => { setFormTipo(t); setFormCuenta(""); setFormAuxiliar(""); setDocsPend([]); }}
                  className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-medium border transition-colors ${formTipo === t ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
              <input type="text" value={busqAux} onChange={(e) => { setBusqAux(e.target.value); setFormAuxiliar(e.target.value); }}
                placeholder="Buscar por RUT o nombre..." className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
              {busqAux && auxFiltrados.length > 0 && (
                <div className="absolute z-10 w-full border border-gray-200 rounded-lg mt-1 max-h-40 overflow-y-auto text-sm bg-white shadow-lg">
                  {auxFiltrados.map((a) => (
                    <button key={a.rut} onClick={() => { setFormAuxiliar(a.rut); setBusqAux(a.rut); }} className="block w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-gray-50 last:border-0">
                      <span className="font-mono text-indigo-600">{formatRut(a.rut)}</span> <span className="text-gray-600">— {a.razon_social}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tipo Doc</label>
              <input value={formTipoDoc} onChange={(e) => setFormTipoDoc(e.target.value)} placeholder="FAC, BV, NC..." className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">N° Doc</label>
              <input value={formNumDoc} onChange={(e) => setFormNumDoc(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tipo Doc Ref</label>
              <input value={formTipoDocRef} onChange={(e) => setFormTipoDocRef(e.target.value)} placeholder="FAC, NCC..." className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">N° Doc Ref</label>
              <input value={formNumDocRef} onChange={(e) => setFormNumDocRef(e.target.value)} placeholder="12345" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
            </div>
          </div>

          {formCuenta && formAuxiliar && (
            <div>
              <button onClick={buscarDocs} disabled={isPending} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium mb-2 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                Buscar docs pendientes
              </button>
              {docsPend.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="divide-y divide-gray-100">
                    {docsPend.map((d) => (
                      <button key={`${d.tipo_doc}-${d.num_doc}`} onClick={() => { setFormTipoDocRef(d.tipo_doc); setFormNumDocRef(d.num_doc); }}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-indigo-50 transition-colors text-sm">
                        <span><span className="font-medium">{d.tipo_doc}</span> <span className="font-mono text-gray-500">{d.num_doc}</span></span>
                        <span className="font-mono font-medium text-gray-900">{formatMonto(d.saldo)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Glosa</label>
              <input value={formGlosa} onChange={(e) => setFormGlosa(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Categoría flujo</label>
              <select value={formCategoria} onChange={(e) => setFormCategoria(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400">
                <option value="">Seleccionar...</option>
                {(["OPERACIONAL", "INVERSION", "FINANCIAMIENTO"] as const).map((flujo) => {
                  const items = categoriasFlujo.filter((c) => c.flujo === flujo);
                  if (items.length === 0) return null;
                  const labels = { OPERACIONAL: "Operacional", INVERSION: "Inversión", FINANCIAMIENTO: "Financiamiento" };
                  return (
                    <optgroup key={flujo} label={labels[flujo]}>
                      {items.map((c) => <option key={c.id} value={c.codigo}>{c.codigo} — {c.nombre}</option>)}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button onClick={ejecutarContab} disabled={isPending || !formCuenta}
              className="w-full sm:w-auto bg-indigo-600 text-white px-8 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-colors">
              {isPending ? "Procesando..." : "Contabilizar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
