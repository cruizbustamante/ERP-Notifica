"use client";

import { useState, useTransition } from "react";
import { formatMonto } from "@/lib/contabilidad/core";
import { formatRut } from "@/lib/rut";
import { guardarFicha, guardarAuxiliar } from "./actions";
import YearSelector from "@/components/YearSelector";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

type AuxiliarItem = {
  rut: string; razon_social: string; tipo: string; giro: string; email: string;
  telefono: string; direccion: string; comuna: string; estudio_rut: string;
  totalVentas: number; cantDocs: number; ultimaVenta: string | null; saldoPendiente: number;
};

type FichaComercial = {
  rut: string; razon_social: string; email: string; giro: string;
  direccion: string; telefono: string; facturacion_tipo: string;
  tipo_doc: string; plan: string; valor_plan: number;
  fecha_inicio: string; estado: string; notas: string;
};

type DashboardData = {
  activos: number; inactivos: number; totalFichas: number; retencion: number;
  factura: number; boleta: number; otroDoc: number; tarifaPromedio: number;
  evolucion: { mes: string; nuevos: number; acumulado: number }[];
  nuevosEsteMes: number; mrr: number; totalCxC: number;
  planes: Record<string, number>;
};

type Props = {
  auxiliares: AuxiliarItem[];
  fichas: FichaComercial[];
  tipoCounts: Record<string, number>;
  totalVentasGlobal: number;
  clientesConDeuda: number;
  dashboard: DashboardData;
  anio: number;
  periodos: { anio: number; estado: string }[];
};

const TIPO_TABS = [
  { key: "SUSCRIPCIONES", label: "Suscripciones", icon: "S" },
  { key: "RECEPTOR", label: "Receptores", icon: "R" },
  { key: "ESTUDIO", label: "Estudios", icon: "E" },
  { key: "ABOGADO", label: "Abogados", icon: "A" },
  { key: "PROVEEDOR", label: "Proveedores", icon: "P" },
  { key: "HONORARIO", label: "Honorarios", icon: "H" },
  { key: "TODOS", label: "Todos", icon: "T" },
] as const;

type TipoTab = typeof TIPO_TABS[number]["key"];

const TIPO_COLORS: Record<string, string> = {
  RECEPTOR: "bg-blue-100 text-blue-700",
  ESTUDIO: "bg-purple-100 text-purple-700",
  ABOGADO: "bg-indigo-100 text-indigo-700",
  PROVEEDOR: "bg-amber-100 text-amber-700",
  HONORARIO: "bg-cyan-100 text-cyan-700",
  CLIENTE: "bg-emerald-100 text-emerald-700",
  EMPLEADO: "bg-gray-100 text-gray-600",
  OTRO: "bg-gray-100 text-gray-500",
};

