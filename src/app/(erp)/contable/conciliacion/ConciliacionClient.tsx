"use client";

import { useState, useTransition } from "react";
import { formatMonto, MESES } from "@/lib/contabilidad/core";
import {
  getResumenCartola,
  getMovimientosCartola,
  contabilizarMovimiento,
  anularContabilizacion,
  getDocsPendientesAuxiliar,
  type MovCartola,
  type ContabilizarInput,
} from "./actions";

type Periodo = { anio: number; estado: string };
type Cuenta = { codigo: string; nombre: string; tipo: string; usa_auxiliar: string; usa_documento: string };
type Auxiliar = { rut: string; razon_social: string };
type MesData = { abonos: number; cargos: number; cantPend: number; cantContab: number };
type DocPend = { tipo_doc: string; num_doc: string; saldo: number };

export default function ConciliacionClient({
  periodos, cuentas, auxiliares, currentYear,
}: {
  periodos: Periodo[];
  cuentas: Cuenta[];
  auxiliares: Auxiliar[];
  currentYear: number;
}) {
  const [anio, setAnio] = useState(currentYear);
  const [resumen, setResumen] = useState<Record<number, MesData> | null>(null);
  const [movimientos, setMovimientos] = useState<MovCartola[]>([]);
  const [mesActivo, setMesActivo] = useState<number | null>(null);
  const [vista, setVista] = useState<"resumen" | "movimientos" | "contabilizar">("resumen");
  const [movActivo, setMovActivo] = useState<MovCartola | null>(null);
  const [soloNoCont, setSoloNoCont] = useState(true);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [isPending, startTransition] = useTransition();

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

  const cargarResumen = () => {
    startTransition(async () => {
      const data = await getResumenCartola(anio);
      setResumen(data);
      setVista("resumen");
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
    const esAbono = mov.tipo === "ABONO" || mov.cargo_abono === "ABONO";
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

  const cuentasFiltradas = formTipo === "COBRANZA"
    ? cuentas.filter((c) => c.tipo === "A" && c.usa_auxiliar === "X")
    : formTipo === "PAGO"
      ? cuentas.filter((c) => c.tipo === "P" && c.usa_auxiliar === "X")
      : formTipo === "GASTO"
        ? cuentas.filter((c) => c.tipo === "G")
        : cuentas.filter((c) => c.tipo === "I");

  const auxFiltrados = busqAux
    ? auxiliares.filter((a) => a.rut.includes(busqAux) || a.razon_social.toLowerCase().includes(busqAux.toLowerCase())).slice(0, 10)
    : auxiliares.slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Conciliación Bancaria</h1>
            <p className="text-gray-500 mt-1">Cartola Santander → Comprobantes contables</p>
          </div>
          <div className="flex items-center gap-3">
            <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {periodos.map((p) => <option key={p.anio} value={p.anio}>{p.anio}</option>)}
            </select>
            <button onClick={cargarResumen} disabled={isPending} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {isPending ? "Cargando..." : "Consultar"}
            </button>
          </div>
        </div>
      </div>

      {mensaje && (
        <div className={`p-4 rounded-lg text-sm ${mensaje.tipo === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {mensaje.texto}
          <button onClick={() => setMensaje(null)} className="float-right font-bold">×</button>
        </div>
      )}

      {/* Resumen por mes */}
      {resumen && vista === "resumen" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Movimientos por mes</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 font-medium">Mes</th>
                <th className="pb-2 font-medium text-right">Pendientes</th>
                <th className="pb-2 font-medium text-right">Abonos Pend.</th>
                <th className="pb-2 font-medium text-right">Cargos Pend.</th>
                <th className="pb-2 font-medium text-right text-green-600">Contabilizados</th>
                <th className="pb-2 font-medium text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const d = resumen[m];
                if (!d || (d.cantPend === 0 && d.cantContab === 0)) return null;
                return (
                  <tr key={m} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 font-medium">{MESES[m]}</td>
                    <td className="py-2 text-right">{d.cantPend}</td>
                    <td className="py-2 text-right font-mono text-green-600">{formatMonto(d.abonos)}</td>
                    <td className="py-2 text-right font-mono text-red-600">{formatMonto(d.cargos)}</td>
                    <td className="py-2 text-right text-green-600">{d.cantContab}</td>
                    <td className="py-2 text-center">
                      <button onClick={() => cargarMovimientos(m)} disabled={isPending} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                        Ver movimientos
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Lista movimientos */}
      {vista === "movimientos" && mesActivo && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => { setVista("resumen"); setMovimientos([]); }} className="text-gray-500 hover:text-gray-700 text-sm">← Volver</button>
              <h3 className="font-semibold text-gray-900">{MESES[mesActivo]} {anio}</h3>
              <span className="text-sm text-gray-500">{movimientos.length} movimientos</span>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={soloNoCont} onChange={(e) => { setSoloNoCont(e.target.checked); cargarMovimientos(mesActivo); }} />
              Solo pendientes
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">Fecha</th>
                  <th className="pb-2 font-medium">Descripción</th>
                  <th className="pb-2 font-medium text-right">Monto</th>
                  <th className="pb-2 font-medium">Tipo</th>
                  <th className="pb-2 font-medium">RUT</th>
                  <th className="pb-2 font-medium">Estado</th>
                  <th className="pb-2 font-medium text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-1.5 whitespace-nowrap">{m.fecha}</td>
                    <td className="py-1.5 truncate max-w-[300px]" title={m.descripcion}>{m.descripcion}</td>
                    <td className={`py-1.5 text-right font-mono font-medium ${m.tipo === "ABONO" || m.cargo_abono === "ABONO" ? "text-green-600" : "text-red-600"}`}>
                      {formatMonto(Math.abs(m.monto))}
                    </td>
                    <td className="py-1.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${m.tipo === "ABONO" || m.cargo_abono === "ABONO" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {m.cargo_abono || m.tipo}
                      </span>
                    </td>
                    <td className="py-1.5 font-mono text-xs">{m.rut_extraido}</td>
                    <td className="py-1.5">
                      {m.contabilizado
                        ? <span className="text-xs text-green-600 font-medium">Contabilizado</span>
                        : <span className="text-xs text-gray-400">Pendiente</span>}
                    </td>
                    <td className="py-1.5 text-center space-x-2">
                      {!m.contabilizado && (
                        <button onClick={() => abrirContabilizar(m)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                          Contabilizar
                        </button>
                      )}
                      {m.contabilizado && (
                        <button onClick={() => ejecutarAnulacion(m.id)} disabled={isPending} className="text-red-600 hover:text-red-800 text-xs font-medium">
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form contabilizar */}
      {vista === "contabilizar" && movActivo && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setVista("movimientos")} className="text-gray-500 hover:text-gray-700 text-sm">← Volver</button>
            <h3 className="font-semibold text-gray-900">Contabilizar movimiento</h3>
          </div>

          {/* Info movimiento */}
          <div className="bg-gray-50 p-4 rounded-lg grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Fecha:</span> <span className="font-medium">{movActivo.fecha}</span></div>
            <div><span className="text-gray-500">Monto:</span> <span className={`font-mono font-bold ${movActivo.tipo === "ABONO" || movActivo.cargo_abono === "ABONO" ? "text-green-600" : "text-red-600"}`}>{formatMonto(Math.abs(movActivo.monto))}</span></div>
            <div className="col-span-2"><span className="text-gray-500">Descripción:</span> <span className="font-medium">{movActivo.descripcion}</span></div>
          </div>

          {/* Tipo contabilización */}
          <div className="grid grid-cols-4 gap-2">
            {(["COBRANZA", "PAGO", "GASTO", "INGRESO"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setFormTipo(t); setFormCuenta(""); setFormAuxiliar(""); setDocsPend([]); }}
                className={`py-2 px-3 rounded-lg text-sm font-medium border ${formTipo === t ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Cuenta contrapartida */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta contrapartida</label>
              <select value={formCuenta} onChange={(e) => setFormCuenta(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Seleccionar...</option>
                {(cuentasFiltradas.length > 0 ? cuentasFiltradas : cuentas).map((c) => (
                  <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nombre}</option>
                ))}
              </select>
            </div>

            {/* Auxiliar */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Auxiliar (RUT)</label>
              <input
                type="text"
                value={busqAux}
                onChange={(e) => { setBusqAux(e.target.value); setFormAuxiliar(e.target.value); }}
                placeholder="Buscar por RUT o nombre..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              {busqAux && auxFiltrados.length > 0 && (
                <div className="border border-gray-200 rounded-lg mt-1 max-h-32 overflow-y-auto text-sm">
                  {auxFiltrados.map((a) => (
                    <button
                      key={a.rut}
                      onClick={() => { setFormAuxiliar(a.rut); setBusqAux(a.rut); }}
                      className="block w-full text-left px-3 py-1.5 hover:bg-blue-50"
                    >
                      <span className="font-mono">{a.rut}</span> — {a.razon_social}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Documento */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Doc</label>
              <input value={formTipoDoc} onChange={(e) => setFormTipoDoc(e.target.value)} placeholder="FAC, BV, NC..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">N° Doc</label>
              <input value={formNumDoc} onChange={(e) => setFormNumDoc(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referencia (TIPO|NUM)</label>
              <input value={formReferencia} onChange={(e) => setFormReferencia(e.target.value)} placeholder="FAC|12345" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Docs pendientes */}
          {formCuenta && formAuxiliar && (
            <div>
              <button onClick={buscarDocs} disabled={isPending} className="text-blue-600 hover:text-blue-800 text-sm font-medium mb-2">
                Buscar documentos pendientes
              </button>
              {docsPend.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="px-3 py-1.5 text-left font-medium">Tipo</th>
                        <th className="px-3 py-1.5 text-left font-medium">N° Doc</th>
                        <th className="px-3 py-1.5 text-right font-medium">Saldo</th>
                        <th className="px-3 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {docsPend.map((d) => (
                        <tr key={`${d.tipo_doc}-${d.num_doc}`} className="border-t hover:bg-blue-50 cursor-pointer" onClick={() => { setFormTipoDoc(d.tipo_doc); setFormNumDoc(d.num_doc); setFormReferencia(`${d.tipo_doc}|${d.num_doc}`); }}>
                          <td className="px-3 py-1.5">{d.tipo_doc}</td>
                          <td className="px-3 py-1.5 font-mono">{d.num_doc}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{formatMonto(d.saldo)}</td>
                          <td className="px-3 py-1.5 text-blue-600 text-xs">Seleccionar</td>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Glosa</label>
              <input value={formGlosa} onChange={(e) => setFormGlosa(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría flujo</label>
              <select value={formCategoria} onChange={(e) => setFormCategoria(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="1">Cobranza</option>
                <option value="2">Pagos proveedores</option>
                <option value="3">Gastos operacionales</option>
                <option value="4">Honorarios</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={ejecutarContab}
              disabled={isPending || !formCuenta}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? "Procesando..." : "Contabilizar"}
            </button>
          </div>
        </div>
      )}

      {!resumen && !isPending && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center text-gray-500">
          Seleccione un año y presione <span className="font-medium text-gray-700">Consultar</span> para ver la cartola.
        </div>
      )}
    </div>
  );
}
