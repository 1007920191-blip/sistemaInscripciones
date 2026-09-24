/**
 * Regla única de compatibilidad grado+nivel para `gradosPermitidos`.
 * La comparten el preview (engine), la asignación real y el selector manual.
 */

/**
 * Compatibilidad de un aula con un par grado+nivel.
 *
 * - Arreglo con valores: compatible solo si `"${grado} ${nivel}"` está listado.
 * - Arreglo vacío (`[]`): el aula no es compatible con ningún grado.
 * - `undefined` (o un valor que no es arreglo): comportamiento legacy.
 *
 * Para copias operativas de `turnosedicion` que no definen el campo, el valor
 * debe resolverse ANTES con `gradosPermitidosEfectivos()` contra el aula
 * maestra, de modo que un `undefined` aquí signifique "tampoco la maestra lo
 * define" y no "la copia no lo define".
 */
export function esCompatibleConGradosPermitidos(
  gradosPermitidos: string[] | undefined,
  grado: string,
  nivel: string
): boolean {
  // Sin campo: comportamiento legacy, para no inutilizar aulas existentes.
  if (!Array.isArray(gradosPermitidos)) return true;
  // Un arreglo vacío es una configuración explícita sin compatibilidades.
  if (gradosPermitidos.length === 0) return false;

  const solicitado = normalizarClaveGradoNivel(grado, nivel);
  return gradosPermitidos.some(valor => normalizarClave(valor) === solicitado);
}

/**
 * Valor efectivo de `gradosPermitidos` para una copia operacional.
 *
 * - Si la copia ya define el campo (incluido `[]`), se respeta tal cual: es el
 *   snapshot que tenía cuando fue creada y no se sobrescribe con cambios
 *   posteriores del aula maestra.
 * - Si la copia no lo define (fue creada antes de esta funcionalidad), se usa
 *   la configuración actual del aula maestra.
 * - Si la maestra tampoco lo define, se devuelve `undefined` (legacy).
 *
 * Es una función pura: el llamador es el que consulta la maestra.
 */
export function gradosPermitidosEfectivos(
  gradosPermitidosCopia: string[] | undefined,
  gradosPermitidosMaestra: string[] | undefined
): string[] | undefined {
  return gradosPermitidosCopia !== undefined ? gradosPermitidosCopia : gradosPermitidosMaestra;
}

function normalizarClaveGradoNivel(grado: string, nivel: string): string {
  return normalizarClave(`${grado} ${nivel}`);
}

function normalizarClave(valor: string): string {
  return String(valor || '').trim().replace(/\s+/g, ' ').toUpperCase();
}
