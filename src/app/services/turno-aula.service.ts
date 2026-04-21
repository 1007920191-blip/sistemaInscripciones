// services/turno-aula.service.ts
import { Injectable } from '@angular/core';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
  query,
  where,
  getDoc
} from 'firebase/firestore';
import { firebaseApp } from '../firebase-config';
import { TurnoAulaAsignada, AulaTurnoDisplay } from '../models/turno.model';
import { AulaService } from './aula.service';
import { Aula } from '../models/aula.model';

const db = getFirestore(firebaseApp);

@Injectable({ providedIn: 'root' })
export class TurnoAulaService {
  private turnosEdicionRef = collection(db, 'turnosedicion');

  constructor(private aulaService: AulaService) {}

  // Obtener todas las aulas asignadas a un turno específico
  async obtenerAulasPorTurno(turnoCodigo: string): Promise<AulaTurnoDisplay[]> {
    console.log('=== obtenerAulasPorTurno ===');
    console.log('Buscando aulas para turnoId:', turnoCodigo);
    
    try {
      const q = query(
        this.turnosEdicionRef,
        where('turnoId', '==', turnoCodigo)
      );
      
      console.log('Ejecutando query...');
      const snapshot = await getDocs(q);
      console.log('Query completado. Documentos encontrados:', snapshot.docs.length);
      
      const aulas = snapshot.docs.map(doc => {
        const data = doc.data() as TurnoAulaAsignada;
        console.log('Procesando doc:', doc.id, data);
        
        return {
          id: doc.id,
          aulaId: data.aulaId,
          codigo: data.codigoAula,
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
      
      console.log('Aulas procesadas:', aulas);
      return aulas;
      
    } catch (error) {
      console.error('Error en obtenerAulasPorTurno:', error);
      throw error;
    }
  }

  // Obtener aulas disponibles (las que no están asignadas a este turno)
  async obtenerAulasDisponibles(turnoCodigo: string): Promise<Aula[]> {
    console.log('=== obtenerAulasDisponibles ===');
    console.log('Turno codigo:', turnoCodigo);
    
    const todasLasAulas = await this.aulaService.getAulas();
    const aulasAsignadas = await this.obtenerAulasPorTurno(turnoCodigo);
    const aulasAsignadasIds = aulasAsignadas.map(a => a.aulaId);
    
    console.log('Aulas ya asignadas IDs:', aulasAsignadasIds);
    
    return todasLasAulas.filter(aula => !aulasAsignadasIds.includes(aula.id!));
  }

  // Asignar un aula a un turno
  async asignarAulaATurno(data: TurnoAulaAsignada): Promise<string> {
    console.log('=== asignarAulaATurno ===');
    console.log('Guardando con turnoId:', data.turnoId);
    try {
      console.log('Guardando en turnosedicion:', data);
      
      const docRef = await addDoc(this.turnosEdicionRef, {
        ...data,
        fechaCreacion: Timestamp.now(),
        inscritos: 0
      });
      
      console.log('Documento creado con ID:', docRef.id);
      return docRef.id;
      
    } catch (error) {
      console.error('Error en asignarAulaATurno:', error);
      throw error; // Re-lanzar el error para que se capture arriba
    }
  }

  async actualizarAulaTurno(id: string, datos: Partial<TurnoAulaAsignada>): Promise<void> {
    const docRef = doc(db, 'turnosedicion', id);
    await updateDoc(docRef, {
      ...datos,
      fechaActualizacion: Timestamp.now()
    });
  }

  // Actualizar inscritos
  async actualizarInscritos(id: string, inscritos: number): Promise<void> {
    const docRef = doc(db, 'turnosedicion', id);
    await updateDoc(docRef, { 
      inscritos,
      fechaActualizacion: Timestamp.now()
    });
  }

  // Eliminar asignación de aula
  async eliminarAsignacion(id: string): Promise<void> {
    const docRef = doc(db, 'turnosedicion', id);
    await deleteDoc(docRef);
  }

  // Verificar si un aula tiene inscritos antes de eliminar
  async verificarInscritos(id: string): Promise<boolean> {
    const docRef = doc(db, 'turnosedicion', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() as TurnoAulaAsignada;
      return data.inscritos > 0;
    }
    return false;
  }
}