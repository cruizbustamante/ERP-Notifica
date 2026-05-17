"use client";

import { useState, useTransition } from "react";
import { formatMonto } from "@/lib/contabilidad/core";
import { formatRut } from "@/lib/rut";
import { enviarCorreoCobranza, enviarCobranzaMasivo, previewCobranzaHtml } from "./actions";

type DocPendiente = { tipoDoc: string; numDoc: string; dias: number; saldo: number };

type ClienteCobranza = {
  rut: string;
  razon_social: string;
  email: string;
  telefono: string;
  totalDeuda: number;
  docs: DocPendiente[];
  cantDocs: number;
  diasMax: number;
  nivel: "NORMAL" | "ALERTA" | "CRÍTICO" | "JUDICIAL";
  correosEnviados: { nivel: string; mes: number; fecha: string }[];
};

type Props = {
  clientes: ClienteCobranza[];
  totalDeuda: number;
  totalNormal: number;
  totalAlerta: number;
  totalCritico: number;
  anio: number;
  mes: number;
};

const NIVELES = {
  NORMAL: { label: "Normal (0-30d)", bg: "bg-green-50 border-green-200", text: "text-green-700", badge: "bg-green-100 text-green-700", emailNivel: "RECORDATORIO" as const },
  ALERTA: { label: "Alerta (31-60d)", bg: "bg-yellow-50 border-yellow-200", text: "text-yellow-700", badge: "bg-yellow-100 text-yellow-700", emailNivel: "RECORDATORIO" as const },
  "CRÍTICO": { label: "Crítico (61-90d)", bg: "bg-orange-50 border-orange-200", text: "text-orange-700", badge: "bg-orange-100 text-orange-700", emailNivel: "URGENTE" as const },
  JUDICIAL: { label: "Judicial (>90d)", bg: "bg-red-50 border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-700", emailNivel: "CRITICO" as const },
};

