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
  orderBy
} from 'firebase/firestore';
import { firebaseApp } from '../firebase-config';
import { Turno } from '../models/turno.model';

const db = getFirestore(firebaseApp);

@Injectable({ providedIn: 'root' })
export class TurnoService {
  private turnosRef = collection(db, 'turnos');

  async guardarTurno(turno: Turno): Promise<string> {
    const docRef = await addDoc(this.turnosRef, {
      ...turno,
      fechaCreacion: Timestamp.now(),
      estado: 'activo'
    });
    return docRef.id;
  }

  async obtenerTurnos(): Promise<Turno[]> {
    const q = query(this.turnosRef, orderBy('fechaCreacion', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      
      let fecha = data['fecha'];
      let fechaCreacion = data['fechaCreacion'];
      let fechaActualizacion = data['fechaActualizacion'];
      
      if (fecha && typeof fecha.toDate === 'function') {
        fecha = fecha.toDate();
      }
      if (fechaCreacion && typeof fechaCreacion.toDate === 'function') {
        fechaCreacion = fechaCreacion.toDate();
      }
      if (fechaActualizacion && typeof fechaActualizacion.toDate === 'function') {
        fechaActualizacion = fechaActualizacion.toDate();
      }
      
      // ← CAMBIO CLAVE: Mapear explícitamente nivelesGrados
      return {
        id: doc.id,
        codigo: data['codigo'],
        fecha: fecha,
        horaInicioEntrada: data['horaInicioEntrada'],
        horaFinEntrada: data['horaFinEntrada'],
        horaInicioPrueba: data['horaInicioPrueba'],
        horaFinPrueba: data['horaFinPrueba'],
        nivel: data['nivel'],
        grados: data['grados'] || [],
        nivelesGrados: data['nivelesGrados'] || [],  // ← ESTO FALTABA
        estado: data['estado'],
        fechaCreacion: fechaCreacion,
        fechaActualizacion: fechaActualizacion
      } as Turno;
    });
  }

  async actualizarTurno(turnoId: string, datos: Partial<Turno>): Promise<void> {
    const docRef = doc(db, 'turnos', turnoId);
    await updateDoc(docRef, {
      ...datos,
      fechaActualizacion: Timestamp.now()
    });
  }

  async eliminarTurno(turnoId: string): Promise<void> {
    const docRef = doc(db, 'turnos', turnoId);
    await deleteDoc(docRef);
  }
}