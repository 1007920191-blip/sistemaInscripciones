export interface Estudiante {
  id?: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  nivel: string;
  grado: string;
  colegio: any;
  fechaRegistro: Date;
}

export interface Inscripcion {
  id?: string;
  colegio: any;
  metodoPago: string;
  cantidadEstudiantes: number;
  montoTotal: number;
  telefonoApoderado: string;
  estudiantes: Estudiante[];
  fechaInscripcion: Date;
  estado: 'pendiente' | 'completada' | 'cancelada';
}