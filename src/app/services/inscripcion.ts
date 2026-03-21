import { Injectable } from '@angular/core';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy,
  Timestamp,
  doc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { firebaseApp } from '../firebase-config';
import { Inscripcion, Estudiante } from '../models/inscripcion.model';

const db = getFirestore(firebaseApp);

@Injectable({ providedIn: 'root' })
export class InscripcionService {
  private inscripcionesRef = collection(db, 'inscripciones');

  async guardarInscripcion(inscripcion: Inscripcion): Promise<string> {
    const docRef = await addDoc(this.inscripcionesRef, {
      ...inscripcion,
      fechaInscripcion: Timestamp.now()
    });
    return docRef.id;
  }

  async guardarEstudiante(estudiante: Estudiante, inscripcionId: string): Promise<void> {
    const estudiantesRef = collection(db, 'inscripciones', inscripcionId, 'estudiantes');
    await addDoc(estudiantesRef, {
      ...estudiante,
      fechaRegistro: Timestamp.now()
    });
  }

  async obtenerInscripciones(): Promise<Inscripcion[]> {
    const snapshot = await getDocs(this.inscripcionesRef);
    
    const inscripciones = snapshot.docs.map(doc => {
      const data = doc.data();
      
      let fechaInscripcion = data['fechaInscripcion'];
      if (fechaInscripcion && typeof fechaInscripcion.toDate === 'function') {
        fechaInscripcion = fechaInscripcion.toDate();
      }
      
      return {
        id: doc.id,
        ...data,
        fechaInscripcion: fechaInscripcion
      } as Inscripcion;
    });
    
    // Ordenar por fecha descendente
    return inscripciones.sort((a, b) => {
      const fechaA = a.fechaInscripcion?.getTime?.() || 0;
      const fechaB = b.fechaInscripcion?.getTime?.() || 0;
      return fechaB - fechaA;
    });
  }

  async obtenerEstudiantes(inscripcionId: string): Promise<Estudiante[]> {
    const estudiantesRef = collection(db, 'inscripciones', inscripcionId, 'estudiantes');
    const snapshot = await getDocs(estudiantesRef);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Estudiante));
  }

  async actualizarInscripcion(inscripcionId: string, datos: any): Promise<void> {
    const docRef = doc(db, 'inscripciones', inscripcionId);
    await updateDoc(docRef, {
      ...datos,
      fechaActualizacion: Timestamp.now()
    });
  }

  async eliminarEstudiantes(inscripcionId: string): Promise<void> {
    const estudiantesRef = collection(db, 'inscripciones', inscripcionId, 'estudiantes');
    const snapshot = await getDocs(estudiantesRef);
    
    const eliminaciones = snapshot.docs.map(docEst => 
      deleteDoc(doc(db, 'inscripciones', inscripcionId, 'estudiantes', docEst.id))
    );
    await Promise.all(eliminaciones);
  }
}