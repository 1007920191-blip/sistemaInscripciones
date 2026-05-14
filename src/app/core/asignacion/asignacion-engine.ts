// src/app/core/asignacion/asignacion-engine.ts
// Motor puro de asignación. Sin dependencias de Angular ni Firebase.

export type ModoAsignacion = 'normal' | 'contingencia';

export interface AulaAsignable {
  id: string;
  grado: string;
  nivel: 'Primaria' | 'Secundaria';
  capacidad: number;
  estudiantes: number;
  porColegio: Record<string, number>;
}

export interface SolicitudInscripcion {
  grado: string;
  nivel: 'Primaria' | 'Secundaria';
  colegioId: string;
  cantidad: number;
}

export interface ResultadoSimulacion {
  exito: boolean;
  asignaciones: { aulaId: string; cantidad: number }[];
  restante: number;
  mensaje?: string;
  nuevaAulaRequerida?: boolean;
  aulaSugerida?: {
    id: string;
    codigo: string;
    espacioDisponible: number;
    inscritosActuales: number;
    capacidad: number;
  };
}

export class AsignacionEngine {
  private readonly LIMITE_OPERATIVO = 0.9;
  private readonly MAX_POR_COLEGIO = 0.5;
  private readonly CAPACIDAD_DEFAULT = 30;
  private readonly MAX_AULAS = 9;

  simularNormal(
    aulasExistentes: AulaAsignable[],
    solicitud: SolicitudInscripcion
  ): ResultadoSimulacion {
    const limiteOperativo = Math.floor(this.CAPACIDAD_DEFAULT * this.LIMITE_OPERATIVO);
    
    const aulasValidas = aulasExistentes.filter(a => 
      a.grado === solicitud.grado &&
      a.nivel === solicitud.nivel &&
      this.puedeAsignar(a, solicitud.colegioId, solicitud.cantidad, limiteOperativo)
    );

    if (aulasValidas.length > 0) {
      aulasValidas.sort((a, b) => 
        (limiteOperativo - a.estudiantes) - (limiteOperativo - b.estudiantes)
      );
      
      const aula = aulasValidas[0];
      return {
        exito: true,
        asignaciones: [{ aulaId: aula.id, cantidad: solicitud.cantidad }],
        restante: 0,
        aulaSugerida: {
          id: aula.id,
          codigo: 'Aula existente',
          espacioDisponible: limiteOperativo - aula.estudiantes,
          inscritosActuales: aula.estudiantes,
          capacidad: aula.capacidad
        }
      };
    }

    const aulasDelGrado = aulasExistentes.filter(a => a.grado === solicitud.grado);
    if (aulasDelGrado.length >= this.MAX_AULAS) {
      return {
        exito: false,
        asignaciones: [],
        restante: solicitud.cantidad,
        mensaje: `Límite de ${this.MAX_AULAS} aulas alcanzado para ${solicitud.grado}`
      };
    }

    return {
      exito: true,
      asignaciones: [{ aulaId: '__NUEVA__', cantidad: solicitud.cantidad }],
      restante: 0,
      nuevaAulaRequerida: true,
      mensaje: `Se abrirá nueva aula para ${solicitud.grado}`,
      aulaSugerida: {
        id: '__NUEVA__',
        codigo: 'Nueva aula',
        espacioDisponible: this.CAPACIDAD_DEFAULT,
        inscritosActuales: 0,
        capacidad: this.CAPACIDAD_DEFAULT
      }
    };
  }

  simularContingencia(
    aulasExistentes: AulaAsignable[],
    solicitud: SolicitudInscripcion
  ): ResultadoSimulacion {
    const aulasGrado = aulasExistentes.filter(a => 
      a.grado === solicitud.grado &&
      a.nivel === solicitud.nivel &&
      a.estudiantes < a.capacidad
    );

    if (aulasGrado.length === 0) {
      return {
        exito: false,
        asignaciones: [],
        restante: solicitud.cantidad,
        mensaje: `Sin espacio en contingencia para ${solicitud.grado}`
      };
    }

    aulasGrado.sort((a, b) => a.estudiantes - b.estudiantes);

    let restante = solicitud.cantidad;
    const asignaciones: { aulaId: string; cantidad: number }[] = [];
    let aulaSugeridaPrincipal: any = null;

    for (const aula of aulasGrado) {
      if (restante <= 0) break;
      
      const espacioReal = aula.capacidad - aula.estudiantes;
      if (espacioReal <= 0) continue;

      const limiteColegio = Math.floor(aula.capacidad * this.MAX_POR_COLEGIO);
      const actualColegio = aula.porColegio[solicitud.colegioId] || 0;
      const espacioColegio = limiteColegio - actualColegio;
      
      const aAsignar = Math.min(restante, espacioReal, espacioColegio);

      if (aAsignar > 0) {
        asignaciones.push({ aulaId: aula.id, cantidad: aAsignar });
        if (!aulaSugeridaPrincipal) {
          aulaSugeridaPrincipal = {
            id: aula.id,
            codigo: 'Aula existente',
            espacioDisponible: espacioReal,
            inscritosActuales: aula.estudiantes,
            capacidad: aula.capacidad
          };
        }
        restante -= aAsignar;
      }
    }

    return {
      exito: restante === 0,
      asignaciones,
      restante,
      mensaje: restante > 0 
        ? `${restante} estudiante(s) quedarían sin aula` 
        : undefined,
      aulaSugerida: aulaSugeridaPrincipal || undefined
    };
  }

  private puedeAsignar(
    aula: AulaAsignable, 
    colegioId: string, 
    cantidad: number, 
    limite: number
  ): boolean {
    if (aula.estudiantes + cantidad > limite) return false;
    const limiteColegio = Math.floor(aula.capacidad * this.MAX_POR_COLEGIO);
    const actualColegio = aula.porColegio[colegioId] || 0;
    if (actualColegio + cantidad > limiteColegio) return false;
    return true;
  }
}