export default function CobranzaClient({ clientes, totalDeuda, totalNormal, totalAlerta, totalCritico, anio, mes }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ exitosos: number; fallidos: number } | null>(null);
  const [preview, setPreview] = useState<{ asunto: string; html: string; nombre: string } | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);

  const porNivel = {
    JUDICIAL: clientes.filter((c) => c.nivel === "JUDICIAL"),
    "CRÍTICO": clientes.filter((c) => c.nivel === "CRÍTICO"),
    ALERTA: clientes.filter((c) => c.nivel === "ALERTA"),
    NORMAL: clientes.filter((c) => c.nivel === "NORMAL"),
  };

  function toggleSelect(rut: string) {
    const next = new Set(selected);
    if (next.has(rut)) next.delete(rut);
    else next.add(rut);
    setSelected(next);
  }

  function getEmailNivel(nivel: string): "RECORDATORIO" | "URGENTE" | "CRITICO" {
    if (nivel === "JUDICIAL") return "CRITICO";
    if (nivel === "CRÍTICO") return "URGENTE";
    return "RECORDATORIO";
  }

  async function handleEnviarIndividual(c: ClienteCobranza) {
    if (!c.email) return;
    setEnviando(c.rut);
    startTransition(async () => {
      await enviarCorreoCobranza({
        rut: c.rut, nombre: c.razon_social, email: c.email,
        docs: c.docs, totalDeuda: c.totalDeuda, maxDias: c.diasMax,
        nivel: getEmailNivel(c.nivel), mes, anio,
      });
      setEnviando(null);
    });
  }

  async function handleEnviarMasivo() {
    const paraEnviar = clientes
      .filter((c) => selected.has(c.rut) && c.email)
      .map((c) => ({
        rut: c.rut, nombre: c.razon_social, email: c.email,
        docs: c.docs, totalDeuda: c.totalDeuda, maxDias: c.diasMax,
        nivel: getEmailNivel(c.nivel), mes, anio,
      }));
    if (paraEnviar.length === 0) return;
    startTransition(async () => {
      const res = await enviarCobranzaMasivo(paraEnviar);
      setResultado(res);
      setSelected(new Set());
    });
  }

  async function handlePreview(c: ClienteCobranza) {
    const res = await previewCobranzaHtml({
      nombre: c.razon_social, docs: c.docs,
      totalDeuda: c.totalDeuda, maxDias: c.diasMax,
      nivel: getEmailNivel(c.nivel),
    });
    setPreview({ ...res, nombre: c.razon_social });
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900">Cobranza</h1>
            <p className="text-gray-500 mt-1 text-sm">Gestión de cobranza por niveles de antigüedad</p>
          </div>
          {selected.size > 0 && (
            <button
              onClick={handleEnviarMasivo}
              disabled={isPending}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? "Enviando..." : `Enviar ${selected.size} cobranzas`}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-gray-500">Deuda Total</p>
          <p className="text-lg sm:text-2xl font-bold font-mono text-gray-900">{formatMonto(totalDeuda)}</p>
          <p className="text-xs text-gray-400">{clientes.length} clientes</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 shadow-sm p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-green-700">Normal</p>
          <p className="text-lg sm:text-xl font-bold font-mono text-green-600">{formatMonto(totalNormal)}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 shadow-sm p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-yellow-700">Alerta</p>
          <p className="text-lg sm:text-xl font-bold font-mono text-yellow-600">{formatMonto(totalAlerta)}</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 shadow-sm p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-red-700">Crítico + Judicial</p>
          <p className="text-lg sm:text-xl font-bold font-mono text-red-600">{formatMonto(totalCritico)}</p>
        </div>
      </div>

      {resultado && (
        <div className={`rounded-xl border p-4 ${resultado.fallidos > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
          <p className="font-medium text-sm">
            Cobranza enviada: {resultado.exitosos} exitosos{resultado.fallidos > 0 ? `, ${resultado.fallidos} fallidos` : ""}
          </p>
          <button onClick={() => setResultado(null)} className="text-xs text-gray-500 mt-1 underline">Cerrar</button>
        </div>
      )}

      <div className="space-y-4">
        {(["JUDICIAL", "CRÍTICO", "ALERTA", "NORMAL"] as const).map((nivel) => {
          const clientesNivel = porNivel[nivel];
          if (clientesNivel.length === 0) return null;
          const config = NIVELES[nivel];
          const total = clientesNivel.reduce((s, c) => s + c.totalDeuda, 0);

          return (
            <div key={nivel} className={`rounded-xl border shadow-sm ${config.bg}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 border-b border-current/10 gap-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${config.badge}`}>{config.label}</span>
                  <span className="text-sm text-gray-600">{clientesNivel.length} clientes</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-bold font-mono ${config.text}`}>{formatMonto(total)}</span>
                  <button
                    onClick={() => {
                      const conEmail = clientesNivel.filter((c) => c.email);
                      if (conEmail.every((c) => selected.has(c.rut))) {
                        const next = new Set(selected);
                        conEmail.forEach((c) => next.delete(c.rut));
                        setSelected(next);
                      } else {
                        const next = new Set(selected);
                        conEmail.forEach((c) => next.add(c.rut));
                        setSelected(next);
                      }
                    }}
                    className="text-xs text-indigo-600 font-medium hover:underline"
                  >
                    Seleccionar
                  </button>
                </div>
              </div>

              <div className="divide-y divide-current/5">
                {clientesNivel.map((c) => (
                  <div key={c.rut} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 sm:px-4 sm:py-3 hover:bg-white/30">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {c.email && (
                        <input
                          type="checkbox"
                          checked={selected.has(c.rut)}
                          onChange={() => toggleSelect(c.rut)}
                          className="rounded border-gray-300 shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{c.razon_social}</div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                          <span className="font-mono">{formatRut(c.rut)}</span>
                          {c.email && <span className="truncate">{c.email}</span>}
                          {c.telefono && <span>{c.telefono}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-4 text-sm pl-8 sm:pl-0">
                      <div className="text-center">
                        <div className="text-xs text-gray-500">Docs</div>
                        <div className="font-medium">{c.cantDocs}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-500">Días</div>
                        <div className="font-mono text-xs font-bold">{c.diasMax}</div>
                      </div>
                      <div className="text-right min-w-[80px]">
                        <div className={`font-mono font-medium ${config.text}`}>{formatMonto(c.totalDeuda)}</div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {c.correosEnviados.length > 0 && (
                          <span className="text-xs text-gray-500 px-1" title={`Último: ${new Date(c.correosEnviados[0].fecha).toLocaleDateString("es-CL")}`}>
                            {c.correosEnviados.length}x
                          </span>
                        )}
                        <button
                          onClick={() => handlePreview(c)}
                          className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-white/50 rounded"
                        >
                          Ver
                        </button>
                        {c.email && (
                          <button
                            onClick={() => handleEnviarIndividual(c)}
                            disabled={isPending || enviando === c.rut}
                            className={`px-2 py-1 text-xs rounded font-medium disabled:opacity-50 ${
                              nivel === "JUDICIAL" || nivel === "CRÍTICO"
                                ? "text-red-700 hover:bg-red-100"
                                : "text-indigo-600 hover:bg-indigo-50"
                            }`}
                          >
                            {enviando === c.rut ? "..." : "Enviar"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {clientes.length === 0 && (
        <div className="bg-green-50 rounded-xl border border-green-200 p-8 text-center">
          <p className="text-green-700 font-medium">Sin cuentas por cobrar pendientes</p>
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setPreview(null)}>
          <div className="bg-white w-full sm:max-w-2xl sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Preview Cobranza: {preview.nombre}</p>
                <p className="text-xs text-gray-500">{preview.asunto}</p>
              </div>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-4" dangerouslySetInnerHTML={{ __html: preview.html }} />
          </div>
        </div>
      )}
    </div>
  );
}
