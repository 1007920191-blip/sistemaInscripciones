import { Injectable } from '@angular/core';

import {
  Firestore,
  collection,
  addDoc,
  getDocs,
  Timestamp,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  where,
  query,
  Unsubscribe
} from '@angular/fire/firestore';

import { Inscripcion, Estudiante } from '../models/inscripcion.model';

@Injectable({
  providedIn: 'root'
})
export class InscripcionService {

  private inscripcionesRef;

  constructor(private firestore: Firestore) {
    this.inscripcionesRef = collection(this.firestore, 'inscripciones');
  }

  async guardarInscripcion(inscripcion: Inscripcion): Promise<string> {

    const docRef = await addDoc(this.inscripcionesRef, {
      ...inscripcion,
      fechaInscripcion: Timestamp.now()
    });

    return docRef.id;
  }

  async guardarEstudiante(
    estudiante: Estudiante,
    inscripcionId: string
  ): Promise<void> {

    const estudiantesRef = collection(
      this.firestore,
      'inscripciones',
      inscripcionId,
      'estudiantes'
    );

    await addDoc(estudiantesRef, {
      ...estudiante,
      fechaRegistro: Timestamp.now()
    });
  }

  async obtenerInscripciones(): Promise<Inscripcion[]> {

    const snapshot = await getDocs(this.inscripcionesRef);

    const inscripciones = snapshot.docs.map(docSnap => {

      const data = docSnap.data() as any;

      let fechaInscripcion = data.fechaInscripcion;

      if (
        fechaInscripcion &&
        typeof fechaInscripcion.toDate === 'function'
      ) {
        fechaInscripcion = fechaInscripcion.toDate();
      }

      return {
        id: docSnap.id,
        ...data,
        fechaInscripcion
      } as Inscripcion;
    });

    return inscripciones.sort((a, b) => {

      const fechaA = a.fechaInscripcion?.getTime?.() || 0;
      const fechaB = b.fechaInscripcion?.getTime?.() || 0;

      return fechaB - fechaA;
    });
  }

  async obtenerEstudiantes(
    inscripcionId: string
  ): Promise<Estudiante[]> {

    const estudiantesRef = collection(
      this.firestore,
      'inscripciones',
      inscripcionId,
      'estudiantes'
    );

    const snapshot = await getDocs(estudiantesRef);

    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    } as Estudiante));
  }

  async actualizarInscripcion(
    inscripcionId: string,
    datos: any
  ): Promise<void> {

    const docRef = doc(
      this.firestore,
      'inscripciones',
      inscripcionId
    );

    await updateDoc(docRef, {
      ...datos,
      fechaActualizacion: Timestamp.now()
    });
  }

  async eliminarEstudiantes(
    inscripcionId: string
  ): Promise<void> {

    const estudiantesRef = collection(
      this.firestore,
      'inscripciones',
      inscripcionId,
      'estudiantes'
    );

    const snapshot = await getDocs(estudiantesRef);

    const eliminaciones = snapshot.docs.map(docEst =>
      deleteDoc(
        doc(
          this.firestore,
          'inscripciones',
          inscripcionId,
          'estudiantes',
          docEst.id
        )
      )
    );

    await Promise.all(eliminaciones);
  }

  escucharInscripcionesPorTurno(
    turnoId: string,
    callback: (inscripciones: Inscripcion[]) => void,
    turnoCodigo?: string
  ): Unsubscribe {

    return onSnapshot(this.inscripcionesRef, (snapshot) => {

      const inscripciones = snapshot.docs
        .map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        } as Inscripcion))

        .filter(insc => {

          let idBase = insc.turnoId;

          if (idBase && typeof idBase === 'object') {
            idBase =
              (idBase as any).id ||
              (idBase as any).codigo;
          }

          const matchId =
            String(idBase) === String(turnoId);

          const matchCodigo = turnoCodigo
            ? (
                String(insc.turnoCodigo || '') ===
                String(turnoCodigo)
              ) ||
              (
                String(idBase) ===
                String(turnoCodigo)
              )
            : false;

          return matchId || matchCodigo;
        });

      callback(inscripciones);
    });
  }
}