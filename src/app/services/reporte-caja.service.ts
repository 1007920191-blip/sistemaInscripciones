import { Injectable, inject } from '@angular/core';
import { jsPDF } from 'jspdf';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { firebaseApp } from '../firebase-config';
import { ConfiguracionService } from './configuracion';

/** Una inscripción ya normalizada para los reportes de caja. */
export interface FilaReporte {
  codigo: string;
  numeroOperacion: string;
  estado: string;
  fechaTexto: string;
  fecha: Date | null;
  metodoPago: string;
  monto: number;
}

export interface UsuarioConInscripciones {
  usuario: string;
  total: number;
}

/**
 * Reportes de caja del sistema presencial:
 *  - POR DIA   : resumen por fecha con columnas YAPE / EFECTIVO, fila TOTALES y
 *                TOTAL GENERAL.
 *  - DETALLADO : una fila por inscripción (código, N° operación, estado, fecha,
 *                tipo de pago, monto) y los totales generales.
 * Ambos llevan el encabezado del concurso tomado de la configuración compartida.
 * Solo LEE la colección `inscripciones` (no escribe nada).
 */
@Injectable({ providedIn: 'root' })
export class ReporteCajaService {
  // Mismo patrón que el resto del sistema presencial: instancias directas de
  // Firebase (la app provee Firestore, no Auth por inyección).
  private readonly db = getFirestore(firebaseApp);
  private readonly auth = getAuth(firebaseApp);
  private readonly configuracionService = inject(ConfiguracionService);

  private readonly margen = 14;
  private readonly anchoTabla = 182;

  /** Cuentas que registraron inscripciones presenciales (por defecto: más de una). */
  async obtenerUsuariosConInscripciones(minimo = 2): Promise<UsuarioConInscripciones[]> {
    const datos = await this.leerTodas();
    const conteo = new Map<string, number>();
    for (const ins of datos) {
      const usuario = String(ins.usuarioId || '').trim().toLowerCase();
      if (!usuario) continue;
      conteo.set(usuario, (conteo.get(usuario) || 0) + 1);
    }
    return [...conteo.entries()]
      .filter(([, total]) => total >= minimo)
      .map(([usuario, total]) => ({ usuario, total }))
      .sort((a, b) => a.usuario.localeCompare(b.usuario));
  }

  /** Reporte POR DIA: una fila por fecha con YAPE / EFECTIVO. */
  async generarReportePorDia(usuario: string, desde: string, hasta: string): Promise<void> {
    const filas = await this.obtenerFilas(usuario, desde, hasta);
    const config = await this.leerConfig();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    let y = this.dibujarEncabezado(doc, config, usuario, desde, hasta, { usuario: true });   // el resumen por día sí indica la cuenta

    const porDia = new Map<string, { yape: number; efectivo: number }>();
    for (const f of filas) {
      const acumulado = porDia.get(f.fechaTexto) || { yape: 0, efectivo: 0 };
      // El sistema maneja dos formas de pago: YAPE (digital) y EFECTIVO.
      if (this.esVirtual(f.metodoPago)) acumulado.yape += f.monto;
      else acumulado.efectivo += f.monto;
      porDia.set(f.fechaTexto, acumulado);
    }
    const dias = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    const cols = [14, 44, 62, 62];   // N°, FECHA, YAPE, EFECTIVO
    const encabezados = ['N°', 'FECHA', 'YAPE', 'EFECTIVO'];
    y = this.dibujarCabeceraTabla(doc, y, cols, encabezados);

    let tYape = 0;
    let tEfect = 0;
    if (dias.length === 0) {
      y = this.dibujarFilaVacia(doc, y, cols, 'No hay inscripciones en el rango seleccionado.');
    } else {
      dias.forEach(([fecha, valores], i) => {
        tYape += valores.yape; tEfect += valores.efectivo;
        y = this.dibujarFila(doc, y, cols, [
          String(i + 1),
          this.fechaBonita(fecha),
          this.moneda(valores.yape),
          this.moneda(valores.efectivo)
        ]);
      });
      // Fila de totales: la etiqueta va centrada sobre las dos primeras columnas
      y = this.dibujarFila(doc, y, cols, [
        'TOTALES', '', this.moneda(tYape), this.moneda(tEfect)
      ], true, true);
    }

    y += 12;
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(11.5);
    doc.text(`TOTAL GENERAL: ${this.moneda(tYape + tEfect)}`, this.margen + this.anchoTabla, y, { align: 'right' });

    (doc as any).setProperties?.({ title: 'REPORTE DE CAJA POR DIA' });
    doc.save(`REPORTE DE CAJA POR DIA_${this.nombreArchivo(usuario)}_${desde}_${hasta}.pdf`);
  }

