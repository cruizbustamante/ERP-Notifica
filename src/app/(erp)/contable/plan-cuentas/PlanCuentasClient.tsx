"use client";

import { useState, useMemo, useTransition } from "react";
import { crearCuenta, actualizarCuenta, toggleEstado } from "./actions";

export type Cuenta = {
  id: number;
  codigo: string;
  nombre: string;
  tipo: string;
  usa_auxiliar: string;
  usa_documento: string;
  conciliable: string;
  nivel: number;
  estado: string;
};

type CuentaNode = Cuenta & { children: CuentaNode[] };

function buildTree(cuentas: Cuenta[]): CuentaNode[] {
  const sorted = [...cuentas].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const roots: CuentaNode[] = [];
  const stack: CuentaNode[] = [];

  for (const c of sorted) {
    const node: CuentaNode = { ...c, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].nivel >= c.nivel) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }

  return roots;
}

function tipoFromCodigo(codigo: string): string {
  switch (codigo[0]) {
    case "1": return "A";
    case "2": return "P";
    case "3": return "T";
    case "4": return "I";
    case "7": return "G";
    default: return "A";
  }
}

function calcularNivel(codigo: string): number {
  const p = codigo.split("-");
  if (p.length !== 4) return 0;
  if (p[3] !== "000") return 4;
  if (p[2] !== "00") return 3;
  if (p[1] !== "0") return 2;
  return 1;
}

const TIPO_INFO: Record<string, { label: string; color: string }> = {
  A: { label: "Activo", color: "bg-blue-100 text-blue-700" },
  P: { label: "Pasivo", color: "bg-red-100 text-red-700" },
  T: { label: "Patrimonio", color: "bg-purple-100 text-purple-700" },
  I: { label: "Ingreso", color: "bg-green-100 text-green-700" },
  G: { label: "Gasto", color: "bg-amber-100 text-amber-700" },
};

type Props = { cuentas: Cuenta[] };

