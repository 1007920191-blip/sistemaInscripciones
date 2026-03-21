export interface Configuracion {
  id?: string;
  nombreConcurso: string;
  edicion: string;
  eslogan: string;
  logoIzquierdo: string;
  logoDerecho: string;
  fondoCredencial: string;
  costoInscripcion: number;
  fechaActualizacion?: Date;
}