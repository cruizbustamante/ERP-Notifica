import ModuleTabs from "@/components/ModuleTabs";

const TABS = [
  {
    group: "Análisis",
    tabs: [
      { label: "Dashboard", href: "/gestion/dashboard" },
      { label: "Estado Resultados", href: "/gestion/estado-resultados" },
      { label: "Situación Financiera", href: "/gestion/situacion-financiera" },
      { label: "Flujo Efectivo", href: "/gestion/flujo-efectivo" },
    ],
  },
  {
    group: "Indicadores",
    tabs: [
      { label: "Rentabilidad", href: "/gestion/rentabilidad" },
      { label: "Indicadores", href: "/gestion/indicadores" },
      { label: "Cartera", href: "/gestion/cartera" },
    ],
  },
];

export default function GestionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ModuleTabs groups={TABS} />
      {children}
    </div>
  );
}