  /** Reporte DETALLADO: una fila por inscripción. */
  async generarReporteDetallado(usuario: string, desde: string, hasta: string): Promise<void> {
    const filas = await this.obtenerFilas(usuario, desde, hasta);
    const config = await this.leerConfig();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    let y = this.dibujarEncabezado(doc, config, usuario, desde, hasta, { usuario: false });

    const cols = [10, 19, 30, 24, 41, 31, 27];   // N°, CODIGO, N° OPERACIÓN, ESTADO, FECHA, TIPO PAGO, MONTO
    const encabezados = ['N°', 'CODIGO', 'N° OPERACIÓN', 'ESTADO', 'FECHA', 'TIPO DE PAGO', 'MONTO'];
    y = this.dibujarCabeceraTabla(doc, y, cols, encabezados);

    let total = 0;
    let virtual = 0;
    let efectivo = 0;
    if (filas.length === 0) {
      y = this.dibujarFilaVacia(doc, y, cols, 'No hay inscripciones en el rango seleccionado.');
    } else {
      filas.forEach((f, i) => {
        if (y > 262) {   // salto de página repitiendo el encabezado
          doc.addPage();
          y = this.dibujarEncabezado(doc, config, usuario, desde, hasta, { usuario: false });
          y = this.dibujarCabeceraTabla(doc, y, cols, encabezados);
        }
        total += f.monto;
        if (this.esVirtual(f.metodoPago)) virtual += f.monto; else efectivo += f.monto;
        y = this.dibujarFila(doc, y, cols, [
          String(i + 1),
          f.codigo,
          f.numeroOperacion,
          f.estado,
          this.fechaHoraBonita(f),
          String(f.metodoPago || '').toUpperCase(),
          this.moneda(f.monto)
        ]);
      });
    }

    y += 3;
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.4);
    doc.line(this.margen + this.anchoTabla - 78, y, this.margen + this.anchoTabla, y);
    y += 7;
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(11);
    doc.text(`TOTAL: ${this.moneda(total)}`, this.margen + this.anchoTabla, y, { align: 'right' }); y += 6;
    doc.setFontSize(9.5);
    doc.text(`TOTAL PAGOS VIRTUALES: ${this.moneda(virtual)}`, this.margen + this.anchoTabla, y, { align: 'right' }); y += 5.5;
    doc.text(`TOTAL PAGOS EFECTIVOS: ${this.moneda(efectivo)}`, this.margen + this.anchoTabla, y, { align: 'right' });

