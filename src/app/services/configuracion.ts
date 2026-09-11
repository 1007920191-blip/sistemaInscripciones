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
  private configRef = doc(db, 'configuraciones', 'general');
  private configRefLegacy = doc(db, 'Configuracion', 'general');
  private configRefOmr = doc(db, 'configuraciones', 'omr');
  private configCollection = collection(db, 'configuraciones');

  private isConfigVacia(data: any): boolean {
    if (!data) return true;
    return !data['nombreConcurso'] && !data['eslogan'] && !data['logoIzquierdo'] && !data['logoDerecho'] && !data['fondoCredencial'];
  }

  // Obtener configuración actual
  async obtenerConfiguracion(): Promise<Configuracion | null> {
  try {
    let docSnap = await getDoc(this.configRef);
    let data: any = docSnap.exists() ? docSnap.data() : null;
    let esVacia = !docSnap.exists() || this.isConfigVacia(data);
    if (esVacia) {
      const omrSnap = await getDoc(this.configRefOmr);
      if (omrSnap.exists()) {
        const omrData: any = omrSnap.data();
        if (!this.isConfigVacia(omrData)) {
          try { await setDoc(this.configRef, omrData as any, { merge: true } as any); } catch {}
          data = omrData;
          docSnap = omrSnap as any;
          esVacia = false;
        }
      }
    }
    if (esVacia) {
      const legacy = await getDoc(this.configRefLegacy);
      if (legacy.exists()) {
        const legacyData: any = legacy.data();
        if (!this.isConfigVacia(legacyData)) {
          try { await setDoc(this.configRef, legacyData as any, { merge: true } as any); } catch {}
          data = legacyData;
          docSnap = legacy as any;
        }
      }
    }
    if (docSnap.exists() && data && !this.isConfigVacia(data)) {
      return {
        id: docSnap.id,
        nombreConcurso: data['nombreConcurso'] || '',
        edicion: data['edicion'] || new Date().getFullYear().toString(),
        eslogan: data['eslogan'] || '',
        logoIzquierdo: data['logoIzquierdo'] || '',
        logoDerecho: data['logoDerecho'] || '',
        fondoCredencial: data['fondoCredencial'] || '',
        costoInscripcion: data['costoInscripcion'] || 15,
        telefonoYape: data['telefonoYape'] || '',
        titularYape: data['titularYape'] || data['nombreYape'] || '',
        nombreCompletoTitularYape: data['nombreCompletoTitularYape'] || data['titularYape'] || '',
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
      costoInscripcion: 15,
      telefonoYape: '',
      titularYape: '',
      nombreCompletoTitularYape: ''
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
      costoInscripcion: 15,
      telefonoYape: '',
      titularYape: '',
      nombreCompletoTitularYape: ''
    };
    }
  }

  // Guardar o actualizar configuración
  async guardarConfiguracion(config: Configuracion): Promise<void> {
  try {
    const data: any = {
      nombreConcurso: config.nombreConcurso,
      edicion: config.edicion,
      eslogan: config.eslogan,
      logoIzquierdo: config.logoIzquierdo,
      logoDerecho: config.logoDerecho,
      fondoCredencial: config.fondoCredencial,
      costoInscripcion: config.costoInscripcion,
      telefonoYape: (config as any).telefonoYape || '',
      titularYape: (config as any).titularYape || '',
      nombreCompletoTitularYape: (config as any).nombreCompletoTitularYape || '',
      fechaActualizacion: Timestamp.now()
    };
    
    console.log('✅ Service: Guardando datos en configuraciones/general:', data); // ← DEBUG
    await setDoc(this.configRef, data);
    console.log('✅ Service: Datos guardados en configuraciones/general'); // ← DEBUG
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