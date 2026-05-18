"use client";

import { useState, useEffect, useTransition } from "react";
import { formatMonto } from "@/lib/contabilidad/core";
import {
  getPeriodos,
  crearPeriodo,
  cerrarPeriodo,
  generarApertura,
  previsualizarCierre,
  previsualizarApertura,
  type PreviewCierre,
  type PreviewApertura,
  type PreviewAperturaLinea,
} from "./actions";

type PeriodoRow = { anio: number; estado: string };

export default function CierreClient() {
  const [periodos, setPeriodos] = useState<PeriodoRow[]>([]);
  const [nuevoAnio, setNuevoAnio] = useState(new Date().getFullYear() + 1);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Preview states
  const [previewCierre, setPreviewCierre] = useState<PreviewCierre | null>(null);
  const [previewApertura, setPreviewApertura] = useState<PreviewApertura | null>(null);
  const [confirmandoCierre, setConfirmandoCierre] = useState<number | null>(null);

  const cargar = () => {
    startTransition(async () => {
      const data = await getPeriodos();
      setPeriodos(data);
    });
  };

  useEffect(() => {
    cargar();
  }, []);

  const handleCrear = () => {
    startTransition(async () => {
      const res = await crearPeriodo(nuevoAnio);
      if (res.error) setMensaje({ tipo: "error", texto: res.error });
      else {
        setMensaje({ tipo: "ok", texto: `Periodo ${nuevoAnio} creado exitosamente` });
        cargar();
      }
    });
  };

  const handlePreviewCierre = (anio: number) => {
    setPreviewApertura(null);
    startTransition(async () => {
      const res = await previsualizarCierre(anio);
      if (res.error) {
        setMensaje({ tipo: "error", texto: res.error });
        setPreviewCierre(null);
      } else {
        setPreviewCierre(res.data);
        setMensaje(null);
      }
    });
  };

  const handleConfirmarCierre = (anio: number) => {
    setConfirmandoCierre(anio);
  };

  const handleEjecutarCierre = (anio: number) => {
    startTransition(async () => {
      const res = await cerrarPeriodo(anio);
      if (res.error) {
        setMensaje({ tipo: "error", texto: res.error });
      } else {
        const msg =
          res.resultado !== undefined
            ? `Periodo ${anio} cerrado exitosamente. Resultado del ejercicio: ${formatMonto(res.resultado)} (${res.resultado >= 0 ? "Utilidad" : "Perdida"})`
            : `Periodo ${anio} cerrado`;
        setMensaje({ tipo: "ok", texto: msg });
        setPreviewCierre(null);
        setConfirmandoCierre(null);
        cargar();
      }
    });
  };

  const handlePreviewApertura = (anio: number) => {
    setPreviewCierre(null);
    setConfirmandoCierre(null);
    startTransition(async () => {
      const res = await previsualizarApertura(anio);
      if (res.error) {
        setMensaje({ tipo: "error", texto: res.error });
        setPreviewApertura(null);
      } else {
        setPreviewApertura(res.data);
        setMensaje(null);
      }
    });
  };

  const handleEjecutarApertura = (anio: number) => {
    startTransition(async () => {
      const res = await generarApertura(anio);
      if (res.error) {
        setMensaje({ tipo: "error", texto: res.error });
      } else {
        setMensaje({
          tipo: "ok",
          texto: `Apertura ${anio + 1} generada exitosamente — Comprobante A-${res.comprobante?.numero}`,
        });
        setPreviewApertura(null);
        cargar();
      }
    });
  };

  const cancelarPreview = () => {
    setPreviewCierre(null);
    setPreviewApertura(null);
    setConfirmandoCierre(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900">Cierre de Ejercicio</h1>
        <p className="text-gray-500 mt-1">Cierre anual y apertura de periodos fiscales</p>
      </div>

      {/* Messages */}
      {mensaje && (
        <div
          className={`p-4 rounded-xl text-sm ${
            mensaje.tipo === "ok"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          <div className="flex justify-between items-start">
            <span>{mensaje.texto}</span>
            <button onClick={() => setMensaje(null)} className="ml-4 font-bold text-lg leading-none hover:opacity-70">
              ×
            </button>
          </div>
        </div>
      )}

      {/* Periodos Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="font-semibold text-gray-900 mb-4 text-lg">Periodos Fiscales</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-3 font-medium">Ano</th>
                <th className="pb-3 font-medium">Estado</th>
                <th className="pb-3 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => (
                <tr key={p.anio} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-4 font-semibold text-lg text-gray-900">{p.anio}</td>
                  <td className="py-4">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                        p.estado === "ABIERTO" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {p.estado}
                    </span>
                  </td>
                  <td className="py-4 text-center">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      {p.estado === "ABIERTO" && (
                        <button
                          onClick={() => handlePreviewCierre(p.anio)}
                          disabled={isPending}
                          className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                        >
                          Previsualizar Cierre
                        </button>
                      )}
                      {p.estado === "CERRADO" && (
                        <button
                          onClick={() => handlePreviewApertura(p.anio)}
                          disabled={isPending}
                          className="bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-100 disabled:opacity-50 transition-colors"
                        >
                          Previsualizar Apertura {p.anio + 1}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {periodos.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-gray-400">
                    No hay periodos creados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Crear nuevo periodo */}
        <div className="mt-6 pt-4 border-t flex items-center gap-3">
          <input
            type="number"
            value={nuevoAnio}
            onChange={(e) => setNuevoAnio(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
          />
          <button
            onClick={handleCrear}
            disabled={isPending}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            Crear periodo
          </button>
        </div>
      </div>

      {/* Preview Cierre */}
      {previewCierre && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 text-lg">
              Previsualizacion del Cierre — {previewCierre.anio}
            </h3>
            <button onClick={cancelarPreview} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
              ×
            </button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Total Ingresos</p>
              <p className="text-2xl font-bold text-green-800 mt-1">{formatMonto(previewCierre.totalIngresos)}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Total Gastos</p>
              <p className="text-2xl font-bold text-red-800 mt-1">{formatMonto(previewCierre.totalGastos)}</p>
            </div>
            <div
              className={`border rounded-xl p-4 ${
                previewCierre.resultado >= 0
                  ? "bg-blue-50 border-blue-200"
                  : "bg-orange-50 border-orange-200"
              }`}
            >
              <p
                className={`text-xs font-medium uppercase tracking-wide ${
                  previewCierre.resultado >= 0 ? "text-blue-600" : "text-orange-600"
                }`}
              >
                Resultado ({previewCierre.resultado >= 0 ? "Utilidad" : "Perdida"})
              </p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  previewCierre.resultado >= 0 ? "text-blue-800" : "text-orange-800"
                }`}
              >
                {formatMonto(Math.abs(previewCierre.resultado))}
              </p>
            </div>
          </div>

          {/* Detalle ingresos */}
          {previewCierre.cuentasIngreso.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Cuentas de Ingreso (se saldan al DEBE)
              </h4>
              <div className="bg-gray-50 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b bg-gray-100">
                      <th className="px-3 py-2 text-left font-medium">Codigo</th>
                      <th className="px-3 py-2 text-left font-medium">Nombre</th>
                      <th className="px-3 py-2 text-right font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewCierre.cuentasIngreso.map((c) => (
                      <tr key={c.codigo} className="border-b last:border-0">
                        <td className="px-3 py-2 font-mono text-gray-600">{c.codigo}</td>
                        <td className="px-3 py-2 text-gray-800">{c.nombre}</td>
                        <td className="px-3 py-2 text-right font-medium text-green-700">
                          {formatMonto(c.saldo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Detalle gastos */}
          {previewCierre.cuentasGasto.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Cuentas de Gasto (se saldan al HABER)
              </h4>
              <div className="bg-gray-50 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b bg-gray-100">
                      <th className="px-3 py-2 text-left font-medium">Codigo</th>
                      <th className="px-3 py-2 text-left font-medium">Nombre</th>
                      <th className="px-3 py-2 text-right font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewCierre.cuentasGasto.map((c) => (
                      <tr key={c.codigo} className="border-b last:border-0">
                        <td className="px-3 py-2 font-mono text-gray-600">{c.codigo}</td>
                        <td className="px-3 py-2 text-gray-800">{c.nombre}</td>
                        <td className="px-3 py-2 text-right font-medium text-red-700">
                          {formatMonto(c.saldo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Warning and action */}
          {!confirmandoCierre && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <div className="flex items-start gap-3">
                <span className="text-amber-600 text-lg">!</span>
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Atencion</p>
                  <p className="mt-1">
                    Al cerrar el ejercicio se creara un comprobante de cierre (tipo C) que saldara todas las
                    cuentas de resultado. El periodo quedara marcado como CERRADO y no se podran registrar
                    mas comprobantes en el.
                  </p>
                </div>
              </div>
            </div>
          )}

          {confirmandoCierre === previewCierre.anio ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-800 font-medium mb-3">
                Confirmar cierre del ejercicio {previewCierre.anio}. Esta accion es irreversible.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleEjecutarCierre(previewCierre.anio)}
                  disabled={isPending}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? "Procesando..." : "Confirmar Cierre"}
                </button>
                <button
                  onClick={() => setConfirmandoCierre(null)}
                  className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => handleConfirmarCierre(previewCierre.anio)}
                disabled={isPending || previewCierre.cuentasIngreso.length === 0 && previewCierre.cuentasGasto.length === 0}
                className="bg-red-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Ejecutar Cierre
              </button>
              <button
                onClick={cancelarPreview}
                className="bg-white text-gray-700 border border-gray-300 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Preview Apertura */}
      {previewApertura && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 text-lg">
              Previsualizacion de Apertura — {previewApertura.anioDestino}
            </h3>
            <button onClick={cancelarPreview} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
              ×
            </button>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            Se trasladaran los saldos patrimoniales del ejercicio {previewApertura.anioOrigen} al nuevo periodo{" "}
            {previewApertura.anioDestino}.
          </p>

          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <p className="text-xs text-indigo-600 font-medium uppercase tracking-wide">Total Debe</p>
              <p className="text-2xl font-bold text-indigo-800 mt-1">{formatMonto(previewApertura.totalDebe)}</p>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <p className="text-xs text-indigo-600 font-medium uppercase tracking-wide">Total Haber</p>
              <p className="text-2xl font-bold text-indigo-800 mt-1">{formatMonto(previewApertura.totalHaber)}</p>
            </div>
          </div>

          {/* Balance sheet accounts */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Cuentas patrimoniales a trasladar</h4>
            <div className="bg-gray-50 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0">
                  <tr className="text-gray-500 border-b bg-gray-100">
                    <th className="px-3 py-2 text-left font-medium">Codigo</th>
                    <th className="px-3 py-2 text-left font-medium">Nombre</th>
                    <th className="px-3 py-2 text-left font-medium">Auxiliar</th>
                    <th className="px-3 py-2 text-center font-medium">Tipo</th>
                    <th className="px-3 py-2 text-right font-medium">Debe</th>
                    <th className="px-3 py-2 text-right font-medium">Haber</th>
                  </tr>
                </thead>
                <tbody>
                  {previewApertura.cuentas.map((c, i) => {
                    const deudor = c.tipo === "A";
                    const debe = deudor ? (c.saldo >= 0 ? c.saldo : 0) : (c.saldo < 0 ? Math.abs(c.saldo) : 0);
                    const haber = deudor ? (c.saldo < 0 ? Math.abs(c.saldo) : 0) : (c.saldo >= 0 ? c.saldo : 0);
                    const tipoLabel = c.tipo === "A" ? "Activo" : c.tipo === "P" ? "Pasivo" : "Patrimonio";
                    return (
                      <tr key={`${c.codigo}-${c.auxiliar_rut}-${i}`} className="border-b last:border-0">
                        <td className="px-3 py-2 font-mono text-gray-600">{c.codigo}</td>
                        <td className="px-3 py-2 text-gray-800">{c.nombre}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">
                          {c.auxiliar_nombre && (
                            <span title={c.auxiliar_rut}>{c.auxiliar_nombre}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              c.tipo === "A"
                                ? "bg-blue-100 text-blue-700"
                                : c.tipo === "P"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-purple-100 text-purple-700"
                            }`}
                          >
                            {tipoLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-700">
                          {debe > 0 ? formatMonto(debe) : ""}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-700">
                          {haber > 0 ? formatMonto(haber) : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {previewApertura.cuentas.length} lineas con saldo a trasladar
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => handleEjecutarApertura(previewApertura.anioOrigen)}
              disabled={isPending}
              className="bg-purple-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Procesando..." : `Generar Apertura ${previewApertura.anioDestino}`}
            </button>
            <button
              onClick={cancelarPreview}
              className="bg-white text-gray-700 border border-gray-300 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