    (doc as any).setProperties?.({ title: 'REPORTE DE CAJA' });
    doc.save(`REPORTE DE CAJA_${this.nombreArchivo(usuario)}_${desde}_${hasta}.pdf`);
  }

  // ============================ interno ============================

  private async leerTodas(): Promise<any[]> {
    const snapshot = await getDocs(collection(this.db, 'inscripciones'));
    const datos: any[] = [];
    snapshot.forEach(d => datos.push({ id: d.id, ...(d.data() as any) }));
    return datos;
  }

  /** Inscripciones de una cuenta y rango, sin las canceladas ni las online. */
  private async obtenerFilas(usuario: string, desde: string, hasta: string): Promise<FilaReporte[]> {
    const usuarioNorm = String(usuario || '').trim().toLowerCase();
    let datos: any[] = [];
    try {
      const q = query(collection(this.db, 'inscripciones'), where('usuarioId', '==', usuarioNorm));
      const snapshot = await getDocs(q);
      snapshot.forEach(d => datos.push({ id: d.id, ...(d.data() as any) }));
    } catch {
      const todas = await this.leerTodas();
      datos = todas.filter(ins => String(ins.usuarioId || '').trim().toLowerCase() === usuarioNorm);
    }

    const filas: FilaReporte[] = [];
    for (const ins of datos) {
      const estado = String(ins.estado || '').toLowerCase();
      if (estado === 'cancelada') continue;
      if (String(ins.origen || '').toLowerCase() === 'online') continue;   // externas: no son caja de ventanilla
      const fechaTexto = this.fechaDe(ins);
      if (!fechaTexto) continue;
      if (desde && fechaTexto < desde) continue;
      if (hasta && fechaTexto > hasta) continue;
      const metodoPago = String(ins.metodoPago || ins.datosPago?.metodo || 'efectivo').toLowerCase();
      const operacion = String(
        ins.numeroOperacion || ins.voucherNumeroOperacion || ins.datosPago?.numeroOperacion || ''
      ).trim();
      filas.push({
        codigo: String(ins.codigo || ins.id || ''),
        numeroOperacion: operacion || 'NO APLICA',
        estado: this.estadoBonito(ins.estado),
        fechaTexto,
        fecha: this.fechaComoDate(ins),
        metodoPago,
        monto: Number(ins.montoTotal || ins.datosPago?.monto || 0) || 0
      });
    }
    // Más recientes primero (igual que el modelo)
    filas.sort((a, b) => b.fechaTexto.localeCompare(a.fechaTexto) || b.codigo.localeCompare(a.codigo));
    return filas;
  }

  private async leerConfig(): Promise<any> {
    try {
      return (await this.configuracionService.obtenerConfiguracion()) || {};
    } catch {
      return {};
    }
  }

  private esVirtual(metodo: string): boolean {
    // El sistema maneja YAPE y EFECTIVO. Si quedara alguna inscripción antigua con
    // "transferencia" (opción ya retirada), se cuenta como pago digital (no es efectivo).
    const m = String(metodo || '').toLowerCase();
    return m !== 'efectivo';
  }

  private moneda(valor: number): string {
    return `S/ ${Number(valor || 0).toFixed(2)}`;
  }

  private estadoBonito(estado: any): string {
    const e = String(estado || '').toLowerCase();
    if (e === 'completada') return 'VALIDADO';
    if (e === 'pendiente') return 'PENDIENTE';
    return String(estado || '').toUpperCase();
  }

  /** Fecha YYYY-MM-DD (usa fechaTexto y, si no hay, fechaInscripcion). */
  private fechaDe(ins: any): string {
    const texto = String(ins.fechaTexto || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
    const d = this.fechaComoDate(ins);
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private fechaComoDate(ins: any): Date | null {
    const valor = ins.fechaInscripcion || ins.fecha || null;
    if (!valor) return null;
    if (typeof valor?.toDate === 'function') return valor.toDate();
    if (valor?.seconds != null) return new Date(valor.seconds * 1000);
    const d = new Date(valor);
    return isNaN(d.getTime()) ? null : d;
  }

  private fechaBonita(texto: string): string {
    const m = String(texto || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : String(texto || '');
  }

  /** Igual que el modelo: 25/9/2026 09:31:56 p. m. */
  private fechaHoraBonita(f: FilaReporte): string {
    if (!f.fecha) return this.fechaBonita(f.fechaTexto);
    const d = f.fecha;
    const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${hora}`;
  }

  private nombreArchivo(usuario: string): string {
    return String(usuario || 'usuario').replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private responsable(): string {
    const u = this.auth.currentUser;
    return String(u?.displayName || u?.email || '').trim();
  }

  /**
   * Encabezado del PDF (nombre del concurso desde la configuración).
   * Igual que el modelo: solo RESPONSABLE y FECHA IMPRESIÓN; en el reporte por
   * día se agrega la línea USUARIO.
   */
  private dibujarEncabezado(
    doc: jsPDF,
    config: any,
    usuario: string,
    desde: string,
    hasta: string,
    opciones: { usuario?: boolean } = {}
  ): number {
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 16;
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(11);
    doc.text(String(config?.nombreConcurso || 'CONCURSO').toUpperCase(), pageWidth / 2, y, { align: 'center', maxWidth: 180 }); y += 5.5;
    const eslogan = String(config?.eslogan || '').trim();
    const edicion = String(config?.edicion || '').trim();
    const linea2 = [eslogan, edicion ? `EDICION ${edicion}` : ''].filter(Boolean).join(' - ').toUpperCase();
    if (linea2) { doc.text(linea2, pageWidth / 2, y, { align: 'center', maxWidth: 180 }); y += 5; }
    const sede = String(config?.sede || '').trim();
    if (sede) { doc.text(sede.toUpperCase(), pageWidth / 2, y, { align: 'center' }); y += 5; }

    y += 1.5;
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.4);
    doc.line(this.margen, y, pageWidth - this.margen, y); y += 6;

    doc.setFont('Helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text(`RESPONSABLE: ${this.responsable()}`, this.margen, y); y += 4.5;
    if (opciones.usuario) { doc.text(`USUARIO: ${usuario}`, this.margen, y); y += 4.5; }
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    doc.text(`FECHA IMPRESION: ${ahora.getDate()}/${ahora.getMonth() + 1}/${ahora.getFullYear()} ${hora}`, this.margen, y); y += 8;
    return y;
  }

  /** Cabecera de la tabla (con bordes). Devuelve la Y donde empiezan las filas. */
  private dibujarCabeceraTabla(doc: jsPDF, y: number, cols: number[], encabezados: string[]): number {
    const alto = 7.5;
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3);
    doc.rect(this.margen, y, this.total(cols), alto);
    let x = this.margen;
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(7.5);
    encabezados.forEach((titulo, i) => {
      doc.text(titulo, x + cols[i] / 2, y + 5, { align: 'center', maxWidth: cols[i] - 2 });
      x += cols[i];
      if (i < cols.length - 1) doc.line(x, y, x, y + alto);
    });
    return y + alto;
  }

  /**
   * Fila de la tabla (todo centrado, como el modelo).
   * `negrita` para la fila de totales y `etiquetaDoble` para que el texto de la
   * primera columna se centre sobre las dos primeras (fila "TOTALES").
   */
  private dibujarFila(
    doc: jsPDF,
    y: number,
    cols: number[],
    valores: string[],
    negrita = false,
    etiquetaDoble = false
  ): number {
    const alto = 6.8;
    const totalAncho = this.total(cols);
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.25);
    doc.rect(this.margen, y, totalAncho, alto);
    doc.setFont('Helvetica', negrita ? 'bold' : 'normal');
    let x = this.margen;
    valores.forEach((valor, i) => {
      const ancho = cols[i];
      let tam = 7.5;
      doc.setFontSize(tam);
      const texto = String(valor ?? '');
      if (texto) {
        while (tam > 5.5 && doc.getTextWidth(texto) > ancho - 3) {
          tam = Math.round((tam - 0.3) * 10) / 10;
          doc.setFontSize(tam);
        }
        const centro = (i === 0 && etiquetaDoble) ? this.margen + (cols[0] + cols[1]) / 2 : x + ancho / 2;
        doc.text(texto, centro, y + 4.7, { align: 'center' });
      }
      x += ancho;
      if (i < cols.length - 1) doc.line(x, y, x, y + alto);
    });
    return y + alto;
  }

  private dibujarFilaVacia(doc: jsPDF, y: number, cols: number[], texto: string): number {
    const alto = 7;
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.25);
    doc.rect(this.margen, y, this.total(cols), alto);
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(8);
    doc.text(texto, this.margen + this.total(cols) / 2, y + 4.8, { align: 'center' });
    return y + alto;
  }

  private total(cols: number[]): number {
    return cols.reduce((a, b) => a + b, 0);
  }
}
