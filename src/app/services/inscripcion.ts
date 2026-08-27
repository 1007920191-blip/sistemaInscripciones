import { Injectable } from '@angular/core';

import {
  Firestore,
  collection,
  getDocs,
  Timestamp,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  where,
  query,
  Unsubscribe,
  runTransaction,
  setDoc
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

  private async siguienteCodigo(nombre: 'pagos' | 'estudiantes', inicial: number): Promise<string> {
    const ref = doc(this.firestore, 'contadores', nombre);
    return runTransaction(this.firestore, async (tx) => {
      const snap = await tx.get(ref);
      let valor: number;
      if (!snap.exists()) {
        valor = inicial;
        tx.set(ref, { valor: valor + 1 });
        return String(valor);
      }
      const d: any = snap.data();
      valor = typeof d['valor'] === 'number' ? d['valor'] : typeof d['ultimo'] === 'number' ? d['ultimo'] + 1 : inicial;
      if (valor < inicial) valor = inicial;
      tx.update(ref, { valor: valor + 1 });
      return String(valor);
    });
  }

  async guardarInscripcion(inscripcion: Inscripcion): Promise<string> {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const fechaTexto = `${anio}-${mes}-${dia}`;
    const auth = getAuth(firebaseApp);
    const usuarioId = auth.currentUser?.uid || '';
    const codigo = await this.siguienteCodigo('pagos', 1000);
    const ref = doc(this.firestore, 'inscripciones', codigo);
    await setDoc(ref, {
      ...inscripcion,
      codigo,
      fechaTexto,
      usuarioId,
      fechaInscripcion: Timestamp.now()
    });
    return codigo;
  }

  async guardarEstudiante(estudiante: Estudiante, inscripcionId: string): Promise<void> {
    let codigoEst = (estudiante as any).codigo || (estudiante as any).id;
    const esCodigoValido = codigoEst && /^\d{5}$/.test(String(codigoEst));
    if (!esCodigoValido) codigoEst = await this.siguienteCodigo('estudiantes', 10000);
    else codigoEst = String(codigoEst);
    const ref = doc(this.firestore, 'inscripciones', inscripcionId, 'estudiantes', codigoEst);
    await setDoc(ref, {
      ...estudiante,
      codigo: codigoEst,
      CORRECTAS: (estudiante as any).CORRECTAS ?? 0,
      INCORRECTAS: (estudiante as any).INCORRECTAS ?? 0,
      EN_BLANCO: (estudiante as any).EN_BLANCO ?? (estudiante as any).BLANCO ?? 0,
      BLANCO: (estudiante as any).BLANCO ?? (estudiante as any).EN_BLANCO ?? 0,
      PUNTAJE_FINAL: (estudiante as any).PUNTAJE_FINAL ?? 0,
      ASISTENCIA: (estudiante as any).ASISTENCIA ?? '',
      FECHA_ASISTENCIA: (estudiante as any).FECHA_ASISTENCIA ?? (estudiante as any).HORA_ENTREGA ?? null,
      HORA_ENTREGA: (estudiante as any).HORA_ENTREGA ?? (estudiante as any).FECHA_ASISTENCIA ?? null,
      PUESTO: (estudiante as any).PUESTO ?? 0,
      fechaRegistro: (estudiante as any).fechaRegistro || Timestamp.now()
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
        q = this.inscripcionesRef;
      } else if (ignorarFecha) {
        q = query(
          this.inscripcionesRef,
          where('usuarioId', '==', usuarioId)
        );
      } else {
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

  async obtenerInscripcionesPorOrigen(origen: string): Promise<Inscripcion[]> {
    try {
      const q = query(this.inscripcionesRef, where('origen', '==', origen));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(docSnap => {
        const data = docSnap.data() as any;
        let fechaInscripcion = data.fechaInscripcion;
        if (fechaInscripcion && typeof fechaInscripcion.toDate === 'function') {
          fechaInscripcion = fechaInscripcion.toDate();
        }
        return { id: docSnap.id, ...data, fechaInscripcion } as Inscripcion;
      }).sort((a, b) => {
        const fechaA = a.fechaInscripcion?.getTime?.() || 0;
        const fechaB = b.fechaInscripcion?.getTime?.() || 0;
        return fechaB - fechaA;
      });
    } catch (error) {
      console.error('Error al obtener inscripciones por origen:', error);
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
    const termRaw = termino.trim();
    if (!term) return inscripciones;
    return inscripciones.filter(ins => {
      const data = ins as any;
      const codigoIns = this.normalizarTexto(String(data.codigo || ins.id || ''));
      if (codigoIns.includes(term)) return true;
      if (termRaw && String(data.codigo || ins.id || '').includes(termRaw)) return true;
      const colegio  = this.normalizarTexto(ins.colegio?.IE || '');
      const modular  = this.normalizarTexto(ins.colegio?.CODIGOMODULAR || ins.colegio?.codigoModular || '');
      if (colegio.includes(term) || modular.includes(term)) return true;
      const camposDirectos = [data.nombreContacto, data.observaciones, data.turnoId, data.turnoCodigo, data.estado].filter(Boolean);
      if (camposDirectos.some(c => this.normalizarTexto(String(c)).includes(term))) return true;
      const nombresRaiz = this.normalizarTexto(data.nombres || data.nombre || '');
      const apellidosRaiz = this.normalizarTexto(data.apellidos || data.apellido || '');
      const dniRaiz = this.normalizarTexto(data.numeroDocumento || data.dni || data.documento || '');
      if (nombresRaiz.includes(term) || apellidosRaiz.includes(term) || dniRaiz.includes(term)) return true;
      const estudiantes: any[] = ins.estudiantes || data.estudiantes || [];
      if (estudiantes.length > 0) {
        return estudiantes.some(est => {
          const nombres = this.normalizarTexto(est.nombres || est.nombre || '');
          const apellidos = this.normalizarTexto(est.apellidos || est.apellido || '');
          const dni = this.normalizarTexto(est.numeroDocumento || est.dni || '');
          const codEst = this.normalizarTexto(String(est.codigo || est.id || ''));
          return nombres.includes(term) || apellidos.includes(term) || dni.includes(term) || codEst.includes(term) || String(est.codigo || est.id || '').includes(termRaw);
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