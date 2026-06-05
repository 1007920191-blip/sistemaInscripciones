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

  aulaAsignadaId?: string;
  codigoAula?: string;
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

  turnoId: string;
  turnoCodigo: string;
  
  // NUEVO: Resumen de asignaciones
  asignacionesAula?: AsignacionAulaResumen[];

  // Optimización de consultas y multiusuario
  fechaTexto?: string;
  usuarioId?: string;
}
export interface AsignacionAulaResumen {
  estudianteIndex: number;
  estudianteNombre: string;
  aulaId: string;
  codigoAula: string;
  grado: string;
  nivel: string;
}