// src/app/core/asignacion/asignacion-engine.ts
// Motor puro de asignación. Sin dependencias de Angular ni Firebase.
import { esCompatibleConGradosPermitidos } from './grados-permitidos';

export type ModoAsignacion = 'normal' | 'contingencia';

export interface AulaAsignable {
  id: string;
  codigo?: string;
  grado: string;
  nivel: 'Primaria' | 'Secundaria';
  capacidad: number;
  estudiantes: number;
  porColegio: Record<string, number>;
  gradosPermitidos?: string[];
}

export interface AulaFisicaDisponible {
  id: string;
  codigo?: string;
  capacidad: number;
  gradosPermitidos?: string[];
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
    aulaFisicaId?: string;
  };
}

export class AsignacionEngine {
  private readonly LIMITE_OPERATIVO = 0.9;
  private readonly MAX_POR_COLEGIO = 0.5;
  private readonly CAPACIDAD_DEFAULT = 30;
  private readonly MAX_AULAS = 9;

  private capacidadDe(capacidad: number): number {
    return Number.isFinite(capacidad) && capacidad >= 0 ? capacidad : this.CAPACIDAD_DEFAULT;
  }

  simularNormal(
    aulasExistentes: AulaAsignable[],
    solicitud: SolicitudInscripcion,
    aulasFisicasDisponibles: AulaFisicaDisponible[] = []
  ): ResultadoSimulacion {
    const limiteOperativo = (capacidad: number) =>
      Math.min(capacidad, Math.max(1, Math.floor(capacidad * this.LIMITE_OPERATIVO)));
    
    const aulasValidas = aulasExistentes.filter(a => 
      a.grado === solicitud.grado &&
      a.nivel === solicitud.nivel &&
      esCompatibleConGradosPermitidos(a.gradosPermitidos, solicitud.grado, solicitud.nivel) &&
      this.puedeAsignar(a, solicitud.colegioId, solicitud.cantidad, limiteOperativo(this.capacidadDe(a.capacidad)))
    );

    if (aulasValidas.length > 0) {
      aulasValidas.sort((a, b) => {
        const aLimite = limiteOperativo(this.capacidadDe(a.capacidad));
        const bLimite = limiteOperativo(this.capacidadDe(b.capacidad));
        return (b.estudiantes / bLimite) - (a.estudiantes / aLimite);
      });
      
      const aula = aulasValidas[0];
      return {
        exito: true,
        asignaciones: [{ aulaId: aula.id, cantidad: solicitud.cantidad }],
        restante: 0,
        aulaSugerida: {
          id: aula.id,
          codigo: aula.codigo || 'Aula existente',
          espacioDisponible: limiteOperativo(this.capacidadDe(aula.capacidad)) - aula.estudiantes,
          inscritosActuales: aula.estudiantes,
          capacidad: aula.capacidad
        }
      };
    }

    if (aulasExistentes.length >= this.MAX_AULAS) {
      return {
        exito: false,
        asignaciones: [],
        restante: solicitud.cantidad,
        mensaje: `No hay aulas disponibles para ${solicitud.grado} ${solicitud.nivel}. Se alcanzó el límite de ${this.MAX_AULAS} aulas; habilite otra aula compatible para continuar.`
      };
    }

    const aulaFisicaCompatible = aulasFisicasDisponibles.find(a =>
      a.capacidad >= 1 && esCompatibleConGradosPermitidos(a.gradosPermitidos, solicitud.grado, solicitud.nivel)
    );
    if (!aulaFisicaCompatible) {
      return {
        exito: false,
        asignaciones: [],
        restante: solicitud.cantidad,
        mensaje: `No hay aulas físicas compatibles disponibles para ${solicitud.grado} ${solicitud.nivel}`
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
        codigo: aulaFisicaCompatible.codigo || 'Nueva aula',
        espacioDisponible: this.capacidadDe(aulaFisicaCompatible.capacidad),
        inscritosActuales: 0,
        capacidad: this.capacidadDe(aulaFisicaCompatible.capacidad),
        aulaFisicaId: aulaFisicaCompatible.id
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
      esCompatibleConGradosPermitidos(a.gradosPermitidos, solicitud.grado, solicitud.nivel) &&
      a.estudiantes < this.capacidadDe(a.capacidad)
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
      
      const capacidad = this.capacidadDe(aula.capacidad);
      const espacioReal = capacidad - aula.estudiantes;
      if (espacioReal <= 0) continue;

      const limiteColegio = Math.floor(capacidad * this.MAX_POR_COLEGIO);
      const actualColegio = aula.porColegio[solicitud.colegioId] || 0;
      const espacioColegio = limiteColegio - actualColegio;
      
      const aAsignar = Math.min(restante, espacioReal, espacioColegio);

      if (aAsignar > 0) {
        asignaciones.push({ aulaId: aula.id, cantidad: aAsignar });
        if (!aulaSugeridaPrincipal) {
          aulaSugeridaPrincipal = {
            id: aula.id,
            codigo: aula.codigo || 'Aula existente',
            espacioDisponible: espacioReal,
            inscritosActuales: aula.estudiantes,
            capacidad
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
    const limiteColegio = Math.floor(this.CAPACIDAD_DEFAULT * this.MAX_POR_COLEGIO);
    const actualColegio = aula.porColegio[colegioId] || 0;
    if (actualColegio + cantidad > limiteColegio) return false;
    return true;
  }

}
