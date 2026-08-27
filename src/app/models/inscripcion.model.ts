export interface Estudiante {
  id?: string;
  codigo?: string;
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

  CORRECTAS?: number;
  INCORRECTAS?: number;
  EN_BLANCO?: number;
  PUNTAJE_FINAL?: number;
  ASISTENCIA?: string;
  FECHA_ASISTENCIA?: any;
  HORA_ENTREGA?: any;
  PUESTO?: number;
  BLANCO?: number;
}

export interface Inscripcion {
  id?: string;
  codigo?: string;
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

  TIEMPO?: number;
  tiempoInscripcion?: number;
  inicioInscripcion?: any;
  finInscripcion?: any;
}
export interface AsignacionAulaResumen {
  estudianteIndex: number;
  estudianteNombre: string;
  aulaId: string;
  codigoAula: string;
  turnoCodigo: string;
  grado: string;
  nivel: string;
}