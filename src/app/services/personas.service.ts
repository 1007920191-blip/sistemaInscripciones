import { Injectable } from '@angular/core';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { firebaseApp } from '../firebase-config';

const db = getFirestore(firebaseApp);

/** Datos de una persona que sí se pueden autocompletar en el formulario. */
export interface PersonaEncontrada {
  nombres: string;
  apellidos: string;
  /** Solo si el tipo de la colección `personas` corresponde a una opción del formulario. */
  tipoDocumentoId?: 'dni' | 'ce';
}

export type ResultadoPersona =
  | { estado: 'encontrada'; persona: PersonaEncontrada }
  | { estado: 'no-encontrada' }
  | { estado: 'error'; mensaje: string };

/**
 * Consulta de personas registradas por número de documento.
 *
 * Lee la colección `personas` que ya existe (documentos con NUMERODOCUMENTO,
 * NOMBRES, APELLIDOS, TIPODOCUMENTO, TELEFONO, GRADO, NIVEL, EDICION).
 * Solo LEE: nunca crea ni modifica documentos.
 *
 * Campos que se devuelven y por qué:
 *   NUMERODOCUMENTO -> es el número buscado (no se reescribe).
 *   NOMBRES / APELLIDOS -> sí, son los datos que el operador tendría que teclear.
 *   TIPODOCUMENTO -> solo si equivale a una opción del formulario (DNI / Carnet de
 *     Extranjería). Cualquier otro texto se ignora para no romper el <select>.
 * NO se devuelven GRADO ni NIVEL: en este sistema los determina el concurso y la
 * selección del usuario. Tampoco TELEFONO: el formulario de estudiante no tiene
 * teléfono (el teléfono es del apoderado, en la inscripción).
 */
@Injectable({ providedIn: 'root' })
export class PersonasService {
  private cache = new Map<string, ResultadoPersona>();

  /** Longitud mínima para lanzar la búsqueda, según el tipo de documento. */
  longitudMinima(tipoDocumento: string): number {
    const tipo = String(tipoDocumento || '').toLowerCase().trim();
    if (tipo === 'dni') return 8;      // DNI peruano: 8 dígitos
    if (tipo === 'ce') return 9;       // Carnet de extranjería: 9 o más
    if (tipo === 'sd') return Infinity; // "Sin documento": no se busca
    return 5;                          // Otros (p. ej. pasaporte): se busca al perder el foco
  }

  /** ¿Ya vale la pena consultar con este número? (evita una consulta por tecla) */
  longitudSuficiente(tipoDocumento: string, numeroDocumento: string): boolean {
    const numero = String(numeroDocumento || '').trim();
    return numero.length >= this.longitudMinima(tipoDocumento);
  }

  async buscarPorDocumento(numeroDocumento: string): Promise<ResultadoPersona> {
    const numero = String(numeroDocumento || '').trim();
    if (!numero) return { estado: 'no-encontrada' };

    const enCache = this.cache.get(numero);
    if (enCache) return enCache;

    try {
      const snap = await getDocs(
        query(collection(db, 'personas'), where('NUMERODOCUMENTO', '==', numero))
      );

      if (snap.empty) {
        const sinResultado: ResultadoPersona = { estado: 'no-encontrada' };
        this.cache.set(numero, sinResultado);
        return sinResultado;
      }

      const datos: any = snap.docs[0].data();
      const persona: PersonaEncontrada = {
        nombres: String(datos['NOMBRES'] || '').toUpperCase().trim(),
        apellidos: String(datos['APELLIDOS'] || '').toUpperCase().trim(),
        tipoDocumentoId: this.mapearTipoDocumento(datos['TIPODOCUMENTO'])
      };

      const encontrada: ResultadoPersona = { estado: 'encontrada', persona };
      this.cache.set(numero, encontrada);
      return encontrada;
    } catch (error: any) {
      // Nunca se propaga: el formulario debe poder continuar a mano.
      return { estado: 'error', mensaje: error?.message || 'No se pudo consultar' };
    }
  }

  /** Limpia la caché (útil al recargar un formulario desde cero). */
  limpiarCache(): void {
    this.cache.clear();
  }

  /**
   * "CARNET DE EXTRANJERÍA" -> 'ce', "DNI" / "DOCUMENTO NACIONAL DE IDENTIDAD" -> 'dni'.
   * Cualquier otro texto devuelve undefined (no se toca el formulario).
   */
  private mapearTipoDocumento(valor: unknown): 'dni' | 'ce' | undefined {
    const texto = String(valor || '').toUpperCase();
    if (!texto) return undefined;
    if (texto.includes('EXTRANJER')) return 'ce';
    if (texto.includes('DNI') || texto.includes('IDENTIDAD')) return 'dni';
    return undefined;
  }
}
