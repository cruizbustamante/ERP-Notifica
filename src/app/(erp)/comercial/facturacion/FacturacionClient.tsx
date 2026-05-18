"use client";

import { useState, useTransition } from "react";
import { formatMonto, MESES } from "@/lib/contabilidad/core";
import { formatRut } from "@/lib/rut";
import { enviarCorreoFactura, enviarFacturasMasivo, previewFacturaHtml } from "./actions";
import YearSelector from "@/components/YearSelector";

type Documento = {
  id: number;
  tipo_dte: number;
  tipo_dte_nombre: string;
  rut_receptor: string;
  razon_social: string;
  folio: string;
  fecha_emision: string;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
  estado_sii: string;
  centralizado: boolean;
  mes: number;
};

type ClienteActivo = {
  rut: string;
  razon_social: string;
  email: string;
  facturacion_tipo: string;
  tipo_doc: string;
  plan: string;
  valor_plan: number;
};

type ResumenMes = { mes: number; facturas: number; nc: number; total: number };

type Props = {
  anio: number;
  mesActual: number;
  documentos: Documento[];
  clientesActivos: ClienteActivo[];
  correosEnviados: Record<string, { mes: number; folio: string; fecha: string }[]>;
  resumenMensual: ResumenMes[];
  totalFacturado: number;
  totalNC: number;
  cantDocs: number;
  periodos: { anio: number; estado: string }[];
};

const MAPA_DTE: Record<number, string> = {
  33: "FAC", 34: "FEX", 39: "BV", 41: "BVE", 46: "FC",
  56: "ND", 61: "NC", 110: "FEX", 111: "NCE", 112: "NDE",
};

const TABS = ["Control del Mes", "Documentos", "Historial Correos"] as const;

