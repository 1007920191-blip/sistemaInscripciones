export interface Configuracion {
  id?: string;
  nombreConcurso: string;
  edicion: string;
  eslogan: string;
  logoIzquierdo: string;
  logoDerecho: string;
  fondoCredencial: string;
  costoInscripcion: number;
  telefonoYape?: string;
  titularYape?: string;
  nombreCompletoTitularYape?: string;
  publicarResultados?: boolean;
  /** Si está activo, las aulas se llenan al 100% de su capacidad (si no, al 90%). */
  usarCapacidadCompleta?: boolean;
  /** Si está activo, el sistema online NO permite registrar nuevas inscripciones. */
  inscripcionesCerradas?: boolean;
  fechaActualizacion?: Date;
}