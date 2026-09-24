import { Injectable } from '@angular/core';
import { Firestore, collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, deleteDoc, onSnapshot, runTransaction, Timestamp, Unsubscribe } from '@angular/fire/firestore';
import { Aula } from '../models/aula.model';
import { TurnoAulaAsignada, AulaTurnoDisplay } from '../models/turno.model';
import { esCompatibleConGradosPermitidos } from '../core/asignacion/grados-permitidos';

@Injectable({
  providedIn: 'root'
})
export class TurnoAulaService {
  private turnosEdicionRef;

  constructor(private firestore: Firestore) {
    this.turnosEdicionRef = collection(this.firestore, 'turnosedicion');
  }

  private async aplicarCapacidadMaestra(aulas: AulaTurnoDisplay[]): Promise<AulaTurnoDisplay[]> {
    const ids = [...new Set(aulas.map(aula => aula.aulaId).filter(Boolean))];
    const capacidades = new Map<string, number>();

    await Promise.all(ids.map(async aulaId => {
      const snapshot = await getDoc(doc(this.firestore, 'aulas', aulaId));
      if (!snapshot.exists()) return;
      const capacidad = (snapshot.data() as Aula).capacidad;
      if (typeof capacidad === 'number' && Number.isFinite(capacidad) && capacidad >= 0) {
        capacidades.set(aulaId, capacidad);
      }
    }));

    return aulas.map(aula => ({
      ...aula,
      capacidad: capacidades.get(aula.aulaId) ?? aula.capacidad
    }));
  }

  // Asignar una nueva aula a un turno
  async asignarAulaATurno(data: TurnoAulaAsignada): Promise<void> {
    try {
      await addDoc(this.turnosEdicionRef, {
        ...data,
        fechaAsignacion: new Date()
      });
    } catch (error) {
      console.error('Error en asignarAulaATurno:', error);
      throw error;
    }
  }

  // Obtener todas las aulas asignadas a un turno específico
  async obtenerAulasPorTurno(turnoId: string): Promise<AulaTurnoDisplay[]> {
    try {
      const q = query(
        this.turnosEdicionRef,
        where('turnoId', '==', turnoId)
      );
      
      const snapshot = await getDocs(q);
      
      const aulas = snapshot.docs.map(doc => {
        const data = doc.data() as TurnoAulaAsignada;
        return {
          id: doc.id,
          aulaId: data.aulaId,
          codigoAula: data.codigoAula,
          inscritos: data.inscritos || 0,
          capacidad: data.capacidad,
          grado: data.grado,
          nivel: data.nivel,
          local: data.local,
          pabellon: data.pabellon,
          piso: data.piso,
          puertaAcceso: data.puertaAcceso,
          sede: data.sede,
          turnoId: data.turnoId
        } as AulaTurnoDisplay;
      });
      return await this.aplicarCapacidadMaestra(aulas);
    } catch (error) {
      console.error('Error en obtenerAulasPorTurno:', error);
      throw error;
    }
  }