export default function FacturacionClient({ anio, mesActual, documentos, clientesActivos, correosEnviados, resumenMensual, totalFacturado, totalNC, cantDocs, periodos }: Props) {
  const [tab, setTab] = useState<typeof TABS[number]>("Control del Mes");
  const [mesControl, setMesControl] = useState(mesActual);
  const [mesFilter, setMesFilter] = useState(0);
  const [buscar, setBuscar] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ exitosos: number; fallidos: number } | null>(null);
  const [preview, setPreview] = useState<{ asunto: string; html: string; nombre: string } | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);

  const docsDelMes = documentos.filter((d) => {
    const m = d.mes || new Date(d.fecha_emision).getMonth() + 1;
    return m === mesControl && ![61, 111].includes(d.tipo_dte);
  });

  const facturadosRuts = new Set(docsDelMes.map((d) => d.rut_receptor));

  const controlClientes = clientesActivos.map((c) => {
    const facturado = facturadosRuts.has(c.rut);
    const doc = facturado ? docsDelMes.find((d) => d.rut_receptor === c.rut) : null;
    const correos = correosEnviados[c.rut]?.filter((e) => e.mes === mesControl) || [];
    return { ...c, facturado, doc, correoEnviado: correos.length > 0, correos };
  });

  const facturados = controlClientes.filter((c) => c.facturado);
  const pendientes = controlClientes.filter((c) => !c.facturado);

  function toggleSelect(rut: string) {
    const next = new Set(selected);
    if (next.has(rut)) next.delete(rut);
    else next.add(rut);
    setSelected(next);
  }

  function selectAll() {
    const facturadosSinCorreo = facturados.filter((c) => !c.correoEnviado && c.email);
    if (facturadosSinCorreo.every((c) => selected.has(c.rut))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(facturadosSinCorreo.map((c) => c.rut)));
    }
  }

  async function handleEnviarIndividual(c: typeof controlClientes[0]) {
    if (!c.doc || !c.email) return;
    setEnviando(c.rut);
    startTransition(async () => {
      await enviarCorreoFactura({
        rut: c.rut, nombre: c.razon_social, email: c.email,
        folio: c.doc!.folio, total: c.doc!.monto_total,
        facturacionTipo: c.facturacion_tipo, mes: mesControl, anio,
      });
      setEnviando(null);
    });
  }

  async function handleEnviarMasivo() {
    const paraEnviar = facturados
      .filter((c) => selected.has(c.rut) && c.email && c.doc)
      .map((c) => ({
        rut: c.rut, nombre: c.razon_social, email: c.email,
        folio: c.doc!.folio, total: c.doc!.monto_total,
        facturacionTipo: c.facturacion_tipo, mes: mesControl, anio,
      }));
    if (paraEnviar.length === 0) return;
    startTransition(async () => {
      const res = await enviarFacturasMasivo(paraEnviar);
      setResultado(res);
      setSelected(new Set());
    });
  }

  async function handlePreview(c: typeof controlClientes[0]) {
    if (!c.doc) return;
    const res = await previewFacturaHtml({
      nombre: c.razon_social, facturacionTipo: c.facturacion_tipo,
      folio: c.doc.folio, total: c.doc.monto_total, mes: mesControl, anio,
    });
    setPreview({ ...res, nombre: c.razon_social });
  }

  const filtradosDocs = documentos.filter((d) => {
    if (mesFilter > 0) {
      const docMes = d.mes || new Date(d.fecha_emision).getMonth() + 1;
      if (docMes !== mesFilter) return false;
    }
    if (buscar) {
      const q = buscar.toLowerCase();
      return d.razon_social.toLowerCase().includes(q) || d.rut_receptor.replace(/\./g, "").includes(q.replace(/\./g, "")) || d.folio.includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900">Facturación</h1>
            <p className="text-gray-500 mt-1 text-sm">Documentos emitidos y control de envío — {anio}</p>
          </div>
          <YearSelector anio={anio} periodos={periodos} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-gray-500">Total Facturado</p>
          <p className="text-lg sm:text-2xl font-bold font-mono text-green-600">{formatMonto(totalFacturado)}</p>
          <p className="text-xs text-gray-400">{cantDocs} documentos</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-gray-500">Notas de Crédito</p>
          <p className="text-lg sm:text-2xl font-bold font-mono text-red-600">{formatMonto(totalNC)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-gray-500">Neto</p>
          <p className="text-lg sm:text-2xl font-bold font-mono text-blue-600">{formatMonto(totalFacturado - totalNC)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto bg-gray-100 rounded-lg p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* TAB: Control del Mes */}
      {tab === "Control del Mes" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Mes:</label>
                <select
                  value={mesControl}
                  onChange={(e) => { setMesControl(Number(e.target.value)); setSelected(new Set()); }}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                >
                  {MESES.slice(1).map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded font-medium">{facturados.length} facturados</span>
                <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded font-medium">{pendientes.length} pendientes</span>
              </div>
              {selected.size > 0 && (
                <button
                  onClick={handleEnviarMasivo}
                  disabled={isPending}
                  className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isPending ? "Enviando..." : `Enviar ${selected.size} correos`}
                </button>
              )}
            </div>
          </div>

          {resultado && (
            <div className={`rounded-xl border p-4 ${resultado.fallidos > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
              <p className="font-medium text-sm">
                Envío completado: {resultado.exitosos} exitosos{resultado.fallidos > 0 ? `, ${resultado.fallidos} fallidos` : ""}
              </p>
              <button onClick={() => setResultado(null)} className="text-xs text-gray-500 mt-1 underline">Cerrar</button>
            </div>
          )}

          {/* Facturados */}
          {facturados.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between p-3 sm:p-4 border-b">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">FACTURADOS</span>
                  <span className="text-sm text-gray-500">{facturados.length} clientes</span>
                </div>
                <button onClick={selectAll} className="text-xs text-indigo-600 font-medium hover:underline">
                  {facturados.filter((c) => !c.correoEnviado && c.email).every((c) => selected.has(c.rut)) ? "Deseleccionar" : "Seleccionar sin enviar"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b bg-gray-50">
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2 text-left font-medium">Cliente</th>
                      <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Email</th>
                      <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Tipo</th>
                      <th className="px-3 py-2 text-center font-medium">Folio</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 text-center font-medium">Correo</th>
                      <th className="px-3 py-2 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturados.map((c) => (
                      <tr key={c.rut} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2">
                          {!c.correoEnviado && c.email && (
                            <input
                              type="checkbox"
                              checked={selected.has(c.rut)}
                              onChange={() => toggleSelect(c.rut)}
                              className="rounded border-gray-300"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-sm">{c.razon_social}</div>
                          <div className="text-xs text-gray-400 font-mono">{formatRut(c.rut)}</div>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 hidden sm:table-cell">{c.email || <span className="text-red-400">Sin email</span>}</td>
                        <td className="px-3 py-2 text-xs hidden md:table-cell">
                          <span className={`px-1.5 py-0.5 rounded ${c.facturacion_tipo === "Mes Anticipado" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                            {c.facturacion_tipo === "Mes Anticipado" ? "Anticipado" : "Vencido"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-xs">{c.doc?.folio}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium">{formatMonto(c.doc?.monto_total || 0)}</td>
                        <td className="px-3 py-2 text-center">
                          {c.correoEnviado ? (
                            <span className="text-green-500 text-xs font-medium">Enviado</span>
                          ) : (
                            <span className="text-gray-300 text-xs">Pendiente</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button
                              onClick={() => handlePreview(c)}
                              className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                              title="Preview"
                            >
                              Ver
                            </button>
                            {!c.correoEnviado && c.email && (
                              <button
                                onClick={() => handleEnviarIndividual(c)}
                                disabled={isPending || enviando === c.rut}
                                className="px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded font-medium disabled:opacity-50"
                              >
                                {enviando === c.rut ? "..." : "Enviar"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pendientes de facturar */}
          {pendientes.length > 0 && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm">
              <div className="flex items-center gap-2 p-3 sm:p-4 border-b border-amber-200">
                <span className="px-2 py-1 bg-amber-200 text-amber-800 rounded text-xs font-bold">PENDIENTES DE FACTURAR</span>
                <span className="text-sm text-amber-700">{pendientes.length} clientes</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-amber-700 border-b border-amber-200">
                      <th className="px-4 py-2 text-left font-medium">Cliente</th>
                      <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Email</th>
                      <th className="px-3 py-2 text-left font-medium">Tipo Fact.</th>
                      <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Plan</th>
                      <th className="px-3 py-2 text-right font-medium">UF Plan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendientes.map((c) => (
                      <tr key={c.rut} className="border-b border-amber-100 hover:bg-amber-100/50">
                        <td className="px-4 py-2">
                          <div className="font-medium">{c.razon_social}</div>
                          <div className="text-xs text-amber-600 font-mono">{formatRut(c.rut)}</div>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 hidden sm:table-cell">{c.email || "—"}</td>
                        <td className="px-3 py-2 text-xs">
                          {c.facturacion_tipo ? (
                            <span className={`px-1.5 py-0.5 rounded ${c.facturacion_tipo === "Mes Anticipado" ? "bg-blue-100 text-blue-700" : "bg-amber-200 text-amber-800"}`}>
                              {c.facturacion_tipo === "Mes Anticipado" ? "Anticipado" : "Vencido"}
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 hidden md:table-cell">{c.plan || "—"}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{c.valor_plan > 0 ? `${c.valor_plan} UF` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Documentos */}
      {tab === "Documentos" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b bg-gray-50">
                  <th className="px-4 py-2 text-left font-medium">Mes</th>
                  <th className="px-3 py-2 text-right font-medium">Facturas</th>
                  <th className="px-3 py-2 text-right font-medium">NC</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {resumenMensual.filter((r) => r.facturas > 0 || r.nc > 0).map((r) => (
                  <tr
                    key={r.mes}
                    className={`border-b hover:bg-gray-50 cursor-pointer ${mesFilter === r.mes ? "bg-blue-50" : ""}`}
                    onClick={() => setMesFilter(mesFilter === r.mes ? 0 : r.mes)}
                  >
                    <td className="px-4 py-2 font-medium">{MESES[r.mes]}</td>
                    <td className="px-3 py-2 text-right">{r.facturas}</td>
                    <td className="px-3 py-2 text-right text-red-500">{r.nc || ""}</td>
                    <td className="px-4 py-2 text-right font-mono font-medium">{formatMonto(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 p-3 sm:p-4 border-b">
              <input
                type="text"
                placeholder="Buscar por RUT, razón social o folio..."
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {mesFilter > 0 && (
                <button onClick={() => setMesFilter(0)} className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
                  {MESES[mesFilter]} ✕
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b bg-gray-50">
                    <th className="px-3 py-2 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium">Folio</th>
                    <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium hidden md:table-cell">RUT</th>
                    <th className="px-4 py-2 text-left font-medium">Razón Social</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-2 py-2 text-center font-medium hidden sm:table-cell">SII</th>
                    <th className="px-2 py-2 text-center font-medium hidden sm:table-cell">Cent.</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradosDocs.map((d) => {
                    const isNC = [61, 111].includes(d.tipo_dte);
                    return (
                      <tr key={d.id} className={`border-b hover:bg-gray-50 ${isNC ? "bg-red-50/30" : ""}`}>
                        <td className="px-3 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${isNC ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                            {MAPA_DTE[d.tipo_dte] || d.tipo_dte}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs">{d.folio}</td>
                        <td className="px-3 py-1.5 text-xs hidden sm:table-cell">{d.fecha_emision}</td>
                        <td className="px-3 py-1.5 font-mono text-xs hidden md:table-cell">{formatRut(d.rut_receptor)}</td>
                        <td className="px-4 py-1.5 max-w-[200px] truncate">{d.razon_social}</td>
                        <td className={`px-3 py-1.5 text-right font-mono font-medium ${isNC ? "text-red-600" : ""}`}>{formatMonto(d.monto_total)}</td>
                        <td className="px-2 py-1.5 text-center text-xs hidden sm:table-cell">{d.estado_sii === "DOK" ? "✓" : d.estado_sii}</td>
                        <td className="px-2 py-1.5 text-center hidden sm:table-cell">{d.centralizado ? <span className="text-green-500">●</span> : <span className="text-gray-300">○</span>}</td>
                      </tr>
                    );
                  })}
                  {filtradosDocs.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin documentos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t px-4 py-2 text-xs text-gray-400">{filtradosDocs.length} documentos</div>
          </div>
        </div>
      )}

      {/* TAB: Historial Correos */}
      {tab === "Historial Correos" && (
        <HistorialCorreos correosEnviados={correosEnviados} anio={anio} />
      )}

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setPreview(null)}>
          <div className="bg-white w-full sm:max-w-2xl sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Preview: {preview.nombre}</p>
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

function HistorialCorreos({ correosEnviados, anio }: { correosEnviados: Record<string, { mes: number; folio: string; fecha: string }[]>; anio: number }) {
  const todos = Object.entries(correosEnviados).flatMap(([rut, correos]) =>
    correos.map((c) => ({ rut, ...c }))
  ).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  if (todos.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-400">No se han enviado correos de facturación en {anio}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b">
        <h3 className="font-medium text-sm text-gray-700">Correos enviados — {anio}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b bg-gray-50">
              <th className="px-4 py-2 text-left font-medium">Fecha</th>
              <th className="px-3 py-2 text-left font-medium">RUT</th>
              <th className="px-3 py-2 text-center font-medium">Folio</th>
              <th className="px-3 py-2 text-center font-medium">Mes</th>
            </tr>
          </thead>
          <tbody>
            {todos.map((c, i) => (
              <tr key={i} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2 text-xs">{new Date(c.fecha).toLocaleString("es-CL")}</td>
                <td className="px-3 py-2 font-mono text-xs">{formatRut(c.rut)}</td>
                <td className="px-3 py-2 text-center font-mono text-xs">{c.folio}</td>
                <td className="px-3 py-2 text-center text-xs">{MESES[c.mes]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
