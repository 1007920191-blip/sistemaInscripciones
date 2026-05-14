// src/app/services/turno-gestion.service.ts
import { Injectable } from '@angular/core';
import { 
  getFirestore, 
  doc, 
  updateDoc, 
  getDoc,
  Timestamp,
  collection,
  getDocs
} from 'firebase/firestore';
import { firebaseApp } from '../firebase-config';
import { Turno, ModoAsignacion } from '../models/turno.model';

const db = getFirestore(firebaseApp);

@Injectable({ providedIn: 'root' })
export class TurnoGestionService {

  async determinarModoActual(turno: Turno): Promise<ModoAsignacion> {
    const ahora = new Date();
    
    if (turno.cierreManual === true) return 'contingencia';
    if (turno.cierreManual === false) return 'normal';
    
    if (turno.fechaCierreInscripcion) {
      const fechaCierre = turno.fechaCierreInscripcion instanceof Date 
        ? turno.fechaCierreInscripcion 
        : (turno.fechaCierreInscripcion as any).toDate();
      
      if (ahora > fechaCierre) return 'contingencia';
    }
    
    return 'normal';
  }

  async cerrarInscripciones(turnoId: string): Promise<void> {
    const docRef = doc(db, 'turnos', turnoId);
    await updateDoc(docRef, {
      modoAsignacion: 'contingencia',
      cierreManual: true,
      fechaActualizacion: Timestamp.now()
    });
  }

  async reabrirInscripciones(turnoId: string): Promise<void> {
    const docRef = doc(db, 'turnos', turnoId);
    await updateDoc(docRef, {
      modoAsignacion: 'normal',
      cierreManual: false,
      fechaActualizacion: Timestamp.now()
    });
  }

  async establecerFechaCierre(turnoId: string, fecha: Date): Promise<void> {
    const docRef = doc(db, 'turnos', turnoId);
    await updateDoc(docRef, {
      fechaCierreInscripcion: Timestamp.fromDate(fecha),
      fechaActualizacion: Timestamp.now()
    });
  }

  async obtenerTurnosConModo(): Promise<(Turno & { modoActual: ModoAsignacion })[]> {
    const snapshot = await getDocs(collection(db, 'turnos'));
    const turnos = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Turno));
    
    return Promise.all(turnos.map(async t => ({
      ...t,
      modoActual: await this.determinarModoActual(t)
    })));
  }

  async obtenerTurnoCompleto(turnoId: string): Promise<Turno | null> {
    const docRef = doc(db, 'turnos', turnoId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Turno;
  }
}