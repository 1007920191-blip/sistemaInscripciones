// src/app/services/asignacion.service.ts
import { Injectable } from '@angular/core';
import { 
  getFirestore, 
  runTransaction,
  doc,
  getDoc,
  addDoc,
  collection,
  Timestamp,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { firebaseApp } from '../firebase-config';
import { Turno, TurnoAulaAsignada, ModoAsignacion } from '../models/turno.model';
import { Estudiante } from '../models/inscripcion.model';
import { Aula } from '../models/aula.model';
import { AsignacionEngine, AulaAsignable, SolicitudInscripcion } from '../core/asignacion/asignacion-engine';
import { esCompatibleConGradosPermitidos } from '../core/asignacion/grados-permitidos';

const db = getFirestore(firebaseApp);

export interface ResultadoAsignacion {
  exito: boolean;
  asignaciones: {
    estudianteIndex: number;
    aulaId: string;
    codigoAula: string;
  }[];
  fallidos: {
    estudianteIndex: number;
    razon: string;
  }[];
}

@Injectable({ providedIn: 'root' })
export class AsignacionService {
  private engine = new AsignacionEngine();

  private normalizarGrado(grado: string): string {
  if (!grado) return '';

  const lower = grado.toLowerCase().trim();

  const numeroMatch = lower.match(/(\d+)/);
  const numero = numeroMatch ? numeroMatch[1] : '';

  const mapaNumeros: Record<string, string> = {
    '1': 'primero',
    '2': 'segundo',
    '3': 'tercero',
    '4': 'cuarto',
    '5': 'quinto',
    '6': 'sexto'
  };

  return mapaNumeros[numero] || lower;
}

  private capacidadValida(valor: unknown): number | undefined {
    return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0
      ? valor
      : undefined;
  }

  private async obtenerCapacidadMaestraEnTransaccion(
    transaction: any,
    aula: TurnoAulaAsignada
  ): Promise<number> {
    if (aula.aulaId) {
      const aulaFisica = await transaction.get(doc(db, 'aulas', aula.aulaId));
      if (aulaFisica.exists()) {
        const capacidadMaestra = this.capacidadValida(aulaFisica.data()['capacidad']);
        if (capacidadMaestra !== undefined) return capacidadMaestra;
      }
    }

    return this.capacidadValida(aula.capacidad) ?? 30;
  }

  // ============================================================
  // ASIGNAR ESTUDIANTES (con transacción Firestore)
  // ============================================================
  async asignarEstudiantes(
    turno: Turno,
    estudiantes: Estudiante[],
    colegioId: string,
    modo: ModoAsignacion
  ): Promise<ResultadoAsignacion> {
    
    const asignaciones: ResultadoAsignacion['asignaciones'] = [];
    const fallidos: ResultadoAsignacion['fallidos'] = [];

    // Obtener aulas actuales
    const aulasRef = collection(db, 'turnosedicion');
    const q = query(aulasRef, where('turnoId', '==', turno.id!));
    for (let i = 0; i < estudiantes.length; i++) {
      const estudiante = estudiantes[i];
      // Actualizar la lista entre estudiantes para incluir aulas creadas en esta llamada.
      const aulasSnap = await getDocs(q);
      const aulasDocs = aulasSnap.docs.map(d => ({
        ref: d.ref,
        data: d.data() as TurnoAulaAsignada
      }));
      
      try {
        const resultado = await runTransaction(db, async (transaction) => {
          // Re-leer aulas dentro de transacción
          const aulasDelGrado = [];
          for (const aula of aulasDocs) {
            const snap = await transaction.get(aula.ref);

            if (snap.exists()) {
              const data = snap.data() as TurnoAulaAsignada;

              // ✅ NORMALIZAR GRADOS
              const gradoEstudiante = this.normalizarGrado(estudiante.grado);
              const gradoAula = this.normalizarGrado(data.grado);

              // ✅ COMPARAR NORMALIZADOS + GRADOS PERMITIDOS DEL AULA
              if (
                gradoAula === gradoEstudiante &&
                data.nivel?.toLowerCase() === estudiante.nivel?.toLowerCase() &&
                esCompatibleConGradosPermitidos(
  data.gradosPermitidos,
  gradoEstudiante,
  estudiante.nivel
)
              ) {
                aulasDelGrado.push({ ref: aula.ref, data });
              }
            }
          }

          if (modo === 'normal') {
            return await this.asignarNormal(transaction, aulasDelGrado, estudiante, colegioId, aulasDocs.length, turno.id!);
          } else {
            return await this.asignarContingencia(transaction, aulasDelGrado, estudiante, colegioId);
          }
        });

        if (resultado.exito) {
          asignaciones.push({
            estudianteIndex: i,
            aulaId: resultado.aulaId!,
            codigoAula: resultado.codigoAula!
          });
        } else {
          fallidos.push({ estudianteIndex: i, razon: resultado.mensaje! });
        }

      } catch (error: any) {
        fallidos.push({ estudianteIndex: i, razon: error.message });
      }
    }

    return { exito: fallidos.length === 0, asignaciones, fallidos };
  }

  // ============================================================
  // LIBERAR ESTUDIANTES (con transacción Firestore)
  // ============================================================
  async liberarEstudiantes(
    asignaciones: { aulaId: string; colegioId: string }[]
  ): Promise<void> {
    if (!asignaciones || asignaciones.length === 0) return;

    try {
      await runTransaction(db, async (transaction) => {
        const aulaDocs = new Map<string, any>();
        for (const asig of asignaciones) {
          if (!aulaDocs.has(asig.aulaId)) {
            const ref = doc(db, 'turnosedicion', asig.aulaId);
            const snap = await transaction.get(ref);
            if (snap.exists()) {
              aulaDocs.set(asig.aulaId, { ref, data: snap.data() });
            }
          }
        }

        const aRestar = new Map<string, { total: number, porColegio: Record<string, number> }>();
        for (const asig of asignaciones) {
          if (!aRestar.has(asig.aulaId)) {
            aRestar.set(asig.aulaId, { total: 0, porColegio: {} });
          }
          const stats = aRestar.get(asig.aulaId)!;
          stats.total++;
          stats.porColegio[asig.colegioId] = (stats.porColegio[asig.colegioId] || 0) + 1;
        }

        for (const [aulaId, stats] of aRestar.entries()) {
          const aulaInfo = aulaDocs.get(aulaId);
          if (aulaInfo) {
            const currentInscritos = aulaInfo.data.inscritos || 0;
            const currentPorColegio = aulaInfo.data.porColegio || {};
            
            const nuevosInscritos = Math.max(0, currentInscritos - stats.total);
            const nuevosPorColegio = { ...currentPorColegio };
            
            for (const [colId, cant] of Object.entries(stats.porColegio)) {
              nuevosPorColegio[colId] = Math.max(0, (nuevosPorColegio[colId] || 0) - cant);
            }

            transaction.update(aulaInfo.ref, {
              inscritos: nuevosInscritos,
              porColegio: nuevosPorColegio,
              fechaActualizacion: Timestamp.now()
            });
          }
        }
      });
    } catch (error) {
      console.error('Error al liberar estudiantes:', error);
      throw new Error('No se pudo liberar a los estudiantes anteriores.');
    }
  }

  // ============================================================
  // LÓGICA NORMAL
  // ============================================================
  private async asignarNormal(
    transaction: any,
    aulasDelGrado: { ref: any; data: TurnoAulaAsignada }[],
    estudiante: Estudiante,
    colegioId: string,
    totalAulasTurno: number,
    turnoId: string
  ): Promise<{ exito: boolean; aulaId?: string; codigoAula?: string; mensaje?: string }> {
    
    const CAPACIDAD = 30;
    const limiteOperativo = (capacidad: number) =>
      Math.min(capacidad, Math.max(1, Math.floor(capacidad * 0.9)));
    const MAX_POR_COLEGIO = 0.5;

    const aulasValidas: typeof aulasDelGrado = [];
    
    for (const aula of aulasDelGrado) {
      const snap = await transaction.get(aula.ref);
      const data = snap.data() as TurnoAulaAsignada;
      const inscritos = data.inscritos || 0;
      const capacidadFisica = await this.obtenerCapacidadMaestraEnTransaccion(transaction, data);
      const limiteOperativoAula = limiteOperativo(capacidadFisica);
      const porColegio = data.porColegio || {};
      const actualColegio = porColegio[colegioId] || 0;
      
      const cabeEnCapacidad = inscritos + 1 <= capacidadFisica;
      const cabeEnLimiteOperativo = inscritos + 1 <= limiteOperativoAula;
      const cabeEnColegio = actualColegio + 1 <= Math.floor(CAPACIDAD * MAX_POR_COLEGIO);
      
      if (cabeEnCapacidad && cabeEnLimiteOperativo && cabeEnColegio) {
        aulasValidas.push({ ref: aula.ref, data: { ...data, capacidad: capacidadFisica } });
      }
    }

    if (aulasValidas.length > 0) {
      aulasValidas.sort((a, b) => {
        const aInscritos = a.data.inscritos || 0;
        const bInscritos = b.data.inscritos || 0;
        const aLimite = limiteOperativo(a.data.capacidad ?? CAPACIDAD);
        const bLimite = limiteOperativo(b.data.capacidad ?? CAPACIDAD);
        return (bInscritos / bLimite) - (aInscritos / aLimite);
      });

      const aula = aulasValidas[0];
      const data = aula.data;
      const nuevoInscritos = (data.inscritos || 0) + 1;
      const porColegio = { ...(data.porColegio || {}) };
      porColegio[colegioId] = (porColegio[colegioId] || 0) + 1;

      transaction.update(aula.ref, {
        inscritos: nuevoInscritos,
        porColegio: porColegio,
        fechaActualizacion: Timestamp.now()
      });

      return {
        exito: true,
        aulaId: aula.ref.id,
        codigoAula: data.codigoAula
      };
    }

    // Crear nueva aula
    if (totalAulasTurno >= 9) {
      return { exito: false, mensaje: `No hay aulas disponibles para ${estudiante.grado} ${estudiante.nivel} en el turno ${turnoId}. Se alcanzó el límite de 9 aulas.` };
    }

    // Buscar aula física disponible
    const aulasFisicasSnap = await getDocs(collection(db, 'aulas'));
    const asignadasSnap = await getDocs(query(collection(db, 'turnosedicion'), where('turnoId', '==', turnoId)));
    const idsAsignados = new Set(asignadasSnap.docs.map(d => d.data()['aulaId']));

    const aulaFisica = aulasFisicasSnap.docs.find(d => {
      if (idsAsignados.has(d.id)) return false;
      const data = d.data() as Aula;
      const capacidad = this.capacidadValida(data.capacidad);
      return (capacidad === undefined || capacidad >= 1) && esCompatibleConGradosPermitidos(
        data.gradosPermitidos,
        this.normalizarGrado(estudiante.grado),
        estudiante.nivel
      );
    });
    if (!aulaFisica) {
      return { exito: false, mensaje: `No hay aulas disponibles para ${estudiante.grado} ${estudiante.nivel} en el turno ${turnoId}. Las aulas compatibles están llenas o sus límites operativos o por colegio no permiten otra asignación. Agregue o habilite otra aula compatible para continuar.` };
    }

    const fisicaData = aulaFisica.data() as Aula;
    const nuevoDocRef = doc(collection(db, 'turnosedicion'));
    
    transaction.set(nuevoDocRef, {
      turnoId: turnoId,
      aulaId: aulaFisica.id,
      codigoAula: fisicaData.codigo,
      grado: estudiante.grado,
      nivel: estudiante.nivel,
      capacidad: this.capacidadValida(fisicaData.capacidad) ?? 30,
      inscritos: 1,
      local: fisicaData.local,
      pabellon: fisicaData.pabellon,
      piso: fisicaData.piso,
      puertaAcceso: fisicaData.puertaAcceso,
      sede: fisicaData.sede || 'ANDAHUAYLAS',
      porColegio: { [colegioId]: 1 },
      ...(fisicaData.gradosPermitidos !== undefined
        ? { gradosPermitidos: [...fisicaData.gradosPermitidos] }
        : {}),
      fechaCreacion: Timestamp.now()
    });

    return {
      exito: true,
      aulaId: nuevoDocRef.id,
      codigoAula: fisicaData.codigo
    };
  }

  // ============================================================
  // LÓGICA CONTINGENCIA
  // ============================================================
  private async asignarContingencia(
    transaction: any,
    aulasDelGrado: { ref: any; data: TurnoAulaAsignada }[],
    estudiante: Estudiante,
    colegioId: string
  ): Promise<{ exito: boolean; aulaId?: string; codigoAula?: string; mensaje?: string }> {
    
    const CAPACIDAD = 30;
    const MAX_POR_COLEGIO = 0.5;

    const aulasConEspacio: typeof aulasDelGrado = [];
    
    for (const aula of aulasDelGrado) {
      const snap = await transaction.get(aula.ref);
      const data = snap.data() as TurnoAulaAsignada;
      const inscritos = data.inscritos || 0;
      const capacidad = await this.obtenerCapacidadMaestraEnTransaccion(transaction, data);
      
      if (inscritos < capacidad) {
        aulasConEspacio.push({ ref: aula.ref, data: { ...data, capacidad } });
      }
    }

    if (aulasConEspacio.length === 0) {
      return { exito: false, mensaje: 'Sin espacio en contingencia' };
    }

    aulasConEspacio.sort((a, b) => {
      const aInscritos = a.data.inscritos || 0;
      const bInscritos = b.data.inscritos || 0;
      return aInscritos - bInscritos;
    });

    for (const aula of aulasConEspacio) {
      const data = aula.data;
      const inscritos = data.inscritos || 0;
      const capacidad = data.capacidad ?? CAPACIDAD;
      const espacioReal = capacidad - inscritos;
      
      if (espacioReal <= 0) continue;

      const limiteColegio = Math.floor(capacidad * MAX_POR_COLEGIO);
      const porColegio = { ...(data.porColegio || {}) };
      const actualColegio = porColegio[colegioId] || 0;
      const espacioColegio = limiteColegio - actualColegio;

      if (espacioColegio > 0) {
        const nuevoInscritos = inscritos + 1;
        porColegio[colegioId] = actualColegio + 1;

        transaction.update(aula.ref, {
          inscritos: nuevoInscritos,
          porColegio: porColegio,
          fechaActualizacion: Timestamp.now()
        });

        return {
          exito: true,
          aulaId: aula.ref.id,
          codigoAula: data.codigoAula
        };
      }
    }

    return { exito: false, mensaje: 'No hay espacio respetando límite por colegio' };
  }

  // ============================================================
  // OBTENER AULAS PARA PREVIEW
  // ============================================================
  async obtenerAulasParaAsignacion(turnoId: string): Promise<AulaAsignable[]> {
    const aulasRef = collection(db, 'turnosedicion');
    const q = query(aulasRef, where('turnoId', '==', turnoId));
    const snapshot = await getDocs(q);
    const aulasMaestras = await getDocs(collection(db, 'aulas'));
    const capacidadesMaestras = new Map<string, number>();
    for (const aula of aulasMaestras.docs) {
      const capacidad = this.capacidadValida(aula.data()['capacidad']);
      if (capacidad !== undefined) capacidadesMaestras.set(aula.id, capacidad);
    }
    
    return snapshot.docs.map(d => {
  const data = d.data() as TurnoAulaAsignada;

  return {
    id: d.id,
    codigo: data.codigoAula,
    grado: data.grado,
    nivel: data.nivel,
    capacidad: capacidadesMaestras.get(data.aulaId) ?? this.capacidadValida(data.capacidad) ?? 30,
    estudiantes: data.inscritos,
    porColegio: data.porColegio || {},
    gradosPermitidos: data.gradosPermitidos
  };
});
  }
  // Agregar este método a la clase AsignacionService

async obtenerTurnoPorGrado(grado: string, nivel: string): Promise<Turno | null> {
  const turnosSnap = await getDocs(collection(db, 'turnos'));
  
  for (const doc of turnosSnap.docs) {
    const turno = doc.data() as Turno;
    
    // Buscar en nivelesGrados primero
    if (turno.nivelesGrados) {
      const encontrado = turno.nivelesGrados.find(ng => 
        ng.grado === grado && ng.nivel === nivel
      );
      if (encontrado) return { id: doc.id, ...turno };
    }
    
    // Fallback: buscar en grados antiguos
    if (turno.grados?.includes(grado)) return { id: doc.id, ...turno };
  }
  
  return null;
}
}
