import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  getDocs,
  getDoc,
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
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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

  /**
   * Busca alumnos que YA tienen una inscripción en la misma edición del concurso.
   *
   * - Con documento (DNI/Carnet): se compara `tipoDocumento + numeroDocumento`.
   * - SIN documento (`sd` o sin número): no hay nada que comparar por número, así que
   *   se compara el NOMBRE COMPLETO normalizado (sin tildes, sin signos y en cualquier
   *   orden) junto con el COLEGIO. Esas coincidencias se devuelven como `'nombre'`
   *   para que el operador confirme (podría ser un homónimo).
   * - Una inscripción CANCELADA no cuenta. Los registros históricos sin tipo se
   *   comparan solo por número.
   * - No crea colecciones nuevas: lee `inscripciones` y su subcolección `estudiantes`.
   */
  async buscarAlumnosYaInscritos(
    estudiantes: { tipoDocumento?: string; numeroDocumento?: string; nombres?: string; apellidos?: string; colegio?: any }[],
    edicion?: string,
    excluirInscripcionId?: string
  ): Promise<{
    numeroDocumento: string; nombre: string; inscripcionCodigo: string; estado: string;
    tipoCoincidencia: 'documento' | 'nombre'; detalle: string;
  }[]> {
    const objetivoDoc = new Map<string, Set<string>>();          // numero -> tipos ('' = sin tipo)
    const objetivoNombre = new Map<string, { nombre: string }>(); // colegio|nombre -> datos
    for (const est of estudiantes || []) {
      const numero = String(est?.numeroDocumento || '').trim();
      const tipo = String(est?.tipoDocumento || '').trim().toLowerCase();
      if (numero && tipo !== 'sd') {
        const tipos = objetivoDoc.get(numero) || new Set<string>();
        tipos.add(tipo);
        objetivoDoc.set(numero, tipos);
        continue;
      }
      const nombre = this.normalizarNombreCompleto(est?.nombres, est?.apellidos);
      if (!nombre) continue;
      objetivoNombre.set(`${this.normalizarColegio(est?.colegio)}|${nombre}`, {
        nombre: `${String(est?.nombres || '').trim()} ${String(est?.apellidos || '').trim()}`.trim().toUpperCase()
      });
    }
    if (objetivoDoc.size === 0 && objetivoNombre.size === 0) return [];

    const encontrados: {
      numeroDocumento: string; nombre: string; inscripcionCodigo: string; estado: string;
      tipoCoincidencia: 'documento' | 'nombre'; detalle: string;
    }[] = [];
    const yaReportado = new Set<string>();
    const edicionBuscada = String(edicion || '').trim() || String(new Date().getFullYear());

    const inscripcionesSnap = await getDocs(collection(this.firestore, 'inscripciones'));
    for (const insDoc of inscripcionesSnap.docs) {
      if (excluirInscripcionId && insDoc.id === excluirInscripcionId) continue;
      const ins: any = insDoc.data() || {};
      const estado = String(ins.estado || '').toLowerCase();
      if (estado === 'cancelada') continue;   // cancelada: el alumno puede volver a inscribirse

      let edicionIns = String(ins.edicion || '').trim();
      if (!edicionIns) {
        const f = ins.fechaInscripcion?.toDate ? ins.fechaInscripcion.toDate() : (ins.fechaInscripcion ? new Date(ins.fechaInscripcion) : null);
        if (f && !isNaN(f.getTime())) edicionIns = String(f.getFullYear());
      }
      if (!edicionIns) {
        const m = String(ins.fechaTexto || '').match(/^(\d{4})/);
        if (m) edicionIns = m[1];
      }
      if (edicionIns && edicionIns !== edicionBuscada) continue;

      let alumnos: any[] = Array.isArray(ins.estudiantes) && ins.estudiantes.length ? ins.estudiantes : [];
      if (alumnos.length === 0) {
        try { alumnos = await this.obtenerEstudiantes(insDoc.id); } catch { alumnos = []; }
      }

      for (const alumno of alumnos) {
        const numero = String(alumno?.numeroDocumento || '').trim();
        const tipoAlumno = String(alumno?.tipoDocumento || '').trim().toLowerCase();
        const codigo = String(ins.codigo || insDoc.id || '').trim();
        const detalle = `${String(alumno?.grado || '').toUpperCase()} ${String(alumno?.nivel || '').toUpperCase()}`.trim();

        // 1) Coincidencia por documento
        const tipos = objetivoDoc.get(numero);
        if (numero && tipoAlumno !== 'sd' && tipos && (tipos.has('') || !tipoAlumno || tipos.has(tipoAlumno))) {
          const clave = `doc|${numero}|${codigo}`;
          if (!yaReportado.has(clave)) {
            yaReportado.add(clave);
            encontrados.push({ numeroDocumento: numero, nombre: '', inscripcionCodigo: codigo, estado: String(ins.estado || ''), tipoCoincidencia: 'documento', detalle });
          }
          continue;
        }

        // 2) Coincidencia por nombre + colegio (alumnos sin documento)
        if (objetivoNombre.size > 0) {
          const nombreAlumno = this.normalizarNombreCompleto(alumno?.nombres, alumno?.apellidos);
          if (!nombreAlumno) continue;
          const colegioAlumno = this.normalizarColegio(alumno?.colegio) || this.normalizarColegio(ins?.colegio);
          const claveObjetivo = `${colegioAlumno}|${nombreAlumno}`;
          const objetivo = objetivoNombre.get(claveObjetivo);
          if (!objetivo) continue;
          const clave = `nom|${claveObjetivo}|${codigo}`;
          if (yaReportado.has(clave)) continue;
          yaReportado.add(clave);
          encontrados.push({ numeroDocumento: '', nombre: objetivo.nombre, inscripcionCodigo: codigo, estado: String(ins.estado || ''), tipoCoincidencia: 'nombre', detalle });
        }
      }
    }
    return encontrados;
  }

  /** Nombre completo normalizado: sin tildes, sin signos y sin importar el orden. */
  private normalizarNombreCompleto(nombres?: string, apellidos?: string): string {
    return `${String(nombres || '')} ${String(apellidos || '')}`
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ').trim()
      .split(' ').filter(Boolean).sort().join(' ');
  }

  /** Código modular del colegio normalizado (para comparar nombres dentro del mismo colegio). */
  private normalizarColegio(colegio: any): string {
    return String(colegio?.CODIGOMODULAR || colegio?.codigoModular || colegio?.codigo || '').trim().toUpperCase();
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

  /**
   * Sube el comprobante que reemplaza el operador de ventanilla (corrección de una
   * inscripción que ya tenía voucher, típicamente de las inscripciones online).
   * Usa la MISMA ruta que el sistema online (`inscripciones-online/vouchers/<uid>/…`)
   * para que todo el sistema siga encontrando el archivo igual.
   */
  async subirVoucherVentanilla(file: File): Promise<{ downloadURL: string; storagePath: string; nombreArchivo: string }> {
    const auth = getAuth(firebaseApp);
    const uid = auth.currentUser?.uid || 'ventanilla';
    const storage = getStorage(firebaseApp);
    const nombreArchivo = file.name || 'voucher.jpg';
    const storagePath = `inscripciones-online/vouchers/${uid}/${Date.now()}_${nombreArchivo}`;
    const referencia = ref(storage, storagePath);
    await uploadBytes(referencia, file);
    const downloadURL = await getDownloadURL(referencia);
    return { downloadURL, storagePath, nombreArchivo };
  }

  /**
   * Hash SHA-256 del archivo, EXACTAMENTE igual que el sistema online: así se puede
   * detectar si la misma foto de comprobante ya fue usada en otra inscripción.
   */
  async calcularHashArchivo(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /** ¿Esa imagen de comprobante ya está usada? (se excluye la inscripción actual). */
  async existeVoucherHash(hash: string, excludeId?: string): Promise<boolean> {
    if (!hash) return false;
    const q = query(this.inscripcionesRef, where('voucherHash', '==', hash));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return false;
    if (excludeId) return snapshot.docs.some(d => d.id !== excludeId);
    return true;
  }

  async guardarInscripcion(inscripcion: Inscripcion): Promise<string> {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const fechaTexto = `${anio}-${mes}-${dia}`;
    const auth = getAuth(firebaseApp);
    const usuarioId = (auth.currentUser?.email || auth.currentUser?.uid || '').toLowerCase().trim();
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

  async guardarEstudiante(estudiante: Estudiante, inscripcionId: string): Promise<string> {
    let codigoEst = (estudiante as any).codigo || (estudiante as any).id;
    const esCodigoValido = codigoEst && /^\d{5}$/.test(String(codigoEst));
    if (!esCodigoValido) codigoEst = await this.siguienteCodigo('estudiantes', 10000);
    else codigoEst = String(codigoEst);
    const base: any = { ...estudiante };
    const ref = doc(this.firestore, 'inscripciones', inscripcionId, 'estudiantes', codigoEst);
    await setDoc(ref, {
      apellidos: base.apellidos ?? '',
      aulaAsignadaId: base.aulaAsignadaId ?? '',
      codigo: codigoEst,
      codigoAula: base.codigoAula ?? '',
      colegio: base.colegio ?? null,
      grado: base.grado ?? '',
      nivel: base.nivel ?? '',
      nombres: base.nombres ?? '',
      numeroDocumento: base.numeroDocumento ?? '',
      tipoDocumento: base.tipoDocumento ?? '',
      turnoCodigo: base.turnoCodigo ?? '',
      fechaRegistro: base.fechaRegistro || Timestamp.now()
    }, { merge: true });
    return codigoEst;
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

  async obtenerInscripcionesFiltradas(fechaTexto: string, usuarioId: string, ignorarFecha: boolean = false, buscarEnTodas: boolean = false): Promise<Inscripcion[]> {
    try {
      let q;
      if (buscarEnTodas) {
        // Búsqueda en TODA la colección (para el día del concurso: encontrar
        // cualquier inscripción por código, nombre, apellido o DNI).
        q = ignorarFecha
          ? query(this.inscripcionesRef)
          : query(this.inscripcionesRef, where('fechaTexto', '==', fechaTexto));
      } else if (ignorarFecha) {
        q = query(this.inscripcionesRef, where('usuarioId', '==', usuarioId));
      } else {
        q = query(
          this.inscripcionesRef,
          where('usuarioId', '==', usuarioId),
          where('fechaTexto', '==', fechaTexto)
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

  async eliminarEstudiante(inscripcionId: string, codigoEstudiante: string): Promise<void> {
    const insRef = doc(this.firestore, 'inscripciones', inscripcionId);
    const estRef = doc(this.firestore, 'inscripciones', inscripcionId, 'estudiantes', codigoEstudiante);
    await runTransaction(this.firestore, async (tx) => {
      const insSnap = await tx.get(insRef);
      if (!insSnap.exists()) throw new Error('Inscripción no existe');
      const insData: any = insSnap.data();
      const estSnap = await tx.get(estRef);
      if (!estSnap.exists()) throw new Error('Estudiante no encontrado');
      const estData: any = estSnap.data();
      const aulaId = String(estData.aulaAsignadaId || '').trim();
      const colegioId = String(estData.colegio?.CODIGOMODULAR || insData.colegio?.CODIGOMODULAR || '').trim();
      const estudiantesArr: any[] = insData.estudiantes || [];
      let remaining: any[] = estudiantesArr.filter((e: any) => {
        if (String(e.codigo || e.id) === String(codigoEstudiante)) return false;
        if (e.numeroDocumento && estData.numeroDocumento && String(e.numeroDocumento) === String(estData.numeroDocumento)) return false;
        if (String(e.nombres||'').toUpperCase().trim() === String(estData.nombres||'').toUpperCase().trim() && String(e.apellidos||'').toUpperCase().trim() === String(estData.apellidos||'').toUpperCase().trim()) return false;
        return true;
      });
      let nuevasAsignaciones: any[] = insData.asignacionesAula || [];
      const nombreCompleto = `${estData.nombres} ${estData.apellidos}`;
      nuevasAsignaciones = nuevasAsignaciones.filter((a: any) => !(a.aulaId === aulaId && a.estudianteNombre === nombreCompleto) && a.estudianteNombre !== nombreCompleto);
      if (aulaId) {
        const aulaRef = doc(this.firestore, 'turnosedicion', aulaId);
        const aulaSnap = await tx.get(aulaRef);
        if (aulaSnap.exists()) {
          const aulaData: any = aulaSnap.data();
          const inscritos = Math.max(0, (aulaData.inscritos || 0) - 1);
          const porColegio: any = { ...(aulaData.porColegio || {}) };
          if (colegioId && porColegio[colegioId] !== undefined) {
            porColegio[colegioId] = Math.max(0, (porColegio[colegioId] || 0) - 1);
            if (porColegio[colegioId] === 0) delete porColegio[colegioId];
          }
          tx.update(aulaRef, { inscritos, porColegio, fechaActualizacion: Timestamp.now() });
        }
      }
      tx.delete(estRef);
      tx.update(insRef, {
        estudiantes: remaining,
        asignacionesAula: nuevasAsignaciones,
        cantidadEstudiantes: remaining.length,
        fechaActualizacion: Timestamp.now()
      });
    });
    try {
      const colRef2 = collection(this.firestore, 'inscripciones', inscripcionId, 'estudiantes');
      const snap2 = await getDocs(colRef2);
      const remaining2 = snap2.docs.map(d => ({ ...d.data(), codigo: d.id, id: d.id }));
      const insSnap2 = await getDoc(insRef);
      const curArr: any[] = (insSnap2.data() as any)?.estudiantes || [];
      const needFix = curArr.length !== remaining2.length || curArr.some((e: any, i: number) => String(e.codigo || e.id) !== String((remaining2[i] as any)?.codigo || (remaining2[i] as any)?.id));
      if (needFix) {
        await updateDoc(insRef, { estudiantes: remaining2, cantidadEstudiantes: remaining2.length, fechaActualizacion: Timestamp.now() });
      }
    } catch {}
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

  escucharTodasLasInscripciones(
    callback: (inscripciones: Inscripcion[]) => void
  ): Unsubscribe {
    return onSnapshot(this.inscripcionesRef, (snapshot) => {
      const inscripciones = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Inscripcion));
      callback(inscripciones);
    });
  }

/** ¿Ese N° de operación ya está usado en otra inscripción? (evita duplicados de pago Yape) */
  async existeNumeroOperacion(numero: string, idExcluir: string = ''): Promise<boolean> {
    const num = String(numero || '').trim();
    if (!num) { return false; }
    try {
      const ref = this.inscripcionesRef;
      const [porVoucher, porDatos] = await Promise.all([
        getDocs(query(ref, where('voucherNumeroOperacion', '==', num))),
        getDocs(query(ref, where('datosPago.numeroOperacion', '==', num)))
      ]);
      const otros = [...porVoucher.docs, ...porDatos.docs].filter(d => d.id !== idExcluir);
      return otros.length > 0;
    } catch (e) {
      console.warn('No se pudo verificar el N° de operación:', e);
      return false;
    }
  }
}
