/**
 * Utilidades de RUT chileno.
 *
 * Formato almacenado (normalizado): sin puntos, con guion.  Ej: "12663589-3"
 * Formato display: con puntos y guion.  Ej: "12.663.589-3"
 */

/**
 * Normaliza un RUT eliminando puntos, conservando guion y digito verificador.
 * "12.663.589-3" -> "12663589-3"
 * Si el RUT ya esta limpio lo retorna igual.
 */
export function normalizeRut(rut: string): string {
  if (!rut) return "";
  return rut.replace(/\./g, "").trim();
}

/**
 * Formatea un RUT para display agregando puntos de miles.
 * "12663589-3" -> "12.663.589-3"
 */
export function formatRut(rut: string): string {
  if (!rut) return "";
  // Primero normalizar (asegurar que no tenga puntos previos)
  const clean = normalizeRut(rut);

  // Separar cuerpo y digito verificador
  const parts = clean.split("-");
  if (parts.length !== 2) return clean; // no tiene guion, devolver limpio

  const cuerpo = parts[0];
  const dv = parts[1];

  // Agregar puntos de miles al cuerpo
  const cuerpoConPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${cuerpoConPuntos}-${dv}`;
}
