import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getFirestore, doc as firestoreDoc, getDoc, updateDoc } from 'firebase/firestore';
import { firebaseApp } from '../../../firebase-config';
import jsQR from 'jsqr';

/** true si la librería del lector QR quedó instalada y disponible en el bundle */
const LIBRERIA_QR_DISPONIBLE = typeof jsQR === 'function';

/**
 * SCANNER DE CALIFICACIONES (presencial)
 * - Busca por código (escrito, escaneado con lector USB o con la cámara del navegador).
 * - Código completo: INSCRIPCION-ESTUDIANTE (ej. 1492-11094).
 * - El QR de la tarjeta trae: CONCURSO/EDICION/SEDE/TURNO/AULA/INSCRIPCION/ESTUDIANTE/NOMBRES/APELLIDOS
 */
@Component({
  selector: 'app-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scanner.html',
  styleUrl: './scanner.css',
})
export class ScannerComponent implements OnDestroy {
  constructor(private zone: NgZone, private cdr: ChangeDetectorRef) {}

  /** Fuerza el repintado de la pantalla (el escaneo corre fuera de la zona de Angular). */
  /** Repinta la pantalla de inmediato (el escaneo corre fuera de la zona de Angular). */
  private refrescar(): void {
    try { this.cdr.detectChanges(); } catch { /* aún no inicializado */ }
  }

  private pintar(fn: () => void): void {
    try { this.zone.run(fn); } catch { fn(); }
    this.refrescar();
  }
  @ViewChild('codigoInput') codigoInput?: ElementRef<HTMLInputElement>;
  @ViewChild('videoCamara') videoCamara?: ElementRef<HTMLVideoElement>;

  codigo = '';
  mensaje = '';
  tipoMensaje: 'ok' | 'error' | 'info' = 'info';
  buscando = false;
  guardando = false;

  // Participante encontrado
  encontrado = false;
  inscripcionId = '';
  estudianteId = '';
  documento = '';
  nombres = '';
  ie = '';
  gestion = '';
  grado = '';

  // Calificación (manual)
  correctas = 0;
  incorrectas = 0;
  blanco = 20;
  puntaje = 0;

  totalPreguntas = 20;

  // Cámara
  camaraActiva = false;
  private stream: MediaStream | null = null;
  private intervaloEscaneo: ReturnType<typeof setInterval> | null = null;
  private temporizadorCodigo: ReturnType<typeof setTimeout> | null = null;
  private ultimoProcesado = '';

  private db = getFirestore(firebaseApp);

  ngOnDestroy(): void {
    this.detenerCamara();
    if (this.temporizadorCodigo) { clearTimeout(this.temporizadorCodigo); }
  }

  /** Escribe un código o el lector USB escribe rápido: se busca solo (150 ms). */
  onCodigoChange(valor: string): void {
    this.codigo = String(valor ?? '');
    if (this.temporizadorCodigo) { clearTimeout(this.temporizadorCodigo); }
    this.temporizadorCodigo = setTimeout(() => {
      if (this.codigo.trim().includes('/') || this.codigo.trim().includes('-')) {
        void this.buscar();
      }
    }, 150);
  }

  /** Recalcula B y P según C e I (B = 20 - C - I, P = C * 10). */
  recalcular(): void {
    const c = Math.max(0, Number(this.correctas) || 0);
    const i = Math.max(0, Number(this.incorrectas) || 0);
    this.correctas = c;
    this.incorrectas = i;
    const b = this.totalPreguntas - c - i;
    this.blanco = b >= 0 ? b : 0;
    this.puntaje = c * 10;
  }

  get sumaValida(): boolean {
    return (Number(this.correctas) || 0) + (Number(this.incorrectas) || 0) + (Number(this.blanco) || 0) === this.totalPreguntas;
  }

  /** Acepta: el texto del QR completo, el formato corto de la cartilla o INSCRIPCION-ESTUDIANTE. */
  private extraerIds(valor: string): { inscripcionId: string; estudianteId: string } | null {
    const texto = String(valor ?? '').trim();
    if (!texto) { return null; }

    if (texto.includes('/')) {
      const p = texto.split('/').map(x => x.trim());
      // Formato tarjeta: CONCURSO/EDICION/SEDE/TURNO/AULA/INSCRIPCION/ESTUDIANTE/...
      if (p.length >= 7) {
        const ins = p[5]; const est = p[6];
        if (/^\d+$/.test(ins) && /^\d+$/.test(est)) { return { inscripcionId: ins, estudianteId: est }; }
      }
      // Formato cartilla: TURNO/AULA/INSCRIPCION/ESTUDIANTE/...
      if (p.length >= 4) {
        const ins = p[2]; const est = p[3];
        if (/^\d+$/.test(ins) && /^\d+$/.test(est)) { return { inscripcionId: ins, estudianteId: est }; }
      }
      return null;
    }

    const partes = texto.split('-').map(x => x.trim());
    if (partes.length !== 2) { return null; }
    if (!/^\d+$/.test(partes[0]) || !/^\d+$/.test(partes[1])) { return null; }
    return { inscripcionId: partes[0], estudianteId: partes[1] };
  }

