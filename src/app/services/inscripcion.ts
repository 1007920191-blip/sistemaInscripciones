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
import { getAuth } from 'firebase/auth';
import { firebaseApp } from '../firebase-config';
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
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const fechaTexto = `${anio}-${mes}-${dia}`;

    const auth = getAuth(firebaseApp);
    const usuarioId = auth.currentUser?.uid || '';

    const docRef = await addDoc(this.inscripcionesRef, {
      ...inscripcion,
      fechaTexto,
      usuarioId,
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

  async obtenerInscripcionesFiltradas(fechaTexto: string, usuarioId: string, verTodos: boolean = false, ignorarFecha: boolean = false): Promise<Inscripcion[]> {
    try {
      let q;
      if (verTodos) {
        // Modo histórico: carga TODA la colección sin filtro de usuarioId ni fechaTexto en Firestore.
        // El filtrado de fecha se realiza localmente en el componente para dar soporte a
        // documentos viejos sin fechaTexto.
        q = this.inscripcionesRef;
      } else if (ignorarFecha) {
        // Modo normal con búsqueda global: se ignorará el filtro de fechaTexto en Firestore
        // cargando todas las inscripciones del usuario actual para posibilitar búsquedas globales.
        q = query(
          this.inscripcionesRef,
          where('usuarioId', '==', usuarioId)
        );
      } else {
        // Modo normal por fecha: filtra por fechaTexto exacto Y usuarioId.
        q = query(
          this.inscripcionesRef,
          where('fechaTexto', '==', fechaTexto),
          where('usuarioId', '==', usuarioId)
        );
      }
      
      const snapshot = await getDocs(q);
      const inscripciones = snapshot.docs.map(docSnap => {
        const data = docSnap.data() as any;
        let fechaInscripcion = data.fechaInscripcion;
        if (fechaInscripcion && typeof fechaInscripcion.toDate === 'function') {
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
    } catch (error) {
      console.error('Error al obtener inscripciones filtradas:', error);
      throw error;
    }
  }

  /**
   * Búsqueda híbrida: filtra en memoria la lista ya cargada desde Firestore.
   * NO usa collectionGroup ni índices compuestos.
   * Busca en: colegio (IE y código modular), cualquier campo de estudiante
   * embebido en el doc (array estudiantes[] si existe), y campos de texto
   * directos del doc. Soporta mayúsculas/minúsculas, tildes y coincidencias parciales.
   */
  filtrarInscripcionesLocal(inscripciones: Inscripcion[], termino: string): Inscripcion[] {
    const term = this.normalizarTexto(termino.trim());
    if (!term) return inscripciones;

    return inscripciones.filter(ins => {
      const data = ins as any;

      // 1. Colegio (campo directo del documento raiz)
      const colegio  = this.normalizarTexto(ins.colegio?.IE || '');
      const modular  = this.normalizarTexto(ins.colegio?.CODIGOMODULAR || ins.colegio?.codigoModular || '');
      if (colegio.includes(term) || modular.includes(term)) return true;

      // 2. Campos de texto planos del documento raíz (ej. nombreContacto, observaciones)
      const camposDirectos = [
        data.nombreContacto, data.observaciones,
        data.turnoId, data.turnoCodigo, data.estado
      ].filter(Boolean);
      if (camposDirectos.some(c => this.normalizarTexto(String(c)).includes(term))) return true;

      // 3. Campos del estudiante a nivel raíz (si existen directamente en el documento raíz)
      const nombresRaiz = this.normalizarTexto(data.nombres || data.nombre || '');
      const apellidosRaiz = this.normalizarTexto(data.apellidos || data.apellido || '');
      const dniRaiz = this.normalizarTexto(data.numeroDocumento || data.dni || data.documento || '');
      if (nombresRaiz.includes(term) || apellidosRaiz.includes(term) || dniRaiz.includes(term)) return true;

      // 4. Array de estudiantes embebido en el documento (si existe)
      const estudiantes: any[] = ins.estudiantes || data.estudiantes || [];
      if (estudiantes.length > 0) {
        return estudiantes.some(est => {
          const nombres   = this.normalizarTexto(est.nombres   || est.nombre   || '');
          const apellidos = this.normalizarTexto(est.apellidos || est.apellido || '');
          const dni       = this.normalizarTexto(est.numeroDocumento || est.dni || '');
          return nombres.includes(term) || apellidos.includes(term) || dni.includes(term);
        });
      }

      return false;
    });
  }

  private normalizarTexto(texto: string): string {
    return texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // elimina tildes
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