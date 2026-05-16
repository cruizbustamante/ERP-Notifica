import ModuleTabs from "@/components/ModuleTabs";

const TABS = [
  {
    group: "Operaciones",
    tabs: [
      { label: "Comprobantes", href: "/contable/comprobantes" },
      { label: "Centralización", href: "/contable/centralizacion" },
      { label: "Conciliación", href: "/contable/conciliacion" },
    ],
  },
  {
    group: "Reportes",
    tabs: [
      { label: "Libro Diario", href: "/contable/libro-diario" },
      { label: "Libro Mayor", href: "/contable/libro-mayor" },
      { label: "Balance", href: "/contable/balance" },
      { label: "Libros Tributarios", href: "/contable/libros-tributarios" },
    ],
  },
  {
    group: "Configuración",
    tabs: [
      { label: "Plan de Cuentas", href: "/contable/plan-cuentas" },
      { label: "Cierre / Apertura", href: "/contable/cierre" },
    ],
  },
];

export default function ContableLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ModuleTabs groups={TABS} />
      {children}
    </div>
  );
}
