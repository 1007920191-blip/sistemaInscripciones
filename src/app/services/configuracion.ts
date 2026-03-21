import { Injectable } from '@angular/core';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  Timestamp 
} from 'firebase/firestore';
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'firebase/storage';
import { firebaseApp } from '../firebase-config';
import { Configuracion } from '../models/configuracion.model';

const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  private configRef = doc(db, 'Configuracion', 'general');
  private configCollection = collection(db, 'Configuracion');

  // Obtener configuración actual
  async obtenerConfiguracion(): Promise<Configuracion | null> {
  try {
    const docSnap = await getDoc(this.configRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        nombreConcurso: data['nombreConcurso'] || '',
        edicion: data['edicion'] || new Date().getFullYear().toString(),
        eslogan: data['eslogan'] || '',
        logoIzquierdo: data['logoIzquierdo'] || '',
        logoDerecho: data['logoDerecho'] || '',
        fondoCredencial: data['fondoCredencial'] || '',
        costoInscripcion: data['costoInscripcion'] || 15,
        fechaActualizacion: data['fechaActualizacion']?.toDate?.() || new Date()
      } as Configuracion;
    }
      return {
      nombreConcurso: 'X Concurso de Matemática',
      edicion: '2026',
      eslogan: 'El gran reto',
      logoIzquierdo: '',
      logoDerecho: '',
      fondoCredencial: '',
      costoInscripcion: 15
    };
    } catch (error) {
      console.error('Error al obtener configuración:', error);
      return {
      nombreConcurso: 'X Concurso de Matemática',
      edicion: '2026',
      eslogan: 'El gran reto',
      logoIzquierdo: '',
      logoDerecho: '',
      fondoCredencial: '',
      costoInscripcion: 15
    };
    }
  }

  // Guardar o actualizar configuración
  async guardarConfiguracion(config: Configuracion): Promise<void> {
  try {
    const data = {
      nombreConcurso: config.nombreConcurso,
      edicion: config.edicion,
      eslogan: config.eslogan,
      logoIzquierdo: config.logoIzquierdo,
      logoDerecho: config.logoDerecho,
      fondoCredencial: config.fondoCredencial,
      costoInscripcion: config.costoInscripcion,
      fechaActualizacion: Timestamp.now()
    };
    
    console.log('✅ Service: Guardando datos:', data); // ← DEBUG
    await setDoc(this.configRef, data);
    console.log('✅ Service: Datos guardados'); // ← DEBUG
  } catch (error) {
    console.error('❌ Service: Error al guardar:', error); // ← DEBUG
    throw error;
  }
}

  // Subir imagen a Firebase Storage
  async subirImagen(file: File, tipo: 'logoIzquierdo' | 'logoDerecho' | 'fondoCredencial'): Promise<string> {
    try {
      const timestamp = new Date().getTime();
      const fileName = `${tipo}_${timestamp}_${file.name}`;
      const storageRef = ref(storage, `configuracion/${fileName}`);
      
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('Error al subir imagen:', error);
      throw error;
    }
  }

  // Obtener solo el costo de inscripción (para uso rápido)
  async obtenerCostoInscripcion(): Promise<number> {
    try {
      const config = await this.obtenerConfiguracion();
      return config?.costoInscripcion || 15; // Valor por defecto
    } catch (error) {
      return 15;
    }
  }
}