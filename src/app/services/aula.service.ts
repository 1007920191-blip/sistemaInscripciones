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
  getDoc,
  setDoc
} from 'firebase/firestore';
import { firebaseApp } from '../firebase-config';
import { Aula } from '../models/aula.model';
import { environment } from '../../environments/environment';

const db = getFirestore(firebaseApp);

@Injectable({ providedIn: 'root' })
export class AulaService {
  private aulasRef = collection(db, 'aulas');

  // ==================== MÉTODOS ORIGINALES ====================

  async addAula(aula: Aula): Promise<string> {
    const codigoNorm = aula.codigo.trim().toUpperCase();
    const codigoLower = codigoNorm.toLowerCase();
    const email = `${codigoLower}@solaris.com`;
    if (!codigoNorm) throw new Error('Código requerido');
    if (await this.existeCodigoAula(codigoNorm)) throw new Error(`El aula ${codigoNorm} ya existe`);
    const usuarioRef = doc(db, 'usuariosaulas', email);
    try {
      await setDoc(usuarioRef, { AULA: codigoNorm });
    } catch (e: any) {
      throw new Error('Error creando documento usuariosaulas: ' + e?.message);
    }
    let docId = '';
    try {
      const docRef = await addDoc(this.aulasRef, {
        ...aula,
        codigo: codigoNorm,
        fechaCreacion: Timestamp.now()
      });
      docId = docRef.id;
    } catch (e: any) {
      try { await deleteDoc(usuarioRef); } catch {}
      throw new Error(e?.message || 'Error creando aula');
    }
    fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${environment.firebase.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: '123456', returnSecureToken: false })
    }).then(async r => {
      const d: any = await r.json().catch(() => ({}));
      if (!r.ok && d?.error?.message !== 'EMAIL_EXISTS') console.error('Auth no creado:', d);
      else console.log('Auth OK/reutilizado:', email);
    }).catch(err => console.error('Auth error:', err));
    return docId;
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
    const aula = await this.getAulaById(aulaId);
    const docRef = doc(db, 'aulas', aulaId);
    await deleteDoc(docRef);
    if (aula?.codigo) {
      const email = `${aula.codigo.trim().toLowerCase()}@solaris.com`;
      try { await deleteDoc(doc(db, 'usuariosaulas', email)); } catch {}
    }
  }

  async eliminarAulaCompleta(aulaId: string): Promise<void> {
    return this.deleteAula(aulaId);
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

  async existeCodigoAula(codigo: string): Promise<boolean> {
    try {
      const q = query(this.aulasRef, where('codigo', '==', codigo));
      const snap = await Promise.race([
        getDocs(q),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500))
      ]) as any;
      return !snap.empty;
    } catch { return false; }
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