export default function PlanCuentasClient({ cuentas }: Props) {
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterEstado, setFilterEstado] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(cuentas.filter((c) => c.nivel < 4).map((c) => c.codigo))
  );
  const [showForm, setShowForm] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<Cuenta | null>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const filtered = useMemo(() => {
    if (!search && filterTipo === "all" && filterEstado === "all") {
      return cuentas;
    }

    const matchingLeaves = cuentas.filter((c) => {
      if (c.nivel !== 4) return false;
      if (filterTipo !== "all" && c.tipo !== filterTipo) return false;
      if (filterEstado !== "all" && c.estado !== filterEstado) return false;
      if (search) {
        const s = search.toLowerCase();
        return c.codigo.includes(s) || c.nombre.toLowerCase().includes(s);
      }
      return true;
    });

    const matchingHeaders = search
      ? cuentas.filter((c) => {
          if (c.nivel === 4) return false;
          if (filterTipo !== "all" && c.tipo !== filterTipo) return false;
          const s = search.toLowerCase();
          return c.codigo.includes(s) || c.nombre.toLowerCase().includes(s);
        })
      : [];

    const include = new Set<string>();

    for (const c of matchingLeaves) {
      include.add(c.codigo);
      const p = c.codigo.split("-");
      include.add(`${p[0]}-0-00-000`);
      include.add(`${p[0]}-${p[1]}-00-000`);
      include.add(`${p[0]}-${p[1]}-${p[2]}-000`);
    }

    for (const c of matchingHeaders) {
      include.add(c.codigo);
      const p = c.codigo.split("-");
      if (c.nivel >= 2) include.add(`${p[0]}-0-00-000`);
      if (c.nivel >= 3) include.add(`${p[0]}-${p[1]}-00-000`);
    }

    return cuentas.filter((c) => include.has(c.codigo));
  }, [cuentas, search, filterTipo, filterEstado]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  const stats = useMemo(
    () => ({
      total: cuentas.length,
      movimiento: cuentas.filter((c) => c.nivel === 4).length,
      activas: cuentas.filter((c) => c.estado === "S").length,
    }),
    [cuentas]
  );

  function toggleExpand(codigo: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  }

  function expandAll() {
    setExpanded(
      new Set(filtered.filter((c) => c.nivel < 4).map((c) => c.codigo))
    );
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function handleEdit(cuenta: Cuenta) {
    setEditingCuenta(cuenta);
    setShowForm(true);
  }

  function handleNew() {
    setEditingCuenta(null);
    setShowForm(true);
  }

  function handleToggleEstado(cuenta: Cuenta) {
    const nuevoEstado = cuenta.estado === "S" ? "N" : "S";
    startTransition(async () => {
      const result = await toggleEstado(cuenta.id, nuevoEstado);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({
          type: "success",
          text: `Cuenta ${nuevoEstado === "S" ? "activada" : "desactivada"}`,
        });
      }
      setTimeout(() => setMessage(null), 3000);
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 lg:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-gray-900">
              Plan de Cuentas
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Estructura contable jer&aacute;rquica X-X-XX-XXX
            </p>
          </div>
          <button
            onClick={handleNew}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition shrink-0"
          >
            + Nueva Cuenta
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-gray-900">{stats.total}</div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wide">
              Total
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-indigo-600">
              {stats.movimiento}
            </div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wide">
              Movimiento
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-green-600">
              {stats.activas}
            </div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wide">
              Activas
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código o nombre..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900"
          />
          <div className="flex gap-2">
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="all">Todos</option>
              <option value="A">Activo</option>
              <option value="P">Pasivo</option>
              <option value="T">Patrimonio</option>
              <option value="I">Ingreso</option>
              <option value="G">Gasto</option>
            </select>
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="all">Todas</option>
              <option value="S">Activas</option>
              <option value="N">Inactivas</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={expandAll}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Expandir todo
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={collapseAll}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Colapsar todo
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-xs text-gray-400">
            {filtered.length} cuentas
          </span>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Tree */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Desktop header */}
        <div className="hidden lg:grid lg:grid-cols-[160px_1fr_80px_50px_50px_50px_70px_100px] gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          <span>C&oacute;digo</span>
          <span>Nombre</span>
          <span>Tipo</span>
          <span className="text-center">Aux</span>
          <span className="text-center">Doc</span>
          <span className="text-center">Conc</span>
          <span className="text-center">Estado</span>
          <span className="text-center">Acciones</span>
        </div>

        <div className="divide-y divide-gray-100">
          {tree.map((node) => (
            <TreeNode
              key={node.codigo}
              node={node}
              depth={0}
              expanded={expanded}
              toggleExpand={toggleExpand}
              onEdit={handleEdit}
              onToggleEstado={handleToggleEstado}
              isPending={isPending}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            No se encontraron cuentas
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <CuentaForm
          cuenta={editingCuenta}
          onClose={() => {
            setShowForm(false);
            setEditingCuenta(null);
          }}
          onSuccess={(msg) => {
            setShowForm(false);
            setEditingCuenta(null);
            setMessage({ type: "success", text: msg });
            setTimeout(() => setMessage(null), 3000);
          }}
          onError={(msg) => {
            setMessage({ type: "error", text: msg });
            setTimeout(() => setMessage(null), 5000);
          }}
        />
      )}
    </div>
  );
}

/* ─── Tree Node ─── */

function TreeNode({
  node,
  depth,
  expanded,
  toggleExpand,
  onEdit,
  onToggleEstado,
  isPending,
}: {
  node: CuentaNode;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (codigo: string) => void;
  onEdit: (cuenta: Cuenta) => void;
  onToggleEstado: (cuenta: Cuenta) => void;
  isPending: boolean;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.codigo);
  const isLeaf = node.nivel === 4;
  const isHeader = node.nivel < 4;
  const tipoInfo = TIPO_INFO[node.tipo] || TIPO_INFO.A;

  const levelBg =
    node.nivel === 1
      ? "bg-gray-50"
      : node.nivel === 2
        ? "bg-gray-50/60"
        : node.nivel === 3
          ? "bg-gray-50/30"
          : "";

  return (
    <>
      {/* Desktop row */}
      <div
        className={`hidden lg:grid lg:grid-cols-[160px_1fr_80px_50px_50px_50px_70px_100px] gap-2 px-4 py-2 items-center text-sm ${levelBg} ${
          isHeader ? "font-medium" : "hover:bg-blue-50/40"
        } ${node.estado === "N" ? "opacity-40" : ""} ${
          hasChildren ? "cursor-pointer select-none" : ""
        }`}
        onClick={hasChildren ? () => toggleExpand(node.codigo) : undefined}
      >
        <div
          className="flex items-center gap-1.5 min-w-0"
          style={{ paddingLeft: depth * 20 }}
        >
          {hasChildren ? (
            <span className="text-[10px] text-gray-400 w-4 shrink-0">
              {isExpanded ? "▼" : "▶"}
            </span>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <span className="font-mono text-xs text-gray-500 truncate">
            {node.codigo}
          </span>
        </div>
        <span
          className={`truncate ${isHeader ? "text-gray-900" : "text-gray-700"}`}
        >
          {node.nombre}
        </span>
        <span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${tipoInfo.color}`}
          >
            {tipoInfo.label}
          </span>
        </span>
        <span className="text-center text-indigo-500">
          {node.usa_auxiliar === "X" ? "✓" : ""}
        </span>
        <span className="text-center text-indigo-500">
          {node.usa_documento === "X" ? "✓" : ""}
        </span>
        <span className="text-center text-indigo-500">
          {node.conciliable === "X" ? "✓" : ""}
        </span>
        <span className="text-center">
          {isLeaf && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                node.estado === "S"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {node.estado === "S" ? "Activa" : "Inactiva"}
            </span>
          )}
        </span>
        <div
          className="flex justify-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {isLeaf && (
            <>
              <button
                onClick={() => onEdit(node)}
                className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition"
              >
                Editar
              </button>
              <button
                onClick={() => onToggleEstado(node)}
                disabled={isPending}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition disabled:opacity-50"
              >
                {node.estado === "S" ? "Desact." : "Activar"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile row */}
      <div
        className={`lg:hidden px-3 py-2.5 ${levelBg} ${
          node.estado === "N" ? "opacity-40" : ""
        } ${hasChildren ? "active:bg-gray-100" : ""}`}
        onClick={hasChildren ? () => toggleExpand(node.codigo) : undefined}
      >
        <div
          className="flex items-start gap-2"
          style={{ paddingLeft: depth * 14 }}
        >
          {hasChildren ? (
            <span className="text-[10px] text-gray-400 mt-1 w-4 shrink-0">
              {isExpanded ? "▼" : "▶"}
            </span>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-gray-400">
                {node.codigo}
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${tipoInfo.color}`}
              >
                {node.tipo}
              </span>
            </div>
            <div
              className={`text-sm mt-0.5 ${
                isHeader ? "font-semibold text-gray-900" : "text-gray-700"
              }`}
            >
              {node.nombre}
            </div>
            {isLeaf && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {node.usa_auxiliar === "X" && (
                  <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                    Auxiliar
                  </span>
                )}
                {node.usa_documento === "X" && (
                  <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                    Documento
                  </span>
                )}
                {node.conciliable === "X" && (
                  <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                    Conciliable
                  </span>
                )}
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded ${
                    node.estado === "S"
                      ? "bg-green-50 text-green-600"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {node.estado === "S" ? "Activa" : "Inactiva"}
                </span>
              </div>
            )}
          </div>
          {isLeaf && (
            <div
              className="flex gap-0.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => onEdit(node)}
                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                onClick={() => onToggleEstado(node)}
                disabled={isPending}
                className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={
                      node.estado === "S"
                        ? "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                        : "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    }
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {isExpanded &&
        node.children.map((child) => (
          <TreeNode
            key={child.codigo}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            toggleExpand={toggleExpand}
            onEdit={onEdit}
            onToggleEstado={onToggleEstado}
            isPending={isPending}
          />
        ))}
    </>
  );
}

/* ─── Form Modal ─── */

function CuentaForm({
  cuenta,
  onClose,
  onSuccess,
  onError,
}: {
  cuenta: Cuenta | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isEdit = cuenta !== null;
  const [isPending, startTransition] = useTransition();

  const [seg1, setSeg1] = useState(cuenta?.codigo.split("-")[0] || "");
  const [seg2, setSeg2] = useState(cuenta?.codigo.split("-")[1] || "");
  const [seg3, setSeg3] = useState(cuenta?.codigo.split("-")[2] || "");
  const [seg4, setSeg4] = useState(cuenta?.codigo.split("-")[3] || "");
  const [nombre, setNombre] = useState(cuenta?.nombre || "");
  const [usaAuxiliar, setUsaAuxiliar] = useState(
    cuenta?.usa_auxiliar === "X"
  );
  const [usaDocumento, setUsaDocumento] = useState(
    cuenta?.usa_documento === "X"
  );
  const [conciliable, setConciliable] = useState(
    cuenta?.conciliable === "X"
  );

  const codigo = `${seg1}-${seg2}-${seg3}-${seg4}`;
  const tipo = seg1 ? tipoFromCodigo(codigo) : "";
  const nivel = seg1 ? calcularNivel(codigo) : 0;
  const tipoInfo = TIPO_INFO[tipo];
  const isValidCode = /^\d-\d-\d{2}-\d{3}$/.test(codigo);
  const isValid = (isEdit || isValidCode) && nombre.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        if (isEdit && cuenta) {
          const result = await actualizarCuenta(cuenta.id, {
            nombre: nombre.trim(),
            usa_auxiliar: usaAuxiliar ? "X" : "",
            usa_documento: usaDocumento ? "X" : "",
            conciliable: conciliable ? "X" : "",
          });
          if (result.error) onError(result.error);
          else onSuccess("Cuenta actualizada correctamente");
        } else {
          const result = await crearCuenta({
            codigo,
            nombre: nombre.trim(),
            tipo,
            usa_auxiliar: usaAuxiliar ? "X" : "",
            usa_documento: usaDocumento ? "X" : "",
            conciliable: conciliable ? "X" : "",
            nivel,
          });
          if (result.error) onError(result.error);
          else onSuccess("Cuenta creada correctamente");
        }
      } catch {
        onError("Error de conexión al servidor");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl lg:rounded-2xl w-full lg:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? "Editar Cuenta" : "Nueva Cuenta"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Código */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              C&oacute;digo
            </label>
            {isEdit ? (
              <div className="font-mono text-base text-gray-900 bg-gray-50 px-4 py-2.5 rounded-lg border border-gray-200">
                {cuenta.codigo}
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={seg1}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setSeg1(v);
                    if (v.length === 1)
                      (
                        document.getElementById("seg2") as HTMLInputElement
                      )?.focus();
                  }}
                  className="w-11 text-center px-1 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900"
                  placeholder="X"
                  autoFocus
                />
                <span className="text-gray-400 font-bold text-lg">-</span>
                <input
                  id="seg2"
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={seg2}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setSeg2(v);
                    if (v.length === 1)
                      (
                        document.getElementById("seg3") as HTMLInputElement
                      )?.focus();
                  }}
                  className="w-11 text-center px-1 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900"
                  placeholder="X"
                />
                <span className="text-gray-400 font-bold text-lg">-</span>
                <input
                  id="seg3"
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={seg3}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setSeg3(v);
                    if (v.length === 2)
                      (
                        document.getElementById("seg4") as HTMLInputElement
                      )?.focus();
                  }}
                  className="w-14 text-center px-1 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900"
                  placeholder="XX"
                />
                <span className="text-gray-400 font-bold text-lg">-</span>
                <input
                  id="seg4"
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  value={seg4}
                  onChange={(e) =>
                    setSeg4(e.target.value.replace(/\D/g, ""))
                  }
                  className="w-16 text-center px-1 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900"
                  placeholder="XXX"
                />
              </div>
            )}
            {!isEdit && seg1 && tipoInfo && (
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-medium ${tipoInfo.color}`}
                >
                  {tipoInfo.label}
                </span>
                <span className="text-xs text-gray-400">
                  Nivel {nivel}{" "}
                  {nivel === 4 ? "(Movimiento)" : nivel > 0 ? "(Cabecera)" : ""}
                </span>
              </div>
            )}
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900 uppercase"
              placeholder="Nombre de la cuenta"
              required
            />
          </div>

          {/* Attributes */}
          {(isEdit ? cuenta.nivel === 4 : nivel === 4) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Atributos
              </label>
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={usaAuxiliar}
                    onChange={(e) => setUsaAuxiliar(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-sm text-gray-700 font-medium">
                      Usa Auxiliar
                    </span>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Requiere RUT de contraparte (cliente, proveedor)
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={usaDocumento}
                    onChange={(e) => setUsaDocumento(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-sm text-gray-700 font-medium">
                      Usa Documento
                    </span>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Requiere tipo y n&uacute;mero de documento (facturas,
                      notas)
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={conciliable}
                    onChange={(e) => setConciliable(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-sm text-gray-700 font-medium">
                      Conciliable
                    </span>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Participa en conciliaci&oacute;n bancaria
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || !isValid}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {isPending
                ? "Guardando..."
                : isEdit
                  ? "Guardar Cambios"
                  : "Crear Cuenta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
