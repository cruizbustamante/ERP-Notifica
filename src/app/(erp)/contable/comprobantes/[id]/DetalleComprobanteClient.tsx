"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TIPOS_COMPROBANTE, formatNumero } from "@/lib/contabilidad/core";
import { formatRut } from "@/lib/rut";
import { actualizarComprobante } from "../actions";
import ComprobanteForm, { ComprobanteFormData } from "../ComprobanteForm";
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
  tipo_doc_ref: string;
  num_doc_ref: string;
  categoria_flujo: string;
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

type Cuenta = { codigo: string; nombre: string; tipo: string; nivel: number; usa_auxiliar: string; usa_documento: string; conciliable: string };
type TipoDoc = { codigo: string; nombre: string; abreviatura: string };
type Auxiliar = { rut: string; razon_social: string };
type CategoriaFlujo = { id: number; codigo: string; nombre: string; tipo: string; flujo: string; orden: number };

export default function DetalleComprobanteClient({ comprobante, cuentas, tiposDoc, auxiliares, categoriasFlujo }: {
  comprobante: Comprobante; cuentas: Cuenta[]; tiposDoc: TipoDoc[]; auxiliares: Auxiliar[]; categoriasFlujo: CategoriaFlujo[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const ti = TIPOS_COMPROBANTE[comprobante.tipo] || TIPOS_COMPROBANTE.T;
  const totalDebe = comprobante.lineas.reduce((s, l) => s + Number(l.debe), 0);
  const totalHaber = comprobante.lineas.reduce((s, l) => s + Number(l.haber), 0);

  async function handleSubmit(data: ComprobanteFormData): Promise<{ error: string | null }> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await actualizarComprobante(comprobante.id, {
          fecha: data.fecha,
          glosa: data.glosa,
          lineas: data.lineas,
        });
        if (result.error) {
          resolve({ error: result.error });
        } else {
          setMensaje({ tipo: "ok", texto: "Comprobante actualizado correctamente" });
          setEditando(false);
          router.refresh();
          resolve({ error: null });
        }
      });
    });
  }

  return (
    <div className="space-y-4 max-w-full overflow-hidden">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/contable/comprobantes" className="text-gray-400 hover:text-gray-600 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 font-mono">{comprobante.tipo}-{comprobante.numero}</h1>
                <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${ti.color}`}>{ti.label}</span>
                <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${comprobante.estado === "VIGENTE" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {comprobante.estado}
                </span>
              </div>
              <p className="text-gray-500 text-sm mt-1">{comprobante.glosa}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {comprobante.estado === "VIGENTE" && !editando && (
              <button onClick={() => setEditando(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition shadow-sm hover:shadow-md">
                Modificar
              </button>
            )}
            {editando && (
              <button onClick={() => setEditando(false)}
                className="text-gray-500 hover:text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition">
                Cancelar edición
              </button>
            )}
          </div>
        </div>

        {/* Info resumen */}
        {!editando && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-[10px] text-gray-400 uppercase font-medium">Fecha</div>
              <div className="font-medium text-gray-900 text-sm mt-0.5">
                {new Date(comprobante.fecha + "T12:00:00").toLocaleDateString("es-CL")}
              </div>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <div className="text-[10px] text-gray-400 uppercase font-medium">Total Debe</div>
              <div className="font-mono font-bold text-green-700 text-sm mt-0.5">${formatNumero(totalDebe)}</div>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <div className="text-[10px] text-gray-400 uppercase font-medium">Total Haber</div>
              <div className="font-mono font-bold text-red-700 text-sm mt-0.5">${formatNumero(totalHaber)}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-[10px] text-gray-400 uppercase font-medium">Líneas</div>
              <div className="font-bold text-gray-900 text-sm mt-0.5">{comprobante.lineas.length}</div>
            </div>
          </div>
        )}
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div className={`px-4 py-3 rounded-xl text-sm flex items-center justify-between ${mensaje.tipo === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          <span>{mensaje.texto}</span>
          <button onClick={() => setMensaje(null)} className="font-bold text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Modo edición: formulario completo */}
      {editando && (
        <ComprobanteForm
          cuentas={cuentas}
          tiposDoc={tiposDoc}
          auxiliares={auxiliares}
          categoriasFlujo={categoriasFlujo}
          modo="editar"
          initialData={{
            tipo: comprobante.tipo,
            fecha: comprobante.fecha,
            glosa: comprobante.glosa,
            numero: comprobante.numero,
            lineas: comprobante.lineas.map((l) => ({
              cuenta_codigo: l.cuenta_codigo,
              debe: Number(l.debe),
              haber: Number(l.haber),
              glosa: l.glosa || "",
              auxiliar_rut: l.auxiliar_rut || "",
              tipo_doc: l.tipo_doc || "",
              num_doc: l.num_doc || "",
              fecha_doc: l.fecha_doc,
              tipo_doc_ref: l.tipo_doc_ref || "",
              num_doc_ref: l.num_doc_ref || "",
              categoria_flujo: l.categoria_flujo || "",
            })),
          }}
          onSubmit={handleSubmit}
          submitting={isPending}
        />
      )}

      {/* Modo vista: tabla de movimientos */}
      {!editando && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3 bg-gray-50/80 border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Movimientos contables</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-500 border-b bg-gray-50/50 uppercase tracking-wider">
                  <th className="px-4 py-2.5 font-medium w-8">#</th>
                  <th className="px-4 py-2.5 font-medium">Cuenta</th>
                  <th className="px-4 py-2.5 font-medium">Glosa</th>
                  <th className="px-4 py-2.5 font-medium">Auxiliar</th>
                  <th className="px-4 py-2.5 font-medium">Documento</th>
                  <th className="px-4 py-2.5 font-medium text-right">Debe</th>
                  <th className="px-4 py-2.5 font-medium text-right">Haber</th>
                </tr>
              </thead>
              <tbody>
                {comprobante.lineas.map((l, i) => {
                  const cuenta = cuentas.find((c) => c.codigo === l.cuenta_codigo);
                  return (
                    <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-medium text-indigo-700">{l.cuenta_codigo}</span>
                        {cuenta && <span className="ml-2 text-xs text-gray-500">{cuenta.nombre}</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate">{l.glosa}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{l.auxiliar_rut ? formatRut(l.auxiliar_rut) : "—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {l.tipo_doc ? `${l.tipo_doc} ${l.num_doc}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-medium text-green-700">
                        {Number(l.debe) > 0 ? `$${formatNumero(Number(l.debe))}` : ""}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-medium text-red-700">
                        {Number(l.haber) > 0 ? `$${formatNumero(Number(l.haber))}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50/80 font-bold">
                  <td colSpan={5} className="px-4 py-3 text-right text-xs uppercase text-gray-500">Totales</td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-green-700">${formatNumero(totalDebe)}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-red-700">${formatNumero(totalHaber)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
