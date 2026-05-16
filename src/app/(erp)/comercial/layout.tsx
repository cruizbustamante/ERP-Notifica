import ModuleTabs from "@/components/ModuleTabs";

const TABS = [
  {
    group: "Clientes",
    tabs: [
      { label: "Ficha Clientes", href: "/comercial/clientes" },
      { label: "Suscripciones", href: "/comercial/suscripciones" },
    ],
  },
  {
    group: "Facturación",
    tabs: [
      { label: "Documentos", href: "/comercial/facturacion" },
      { label: "Cuentas por Cobrar", href: "/comercial/cxc" },
      { label: "Cuentas por Pagar", href: "/comercial/cxp" },
    ],
  },
  {
    group: "Cobranza",
    tabs: [
      { label: "Gestión Cobranza", href: "/comercial/cobranza" },
    ],
  },
];

export default function ComercialLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ModuleTabs groups={TABS} />
      {children}
    </div>
  );
}
