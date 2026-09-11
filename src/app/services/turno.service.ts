import { Injectable } from '@angular/core';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
  query,
  orderBy,
  setDoc
} from 'firebase/firestore';
import { firebaseApp } from '../firebase-config';
import { Turno } from '../models/turno.model';

const db = getFirestore(firebaseApp);

@Injectable({ providedIn: 'root' })
export class TurnoService {
  private turnosRef = collection(db, 'turnos');

  private toTimestamp(fecha: Date, hora: any): Timestamp {
    if (!hora) return Timestamp.fromDate(fecha);
    if (hora && typeof (hora as any).toDate === 'function') return hora as Timestamp;
    if (hora && typeof (hora as any).seconds === 'number') return new Timestamp((hora as any).seconds, (hora as any).nanoseconds || 0);
    if (hora instanceof Date) return Timestamp.fromDate(hora);
    if (typeof hora === 'string') {
      const m = hora.match(/^(\d{1,2}):(\d{2})/);
      if (m) {
        const d = new Date(fecha);
        d.setHours(parseInt(m[1],10), parseInt(m[2],10), 0, 0);
        return Timestamp.fromDate(d);
      }
      const d = new Date(hora);
      if (!isNaN(d.getTime())) return Timestamp.fromDate(d);
      return Timestamp.fromDate(fecha);
    }
    return Timestamp.fromDate(fecha);
  }

  private parseFechaLocal(s: string): Date {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10));
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  async guardarTurno(turno: Turno): Promise<string> {
    const codigo = (turno.codigo || '').trim().toUpperCase();
    if (!codigo) throw new Error('Código requerido');
    const id = codigo;
    let fecha: Date;
    if (turno.fecha instanceof Date) fecha = new Date(turno.fecha.getFullYear(), turno.fecha.getMonth(), turno.fecha.getDate());
    else if ((turno.fecha as any)?.toDate) { const d=(turno.fecha as any).toDate(); fecha=new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    else if ((turno.fecha as any)?.seconds) { const d=new Date((turno.fecha as any).seconds*1000); fecha=new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    else fecha = this.parseFechaLocal(String((turno.fecha as any) || ''));
    const datos: any = {
      codigo,
      fecha: Timestamp.fromDate(fecha),
      horaInicioEntrada: this.toTimestamp(fecha, turno.horaInicioEntrada as any),
      horaFinEntrada: this.toTimestamp(fecha, turno.horaFinEntrada as any),
      horaInicioPrueba: this.toTimestamp(fecha, turno.horaInicioPrueba as any),
      horaFinPrueba: this.toTimestamp(fecha, turno.horaFinPrueba as any),
      nivel: turno.nivel,
      grados: turno.grados || [],
      nivelesGrados: turno.nivelesGrados || [],
      estado: 'activo' as const,
      fechaCreacion: Timestamp.now(),
    };
    await setDoc(doc(db, 'turnos', id), datos, { merge: true });
    return id;
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
    const id = (turnoId || (datos as any).codigo || '').trim().toUpperCase();
    const docRef = doc(db, 'turnos', id);
    const patch: any = { ...datos };
    if (patch.codigo) patch.codigo = patch.codigo.trim().toUpperCase();
    if (patch.fecha) {
      let f:Date;
      if (patch.fecha instanceof Date) f=new Date(patch.fecha.getFullYear(), patch.fecha.getMonth(), patch.fecha.getDate());
      else if (patch.fecha?.toDate) { const d=patch.fecha.toDate(); f=new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
      else if (patch.fecha?.seconds) { const d=new Date(patch.fecha.seconds*1000); f=new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
      else f=this.parseFechaLocal(String(patch.fecha));
      patch.fecha = Timestamp.fromDate(f);
    }
    let fechaBase: Date;
    if (patch.fecha?.toDate) { const d=patch.fecha.toDate(); fechaBase=new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    else fechaBase = new Date();
    const toTS = (h:any) => {
      if (!h) return undefined;
      if (h?.toDate || h?.seconds) return h;
      if (typeof h === 'string') {
        const m = h.match(/^(\d{1,2}):(\d{2})/);
        if (m) { const d=new Date(fechaBase); d.setHours(+m[1],+m[2],0,0); return Timestamp.fromDate(d); }
      }
      return h;
    };
    ['horaInicioEntrada','horaFinEntrada','horaInicioPrueba','horaFinPrueba'].forEach(k=>{
      if (patch[k] !== undefined) {
        const v = toTS(patch[k]);
        if (v) patch[k]=v;
      }
    });
    patch.fechaActualizacion = Timestamp.now();
    await updateDoc(docRef, patch);
  }

  async eliminarTurno(turnoId: string): Promise<void> {
    const docRef = doc(db, 'turnos', turnoId);
    await deleteDoc(docRef);
  }
}