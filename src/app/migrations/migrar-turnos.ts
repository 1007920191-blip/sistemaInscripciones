// src/app/migrations/migrar-turnos.ts
import { getFirestore, collection, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { firebaseApp } from '../firebase-config';

const db = getFirestore(firebaseApp);

export async function migrarTurnos() {
  console.log('Iniciando migración...');
  
  const turnosSnap = await getDocs(collection(db, 'turnos'));
  let contador = 0;
  
  for (const d of turnosSnap.docs) {
    const data = d.data();
    if (!data['ModoAsignacion']) {
      await updateDoc(doc(db, 'turnos', d.id), {
        modoAsignacion: 'normal',
        cierreManual: null,
        fechaActualizacion: Timestamp.now()
      });
      contador++;
      console.log(`✓ Migrado turno ${d.id}`);
    }
  }

  const turnosEdicionSnap = await getDocs(collection(db, 'turnosedicion'));
  let contadorAulas = 0;
  
  for (const d of turnosEdicionSnap.docs) {
    const data = d.data();
    if (!data['porColegio']) {
      await updateDoc(doc(db, 'turnosedicion', d.id), {
        porColegio: {},
        fechaActualizacion: Timestamp.now()
      });
      contadorAulas++;
      console.log(`✓ Migrado turno-aula ${d.id}`);
    }
  }

  console.log(`Migración completada: ${contador} turnos, ${contadorAulas} aulas`);
}