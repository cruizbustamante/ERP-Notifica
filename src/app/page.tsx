export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 to-indigo-800 flex items-center justify-center">
      <div className="text-center text-white">
        <h1 className="text-4xl font-bold mb-2">Notifica Legal ERP</h1>
        <p className="text-indigo-300 text-lg">Sistema Contable Integrado</p>
        <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl">
          {[
            { name: "Dashboard", href: "/dashboard" },
            { name: "Contabilidad", href: "/contabilidad" },
            { name: "Conciliación", href: "/conciliacion" },
            { name: "Centralización", href: "/centralizacion" },
            { name: "Clientes", href: "/clientes" },
            { name: "Reportes", href: "/reportes" },
          ].map((mod) => (
            <a
              key={mod.href}
              href={mod.href}
              className="bg-white/10 hover:bg-white/20 transition rounded-xl p-4 text-sm font-medium"
            >
              {mod.name}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
