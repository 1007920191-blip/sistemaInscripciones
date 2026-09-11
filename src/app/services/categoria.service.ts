import { Injectable } from '@angular/core';
import { getFirestore, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { firebaseApp } from '../firebase-config';

const db = getFirestore(firebaseApp);

export interface CondicionCategoria {
  campo: 'GESTION' | 'AREA' | 'NIVEL';
  operador: 'IGUAL' | 'DIFERENTE';
  valor: string;
}

export interface CategoriaCalificacion {
  id?: string;
  nombre: string;
  tipo: 'NORMAL' | 'INTERNA';
  PUESTOPREMIADO: number;
  activa: boolean;
  condiciones: CondicionCategoria[];
  institucionesInternas: any[];
  fechaCreacion?: any;
  fechaActualizacion?: any;
}

@Injectable({ providedIn: 'root' })
export class CategoriaService {
  async obtenerCategorias(): Promise<CategoriaCalificacion[]> {
    const snap = await getDocs(collection(db, 'categoriasCalificacion'));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as CategoriaCalificacion)).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  }

  async crearCategoria(cat: CategoriaCalificacion): Promise<string> {
    const data: any = {
      nombre: cat.nombre.toUpperCase().trim(),
      tipo: cat.tipo,
      PUESTOPREMIADO: Number(cat.PUESTOPREMIADO) || 1,
      activa: cat.activa !== false,
      condiciones: cat.tipo === 'NORMAL' ? (cat.condiciones || []) : [],
      institucionesInternas: cat.tipo === 'INTERNA' ? (cat.institucionesInternas || []) : [],
      fechaCreacion: Timestamp.now(),
      fechaActualizacion: Timestamp.now()
    };
    const ref = await addDoc(collection(db, 'categoriasCalificacion'), data);
    return ref.id;
  }

  async actualizarCategoria(id: string, cat: Partial<CategoriaCalificacion>): Promise<void> {
    const ref = doc(db, 'categoriasCalificacion', id);
    const data: any = { fechaActualizacion: Timestamp.now() };
    if (cat.nombre !== undefined) data.nombre = String(cat.nombre).toUpperCase().trim();
    if (cat.tipo !== undefined) data.tipo = cat.tipo;
    if ((cat as any).PUESTOPREMIADO !== undefined) data.PUESTOPREMIADO = Number((cat as any).PUESTOPREMIADO);
    if (cat.activa !== undefined) data.activa = cat.activa;
    if (cat.condiciones !== undefined) data.condiciones = cat.condiciones;
    if (cat.institucionesInternas !== undefined) data.institucionesInternas = cat.institucionesInternas;
    await updateDoc(ref, data);
  }

  async eliminarCategoria(id: string): Promise<void> {
    await deleteDoc(doc(db, 'categoriasCalificacion', id));
  }

  async toggleActiva(cat: CategoriaCalificacion): Promise<void> {
    await this.actualizarCategoria(cat.id!, { activa: !cat.activa });
  }
}