  /** Busca el estudiante y llena los campos. */
  async buscar(): Promise<void> {
    const ids = this.extraerIds(this.codigo);
    if (!ids) {
      this.avisar('Escriba o escanee un código válido, por ejemplo: 1492-11094', 'error');
      return;
    }

    this.buscando = true;
    this.encontrado = false;
    this.mensaje = '';
    try {
      const ref = firestoreDoc(this.db, 'inscripciones', ids.inscripcionId, 'estudiantes', ids.estudianteId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        this.avisar('No se encontró ningún estudiante con ese código.', 'error');
        return;
      }
      const e: any = snap.data() || {};
      const col: any = e.colegio || {};

      this.inscripcionId = ids.inscripcionId;
      this.estudianteId = ids.estudianteId;
      this.documento = String(e.numeroDocumento || '');
      this.nombres = `${e.nombres || ''} ${e.apellidos || ''}`.trim();
      this.ie = String(col.IE || '');
      this.gestion = [col.GESTION, col.AREA].filter((x: any) => !!x).join(' · ');
      this.grado = `${e.grado || ''} ${e.nivel || ''}`.trim();
      this.encontrado = true;

      // Precarga la calificación si ya tenía (varias formas de nombre)
      this.correctas = Number(e.CORRECTAS ?? e.correctas ?? e.ACIERTOS ?? 0) || 0;
      this.incorrectas = Number(e.INCORRECTAS ?? e.incorrectas ?? e.ERRORES ?? 0) || 0;
      this.recalcular();

      this.avisar('Estudiante encontrado', 'ok');
      if (this.camaraActiva) { this.detenerCamara(); }
    } catch (err) {
      console.error('Error al buscar estudiante:', err);
      this.avisar('No fue posible consultar. Revisa tu conexión.', 'error');
    } finally {
      this.buscando = false;
      this.refrescar();
    }
  }

