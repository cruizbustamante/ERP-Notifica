"use client";

import { useState, useEffect, useTransition } from "react";
import { formatMonto } from "@/lib/contabilidad/core";
import { getPeriodos, crearPeriodo, cerrarPeriodo, generarApertura } from "./actions";

type PeriodoRow = { anio: number; estado: string };

export default function CierreClient() {
  const [periodos, setPeriodos] = useState<PeriodoRow[]>([]);
  const [nuevoAnio, setNuevoAnio] = useState(new Date().getFullYear() + 1);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const cargar = () => {
    startTransition(async () => {
      const data = await getPeriodos();
      setPeriodos(data);
    });
  };

  useEffect(() => { cargar(); }, []);

  const handleCrear = () => {
    startTransition(async () => {
      const res = await crearPeriodo(nuevoAnio);
      if (res.error) setMensaje({ tipo: "error", texto: res.error });
      else { setMensaje({ tipo: "ok", texto: `Período ${nuevoAnio} creado` }); cargar(); }
    });
  };

  const handleCerrar = (anio: number) => {
    if (!confirm(`¿Cerrar período ${anio}? Se creará el comprobante de cierre y no se podrán agregar más movimientos.`)) return;
    startTransition(async () => {
      const res = await cerrarPeriodo(anio);
      if (res.error) setMensaje({ tipo: "error", texto: res.error });
      else {
        const msg = res.resultado !== undefined
          ? `Período ${anio} cerrado. Resultado: ${formatMonto(res.resultado)} (${res.resultado >= 0 ? "Utilidad" : "Pérdida"})`
          : `Período ${anio} cerrado`;
        setMensaje({ tipo: "ok", texto: msg });
        cargar();
      }
    });
  };

  const handleApertura = (anio: number) => {
    if (!confirm(`¿Generar apertura para ${anio + 1} con los saldos patrimoniales de ${anio}?`)) return;
    startTransition(async () => {
      const res = await generarApertura(anio);
      if (res.error) setMensaje({ tipo: "error", texto: res.error });
      else { setMensaje({ tipo: "ok", texto: `Apertura ${anio + 1} generada — Comprobante A-${res.comprobante?.numero}` }); cargar(); }
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900">Cierre de Ejercicio</h1>
        <p className="text-gray-500 mt-1">Cierre y apertura de períodos fiscales</p>
      </div>

      {mensaje && (
        <div className={`p-4 rounded-lg text-sm ${mensaje.tipo === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {mensaje.texto}
          <button onClick={() => setMensaje(null)} className="float-right font-bold">×</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Períodos fiscales</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2 font-medium">Año</th>
              <th className="pb-2 font-medium">Estado</th>
              <th className="pb-2 font-medium text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {periodos.map((p) => (
              <tr key={p.anio} className="border-b last:border-0 hover:bg-gray-50">
                <td className="py-3 font-medium text-lg">{p.anio}</td>
                <td className="py-3">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${p.estado === "ABIERTO" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                    {p.estado}
                  </span>
                </td>
                <td className="py-3 text-center space-x-3">
                  {p.estado === "ABIERTO" && (
                    <button
                      onClick={() => handleCerrar(p.anio)}
                      disabled={isPending}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Cerrar período
                    </button>
                  )}
                  {p.estado === "CERRADO" && (
                    <button
                      onClick={() => handleApertura(p.anio)}
                      disabled={isPending}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Generar apertura {p.anio + 1}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 pt-4 border-t flex items-center gap-3">
          <input
            type="number"
            value={nuevoAnio}
            onChange={(e) => setNuevoAnio(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28"
          />
          <button
            onClick={handleCrear}
            disabled={isPending}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Crear período
          </button>
        </div>
      </div>
    </div>
  );
}