function avatarColor(name: string) {
  const colors = ["#4f46e5", "#059669", "#d97706", "#7c3aed", "#dc2626", "#0891b2", "#1e1b8a", "#0d9488"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const ESTADO_COLORS = ["#10b981", "#94a3b8"];
const DOC_COLORS = ["#1e1b8a", "#a78bfa", "#94a3b8"];
const PLAN_COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#94a3b8"];

export default function ClientesClient({ auxiliares, fichas, tipoCounts, totalVentasGlobal, clientesConDeuda, dashboard, anio, periodos }: Props) {
  const [tipoTab, setTipoTab] = useState<TipoTab>("SUSCRIPCIONES");
  const [buscar, setBuscar] = useState("");
  const [ordenar, setOrdenar] = useState<"ventas" | "nombre" | "deuda">("nombre");
  const [subTab, setSubTab] = useState<"todos" | "activos" | "inactivos" | "deuda">("todos");
  const [selectedRut, setSelectedRut] = useState<string | null>(null);
  const [vista, setVista] = useState<"dashboard" | "tabla">("dashboard");
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<FichaComercial | null>(null);
  const [auxForm, setAuxForm] = useState<{ rut: string; razon_social: string; tipo: string; giro: string; direccion: string; comuna: string; telefono: string; email: string; estudio_rut: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const fichaMap = new Map(fichas.map((f) => [f.rut, f]));

  const isSusc = tipoTab === "SUSCRIPCIONES";
  const isTodos = tipoTab === "TODOS";

  const filteredAux = auxiliares.filter((a) => {
    if (isSusc) return fichaMap.has(a.rut);
    if (isTodos) return true;
    return a.tipo === tipoTab;
  });

  const filtrados = filteredAux
    .filter((c) => {
      if (isSusc) {
        if (subTab === "activos") { const f = fichaMap.get(c.rut); return f?.estado === "ACTIVO"; }
        if (subTab === "inactivos") { const f = fichaMap.get(c.rut); return f?.estado === "INACTIVO"; }
        if (subTab === "deuda") return c.saldoPendiente > 0;
      }
      return true;
    })
    .filter((c) => {
      if (!buscar) return true;
      const q = buscar.toLowerCase().replace(/\./g, "");
      return c.razon_social.toLowerCase().includes(q) || c.rut.includes(q) || c.email.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (ordenar === "ventas") return b.totalVentas - a.totalVentas;
      if (ordenar === "deuda") return b.saldoPendiente - a.saldoPendiente;
      return a.razon_social.localeCompare(b.razon_social);
    });

  const selected = selectedRut ? auxiliares.find((c) => c.rut === selectedRut) : null;
  const selectedFicha = selectedRut ? fichaMap.get(selectedRut) : null;

  const closeModal = () => { setSelectedRut(null); setEditando(false); setForm(null); setAuxForm(null); setMensaje(null); };

  const suscCount = fichas.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#1e1b4b]">Fichas</h1>
            <p className="text-xs text-gray-400 mt-0.5">Gestionar auxiliares, receptores, estudios y proveedores</p>
          </div>
          <YearSelector anio={anio} periodos={periodos} />
        </div>
        <div className="flex items-center gap-2">
          {isSusc && (
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setVista("dashboard")} className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${vista === "dashboard" ? "bg-white text-[#1e1b8a] shadow-sm" : "text-gray-500"}`}>
                Dashboard
              </button>
              <button onClick={() => setVista("tabla")} className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${vista === "tabla" ? "bg-white text-[#1e1b8a] shadow-sm" : "text-gray-500"}`}>
                Tabla
              </button>
            </div>
          )}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" placeholder="Buscar..." value={buscar}
              onChange={(e) => { setBuscar(e.target.value); if (isSusc && e.target.value) setVista("tabla"); }}
              className="pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-56 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5]"
            />
          </div>
        </div>
      </div>

      {/* Tipo Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 px-3 py-2 overflow-x-auto">
        {TIPO_TABS.map((t) => {
          const count = t.key === "SUSCRIPCIONES" ? suscCount : t.key === "TODOS" ? auxiliares.length : (tipoCounts[t.key] || 0);
          return (
            <button key={t.key} onClick={() => { setTipoTab(t.key); setBuscar(""); setSelectedRut(null); }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap flex items-center gap-2 ${
                tipoTab === t.key ? "bg-[#1e1b4b] text-white shadow-sm" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}>
              {t.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                tipoTab === t.key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Suscripciones: KPI + Dashboard */}
      {isSusc && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={<IconUsers />} iconBg="bg-[#ede9fe]" iconColor="text-[#4f46e5]" borderColor="border-t-[#4f46e5]"
              label="Total Suscripciones" value={String(dashboard.totalFichas)} />
            <KpiCard icon={<IconCheck />} iconBg="bg-emerald-50" iconColor="text-emerald-500" borderColor="border-t-emerald-500"
              label="Activos / Inactivos" value={<><span className="text-emerald-600">{dashboard.activos}</span><span className="text-gray-400 text-lg font-normal">/{dashboard.inactivos}</span></>} />
            <KpiCard icon={<IconShield />} iconBg="bg-blue-50" iconColor="text-blue-500" borderColor="border-t-blue-500"
              label="Tasa de Retenci&oacute;n" value={`${dashboard.retencion}%`}
              badge={dashboard.retencion >= 80 ? { text: "Saludable", color: "bg-emerald-100 text-emerald-700" } : dashboard.retencion >= 60 ? { text: "Moderada", color: "bg-amber-100 text-amber-700" } : { text: "Baja", color: "bg-red-100 text-red-700" }} />
            <KpiCard icon={<IconTrend />} iconBg="bg-cyan-50" iconColor="text-cyan-500" borderColor="border-t-cyan-500"
              label="Nuevos Este Mes" value={String(dashboard.nuevosEsteMes)}
              badge={dashboard.nuevosEsteMes === 0 ? { text: "Sin cambios", color: "bg-gray-100 text-gray-500" } : undefined} />
          </div>

          {vista === "dashboard" && <SuscDashboard dashboard={dashboard} fichas={fichas} clientesConDeuda={clientesConDeuda} />}
        </>
      )}

      {/* Tabla */}
      {(isSusc ? vista === "tabla" : true) && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isSusc && (
            <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-gray-100 overflow-x-auto">
              {([
                { key: "todos", label: "Todos", count: filteredAux.length },
                { key: "activos", label: "Activos", count: dashboard.activos },
                { key: "inactivos", label: "Inactivos", count: dashboard.inactivos },
                { key: "deuda", label: "Con Deuda", count: clientesConDeuda },
              ] as const).map((t) => (
                <button key={t.key} onClick={() => setSubTab(t.key)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap ${subTab === t.key ? "border-[#1e1b8a] text-[#1e1b8a]" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                  {t.label}
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${t.key === "deuda" && t.count > 0 ? "bg-amber-100 text-amber-700" : subTab === t.key ? "bg-[#e8e7f8] text-[#1e1b8a]" : "bg-gray-100 text-gray-500"}`}>{t.count}</span>
                </button>
              ))}
              <div className="flex-1" />
              <select value={ordenar} onChange={(e) => setOrdenar(e.target.value as typeof ordenar)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 mb-1 bg-white text-gray-600">
                <option value="nombre">Alfabetico</option>
                <option value="ventas">Mayor ventas</option>
                <option value="deuda">Mayor deuda</option>
              </select>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th>Nombre</th>
                  {(isTodos) && <th>Tipo</th>}
                  {isSusc && <th>Estado</th>}
                  {isSusc && <th>Plan</th>}
                  {isSusc && <th>Facturacion</th>}
                  {isSusc && <th className="text-right">Tarifa</th>}
                  {!isSusc && <th>Email</th>}
                  {!isSusc && <th>Telefono</th>}
                  {!isSusc && <th>Comuna</th>}
                  {tipoTab === "ABOGADO" && <th>Estudio</th>}
                  {(isSusc || tipoTab === "RECEPTOR") && <th className="text-right">Deuda</th>}
                  {isSusc && <th>Ingreso</th>}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c, i) => {
                  const ficha = fichaMap.get(c.rut);
                  const isInactive = ficha?.estado === "INACTIVO";
                  const estudio = tipoTab === "ABOGADO" && c.estudio_rut ? auxiliares.find((a) => a.rut === c.estudio_rut) : null;
                  return (
                    <tr key={c.rut} className={`cursor-pointer ${isInactive ? "opacity-50" : ""}`} onClick={() => setSelectedRut(c.rut)}>
                      <td className="text-center text-gray-400 text-xs">{i + 1}</td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: avatarColor(c.razon_social) }}>
                            <span className="text-xs font-bold text-white">{c.razon_social[0]}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{c.razon_social}</p>
                            <p className="text-[11px] text-gray-400 font-mono">{formatRut(c.rut)}</p>
                          </div>
                        </div>
                      </td>
                      {isTodos && (
                        <td><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TIPO_COLORS[c.tipo] || TIPO_COLORS.OTRO}`}>{c.tipo}</span></td>
                      )}
                      {isSusc && (
                        <td>{ficha?.estado && <span className={`badge ${ficha.estado === "ACTIVO" ? "badge-active" : "badge-inactive"}`}>{ficha.estado}</span>}</td>
                      )}
                      {isSusc && <td className="text-xs text-gray-600">{ficha?.plan || "--"}</td>}
                      {isSusc && (
                        <td>
                          {ficha?.facturacion_tipo && (
                            <span className={`badge ${ficha.facturacion_tipo.includes("Anticipado") ? "badge-anticipado" : "badge-vencido"}`}>
                              {ficha.facturacion_tipo.includes("Anticipado") ? "Anticipado" : "Vencido"}
                            </span>
                          )}
                        </td>
                      )}
                      {isSusc && <td className="text-right font-mono text-sm">{ficha?.valor_plan ? `${ficha.valor_plan} UF` : "--"}</td>}
                      {!isSusc && <td className="text-xs text-gray-500 truncate max-w-[180px]">{c.email || "--"}</td>}
                      {!isSusc && <td className="text-xs text-gray-500 font-mono">{c.telefono || "--"}</td>}
                      {!isSusc && <td className="text-xs text-gray-500">{c.comuna || "--"}</td>}
                      {tipoTab === "ABOGADO" && <td className="text-xs text-gray-600">{estudio?.razon_social || "--"}</td>}
                      {(isSusc || tipoTab === "RECEPTOR") && (
                        <td className={`text-right font-mono text-sm ${c.saldoPendiente > 0 ? "text-amber-600 font-semibold" : "text-gray-400"}`}>
                          {c.saldoPendiente > 0 ? formatMonto(c.saldoPendiente) : "--"}
                        </td>
                      )}
                      {isSusc && <td className="text-xs text-gray-500">{ficha?.fecha_inicio || "--"}</td>}
                    </tr>
                  );
                })}
                {filtrados.length === 0 && (
                  <tr><td colSpan={12} className="text-center py-8 text-gray-400">Sin resultados</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t px-4 py-2 text-xs text-gray-400 bg-[#fafbfd]">{filtrados.length} de {filteredAux.length} registros</div>
        </div>
      )}

      {/* Modal Detalle / Edicion */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-8 px-4" onClick={() => { if (!editando) closeModal(); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden animate-modal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="relative px-6 py-5 text-white" style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)" }}>
              <button onClick={closeModal} className="absolute top-4 right-4 text-white/60 hover:text-white text-xl font-light">&times;</button>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center ring-3 ring-white/20" style={{ background: avatarColor(selected.razon_social) }}>
                  <span className="text-xl font-bold text-white">{selected.razon_social[0]}</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold">{selected.razon_social}</h2>
                  <p className="text-sm text-white/70">{formatRut(selected.rut)}</p>
                  <div className="flex gap-2 mt-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TIPO_COLORS[selected.tipo] || TIPO_COLORS.OTRO}`}>{selected.tipo}</span>
                    {selectedFicha && (
                      <>
                        <span className={`badge ${selectedFicha.estado === "ACTIVO" ? "badge-active" : "badge-inactive"}`}>{selectedFicha.estado}</span>
                        {selectedFicha.plan && <span className="badge badge-info">{selectedFicha.plan}</span>}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* KPI strip for suscripciones */}
            {selectedFicha && (
              <div className="grid grid-cols-4 border-b border-gray-100">
                {[
                  { label: "Tarifa", value: selectedFicha.valor_plan ? `${selectedFicha.valor_plan} UF` : "--", color: "text-[#1e1b4b]" },
                  { label: "Ventas", value: formatMonto(selected.totalVentas), color: "text-emerald-600" },
                  { label: "Deuda CxC", value: selected.saldoPendiente > 0 ? formatMonto(selected.saldoPendiente) : "$0", color: selected.saldoPendiente > 0 ? "text-amber-600" : "text-emerald-600" },
                  { label: "Documentos", value: String(selected.cantDocs), color: "text-[#1e1b4b]" },
                ].map((s) => (
                  <div key={s.label} className="text-center py-3 border-r border-gray-100 last:border-0">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold">{s.label}</p>
                    <p className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}

            {mensaje && (
              <div className={`mx-6 mt-4 p-3 rounded-lg text-sm font-medium ${mensaje.tipo === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {mensaje.texto}
              </div>
            )}

            <div className="p-6 overflow-y-auto max-h-[45vh]">
              {!editando ? (
                <ModalReadView
                  selected={selected}
                  selectedFicha={selectedFicha ?? undefined}
                  auxiliares={auxiliares}
                />
              ) : selectedFicha && form ? (
                <FichaEditForm form={form} setForm={setForm} comuna={selected.comuna} />
              ) : auxForm ? (
                <AuxiliarEditForm form={auxForm} setForm={setAuxForm} estudios={auxiliares.filter((a) => a.tipo === "ESTUDIO")} />
              ) : null}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-6 py-3 flex justify-between bg-[#fafbfd]">
              <div>
                {!editando && (
                  <button
                    onClick={() => {
                      setEditando(true);
                      setMensaje(null);
                      if (selectedFicha) {
                        setForm({
                          rut: selected.rut,
                          razon_social: selected.razon_social,
                          giro: selectedFicha.giro || selected.giro || "",
                          direccion: selectedFicha.direccion || selected.direccion || "",
                          email: selectedFicha.email || selected.email || "",
                          telefono: selectedFicha.telefono || selected.telefono || "",
                          facturacion_tipo: selectedFicha.facturacion_tipo || "Mes Vencido",
                          tipo_doc: selectedFicha.tipo_doc || "Factura",
                          plan: selectedFicha.plan || "",
                          valor_plan: selectedFicha.valor_plan || 0,
                          fecha_inicio: selectedFicha.fecha_inicio || "",
                          estado: selectedFicha.estado || "ACTIVO",
                          notas: selectedFicha.notas || "",
                        });
                      } else {
                        setAuxForm({
                          rut: selected.rut,
                          razon_social: selected.razon_social,
                          tipo: selected.tipo,
                          giro: selected.giro,
                          direccion: selected.direccion,
                          comuna: selected.comuna,
                          telefono: selected.telefono,
                          email: selected.email,
                          estudio_rut: selected.estudio_rut,
                        });
                      }
                    }}
                    className="px-4 py-2 text-sm font-medium text-white bg-[#1e1b8a] rounded-lg hover:bg-[#2d2a9e] transition"
                  >
                    Editar Ficha
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {editando ? (
                  <>
                    <button onClick={() => { setEditando(false); setForm(null); setAuxForm(null); setMensaje(null); }}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition" disabled={isPending}>
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (form) {
                          startTransition(async () => {
                            const res = await guardarFicha({ ...form, rut: selected.rut });
                            if (res.error) setMensaje({ tipo: "error", texto: res.error });
                            else { setMensaje({ tipo: "ok", texto: "Ficha guardada" }); setEditando(false); setForm(null); }
                          });
                        } else if (auxForm) {
                          startTransition(async () => {
                            const res = await guardarAuxiliar({ ...auxForm, rut: selected.rut });
                            if (res.error) setMensaje({ tipo: "error", texto: res.error });
                            else { setMensaje({ tipo: "ok", texto: "Auxiliar guardado" }); setEditando(false); setAuxForm(null); }
                          });
                        }
                      }}
                      disabled={isPending}
                      className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                    >
                      {isPending ? "Guardando..." : "Guardar"}
                    </button>
                  </>
                ) : (
                  <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition">Cerrar</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Modal Read View ─── */
function ModalReadView({ selected, selectedFicha, auxiliares }: { selected: AuxiliarItem; selectedFicha: FichaComercial | undefined; auxiliares: AuxiliarItem[] }) {
  const estudio = selected.estudio_rut ? auxiliares.find((a) => a.rut === selected.estudio_rut) : null;
  const abogadosDelEstudio = selected.tipo === "ESTUDIO" ? auxiliares.filter((a) => a.tipo === "ABOGADO" && a.estudio_rut === selected.rut) : [];

  return (
    <>
      {selected.saldoPendiente > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-3">
          <div>
            <p className="text-sm font-semibold text-red-800">Deuda pendiente: {formatMonto(selected.saldoPendiente)}</p>
            <p className="text-xs text-red-600">Saldo por cobrar</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
        <div>
          <p className="text-[11px] text-gray-400 uppercase font-semibold mb-3">Datos Generales</p>
          <div className="space-y-2">
            <InfoRow label="RUT" value={formatRut(selected.rut)} />
            <InfoRow label="Razon Social" value={selected.razon_social} />
            <InfoRow label="Tipo" value={selected.tipo} />
            <InfoRow label="Giro" value={selected.giro || "--"} />
            <InfoRow label="Direccion" value={selected.direccion || "--"} />
            <InfoRow label="Comuna" value={selected.comuna || "--"} />
            <InfoRow label="Email" value={selected.email || "--"} />
            <InfoRow label="Telefono" value={selected.telefono || "--"} />
          </div>
        </div>
        <div>
          {selectedFicha ? (
            <>
              <p className="text-[11px] text-gray-400 uppercase font-semibold mb-3">Datos Comerciales</p>
              <div className="space-y-2">
                <InfoRow label="Plan" value={selectedFicha.plan || "--"} />
                <InfoRow label="Tarifa" value={selectedFicha.valor_plan ? `${selectedFicha.valor_plan} UF` : "--"} />
                <InfoRow label="Facturacion" value={selectedFicha.facturacion_tipo || "--"} />
                <InfoRow label="Tipo Doc." value={selectedFicha.tipo_doc || "--"} />
                <InfoRow label="Fecha Ingreso" value={selectedFicha.fecha_inicio || "--"} />
                <InfoRow label="Estado" value={selectedFicha.estado || "--"} />
              </div>
            </>
          ) : selected.tipo === "ABOGADO" && estudio ? (
            <>
              <p className="text-[11px] text-gray-400 uppercase font-semibold mb-3">Estudio</p>
              <div className="space-y-2">
                <InfoRow label="Razon Social" value={estudio.razon_social} />
                <InfoRow label="RUT" value={formatRut(estudio.rut)} />
                <InfoRow label="Giro" value={estudio.giro || "--"} />
                <InfoRow label="Email" value={estudio.email || "--"} />
              </div>
            </>
          ) : selected.tipo === "ESTUDIO" && abogadosDelEstudio.length > 0 ? (
            <>
              <p className="text-[11px] text-gray-400 uppercase font-semibold mb-3">Abogados vinculados ({abogadosDelEstudio.length})</p>
              <div className="space-y-2">
                {abogadosDelEstudio.map((ab) => (
                  <div key={ab.rut} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: avatarColor(ab.razon_social) }}>
                      <span className="text-[10px] font-bold text-white">{ab.razon_social[0]}</span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-800">{ab.razon_social}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{formatRut(ab.rut)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] text-gray-400 uppercase font-semibold mb-3">Actividad</p>
              <div className="space-y-2">
                <InfoRow label="Ventas" value={selected.totalVentas > 0 ? formatMonto(selected.totalVentas) : "--"} />
                <InfoRow label="Documentos" value={selected.cantDocs > 0 ? String(selected.cantDocs) : "--"} />
                <InfoRow label="Ultima venta" value={selected.ultimaVenta || "--"} />
              </div>
            </>
          )}
        </div>
      </div>

      {selectedFicha?.notas && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-[11px] text-gray-400 uppercase font-semibold mb-1">Notas</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedFicha.notas}</p>
        </div>
      )}
    </>
  );
}

/* ─── Ficha Comercial Edit Form ─── */
function FichaEditForm({ form, setForm, comuna }: { form: FichaComercial; setForm: (f: FichaComercial) => void; comuna: string }) {
  return (
    <div className="space-y-5">
      <fieldset className="border border-gray-200 rounded-lg p-4">
        <legend className="text-[11px] text-gray-400 uppercase font-semibold px-2">Datos del Cliente</legend>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Razon Social" value={form.razon_social} onChange={(v) => setForm({ ...form, razon_social: v })} />
          <FormField label="Giro" value={form.giro} onChange={(v) => setForm({ ...form, giro: v })} />
          <FormField label="Direccion" value={form.direccion} onChange={(v) => setForm({ ...form, direccion: v })} />
          <FormField label="Comuna" value={comuna} disabled />
          <FormField label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
          <FormField label="Telefono" value={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} />
        </div>
      </fieldset>
      <fieldset className="border border-gray-200 rounded-lg p-4">
        <legend className="text-[11px] text-gray-400 uppercase font-semibold px-2">Datos Comerciales</legend>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Plan" value={form.plan} onChange={(v) => setForm({ ...form, plan: v })} />
          <FormField label="Tarifa (UF)" value={String(form.valor_plan || "")} onChange={(v) => setForm({ ...form, valor_plan: parseFloat(v) || 0 })} type="number" step="0.01" />
          <FormSelect label="Facturacion" value={form.facturacion_tipo} onChange={(v) => setForm({ ...form, facturacion_tipo: v })} options={["Mes Vencido", "Mes Anticipado"]} />
          <FormSelect label="Tipo Documento" value={form.tipo_doc} onChange={(v) => setForm({ ...form, tipo_doc: v })} options={["Factura", "Boleta"]} />
          <FormField label="Fecha Inicio" value={form.fecha_inicio} onChange={(v) => setForm({ ...form, fecha_inicio: v })} type="date" />
          <FormSelect label="Estado" value={form.estado} onChange={(v) => setForm({ ...form, estado: v })} options={["ACTIVO", "INACTIVO"]} />
        </div>
      </fieldset>
      <fieldset className="border border-gray-200 rounded-lg p-4">
        <legend className="text-[11px] text-gray-400 uppercase font-semibold px-2">Notas</legend>
        <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] resize-none"
          placeholder="Observaciones del cliente..." />
      </fieldset>
    </div>
  );
}

/* ─── Auxiliar Edit Form ─── */
function AuxiliarEditForm({ form, setForm, estudios }: {
  form: { rut: string; razon_social: string; tipo: string; giro: string; direccion: string; comuna: string; telefono: string; email: string; estudio_rut: string };
  setForm: (f: typeof form) => void;
  estudios: AuxiliarItem[];
}) {
  return (
    <div className="space-y-5">
      <fieldset className="border border-gray-200 rounded-lg p-4">
        <legend className="text-[11px] text-gray-400 uppercase font-semibold px-2">Datos Generales</legend>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Razon Social" value={form.razon_social} onChange={(v) => setForm({ ...form, razon_social: v })} />
          <FormSelect label="Tipo" value={form.tipo} onChange={(v) => setForm({ ...form, tipo: v })}
            options={["RECEPTOR", "ESTUDIO", "ABOGADO", "PROVEEDOR", "HONORARIO", "EMPLEADO", "OTRO"]} />
          <FormField label="Giro" value={form.giro} onChange={(v) => setForm({ ...form, giro: v })} />
          <FormField label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
          <FormField label="Direccion" value={form.direccion} onChange={(v) => setForm({ ...form, direccion: v })} />
          <FormField label="Comuna" value={form.comuna} onChange={(v) => setForm({ ...form, comuna: v })} />
          <FormField label="Telefono" value={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} />
          {(form.tipo === "ABOGADO") && (
            <div>
              <label className="block text-[11px] text-gray-500 font-medium mb-1">Estudio vinculado</label>
              <select value={form.estudio_rut} onChange={(e) => setForm({ ...form, estudio_rut: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] bg-white">
                <option value="">-- Sin estudio --</option>
                {estudios.map((e) => <option key={e.rut} value={e.rut}>{e.razon_social} ({formatRut(e.rut)})</option>)}
              </select>
            </div>
          )}
        </div>
      </fieldset>
    </div>
  );
}

/* ─── Suscripciones Dashboard ─── */
function SuscDashboard({ dashboard, fichas, clientesConDeuda }: { dashboard: DashboardData; fichas: FichaComercial[]; clientesConDeuda: number }) {
  const estadoData = [{ name: "Activos", value: dashboard.activos }, { name: "Inactivos", value: dashboard.inactivos }];
  const docData = [
    { name: "Factura", value: dashboard.factura },
    { name: "Boleta", value: dashboard.boleta },
    ...(dashboard.otroDoc > 0 ? [{ name: "Otro", value: dashboard.otroDoc }] : []),
  ];
  const planData = Object.entries(dashboard.planes).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k, value: v }));
  const primerCliente = dashboard.evolucion.length > 0 ? dashboard.evolucion[0].mes : "--";
  const promMensual = dashboard.evolucion.length > 0 ? (dashboard.totalFichas / dashboard.evolucion.length).toFixed(1) : "0";

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-[#1e1b4b] mb-4">Distribucion</h3>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Estado de Clientes</p>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={estadoData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value">
                {estadoData.map((_, i) => <Cell key={i} fill={ESTADO_COLORS[i]} />)}
              </Pie><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} /></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="border-t border-gray-100 mt-4 pt-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Tipo Documento</p>
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={docData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value">
                  {docData.map((_, i) => <Cell key={i} fill={DOC_COLORS[i]} />)}
                </Pie><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} /></PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="border-t border-gray-100 mt-4 pt-4 text-center">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Tarifa Promedio</p>
            <p className="text-3xl font-bold text-[#1e1b4b] mt-1">{dashboard.tarifaPromedio.toFixed(2)} <span className="text-sm font-normal text-gray-400">UF</span></p>
            <p className="text-[11px] text-gray-400">{fichas.filter((f) => f.valor_plan > 0).length} clientes con tarifa definida</p>
          </div>
        </div>

        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-[#1e1b4b] mb-4">Evolucion de Clientes</h3>
          <div className="grid grid-cols-4 gap-3 mb-5">
            <MiniStat label="Primer Cliente" value={primerCliente} />
            <MiniStat label="Total Actual" value={String(dashboard.totalFichas)} />
            <MiniStat label="Crecimiento Total" value={`+${dashboard.totalFichas}`} />
            <MiniStat label="Prom. Mensual" value={promMensual} />
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboard.evolucion} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradAcum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1e1b8a" stopOpacity={0.1} /><stop offset="95%" stopColor="#1e1b8a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradNuevos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                <Area type="monotone" dataKey="acumulado" stroke="#1e1b8a" strokeWidth={2.5} fill="url(#gradAcum)" name="Total Acumulado" />
                <Area type="monotone" dataKey="nuevos" stroke="#10b981" strokeWidth={2} fill="url(#gradNuevos)" name="Nuevos Ingresos" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">MRR (Ingreso Recurrente)</p>
          <p className="text-3xl font-bold text-[#1e1b8a] mt-2">{dashboard.mrr.toFixed(1)} <span className="text-sm font-normal text-gray-400">UF/mes</span></p>
          <p className="text-xs text-gray-400 mt-1">{dashboard.activos} clientes activos con suscripcion</p>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Proyeccion anual</span>
              <span className="font-semibold text-[#1e1b4b]">{(dashboard.mrr * 12).toFixed(1)} UF</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Distribucion por Plan</p>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={planData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={2} dataKey="value">
                {planData.map((_, i) => <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} />)}
              </Pie><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} /><Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} /></PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Cuentas por Cobrar</p>
          <p className={`text-3xl font-bold mt-2 font-mono ${dashboard.totalCxC > 0 ? "text-amber-600" : "text-emerald-600"}`}>{formatMonto(dashboard.totalCxC)}</p>
          <p className="text-xs text-gray-400 mt-1">{clientesConDeuda} clientes con saldo pendiente</p>
          {dashboard.totalCxC > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Saldo promedio</span>
                <span className="font-semibold text-amber-600 font-mono">{clientesConDeuda > 0 ? formatMonto(dashboard.totalCxC / clientesConDeuda) : "$0"}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Sub-components ─── */

function KpiCard({ icon, iconBg, iconColor, borderColor, label, value, badge }: {
  icon: React.ReactNode; iconBg: string; iconColor: string; borderColor: string;
  label: string; value: React.ReactNode; badge?: { text: string; color: string };
}) {
  return (
    <div className={`kpi-card bg-white rounded-xl border border-gray-200 border-t-[3px] ${borderColor} p-4`}>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl ${iconBg} ${iconColor} flex items-center justify-center`}>{icon}</div>
        {badge && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>{badge.text}</span>}
      </div>
      <p className="text-xs text-gray-500 mt-3">{label}</p>
      <p className="text-2xl font-bold text-[#1e1b4b] mt-0.5">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center bg-[#fafbfd] rounded-lg border border-gray-100 py-3 px-2">
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className="text-lg font-bold text-[#1e1b4b] mt-0.5">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-gray-400 w-24 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  );
}

function FormField({ label, value, onChange, type = "text", disabled, step }: {
  label: string; value: string; onChange?: (v: string) => void; type?: string; disabled?: boolean; step?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] text-gray-500 font-medium mb-1">{label}</label>
      <input type={type} value={value} step={step} onChange={onChange ? (e) => onChange(e.target.value) : undefined} disabled={disabled}
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] disabled:bg-gray-50 disabled:text-gray-400" />
    </div>
  );
}

function FormSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="block text-[11px] text-gray-500 font-medium mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] bg-white">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

/* ─── Icons ─── */
function IconUsers() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>;
}
function IconCheck() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function IconShield() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>;
}
function IconTrend() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>;
}