  /** Guarda la calificación en el mismo estudiante. */
  async guardar(): Promise<void> {
    if (!this.encontrado) {
      this.avisar('Primero busque o escanee el código del estudiante.', 'error');
      return;
    }
    this.recalcular();
    if (!this.sumaValida) {
      this.avisar(`La suma de correctas, incorrectas y en blanco debe ser exactamente ${this.totalPreguntas}.`, 'error');
      return;
    }

    this.guardando = true;
    try {
      const ref = firestoreDoc(this.db, 'inscripciones', this.inscripcionId, 'estudiantes', this.estudianteId);
      // Tiempo máximo: si Firebase no responde, se avisa (no se queda "Guardando...")
      const guardado = updateDoc(ref, {
        CORRECTAS: Number(this.correctas) || 0,
        INCORRECTAS: Number(this.incorrectas) || 0,
        ENBLANCO: Number(this.blanco) || 0,
        PUNTAJEFINAL: Number(this.puntaje) || 0,
      } as any);
      const tiempoMax = new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error('tiempo excedido')), 12000));
      await Promise.race([guardado, tiempoMax]);
      // Se limpian TODOS los campos de inmediato (queda listo para el siguiente alumno)
      this.limpiarCampos();
      this.avisar('Calificación guardada correctamente', 'ok');
      setTimeout(() => { this.mensaje = ''; this.refrescar(); }, 4000);
    } catch (err) {
      console.error('Error al guardar la calificación:', err);
      const cod = String((err as any)?.code || '');
      this.avisar(cod.includes('permission-denied') ? 'Firebase rechazó el guardado (permisos). Avisa al soporte técnico.' : 'No se pudo guardar: ' + (cod || (err as any)?.message || ''), 'error');
    } finally {
      this.guardando = false;
    }
  }

  /** Limpia los campos de trabajo pero conserva el mensaje de confirmación. */
  private limpiarCampos(): void {
    this.codigo = '';
    this.encontrado = false;
    this.documento = ''; this.nombres = ''; this.ie = ''; this.gestion = ''; this.grado = '';
    this.correctas = 0; this.incorrectas = 0; this.blanco = this.totalPreguntas; this.puntaje = 0;
    this.ultimoProcesado = '';
    this.detenerCamara();
  }

  limpiar(): void {
    // Se olvida el último código leído: permite volver a escanear la MISMA tarjeta
    this.ultimoProcesado = '';
    this.detenerCamara();
    this.codigo = '';
    this.encontrado = false;
    this.documento = ''; this.nombres = ''; this.ie = ''; this.gestion = ''; this.grado = '';
    this.correctas = 0; this.incorrectas = 0; this.blanco = this.totalPreguntas; this.puntaje = 0;
    this.mensaje = '';
    setTimeout(() => this.codigoInput?.nativeElement?.focus());
  }

  private avisar(texto: string, tipo: 'ok' | 'error' | 'info'): void {
    this.mensaje = texto;
    this.tipoMensaje = tipo;
    this.refrescar();
  }

  // ---------------- Cámara (BarcodeDetector nativo, sin librerías) ----------------

  async abrirCamara(): Promise<void> {
    const nav: any = navigator as any;
    if (!nav.mediaDevices || !nav.mediaDevices.getUserMedia) {
      this.avisar('Este navegador no permite usar la cámara. Use el lector USB o escriba el código.', 'error');
      return;
    }
    if (!LIBRERIA_QR_DISPONIBLE) {
      this.avisar('Falta la librería del lector QR (jsQR). Use el lector USB o escriba el código.', 'error');
      return;
    }

    // ¿El navegador ya tiene el permiso bloqueado?
    try {
      const permiso: any = await nav.permissions?.query?.({ name: 'camera' });
      if (permiso && permiso.state === 'denied') {
        this.avisar('La cámara está BLOQUEADA para este sitio. Haz clic en el candado 🔒 de la barra de direcciones → Cámara → Permitir, y recarga la página.', 'error');
        return;
      }
    } catch { /* algunos navegadores no soportan la consulta */ }

    this.detenerCamara();
    this.ultimoProcesado = ''; // cada apertura empieza de cero
    this.avisar('Abriendo cámara… (si el navegador pide permiso, pulsa PERMITIR)', 'info');

    let ultimoError: any = null;
    for (let intento = 1; intento <= 3; intento++) {
      try {
        const pedir = nav.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        // Tiempo máximo de 10 s por intento: nunca se queda "Abriendo cámara..."
        const limite = new Promise<never>((_, rechazar) =>
          setTimeout(() => rechazar(new Error('permiso pendiente')), 10000));
        this.stream = await Promise.race([pedir, limite]);
        ultimoError = null;
        break;
      } catch (err: any) {
        ultimoError = err;
        const msg = String(err?.name || err?.message || '');
        console.warn('Intento ' + intento + ' de abrir la cámara falló:', err);
        if (msg.includes('permiso pendiente') || msg.includes('NotAllowedError')) { break; }
        await new Promise(r => setTimeout(r, 400 * intento));
      }
    }

    if (!this.stream) {
      const msg = String(ultimoError?.name || ultimoError?.message || '');
      console.error('Error al abrir la cámara:', ultimoError);
      if (msg.includes('permiso pendiente')) {
        this.avisar('El navegador no respondió al permiso de la cámara. Revisa el candado 🔒 de la barra de direcciones → Cámara → Permitir (y recarga).', 'error');
      } else if (msg.includes('NotAllowedError')) {
        this.avisar('Permiso de cámara denegado. Habilítalo en el candado 🔒 de la barra de direcciones.', 'error');
      } else if (msg.includes('NotFoundError')) {
        this.avisar('No se encontró ninguna cámara conectada a este equipo.', 'error');
      } else if (msg.includes('NotReadableError')) {
        this.avisar('La cámara está siendo usada por otro programa. Ciérralo (Zoom, Meet, etc.) e intenta otra vez.', 'error');
      } else {
        this.avisar('No se pudo abrir la cámara: ' + (msg || 'error desconocido'), 'error');
      }
      return;
    }

    this.camaraActiva = true;
    this.refrescar();
    this.avisar('Apunte la cámara al código QR de la tarjeta (acérquelo y evite reflejos).', 'info');
    setTimeout(async () => {
      const video = this.videoCamara?.nativeElement;
      if (!video) { return; }
      // Necesario para que el navegador muestre el video (si no, sale en negro)
      video.muted = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('autoplay', 'true');
      video.srcObject = this.stream;
      const intentarPlay = async () => {
        try { await video.play(); return true; } catch { return false; }
      };
      if (!(await intentarPlay())) {
        setTimeout(() => { void intentarPlay(); }, 400);
      }
      // Algunos navegadores necesitan que el video ya tenga datos para pintar el primer cuadro
      const pintarPrimerCuadro = () => { try { void video.play(); } catch {} };
      video.onloadeddata = pintarPrimerCuadro;
      video.oncanplay = pintarPrimerCuadro;
      this.iniciarDeteccion();
    }, 150);
  }

  private iniciarDeteccion(): void {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.avisar('No se pudo preparar el lector de la cámara.', 'error');
      this.detenerCamara();
      return;
    }

    this.intervaloEscaneo = setInterval(() => {
      const video = this.videoCamara?.nativeElement;
      if (!video || video.readyState !== 4 || !video.videoWidth) { return; }
      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imagen = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const leido: any = jsQR(imagen.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
        const texto = String(leido?.data || '').trim();
        if (texto && texto !== this.ultimoProcesado) {
          this.ultimoProcesado = texto;
          const ids = this.extraerIds(texto);
          this.codigo = ids ? (ids.inscripcionId + '-' + ids.estudianteId) : texto;
          this.detenerCamara();
          this.refrescar();
          void this.buscar();
        }
      } catch { /* frame sin lectura */ }
    }, 200);
  }

  detenerCamara(): void {
    if (this.intervaloEscaneo) { clearInterval(this.intervaloEscaneo); this.intervaloEscaneo = null; }
    try {
      this.stream?.getTracks().forEach(t => { try { t.stop(); } catch {} });
    } catch {}
    this.stream = null;
    const v = this.videoCamara?.nativeElement;
    if (v) { try { (v as any).srcObject = null; } catch {} }
    this.camaraActiva = false;
  }
}
