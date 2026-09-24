// src/app/services/asignacion-preview.service.ts
import { Injectable } from '@angular/core';
import { AsignacionService } from './asignacion.service';
import { TurnoGestionService } from './turno-gestion.service';
import { 
  AsignacionEngine, 
  AulaFisicaDisponible,
  SolicitudInscripcion,
  ResultadoSimulacion 
} from '../core/asignacion/asignacion-engine';
import { Turno, ModoAsignacion } from '../models/turno.model';
import { Estudiante } from '../models/inscripcion.model';
import { TurnoAulaService } from './turno-aula.service';

export interface PreviewAsignacion {
  estudiante: Estudiante;
  modo: ModoAsignacion;
  sugerencia: {
    aulaId?: string;
    codigoAula?: string;
    espacioDisponible: number;
    inscritosActuales: number;
    capacidad: number;
    mensaje: string;
    exito: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class AsignacionPreviewService {
  private engine = new AsignacionEngine();

  constructor(
    private asignacionService: AsignacionService,
    private turnoGestion: TurnoGestionService,
    private turnoAulaService: TurnoAulaService
  ) {}

  /**
   * Genera preview para UN estudiante específico en su turno
   */
  async generarPreviewParaEstudiante(
    turno: Turno,
    estudiante: Estudiante,
    colegioId: string,
    modo: ModoAsignacion
  ): Promise<PreviewAsignacion> {
    
    const aulas = await this.asignacionService.obtenerAulasParaAsignacion(turno.id || turno.codigo);
    const aulasFisicas = turno.id ? await this.obtenerAulasFisicasDisponibles(turno.id) : [];
    
    const solicitud: SolicitudInscripcion = {
      grado: this.normalizarGrado(estudiante.grado),
      nivel: estudiante.nivel as 'Primaria' | 'Secundaria',
      colegioId,
      cantidad: 1
    };

    let resultado: ResultadoSimulacion;
    
    if (modo === 'normal') {
      resultado = this.engine.simularNormal(aulas, solicitud, aulasFisicas);
    } else {
      resultado = this.engine.simularContingencia(aulas, solicitud);
    }

    return {
      estudiante,
      modo,
      sugerencia: {
        aulaId: resultado.aulaSugerida?.id,
        codigoAula: resultado.aulaSugerida?.codigo,
        espacioDisponible: resultado.aulaSugerida?.espacioDisponible || 0,
        inscritosActuales: resultado.aulaSugerida?.inscritosActuales || 0,
        capacidad: resultado.aulaSugerida?.capacidad ?? 30,
        mensaje: resultado.mensaje || (resultado.exito ? `Aula asignada: ${resultado.aulaSugerida?.codigo || 'Nueva aula'}` : 'No se puede asignar'),
        exito: resultado.exito
      }
    };
  }

  /**
   * Genera preview para múltiples estudiantes (mismo grado/turno)
   */
  async generarPreview(
    turno: Turno,
    estudiantes: Estudiante[],
    colegioId: string
  ): Promise<PreviewAsignacion[]> {
    
    const modo = await this.turnoGestion.determinarModoActual(turno);
    const aulas = await this.asignacionService.obtenerAulasParaAsignacion(turno.id || turno.codigo);
    const aulasFisicas = turno.id ? await this.obtenerAulasFisicasDisponibles(turno.id) : [];
    
    const previews: PreviewAsignacion[] = [];

    for (const estudiante of estudiantes) {
      const solicitud: SolicitudInscripcion = {
        grado: this.normalizarGrado(estudiante.grado),
        nivel: estudiante.nivel as 'Primaria' | 'Secundaria',
        colegioId,
        cantidad: 1
      };

      let resultado: ResultadoSimulacion;
      
      if (modo === 'normal') {
        resultado = this.engine.simularNormal(aulas, solicitud, aulasFisicas);
      } else {
        resultado = this.engine.simularContingencia(aulas, solicitud);
      }

      // Actualizar aulas en memoria para siguiente estudiante
      if (resultado.exito && resultado.asignaciones.length > 0) {
        const asig = resultado.asignaciones[0];
        if (asig.aulaId !== '__NUEVA__') {
          const aula = aulas.find(a => a.id === asig.aulaId);
          if (aula) {
            aula.estudiantes += asig.cantidad;
            aula.porColegio[colegioId] = (aula.porColegio[colegioId] || 0) + asig.cantidad;
          }
        } else {
          const aulaFisicaId = resultado.aulaSugerida?.aulaFisicaId;
          const indiceFisica = aulasFisicas.findIndex(a => a.id === aulaFisicaId);
          const aulaFisica = indiceFisica >= 0 ? aulasFisicas.splice(indiceFisica, 1)[0] : undefined;
          aulas.push({
            id: '__NUEVA_SIM__',
            grado: this.normalizarGrado(estudiante.grado),
            codigo: aulaFisica?.codigo,
            nivel: estudiante.nivel as 'Primaria' | 'Secundaria',
          capacidad: aulaFisica?.capacidad ?? 30,
            estudiantes: 1,
            porColegio: { [colegioId]: 1 },
            gradosPermitidos: aulaFisica?.gradosPermitidos
          });
        }
      }

      previews.push({
        estudiante,
        modo,
        sugerencia: {
          aulaId: resultado.aulaSugerida?.id,
          codigoAula: resultado.aulaSugerida?.codigo,
          espacioDisponible: resultado.aulaSugerida?.espacioDisponible || 0,
          inscritosActuales: resultado.aulaSugerida?.inscritosActuales || 0,
          capacidad: resultado.aulaSugerida?.capacidad ?? 30,
          mensaje: resultado.mensaje || (resultado.exito ? 'Listo para asignar' : 'No se puede asignar'),
          exito: resultado.exito
        }
      });
    }

    return previews;
  }

  private normalizarGrado(grado: string): string {
    const lower = grado.toLowerCase().trim();
    const numeroMatch = lower.match(/(\d+)/);
    const numero = numeroMatch ? numeroMatch[1] : '';
    
    const mapaNumeros: Record<string, string> = {
      '1': 'Primero', '2': 'Segundo', '3': 'Tercero',
      '4': 'Cuarto', '5': 'Quinto', '6': 'Sexto'
    };
    
    return mapaNumeros[numero] || grado;
  }

  private async obtenerAulasFisicasDisponibles(turnoId: string): Promise<AulaFisicaDisponible[]> {
    const aulas = await this.turnoAulaService.obtenerAulasDisponibles(turnoId);
    return aulas
      .filter(aula => !!aula.id)
      .map(aula => ({
        id: aula.id!,
        codigo: aula.codigo,
        capacidad: aula.capacidad,
        gradosPermitidos: aula.gradosPermitidos
      }));
  }
}
