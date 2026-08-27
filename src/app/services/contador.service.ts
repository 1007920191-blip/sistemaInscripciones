import { Injectable } from '@angular/core';
import { getFirestore, doc, runTransaction } from 'firebase/firestore';
import { firebaseApp } from '../firebase-config';

const db = getFirestore(firebaseApp);

@Injectable({ providedIn: 'root' })
export class ContadorService {
  private pagosRef = doc(db, 'contadores', 'pagos');
  private estudiantesRef = doc(db, 'contadores', 'estudiantes');

  async siguienteCodigoInscripcion(): Promise<string> {
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(this.pagosRef);
      let valor: number;
      if (!snap.exists()) {
        valor = 1000;
        tx.set(this.pagosRef, { valor: valor + 1 });
        return String(valor);
      }
      const data: any = snap.data();
      valor = typeof data['valor'] === 'number' ? data['valor'] : typeof data['ultimo'] === 'number' ? data['ultimo'] + 1 : 1000;
      if (valor < 1000) valor = 1000;
      tx.update(this.pagosRef, { valor: valor + 1 });
      return String(valor);
    });
  }

  async siguienteCodigoEstudiante(): Promise<string> {
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(this.estudiantesRef);
      let valor: number;
      if (!snap.exists()) {
        valor = 10000;
        tx.set(this.estudiantesRef, { valor: valor + 1 });
        return String(valor);
      }
      const data: any = snap.data();
      valor = typeof data['valor'] === 'number' ? data['valor'] : typeof data['ultimo'] === 'number' ? data['ultimo'] + 1 : 10000;
      if (valor < 10000) valor = 10000;
      tx.update(this.estudiantesRef, { valor: valor + 1 });
      return String(valor);
    });
  }

  async inicializarContadores(): Promise<void> {
    const { getDoc, setDoc } = await import('firebase/firestore');
    const snapPagos = await getDoc(this.pagosRef);
    if (!snapPagos.exists()) await setDoc(this.pagosRef, { valor: 1000 });
    const snapEst = await getDoc(this.estudiantesRef);
    if (!snapEst.exists()) await setDoc(this.estudiantesRef, { valor: 10000 });
  }
}
