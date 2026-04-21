export interface Turno {
  id?: string;
  codigo: string;
  fecha: Date;
  horaInicioEntrada: string;
  horaFinEntrada: string;
  horaInicioPrueba: string;
  horaFinPrueba: string;
  nivel: 'Primaria' | 'Secundaria';        // Compatibilidad
  grados: string[];                        // Compatibilidad
  nivelesGrados?: NivelGrado[];           // ← NUEVO: Guardar pares nivel-grado
  estado?: 'activo' | 'inactivo';
  fechaCreacion?: Date;
  fechaActualizacion?: Date;
}

export interface NivelGrado {
  nivel: 'Primaria' | 'Secundaria';
  grado: string;
}

export const NIVELES = ['Primaria', 'Secundaria'] as const;

export const GRADOS_POR_NIVEL = {
  'Primaria': ['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto'],
  'Secundaria': ['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto']
} as const;

export interface TurnoAulaAsignada {
  id?: string;
  turnoId: string;           // ID del turno (T1, T2, etc.)
  aulaId: string;            // ID del aula (referencia a la colección Aulas)
  codigoAula: string;        // Código del aula (A1, B1, etc.)
  grado: string;             // PRIMERO, SEGUNDO, etc.
  nivel: 'Primaria' | 'Secundaria';
  inscritos: number;         // Inicia en 0
  capacidad: number;         // Copiado del aula
  local: string;            // I.E. BELEN DE OSMA Y PARDO
  pabellon: string;
  piso: number;
  puertaAcceso: string;
  sede: string;              // ANDAHUAYLAS
  fechaCreacion?: Date;
}

// Interfaz para mostrar en la tabla del modal
export interface AulaTurnoDisplay {
  id: string;                // ID del documento en turnosedicion
  aulaId: string;            // ID del aula original
  codigo: string;            // B1, A1, etc.
  inscritos: number;
  capacidad: number;
  grado: string;
  nivel: string;
  local: string;
  pabellon: string;
  piso: number;
  puertaAcceso: string;
  sede: string;
  turnoId: string;
}