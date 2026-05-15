export default function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-indigo-950 text-white px-6 py-3 flex items-center gap-6">
        <a href="/" className="font-bold text-lg">Notifica Legal</a>
        <div className="flex gap-4 text-sm text-indigo-300">
          <a href="/dashboard" className="hover:text-white transition">Dashboard</a>
          <a href="/contabilidad" className="hover:text-white transition">Contabilidad</a>
          <a href="/conciliacion" className="hover:text-white transition">Conciliación</a>
          <a href="/centralizacion" className="hover:text-white transition">Centralización</a>
          <a href="/clientes" className="hover:text-white transition">Clientes</a>
          <a href="/reportes" className="hover:text-white transition">Reportes</a>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
