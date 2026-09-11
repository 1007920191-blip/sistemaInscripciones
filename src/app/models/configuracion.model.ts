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
  fechaActualizacion?: Date;
}