// services/aula.service.ts
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
  orderBy,
  getDoc
} from 'firebase/firestore';
import { firebaseApp } from '../firebase-config';
import { Aula } from '../models/aula.model';

const db = getFirestore(firebaseApp);

@Injectable({ providedIn: 'root' })
export class AulaService {
  private aulasRef = collection(db, 'aulas');

  // ==================== MÉTODOS ORIGINALES ====================

  async addAula(aula: Aula): Promise<string> {
    const docRef = await addDoc(this.aulasRef, {
      ...aula,
      fechaCreacion: Timestamp.now()
    });
    return docRef.id;
  }

  async getAulas(): Promise<Aula[]> {
    const q = query(this.aulasRef, orderBy('codigo', 'asc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      
      return {
        id: doc.id,
        ...data
      } as Aula;
    });
  }

  async updateAula(aulaId: string, datos: Partial<Aula>): Promise<void> {
    const docRef = doc(db, 'aulas', aulaId);
    await updateDoc(docRef, {
      ...datos,
      fechaActualizacion: Timestamp.now()
    });
  }

  async deleteAula(aulaId: string): Promise<void> {
    const docRef = doc(db, 'aulas', aulaId);
    await deleteDoc(docRef);
  }

  // ==================== NUEVOS MÉTODOS PARA TURNOS ====================

  // Obtener un aula específica por su ID
  async getAulaById(aulaId: string): Promise<Aula | null> {
    const docRef = doc(db, 'aulas', aulaId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      } as Aula;
    }
    return null;
  }

  // Obtener aulas por código (para búsquedas)
  async getAulasByCodigo(codigo: string): Promise<Aula[]> {
    const q = query(
      this.aulasRef,
      where('codigo', '>=', codigo),
      where('codigo', '<=', codigo + '\uf8ff'),
      orderBy('codigo', 'asc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Aula));
  }

  // Verificar si un código de aula ya existe
  async existeCodigoAula(codigo: string): Promise<boolean> {
    const q = query(this.aulasRef, where('codigo', '==', codigo));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  }

  // Obtener aulas por pabellón
  async getAulasByPabellon(pabellon: string): Promise<Aula[]> {
    const q = query(
      this.aulasRef,
      where('pabellon', '==', pabellon),
      orderBy('codigo', 'asc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Aula));
  }

  // Obtener aulas por local
  async getAulasByLocal(local: string): Promise<Aula[]> {
    const q = query(
      this.aulasRef,
      where('local', '==', local),
      orderBy('codigo', 'asc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Aula));
  }

  // Obtener capacidad total de todas las aulas
  async getCapacidadTotal(): Promise<number> {
    const aulas = await this.getAulas();
    return aulas.reduce((total, aula) => total + (aula.capacidad || 0), 0);
  }
}