  // Escuchar aulas asignadas a un turno en tiempo real
  escucharAulasPorTurno(turnoId: string, callback: (aulas: AulaTurnoDisplay[]) => void, turnoCodigo?: string): Unsubscribe {
    let documentosOperativos: { id: string; data: any }[] = [];
    let capacidadesMaestras = new Map<string, number>();
    let operativasListas = false;
    let maestrasListas = false;

    const publicar = () => {
      if (!operativasListas || !maestrasListas) return;
      const aulas = documentosOperativos.map(({ id, data }) => {
        const capacidadMaestra = capacidadesMaestras.get(String(data.aulaId || ''));
        return {
          id,
          aulaId: data.aulaId,
          codigoAula: data.codigoAula,
          inscritos: data.inscritos || 0,
          capacidad: capacidadMaestra ?? data.capacidad,
          grado: data.grado,
          nivel: data.nivel,
          local: data.local,
          pabellon: data.pabellon,
          piso: data.piso,
          puertaAcceso: data.puertaAcceso,
          sede: data.sede,
          turnoId: data.turnoId,
          turnoCodigo: data.turnoCodigo
        } as AulaTurnoDisplay & { turnoCodigo?: string };
      }).filter(aula => {
        const matchId = String(aula.turnoId) === String(turnoId);
        const matchCodigo = turnoCodigo ? (String(aula.turnoCodigo || '') === String(turnoCodigo) || String(aula.turnoId) === String(turnoCodigo)) : false;
        return matchId || matchCodigo;
      });
      callback(aulas);
    };

    const unsubscribeOperativas = onSnapshot(this.turnosEdicionRef, (snapshot) => {
      documentosOperativos = snapshot.docs.map(documento => ({ id: documento.id, data: documento.data() }));
      operativasListas = true;
      publicar();
    }, (error) => {
      console.error('Error en escucharAulasPorTurno:', error);
    });

    const unsubscribeMaestras = onSnapshot(collection(this.firestore, 'aulas'), (snapshot) => {
      capacidadesMaestras = new Map();
      for (const aula of snapshot.docs) {
        const capacidad = (aula.data() as Aula).capacidad;
        if (typeof capacidad === 'number' && Number.isFinite(capacidad) && capacidad >= 0) {
          capacidadesMaestras.set(aula.id, capacidad);
        }
      }
      maestrasListas = true;
      publicar();
    }, (error) => {
      console.error('Error en escucharAulasPorTurno:', error);
    });

    return (() => {
      unsubscribeOperativas();
      unsubscribeMaestras();
    }) as Unsubscribe;
  }

  // Obtener aulas disponibles (las que no están asignadas a este turno)
  async obtenerAulasDisponibles(turnoId: string, grado?: string, nivel?: string): Promise<Aula[]> {
    try {
      const aulasSnapshot = await getDocs(collection(this.firestore, 'aulas'));
      const aulas = aulasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Aula));

      const asignadas = await this.obtenerAulasPorTurno(turnoId);
      const asignadasIds = new Set(asignadas.map(a => a.aulaId));

