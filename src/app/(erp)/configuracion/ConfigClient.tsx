"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  updateConfig,
  upsertCategoriaFlujo,
  toggleCategoriaFlujo,
  upsertTipoDocumento,
  toggleTipoDocumento,
  upsertPlan,
  togglePlan,
  crearUsuario,
  actualizarUsuario,
  toggleUsuario,
} from "./actions";

type Categoria = { id: number; codigo: string; nombre: string; tipo: string; flujo: string; orden: number; estado: string };
type TipoDoc = { id: number; codigo: string; nombre: string; abreviatura: string; clasificacion: string; codigo_sii: number; afecto_iva: string; origen: string; estado: string };
type Plan = { id: number; codigo: string; nombre: string; descripcion: string; valor_base: number; moneda: string; estado: string };
type Usuario = { id: number; user_id: string; email: string; rol: string; nombre: string; activo: boolean; created_at: string };

const TABS = [
  { key: "empresa", label: "Empresa" },
  { key: "centralizacion", label: "Centralización" },
  { key: "categorias", label: "Categorías Flujo" },
  { key: "documentos", label: "Tipos Documento" },
  { key: "planes", label: "Planes" },
  { key: "usuarios", label: "Usuarios" },
];

export default function ConfigClient({
  config, categorias, tiposDoc, planes, usuarios,
}: {
  config: Record<string, string>;
  categorias: Categoria[];
  tiposDoc: TipoDoc[];
  planes: Plan[];
  usuarios: Usuario[];
}) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "empresa";
  const [tab, setTab] = useState(initialTab);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const showMsg = (tipo: "ok" | "error", texto: string) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje(null), 3000);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500 text-sm mt-0.5">Parámetros generales del sistema</p>
      </div>

      {mensaje && (
        <div className={`p-3 rounded-lg text-sm ${mensaje.tipo === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {mensaje.texto}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${tab === t.key ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Empresa */}
      {tab === "empresa" && (
        <TabEmpresa config={config} isPending={isPending} startTransition={startTransition} showMsg={showMsg} />
      )}

      {/* Tab: Centralización */}
      {tab === "centralizacion" && (
        <TabCentralizacion config={config} isPending={isPending} startTransition={startTransition} showMsg={showMsg} />
      )}

      {/* Tab: Categorías Flujo */}
      {tab === "categorias" && (
        <TabCategorias categorias={categorias} isPending={isPending} startTransition={startTransition} showMsg={showMsg} />
      )}

      {/* Tab: Tipos Documento */}
      {tab === "documentos" && (
        <TabTiposDoc tiposDoc={tiposDoc} isPending={isPending} startTransition={startTransition} showMsg={showMsg} />
      )}

      {/* Tab: Planes */}
      {tab === "planes" && (
        <TabPlanes planes={planes} isPending={isPending} startTransition={startTransition} showMsg={showMsg} />
      )}

      {/* Tab: Usuarios */}
      {tab === "usuarios" && (
        <TabUsuarios usuarios={usuarios} isPending={isPending} startTransition={startTransition} showMsg={showMsg} />
      )}
    </div>
  );
}

// ─── Tab Empresa ───────────────────────────────────────────────────────

function TabEmpresa({ config, isPending, startTransition, showMsg }: {
  config: Record<string, string>;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  showMsg: (t: "ok" | "error", m: string) => void;
}) {
  const campos = [
    { clave: "EMPRESA_NOMBRE", label: "Razón Social", valor: config.EMPRESA_NOMBRE || "" },
    { clave: "EMPRESA_RUT", label: "RUT", valor: config.EMPRESA_RUT || "" },
    { clave: "MONEDA", label: "Moneda", valor: config.MONEDA || "CLP" },
    { clave: "CUENTA_BANCO", label: "Cuenta Banco (código contable)", valor: config.CUENTA_BANCO || "1-1-01-002" },
    { clave: "BANCO_NOMBRE", label: "Banco", valor: config.BANCO_NOMBRE || "Santander" },
    { clave: "BANCO_CTA", label: "N° Cuenta Corriente", valor: config.BANCO_CTA || "" },
  ];

  const [valores, setValores] = useState<Record<string, string>>(
    Object.fromEntries(campos.map((c) => [c.clave, c.valor]))
  );

  const guardar = () => {
    startTransition(async () => {
      for (const [clave, valor] of Object.entries(valores)) {
        const res = await updateConfig(clave, valor);
        if (res.error) { showMsg("error", res.error); return; }
      }
      showMsg("ok", "Configuración guardada");
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-4">
      <h3 className="font-semibold text-gray-900">Datos de la Empresa</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {campos.map((c) => (
          <div key={c.clave}>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{c.label}</label>
            <input
              value={valores[c.clave]}
              onChange={(e) => setValores((p) => ({ ...p, [c.clave]: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button onClick={guardar} disabled={isPending} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          {isPending ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

// ─── Tab Centralización ───────────────────────────────────────────────

function TabCentralizacion({ config, isPending, startTransition, showMsg }: {
  config: Record<string, string>;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  showMsg: (t: "ok" | "error", m: string) => void;
}) {
  const secciones = [
    {
      titulo: "Libro de Ventas",
      campos: [
        { clave: "CENT_CTA_CLIENTES", label: "Cuenta Clientes (Activo)", default: "1-1-03-001" },
        { clave: "CENT_CTA_IVA_DEBITO", label: "Cuenta IVA Débito Fiscal", default: "2-1-06-001" },
        { clave: "CENT_CTA_VENTAS", label: "Cuenta Ingresos por Venta", default: "4-1-01-001" },
      ],
    },
    {
      titulo: "Libro de Compras",
      campos: [
        { clave: "CENT_CTA_PROVEEDORES", label: "Cuenta Proveedores (Pasivo)", default: "2-1-02-001" },
        { clave: "CENT_CTA_IVA_CREDITO", label: "Cuenta IVA Crédito Fiscal", default: "1-1-07-002" },
        { clave: "CENT_CTA_GASTOS", label: "Cuenta Gastos (por defecto)", default: "5-1-01-001" },
      ],
    },
    {
      titulo: "Libro de Honorarios",
      campos: [
        { clave: "CENT_CTA_HONORARIOS_GASTO", label: "Cuenta Gasto Honorarios", default: "5-1-02-001" },
        { clave: "CENT_CTA_RETENCION", label: "Cuenta Retención por Pagar", default: "2-1-05-001" },
        { clave: "CENT_CTA_HONORARIOS_PAGAR", label: "Cuenta Honorarios por Pagar", default: "2-1-03-001" },
      ],
    },
    {
      titulo: "Vouchers Transbank",
      campos: [
        { clave: "CENT_CTA_TRANSBANK_BANCO", label: "Cuenta Banco (depósito neto)", default: "1-1-01-002" },
        { clave: "CENT_CTA_TRANSBANK_COMISION", label: "Cuenta Comisión Transbank (gasto)", default: "5-1-04-001" },
        { clave: "CENT_CTA_TRANSBANK_IVA", label: "Cuenta IVA Crédito (comisión)", default: "1-1-07-002" },
        { clave: "CENT_CTA_TRANSBANK_VENTAS", label: "Cuenta Ventas/Clientes (contrapartida)", default: "4-1-01-001" },
      ],
    },
  ];

  const allCampos = secciones.flatMap((s) => s.campos);
  const [valores, setValores] = useState<Record<string, string>>(
    Object.fromEntries(allCampos.map((c) => [c.clave, config[c.clave] || c.default]))
  );

  const guardar = () => {
    startTransition(async () => {
      for (const [clave, valor] of Object.entries(valores)) {
        const res = await updateConfig(clave, valor);
        if (res.error) { showMsg("error", res.error); return; }
      }
      showMsg("ok", "Cuentas de centralización guardadas");
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-6">
      <div>
        <h3 className="font-semibold text-gray-900">Cuentas Contables de Centralización</h3>
        <p className="text-sm text-gray-500 mt-1">Estas cuentas se utilizan al centralizar los libros tributarios. Cada proveedor/cliente puede tener una regla específica en el módulo de centralización.</p>
      </div>

      {secciones.map((seccion) => (
        <div key={seccion.titulo}>
          <h4 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide mb-3 border-b border-indigo-100 pb-1">{seccion.titulo}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {seccion.campos.map((c) => (
              <div key={c.clave}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{c.label}</label>
                <input
                  value={valores[c.clave]}
                  onChange={(e) => setValores((p) => ({ ...p, [c.clave]: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                  placeholder={c.default}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-end pt-2">
        <button onClick={guardar} disabled={isPending} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          {isPending ? "Guardando..." : "Guardar cuentas"}
        </button>
      </div>
    </div>
  );
}

// ─── Tab Categorías Flujo ──────────────────────────────────────────────

const FLUJOS = [
  { key: "OPERACIONAL", label: "Actividades de Operación", color: "indigo" },
  { key: "INVERSION", label: "Actividades de Inversión", color: "amber" },
  { key: "FINANCIAMIENTO", label: "Actividades de Financiamiento", color: "emerald" },
] as const;

function TabCategorias({ categorias, isPending, startTransition, showMsg }: {
  categorias: Categoria[];
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  showMsg: (t: "ok" | "error", m: string) => void;
}) {
  const [editando, setEditando] = useState<Partial<Categoria> | null>(null);

  const guardar = () => {
    if (!editando?.codigo || !editando?.nombre || !editando?.tipo || !editando?.flujo) {
      showMsg("error", "Código, nombre, tipo y flujo son requeridos");
      return;
    }
    startTransition(async () => {
      const res = await upsertCategoriaFlujo({
        id: editando.id,
        codigo: editando.codigo!,
        nombre: editando.nombre!,
        tipo: editando.tipo!,
        flujo: editando.flujo!,
        orden: editando.orden || 0,
      });
      if (res.error) showMsg("error", res.error);
      else { showMsg("ok", "Categoría guardada"); setEditando(null); }
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Estado de Flujo de Efectivo (EFE)</h3>
            <p className="text-xs text-gray-500 mt-0.5">{categorias.filter((c) => c.estado === "S").length} categorías activas</p>
          </div>
          <button onClick={() => setEditando({ codigo: "", nombre: "", tipo: "EGRESO", flujo: "OPERACIONAL", orden: 0 })} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700">
            + Nueva categoría
          </button>
        </div>
      </div>

      {editando && (
        <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-4 sm:p-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">{editando.id ? "Editar categoría" : "Nueva categoría"}</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Código</label>
              <input value={editando.codigo || ""} onChange={(e) => setEditando((p) => ({ ...p, codigo: e.target.value }))} placeholder="1.01" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
            </div>
            <div className="col-span-2 sm:col-span-2">
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre</label>
              <input value={editando.nombre || ""} onChange={(e) => setEditando((p) => ({ ...p, nombre: e.target.value }))} placeholder="Cobranza clientes" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Flujo</label>
              <select value={editando.flujo || "OPERACIONAL"} onChange={(e) => setEditando((p) => ({ ...p, flujo: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {FLUJOS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Tipo</label>
              <select value={editando.tipo || "EGRESO"} onChange={(e) => setEditando((p) => ({ ...p, tipo: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="INGRESO">Ingreso</option>
                <option value="EGRESO">Egreso</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Orden</label>
              <input type="number" value={editando.orden || 0} onChange={(e) => setEditando((p) => ({ ...p, orden: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={guardar} disabled={isPending} className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {isPending ? "Guardando..." : "Guardar"}
            </button>
            <button onClick={() => setEditando(null)} className="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {FLUJOS.map((flujo) => {
        const items = categorias.filter((c) => c.flujo === flujo.key);
        if (items.length === 0) return null;
        const colorMap = { indigo: "border-indigo-200 bg-indigo-50", amber: "border-amber-200 bg-amber-50", emerald: "border-emerald-200 bg-emerald-50" };
        const headerColor = colorMap[flujo.color];
        return (
          <div key={flujo.key} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className={`px-4 sm:px-6 py-3 border-b ${headerColor}`}>
              <h4 className="text-sm font-semibold text-gray-800">{flujo.label}</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wider">
                    <th className="px-4 py-2.5 text-left font-medium w-20">Código</th>
                    <th className="px-4 py-2.5 text-left font-medium">Nombre</th>
                    <th className="px-4 py-2.5 text-center font-medium w-24">Tipo</th>
                    <th className="px-4 py-2.5 text-center font-medium w-16">Orden</th>
                    <th className="px-4 py-2.5 text-center font-medium w-20">Estado</th>
                    <th className="px-4 py-2.5 text-center font-medium w-32">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((c) => (
                    <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${c.estado !== "S" ? "opacity-40" : ""}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-indigo-700 font-semibold">{c.codigo}</td>
                      <td className="px-4 py-2.5 text-gray-900">{c.nombre}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${c.tipo === "INGRESO" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {c.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs text-gray-400">{c.orden}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${c.estado === "S" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          {c.estado === "S" ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setEditando(c)} className="px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded transition">Editar</button>
                          <button
                            onClick={() => startTransition(async () => {
                              const res = await toggleCategoriaFlujo(c.id, c.estado);
                              if (res.error) showMsg("error", res.error);
                              else showMsg("ok", c.estado === "S" ? "Desactivada" : "Activada");
                            })}
                            className={`px-2 py-1 text-xs rounded transition ${c.estado === "S" ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                          >
                            {c.estado === "S" ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab Tipos Documento ───────────────────────────────────────────────

function TabTiposDoc({ tiposDoc, isPending, startTransition, showMsg }: {
  tiposDoc: TipoDoc[];
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  showMsg: (t: "ok" | "error", m: string) => void;
}) {
  const [editando, setEditando] = useState<Partial<TipoDoc> | null>(null);

  const guardar = () => {
    if (!editando?.codigo || !editando?.nombre || !editando?.abreviatura || !editando?.clasificacion) {
      showMsg("error", "Todos los campos son requeridos");
      return;
    }
    startTransition(async () => {
      const res = await upsertTipoDocumento({
        id: editando.id,
        codigo: editando.codigo!,
        nombre: editando.nombre!,
        abreviatura: editando.abreviatura!,
        clasificacion: editando.clasificacion!,
        codigo_sii: editando.codigo_sii || 0,
        afecto_iva: editando.afecto_iva || "N",
        origen: editando.origen || "MANUAL",
      });
      if (res.error) showMsg("error", res.error);
      else { showMsg("ok", "Tipo documento guardado"); setEditando(null); }
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Tipos de Documento</h3>
        <button onClick={() => setEditando({ codigo: "", nombre: "", abreviatura: "", clasificacion: "VENTA", codigo_sii: 0, afecto_iva: "N", origen: "MANUAL" })} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700">
          + Nuevo
        </button>
      </div>

      {editando && (
        <div className="px-4 sm:px-6 py-4 bg-indigo-50 border-b border-indigo-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <input value={editando.codigo || ""} onChange={(e) => setEditando((p) => ({ ...p, codigo: e.target.value }))} placeholder="Código (FAC, NC...)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input value={editando.nombre || ""} onChange={(e) => setEditando((p) => ({ ...p, nombre: e.target.value }))} placeholder="Nombre completo" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input value={editando.abreviatura || ""} onChange={(e) => setEditando((p) => ({ ...p, abreviatura: e.target.value }))} placeholder="Abreviatura" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <select value={editando.clasificacion || "VENTA"} onChange={(e) => setEditando((p) => ({ ...p, clasificacion: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="VENTA">Venta</option>
              <option value="COMPRA">Compra</option>
              <option value="PAGO">Pago</option>
              <option value="HONORARIO">Honorario</option>
              <option value="INTERNO">Interno</option>
            </select>
            <input type="number" value={editando.codigo_sii || 0} onChange={(e) => setEditando((p) => ({ ...p, codigo_sii: Number(e.target.value) }))} placeholder="Código SII" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <select value={editando.afecto_iva || "N"} onChange={(e) => setEditando((p) => ({ ...p, afecto_iva: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="S">Afecto IVA</option>
              <option value="N">Exento IVA</option>
            </select>
            <select value={editando.origen || "MANUAL"} onChange={(e) => setEditando((p) => ({ ...p, origen: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="MANUAL">Manual</option>
              <option value="SII">SII</option>
              <option value="SISTEMA">Sistema</option>
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={guardar} disabled={isPending} className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50">
              {isPending ? "..." : "Guardar"}
            </button>
            <button onClick={() => setEditando(null)} className="text-gray-500 hover:text-gray-700 px-4 py-1.5 text-xs">Cancelar</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
              <th className="px-4 py-2.5 text-left font-medium">Código</th>
              <th className="px-4 py-2.5 text-left font-medium">Nombre</th>
              <th className="px-4 py-2.5 text-center font-medium">Clasif.</th>
              <th className="px-4 py-2.5 text-center font-medium">SII</th>
              <th className="px-4 py-2.5 text-center font-medium">IVA</th>
              <th className="px-4 py-2.5 text-center font-medium">Estado</th>
              <th className="px-4 py-2.5 text-center font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {tiposDoc.map((d) => (
              <tr key={d.id} className={`hover:bg-gray-50 ${d.estado !== "S" ? "opacity-40" : ""}`}>
                <td className="px-4 py-2 font-mono text-xs text-indigo-600 font-medium">{d.codigo}</td>
                <td className="px-4 py-2 text-gray-900">{d.nombre}</td>
                <td className="px-4 py-2 text-center text-xs text-gray-500">{d.clasificacion}</td>
                <td className="px-4 py-2 text-center font-mono text-xs text-gray-500">{d.codigo_sii || "-"}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-xs ${d.afecto_iva === "S" ? "text-blue-600" : "text-gray-400"}`}>
                    {d.afecto_iva === "S" ? "Afecto" : "Exento"}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.estado === "S" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {d.estado === "S" ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => setEditando(d)} className="px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded">Editar</button>
                    <button
                      onClick={() => startTransition(async () => {
                        const res = await toggleTipoDocumento(d.id, d.estado);
                        if (res.error) showMsg("error", res.error);
                        else showMsg("ok", d.estado === "S" ? "Desactivado" : "Activado");
                      })}
                      className={`px-2 py-1 text-xs rounded ${d.estado === "S" ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                    >
                      {d.estado === "S" ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab Planes ────────────────────────────────────────────────────────

function TabPlanes({ planes, isPending, startTransition, showMsg }: {
  planes: Plan[];
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  showMsg: (t: "ok" | "error", m: string) => void;
}) {
  const [editando, setEditando] = useState<Partial<Plan> | null>(null);

  const guardar = () => {
    if (!editando?.codigo || !editando?.nombre) {
      showMsg("error", "Código y nombre son requeridos");
      return;
    }
    startTransition(async () => {
      const res = await upsertPlan({
        id: editando.id,
        codigo: editando.codigo!,
        nombre: editando.nombre!,
        descripcion: editando.descripcion || "",
        valor_base: editando.valor_base || 0,
        moneda: editando.moneda || "UF",
      });
      if (res.error) showMsg("error", res.error);
      else { showMsg("ok", "Plan guardado"); setEditando(null); }
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Planes Comerciales</h3>
        <button onClick={() => setEditando({ codigo: "", nombre: "", descripcion: "", valor_base: 0, moneda: "UF" })} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700">
          + Nuevo
        </button>
      </div>

      {editando && (
        <div className="px-4 sm:px-6 py-4 bg-indigo-50 border-b border-indigo-100">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <input value={editando.codigo || ""} onChange={(e) => setEditando((p) => ({ ...p, codigo: e.target.value }))} placeholder="Código" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input value={editando.nombre || ""} onChange={(e) => setEditando((p) => ({ ...p, nombre: e.target.value }))} placeholder="Nombre" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input value={editando.descripcion || ""} onChange={(e) => setEditando((p) => ({ ...p, descripcion: e.target.value }))} placeholder="Descripción" className="border border-gray-300 rounded-lg px-3 py-2 text-sm col-span-2 sm:col-span-1" />
            <input type="number" step="0.1" value={editando.valor_base || 0} onChange={(e) => setEditando((p) => ({ ...p, valor_base: Number(e.target.value) }))} placeholder="Valor base" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <select value={editando.moneda || "UF"} onChange={(e) => setEditando((p) => ({ ...p, moneda: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="UF">UF</option>
              <option value="CLP">CLP</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={guardar} disabled={isPending} className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50">
              {isPending ? "..." : "Guardar"}
            </button>
            <button onClick={() => setEditando(null)} className="text-gray-500 hover:text-gray-700 px-4 py-1.5 text-xs">Cancelar</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
              <th className="px-4 py-2.5 text-left font-medium">Código</th>
              <th className="px-4 py-2.5 text-left font-medium">Nombre</th>
              <th className="px-4 py-2.5 text-left font-medium">Descripción</th>
              <th className="px-4 py-2.5 text-right font-medium">Valor Base</th>
              <th className="px-4 py-2.5 text-center font-medium">Moneda</th>
              <th className="px-4 py-2.5 text-center font-medium">Estado</th>
              <th className="px-4 py-2.5 text-center font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {planes.map((p) => (
              <tr key={p.id} className={`hover:bg-gray-50 ${p.estado !== "S" ? "opacity-40" : ""}`}>
                <td className="px-4 py-2 font-mono text-xs text-indigo-600 font-medium">{p.codigo}</td>
                <td className="px-4 py-2 text-gray-900 font-medium">{p.nombre}</td>
                <td className="px-4 py-2 text-gray-500 text-xs">{p.descripcion}</td>
                <td className="px-4 py-2 text-right font-mono font-medium text-gray-900">{p.valor_base}</td>
                <td className="px-4 py-2 text-center text-xs text-gray-500">{p.moneda}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.estado === "S" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {p.estado === "S" ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => setEditando(p)} className="px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded">Editar</button>
                    <button
                      onClick={() => startTransition(async () => {
                        const res = await togglePlan(p.id, p.estado);
                        if (res.error) showMsg("error", res.error);
                        else showMsg("ok", p.estado === "S" ? "Desactivado" : "Activado");
                      })}
                      className={`px-2 py-1 text-xs rounded ${p.estado === "S" ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                    >
                      {p.estado === "S" ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab Usuarios ─────────────────────────────────────────────────────

const ROLES = [
  { value: "admin", label: "Administrador", desc: "Acceso total al sistema" },
  { value: "contador", label: "Contador", desc: "Contabilidad y reportes" },
  { value: "comercial", label: "Comercial", desc: "Gestión de clientes y facturación" },
  { value: "consulta", label: "Consulta", desc: "Solo lectura" },
];

function TabUsuarios({ usuarios, isPending, startTransition, showMsg }: {
  usuarios: Usuario[];
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  showMsg: (t: "ok" | "error", m: string) => void;
}) {
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [form, setForm] = useState({ email: "", password: "", nombre: "", rol: "consulta" });

  const handleCrear = () => {
    if (!form.email || !form.password || !form.nombre) {
      showMsg("error", "Email, contraseña y nombre son requeridos");
      return;
    }
    if (form.password.length < 6) {
      showMsg("error", "La contraseña debe tener al menos 6 caracteres");
      return;
    }
    startTransition(async () => {
      const res = await crearUsuario(form);
      if (res.error) showMsg("error", res.error);
      else {
        showMsg("ok", "Usuario creado exitosamente");
        setCreando(false);
        setForm({ email: "", password: "", nombre: "", rol: "consulta" });
      }
    });
  };

  const handleEditar = () => {
    if (!editando) return;
    startTransition(async () => {
      const res = await actualizarUsuario(editando.id, { nombre: editando.nombre, rol: editando.rol });
      if (res.error) showMsg("error", res.error);
      else { showMsg("ok", "Usuario actualizado"); setEditando(null); }
    });
  };

  const handleToggle = (u: Usuario) => {
    startTransition(async () => {
      const res = await toggleUsuario(u.id, u.activo);
      if (res.error) showMsg("error", res.error);
      else showMsg("ok", u.activo ? "Usuario desactivado" : "Usuario activado");
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Usuarios del Sistema</h3>
          <p className="text-xs text-gray-500 mt-0.5">{usuarios.length} usuarios registrados</p>
        </div>
        <button onClick={() => { setCreando(true); setEditando(null); }}
          className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700 transition">
          + Nuevo usuario
        </button>
      </div>

      {/* Crear usuario */}
      {creando && (
        <div className="px-4 sm:px-6 py-5 bg-indigo-50/50 border-b border-indigo-100">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Nuevo usuario</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre</label>
              <input value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                placeholder="Nombre completo" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="usuario@empresa.cl" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Contraseña</label>
              <input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Mínimo 6 caracteres" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Rol</label>
              <select value={form.rol} onChange={(e) => setForm((p) => ({ ...p, rol: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400">
                {ROLES.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleCrear} disabled={isPending}
              className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition">
              {isPending ? "Creando..." : "Crear usuario"}
            </button>
            <button onClick={() => { setCreando(false); setForm({ email: "", password: "", nombre: "", rol: "consulta" }); }}
              className="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm transition">Cancelar</button>
          </div>
        </div>
      )}

      {/* Editar usuario */}
      {editando && (
        <div className="px-4 sm:px-6 py-5 bg-amber-50/50 border-b border-amber-100">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Editando: {editando.email}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre</label>
              <input value={editando.nombre} onChange={(e) => setEditando((p) => p ? { ...p, nombre: e.target.value } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-200 focus:border-amber-400" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Rol</label>
              <select value={editando.rol} onChange={(e) => setEditando((p) => p ? { ...p, rol: e.target.value } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-amber-200 focus:border-amber-400">
                {ROLES.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleEditar} disabled={isPending}
              className="bg-amber-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition">
              {isPending ? "Guardando..." : "Guardar cambios"}
            </button>
            <button onClick={() => setEditando(null)} className="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm transition">Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista de usuarios */}
      <div className="divide-y divide-gray-50">
        {usuarios.map((u) => {
          const rolInfo = ROLES.find((r) => r.value === u.rol) || ROLES[3];
          const initials = (u.nombre || u.email)[0].toUpperCase();
          return (
            <div key={u.id} className={`px-4 sm:px-6 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition ${!u.activo ? "opacity-50" : ""}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                u.rol === "admin" ? "bg-indigo-100 text-indigo-700" :
                u.rol === "contador" ? "bg-emerald-100 text-emerald-700" :
                u.rol === "comercial" ? "bg-amber-100 text-amber-700" :
                "bg-gray-100 text-gray-600"
              }`}>
                <span className="text-sm font-bold">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 text-sm">{u.nombre || "Sin nombre"}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    u.rol === "admin" ? "bg-indigo-100 text-indigo-700" :
                    u.rol === "contador" ? "bg-emerald-100 text-emerald-700" :
                    u.rol === "comercial" ? "bg-amber-100 text-amber-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {rolInfo.label}
                  </span>
                  {!u.activo && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Inactivo</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{u.email}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Creado: {new Date(u.created_at).toLocaleDateString("es-CL")}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => { setEditando(u); setCreando(false); }}
                  className="px-3 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 rounded-lg font-medium transition">
                  Editar
                </button>
                <button onClick={() => handleToggle(u)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition ${
                    u.activo ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"
                  }`}>
                  {u.activo ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {usuarios.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">No hay usuarios registrados</div>
      )}

      {/* Leyenda de roles */}
      <div className="px-4 sm:px-6 py-4 bg-gray-50 border-t border-gray-100">
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">Roles disponibles</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ROLES.map((r) => (
            <div key={r.value} className="text-xs">
              <span className="font-medium text-gray-700">{r.label}</span>
              <span className="text-gray-400 ml-1">— {r.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
