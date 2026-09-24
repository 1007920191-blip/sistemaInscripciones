/** Comparte la regla de compatibilidad entre el preview y la asignación real. */
export function esCompatibleConGradosPermitidos(
  gradosPermitidos: string[] | undefined,
  grado: string,
  nivel: string
): boolean {
  // La ausencia del campo conserva el comportamiento legado.
  if (!Array.isArray(gradosPermitidos)) return false;
  // Un arreglo vacío es una configuración explícita sin compatibilidades.
  if (gradosPermitidos.length === 0) return false;

  const solicitado = normalizarClaveGradoNivel(grado, nivel);
  return gradosPermitidos.some(valor => normalizarClave(valor) === solicitado);
}

function normalizarClaveGradoNivel(grado: string, nivel: string): string {
  return normalizarClave(`${grado} ${nivel}`);
}

function normalizarClave(valor: string): string {
  return String(valor || '').trim().replace(/\s+/g, ' ').toUpperCase();
}
