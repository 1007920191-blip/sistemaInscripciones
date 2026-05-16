import { Injectable } from '@angular/core';
import { Firestore, collection, doc, getDocs, query, where, addDoc, updateDoc, deleteDoc, onSnapshot, Unsubscribe } from '@angular/fire/firestore';
import { Aula } from '../models/aula.model';
import { TurnoAulaAsignada, AulaTurnoDisplay } from '../models/turno.model';

@Injectable({
  providedIn: 'root'
})
export class TurnoAulaService {
  private turnosEdicionRef;

  constructor(private firestore: Firestore) {
    this.turnosEdicionRef = collection(this.firestore, 'turnosedicion');
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
      
      return snapshot.docs.map(doc => {
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
    } catch (error) {
      console.error('Error en obtenerAulasPorTurno:', error);
      throw error;
    }
  }

  // Escuchar aulas asignadas a un turno en tiempo real
  escucharAulasPorTurno(turnoId: string, callback: (aulas: AulaTurnoDisplay[]) => void, turnoCodigo?: string): Unsubscribe {
    return onSnapshot(this.turnosEdicionRef, (snapshot) => {
      const aulas = snapshot.docs.map(doc => {
        const data = doc.data() as any;
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
          turnoId: data.turnoId,
          turnoCodigo: data.turnoCodigo
        } as AulaTurnoDisplay & { turnoCodigo?: string };
      }).filter(aula => {
        const matchId = String(aula.turnoId) === String(turnoId);
        const matchCodigo = turnoCodigo ? (String(aula.turnoCodigo || '') === String(turnoCodigo) || String(aula.turnoId) === String(turnoCodigo)) : false;
        return matchId || matchCodigo;
      });
      callback(aulas);
    }, (error) => {
      console.error('Error en escucharAulasPorTurno:', error);
    });
  }

  // Obtener aulas disponibles (las que no están asignadas a este turno)
  async obtenerAulasDisponibles(turnoId: string): Promise<Aula[]> {
    try {
      const aulasSnapshot = await getDocs(collection(this.firestore, 'aulas'));
      const aulas = aulasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Aula));

      const asignadas = await this.obtenerAulasPorTurno(turnoId);
      const asignadasIds = new Set(asignadas.map(a => a.aulaId));

      return aulas.filter(a => !asignadasIds.has(a.id!));
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
}