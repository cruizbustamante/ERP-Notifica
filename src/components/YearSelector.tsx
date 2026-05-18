"use client";

import { useRouter, usePathname } from "next/navigation";

type Periodo = { anio: number; estado: string };

export default function YearSelector({ anio, periodos }: { anio: number; periodos: Periodo[] }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      value={anio}
      onChange={(e) => router.push(`${pathname}?anio=${e.target.value}`)}
      className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
    >
      {periodos.map((p) => (
        <option key={p.anio} value={p.anio}>
          {p.anio} {p.estado !== "ABIERTO" ? `(${p.estado})` : ""}
        </option>
      ))}
    </select>
  );
}
