import { Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * Datos que se envían a la función `enviarMensajeWhatsApp` (us-central1).
 *
 * La función del servidor ya tiene las plantillas de WhatsApp y sus variables:
 *  - individual    → plantilla "resultados_individual"  (idioma "es")
 *                    variables: evento, edición, url, nombre, código, sede
 *  - institucional → plantilla "resultados_institucional" (idioma "es_PE")
 *                    variables: evento, edición, cantidad, url, código, código modular, sede
 *
 * Por eso aquí SOLO se mandan los datos: no se tocan tokens, credenciales ni plantillas.
 */
export interface EnvioWhatsapp {
  telefono: string;
  tipo: 'individual' | 'institucional';
  nombre?: string;
  evento: string;
  edicion: string;
  url: string;
  codigo: string;
  sede: string;
  cantidad?: number;
  codigoModular?: string;
}

export interface RespuestaWhatsapp {
  success: boolean;
  messageId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class WhatsappService {

  private functions = getFunctions(getApp(), 'us-central1');

  /** Envía el mensaje por WhatsApp usando la función del servidor. */
  async enviar(datos: EnvioWhatsapp): Promise<RespuestaWhatsapp> {
    const llamar = httpsCallable(this.functions, 'enviarMensajeWhatsApp');

    const respuesta = await llamar({
      telefono: datos.telefono,
      tipo: datos.tipo,
      nombre: datos.nombre || '',
      evento: datos.evento,
      edicion: datos.edicion,
      url: datos.url,
      codigo: datos.codigo,
      sede: datos.sede,
      cantidad: datos.cantidad ?? 1,
      codigoModular: datos.codigoModular || undefined
    });

    return (respuesta?.data || {}) as RespuestaWhatsapp;
  }
}