      return aulas.filter(a =>
        !asignadasIds.has(a.id!) &&
        (!grado || !nivel || esCompatibleConGradosPermitidos(a.gradosPermitidos, grado, nivel))
      );
    } catch (error) {
      console.error('Error en obtenerAulasDisponibles:', error);
      throw error;
    }
  }

  // Actualizar datos de una asignación
  async actualizarAulaTurno(id: string, data: Partial<TurnoAulaAsignada>): Promise<void> {
    try {
      const docRef = doc(this.firestore, 'turnosedicion', id);
      await updateDoc(docRef, {
        ...data,
        ultimaActualizacion: new Date()
      });
    } catch (error) {
      console.error('Error en actualizarAulaTurno:', error);
      throw error;
    }
  }

  // Eliminar asignación
  async eliminarAsignacion(id: string): Promise<void> {
    try {
      const docRef = doc(this.firestore, 'turnosedicion', id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error en eliminarAsignacion:', error);
      throw error;
    }
  }

  // Verificar si un aula tiene inscritos antes de eliminar
  async verificarInscritos(aulaAsignadaId: string): Promise<boolean> {
    try {
      const q = query(
        collection(this.firestore, 'inscripciones'),
        where('aulaId', '==', aulaAsignadaId)
      );
      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      console.error('Error en verificarInscritos:', error);
      return true; // Por seguridad, si hay error asumimos que tiene inscritos
    }
  }

  /**
   * Mantiene cuadrados los contadores de las aulas de un turno.
   *
   * Recalcula `inscritos` y `porColegio` de cada aula operativa del turno a partir
   * de los alumnos realmente asignados (campo `aulaAsignadaId` de cada estudiante).
   * Sirve para que el número no quede descuadrado cuando se borraron documentos por
   * fuera de la app (consola de Firebase, borrar un aula maestra, etc.), casos en los
   * que nadie ejecuta el +1/-1 de la asignación.
   *
   * Garantías:
   * - Solo toca documentos de `turnosedicion` de ESTE turno.
   * - Solo escribe el aula cuyo valor calculado difiere del guardado (si no difiere
   *   no escribe nada, así que repetirlo no genera escrituras ni bucles).
   * - Si el aula cambió entre el cálculo y la escritura, no la pisa.
   * - Si no puede leer alguna inscripción, aborta antes de escribir nada.
   */
  async recalcularInscritosDelTurno(
    turnoId: string
  ): Promise<{ aulas: number; cambiadas: number; estudiantes: number }> {
    const resultado = { aulas: 0, cambiadas: 0, estudiantes: 0 };
    if (!turnoId) return resultado;

    // 1) Aulas operativas del turno
    const aulasSnap = await getDocs(
      query(this.turnosEdicionRef, where('turnoId', '==', turnoId))
    );
    if (aulasSnap.empty) return resultado;

    const aulas = aulasSnap.docs.map(documento => ({
      ref: documento.ref,
      data: documento.data() as TurnoAulaAsignada
    }));
    resultado.aulas = aulas.length;
    const idsAulasDelTurno = new Set(aulasSnap.docs.map(documento => documento.id));

    // 2) Conteo real: un estudiante asignado equivale a un cupo ocupado
    const conteo = new Map<string, { total: number; porColegio: Record<string, number> }>();
    const inscripcionesSnap = await getDocs(collection(this.firestore, 'inscripciones'));

    for (const inscripcion of inscripcionesSnap.docs) {
      const estudiantesSnap = await getDocs(
        collection(this.firestore, 'inscripciones', inscripcion.id, 'estudiantes')
      );
      for (const estudianteDoc of estudiantesSnap.docs) {
        const estudiante = estudianteDoc.data() as any;
        const aulaId = String(estudiante?.aulaAsignadaId || '').trim();
        // Ignora apuntes a aulas inexistentes o de otros turnos.
        if (!aulaId || !idsAulasDelTurno.has(aulaId)) continue;

        const colegioId = String(
          estudiante?.colegio?.CODIGOMODULAR || estudiante?.colegio?.codigoModular || ''
        ).trim();
        const acumulado = conteo.get(aulaId) || { total: 0, porColegio: {} };
        acumulado.total++;
        if (colegioId) {
          acumulado.porColegio[colegioId] = (acumulado.porColegio[colegioId] || 0) + 1;
        }
        conteo.set(aulaId, acumulado);
        resultado.estudiantes++;
      }
    }

    // 3) Escribir únicamente las aulas cuyo contador cambia
    for (const aula of aulas) {
      const nuevo = conteo.get(String(aula.ref.id)) || { total: 0, porColegio: {} };
      const inscritosGuardados = Number(aula.data.inscritos || 0);
      const porColegioGuardado = aula.data.porColegio || {};

      if (
        inscritosGuardados === nuevo.total &&
        this.mismoPorColegio(porColegioGuardado, nuevo.porColegio)
      ) {
        continue;
      }

      const aplicado = await runTransaction(this.firestore, async (transaccion) => {
        const actualSnap = await transaccion.get(aula.ref);
        if (!actualSnap.exists()) return false;
        const actual = actualSnap.data() as TurnoAulaAsignada;
        // Si alguien lo cambió mientras calculábamos, no lo pisamos.
        if (Number(actual.inscritos || 0) !== inscritosGuardados) return false;

        transaccion.update(aula.ref, {
          inscritos: nuevo.total,
          porColegio: nuevo.porColegio,
          fechaActualizacion: Timestamp.now()
        });
        return true;
      });

      if (aplicado) resultado.cambiadas++;
    }

    return resultado;
  }

  private mismoPorColegio(a: Record<string, number>, b: Record<string, number>): boolean {
    const normalizar = (origen: Record<string, number>) =>
      Object.entries(origen || {})
        .filter(([, cantidad]) => Number(cantidad) > 0)
        .sort(([x], [y]) => x.localeCompare(y));
    return JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b));
  }
}
