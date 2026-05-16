export const TIPOS_COMPROBANTE: Record<
  string,
  { label: string; short: string; color: string }
> = {
  I: { label: "Ingreso", short: "ING", color: "bg-green-100 text-green-700" },
  E: { label: "Egreso", short: "EGR", color: "bg-red-100 text-red-700" },
  T: { label: "Traspaso", short: "TRA", color: "bg-blue-100 text-blue-700" },
  A: {
    label: "Apertura",
    short: "APE",
    color: "bg-purple-100 text-purple-700",
  },
  C: { label: "Cierre", short: "CIE", color: "bg-gray-200 text-gray-700" },
};

export function formatMonto(n: number): string {
  return "$" + new Intl.NumberFormat("es-CL").format(Math.round(n));
}

export function formatNumero(n: number): string {
  return new Intl.NumberFormat("es-CL").format(Math.round(n));
}

export function esCuentaDeMovimiento(codigo: string): boolean {
  const p = codigo.split("-");
  return p.length === 4 && p[2] !== "00" && p[3] !== "000";
}

export function esDeudor(tipo: string): boolean {
  return tipo === "A" || tipo === "G";
}

export const MESES = [
  "",
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
