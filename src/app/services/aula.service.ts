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
  orderBy
} from 'firebase/firestore';
import { firebaseApp } from '../firebase-config';
import { Aula } from '../models/aula.model';

const db = getFirestore(firebaseApp);

@Injectable({ providedIn: 'root' })
export class AulaService {
  private aulasRef = collection(db, 'aulas');

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
}