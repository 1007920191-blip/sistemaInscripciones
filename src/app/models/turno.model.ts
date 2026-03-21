export interface Turno {
  id?: string;
  codigo: string;
  fecha: Date;           // Fecha del día del examen
  horaInicioEntrada: string;
  horaFinEntrada: string;
  horaInicioPrueba: string;
  horaFinPrueba: string;
  nivel: 'Primaria' | 'Secundaria';
  grados: string[];      // Array de grados asignados a este turno
  estado?: 'activo' | 'inactivo';
  fechaCreacion?: Date;
}

export interface NivelGrado {
  nivel: 'Primaria' | 'Secundaria';
  grado: string;
}

// Opciones disponibles
export const NIVELES = ['Primaria', 'Secundaria'] as const;

export const GRADOS_POR_NIVEL = {
  'Primaria': ['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto'],
  'Secundaria': ['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto']
} as const;