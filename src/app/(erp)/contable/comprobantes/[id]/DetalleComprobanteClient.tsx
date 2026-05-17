"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMonto, TIPOS_COMPROBANTE } from "@/lib/contabilidad/core";
import { actualizarComprobante } from "../actions";
import Link from "next/link";

type Linea = {
  id?: number;
  linea: number;
  cuenta_codigo: string;
  debe: number;
  haber: number;
  glosa: string;
  auxiliar_rut: string;
  tipo_doc: string;
  num_doc: string;
  fecha_doc: string | null;
  referencia: string;
};

type Comprobante = {
  id: number;
  numero: number;
  tipo: string;
  fecha: string;
  glosa: string;
  anio: number;
  mes: number;
  estado: string;
  lineas: Linea[];
};

type Cuenta = {
  codigo: string;
  nombre: string;
  tipo: string;
  nivel: number;
  usa_auxiliar: string;
  usa_documento: string;
};

export default function DetalleComprobanteClient({
  comprobante,
  cuentas,
}: {
  comprobante: Comprobante;
  cuentas: Cuenta[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const [fecha, setFecha] = useState(comprobante.fecha);
  const [glosa, setGlosa] = useState(comprobante.glosa);
  const [lineas, setLineas] = useState<Linea[]>(comprobante.lineas);

  const ti = TIPOS_COMPROBANTE[comprobante.tipo] || TIPOS_COMPROBANTE.T;
  const totalDebe = lineas.reduce((s, l) => s + Number(l.debe), 0);
  const totalHaber = lineas.reduce((s, l) => s + Number(l.haber), 0);
  const cuadrado = Math.abs(totalDebe - totalHaber) <= 1;

  const updateLinea = (idx: number, field: string, value: string | number) => {
    setLineas((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const addLinea = () => {
    setLineas((prev) => [...prev, { linea: prev.length + 1, cuenta_codigo: "", debe: 0, haber: 0, glosa: "", auxiliar_rut: "", tipo_doc: "", num_doc: "", fecha_doc: null, referencia: "" }]);
  };

  const removeLinea = (idx: number) => {
    if (lineas.length <= 2) return;
    setLineas((prev) => prev.filter((_, i) => i !== idx));
  };

  const guardar = () => {
    if (!cuadrado) { setMensaje({ tipo: "error", texto: "El comprobante está descuadrado" }); return; }
    startTransition(async () => {
      const result = await actualizarComprobante(comprobante.id, {
        fecha,
        glosa,
        lineas: lineas.map((l) => ({
          cuenta_codigo: l.cuenta_codigo,
          debe: Number(l.debe) || 0,
          haber: Number(l.haber) || 0,
          glosa: l.glosa,
          auxiliar_rut: l.auxiliar_rut || "",
          tipo_doc: l.tipo_doc || "",
          num_doc: l.num_doc || "",
          fecha_doc: l.fecha_doc || null,
          referencia: l.referencia || "",
        })),
      });
      if (result.error) {
        setMensaje({ tipo: "error", texto: result.error });
      } else {
        setMensaje({ tipo: "ok", texto: "Comprobante actualizado" });
        setEditando(false);
        router.refresh();
      }
    });
  };

  const cancelar = () => {
    setLineas(comprobante.lineas);
    setFecha(comprobante.fecha);
    setGlosa(comprobante.glosa);
    setEditando(false);
    setMensaje(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/contable/comprobantes" className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900 font-mono">{comprobante.tipo}-{comprobante.numero}</h1>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${ti.color}`}>{ti.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${comprobante.estado === "VIGENTE" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{comprobante.estado}</span>
              </div>
              {!editando ? (
                <p className="text-gray-500 mt-1">{comprobante.glosa}</p>
              ) : (
                <input value={glosa} onChange={(e) => setGlosa(e.target.value)} className="mt-1 border border-gray-300 rounded px-2 py-1 text-sm w-full max-w-md" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {comprobante.estado === "VIGENTE" && !editando && (
              <button onClick={() => setEditando(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                Modificar
              </button>
            )}
            {editando && (
              <>
                <button onClick={cancelar} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50">Cancelar</button>
                <button onClick={guardar} disabled={isPending || !cuadrado} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {isPending ? "Guardando..." : "Guardar"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t">
          <div>
            <span className="text-xs text-gray-500">Fecha</span>
            {!editando ? (
              <div className="font-medium">{new Date(comprobante.fecha + "T12:00:00").toLocaleDateString("es-CL")}</div>
            ) : (
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm w-full" />
            )}
          </div>
          <div>
            <span className="text-xs text-gray-500">Total Debe</span>
            <div className="font-mono font-medium text-green-700">{formatMonto(totalDebe)}</div>
          </div>
          <div>
            <span className="text-xs text-gray-500">Total Haber</span>
            <div className="font-mono font-medium text-red-700">{formatMonto(totalHaber)}</div>
          </div>
          <div>
            <span className="text-xs text-gray-500">Cuadratura</span>
            <div className={`font-medium ${cuadrado ? "text-green-600" : "text-red-600"}`}>
              {cuadrado ? "Cuadrado" : `Diferencia: ${formatMonto(Math.abs(totalDebe - totalHaber))}`}
            </div>
          </div>
        </div>
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div className={`p-3 rounded-lg text-sm ${mensaje.tipo === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {mensaje.texto}
          <button onClick={() => setMensaje(null)} className="float-right font-bold">×</button>
        </div>
      )}

      {/* Líneas */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Movimientos ({lineas.length} líneas)</h3>
          {editando && (
            <button onClick={addLinea} className="text-sm text-blue-600 hover:text-blue-800 font-medium">+ Agregar línea</button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="px-3 py-2 font-medium w-8">#</th>
                <th className="px-3 py-2 font-medium">Cuenta</th>
                <th className="px-3 py-2 font-medium">Glosa</th>
                <th className="px-3 py-2 font-medium">Auxiliar</th>
                <th className="px-3 py-2 font-medium">Doc</th>
                <th className="px-3 py-2 font-medium text-right">Debe</th>
                <th className="px-3 py-2 font-medium text-right">Haber</th>
                {editando && <th className="px-3 py-2 font-medium w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => {
                const cuenta = cuentas.find((c) => c.codigo === l.cuenta_codigo);
                return (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-3 py-2">
                      {!editando ? (
                        <div>
                          <span className="font-mono text-xs font-medium">{l.cuenta_codigo}</span>
                          {cuenta && <span className="ml-1 text-xs text-gray-500">{cuenta.nombre}</span>}
                        </div>
                      ) : (
                        <select
                          value={l.cuenta_codigo}
                          onChange={(e) => updateLinea(i, "cuenta_codigo", e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-full min-w-[200px]"
                        >
                          <option value="">Seleccionar...</option>
                          {cuentas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nombre}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {!editando ? (
                        <span className="text-xs text-gray-600 truncate max-w-[180px] block">{l.glosa}</span>
                      ) : (
                        <input value={l.glosa} onChange={(e) => updateLinea(i, "glosa", e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-xs w-full min-w-[150px]" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {!editando ? (
                        <span className="font-mono text-xs">{l.auxiliar_rut}</span>
                      ) : (
                        <input value={l.auxiliar_rut || ""} onChange={(e) => updateLinea(i, "auxiliar_rut", e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-xs w-24" placeholder="RUT" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {!editando ? (
                        <span className="text-xs">{l.tipo_doc && `${l.tipo_doc} ${l.num_doc}`}</span>
                      ) : (
                        <div className="flex gap-1">
                          <input value={l.tipo_doc || ""} onChange={(e) => updateLinea(i, "tipo_doc", e.target.value)} className="border border-gray-300 rounded px-1 py-1 text-xs w-12" placeholder="Tipo" />
                          <input value={l.num_doc || ""} onChange={(e) => updateLinea(i, "num_doc", e.target.value)} className="border border-gray-300 rounded px-1 py-1 text-xs w-16" placeholder="N°" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!editando ? (
                        <span className="font-mono">{l.debe > 0 ? formatMonto(Number(l.debe)) : ""}</span>
                      ) : (
                        <input type="number" value={l.debe || ""} onChange={(e) => updateLinea(i, "debe", Number(e.target.value) || 0)} className="border border-gray-300 rounded px-2 py-1 text-xs w-24 text-right font-mono" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!editando ? (
                        <span className="font-mono">{l.haber > 0 ? formatMonto(Number(l.haber)) : ""}</span>
                      ) : (
                        <input type="number" value={l.haber || ""} onChange={(e) => updateLinea(i, "haber", Number(e.target.value) || 0)} className="border border-gray-300 rounded px-2 py-1 text-xs w-24 text-right font-mono" />
                      )}
                    </td>
                    {editando && (
                      <td className="px-3 py-2">
                        <button onClick={() => removeLinea(i)} className="text-red-400 hover:text-red-600" title="Eliminar línea">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold bg-gray-50">
                <td colSpan={5} className="px-3 py-2 text-right">TOTALES</td>
                <td className="px-3 py-2 text-right font-mono">{formatMonto(totalDebe)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatMonto(totalHaber)}</td>
                {editando && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
