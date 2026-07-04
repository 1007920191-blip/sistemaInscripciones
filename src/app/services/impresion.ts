import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { AulaTurnoDisplay, Turno } from '../models/turno.model';
import * as QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

@Injectable({
  providedIn: 'root'
})
export class ImpresionService {

  constructor() {}

  async generarTarjetas(estudiantes: any[], aula: AulaTurnoDisplay, turno: Turno, config: any) {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    
    const edicion = {
      FONDO: config?.fondo || '',
      LOGODERECHO: config?.logoDerecho || '',
      LOGOIZQUIERDO: config?.logoIzquierdo || '',
      NOMBRE: config?.nombreConcurso || 'CONCURSO NACIONAL',
      SLOGAN: config?.eslogan || '',
      ORGANIZADOR: config?.organizador || 'I.E.',
      FECHA: config?.fecha || ''
    };

    const [logoIzquierdoB64, logoDerechoB64] = await Promise.all([
      this.cargarImagenBase64(edicion.LOGOIZQUIERDO),
      this.cargarImagenBase64(edicion.LOGODERECHO)
    ]);

    let xactual = 7;
    let yactual = 7;
    const incx = 102;
    const incy = 73;

    for (let x = 0; x < estudiantes.length; x++) {
      const est = estudiantes[x];
      
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      
      const nombreajustado = doc.splitTextToSize(edicion.NOMBRE, 150);
      const sloganajustado = doc.splitTextToSize(`${edicion.SLOGAN} - ${config?.edicion || ''}`, 150);
      const ieajustado = doc.splitTextToSize(edicion.ORGANIZADOR, 150);
      const sedeajustado = doc.splitTextToSize(aula.sede || '', 150);

      doc.text(nombreajustado, xactual + 47.5, yactual + 5, { align: 'center' });
      doc.text(sloganajustado, xactual + 47.5, yactual + 9, { align: 'center' });
      doc.text(ieajustado, xactual + 47.5, yactual + 13, { align: 'center' });
      doc.text(sedeajustado, xactual + 47.5, yactual + 17, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.text('DNI:', xactual + 37, yactual + 23);
      doc.text('TURNO:', xactual + 66, yactual + 23);

      doc.text('NOMBRES:', xactual + 37, yactual + 27);
      doc.text('CÓDIGO IE:', xactual + 37, yactual + 35);
      doc.text('IE:', xactual + 37, yactual + 39);
      doc.text('GESTIÓN:', xactual + 37, yactual + 43);
      doc.text('GRADO:', xactual + 37, yactual + 47);

      doc.setFont('helvetica', 'normal');
      doc.text(est.numeroDocumento || 'SIN NÚMERO', xactual + 51, yactual + 23);
      doc.text(turno.codigo || '—', xactual + 78, yactual + 23);
      
      const nombres = `${est.apellidos || ''} ${est.nombres || ''}`.trim();
      doc.text(nombres.substring(0, 35), xactual + 51, yactual + 27);
      
      const codModular = est.colegioObj?.CODIGOMODULAR || est.colegioObj?.codigoModular || '—';
      doc.text(codModular, xactual + 51, yactual + 35);
      
      doc.text((est.colegioObj?.IE || '—').substring(0, 35), xactual + 51, yactual + 39);
      doc.text((est.colegioObj?.GESTION || est.colegioObj?.gestion || '—'), xactual + 51, yactual + 43);
      
      doc.text(`${est.grado || ''} ${est.nivel || ''}`.trim(), xactual + 51, yactual + 47);

      doc.setFontSize(20);
      doc.text(aula.codigoAula || '—', xactual + 8, yactual + 63);

      const textToEncode = `${edicion.NOMBRE}/${config?.edicion || ''}/${aula.sede || ''}/${turno.codigo}/${aula.codigoAula}/${est.inscripcionId || 'N/A'}/${est.id || 'N/A'}/${est.nombres || 'N/A'}/${est.apellidos || 'N/A'}`;
      const qr = await QRCode.toDataURL(textToEncode, { errorCorrectionLevel: 'M' });
      const qrSize = 35;
      
      doc.setDrawColor(0, 0, 0);
      doc.rect(xactual - 0.5, yactual + 20 - 0.5, qrSize + 1, qrSize + 1, 'S');
      doc.addImage(qr, 'JPEG', xactual, yactual + 20, qrSize, qrSize);

      const barcodeDataUrl = this.generateBarcode(est.id || 'SIN_ID');
      doc.addImage(barcodeDataUrl, 'PNG', xactual + 50, yactual + 52, 40, 13);

      if ((x + 1) % 2 === 0) {
        yactual = yactual + incy;
        xactual = 7;
        if ((x + 1) % 8 !== 0) {
          doc.setLineDashPattern([4, 2], 0);
          doc.line(xactual, yactual - 7, xactual + 196, yactual - 7, 'S');
          doc.setLineDashPattern([], 0);
        }
      } else {
        xactual += incx;
      }

      if ((x + 1) % 8 === 0 && x < estudiantes.length - 1) {
        doc.addPage();
        doc.setLineDashPattern([4, 2], 0);
        doc.line(105, 7, 105, 290, 'S');
        doc.setLineDashPattern([], 0);
        xactual = 7;
        yactual = 7;
      }

      if (x === 1) {
        doc.setLineDashPattern([4, 2], 0);
        doc.line(105, 7, 105, 290, 'S');
        doc.setLineDashPattern([], 0);
      }
    }

    doc.save(`TARJETAS_Aula_${aula.codigoAula}_${turno.codigo}.pdf`);
  }

  async generarCartillas(estudiantes: any[], aula: AulaTurnoDisplay, turno: Turno, config: any, alternativas: number) {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;

    const nombre = config?.nombreConcurso || 'CONCURSO NACIONAL';
    const slogan = `${config?.eslogan || ''} - ${config?.edicion || ''}`;
    const ie = config?.organizador || 'I.E.';

    const altsMap: { [key: number]: string } = { 0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E' };

    let desplazamientox = 0;
    let inicioy = 10;

    for (let x = 1; x <= estudiantes.length; x++) {
      const est = estudiantes[x - 1];

      if (x % 2 === 1) {
        desplazamientox = 0;
      } else {
        desplazamientox = centerX;
        inicioy = 10;
      }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(ie, centerX / 2 + desplazamientox, inicioy, { align: 'center' });
      doc.text(nombre, centerX / 2 + desplazamientox, inicioy + 6, { align: 'center' });
      doc.text(slogan, centerX / 2 + desplazamientox, inicioy + 12, { align: 'center' });

      const textToEncode = `${nombre}/${config?.edicion || ''}/${aula.sede || ''}/${turno.codigo}/${aula.codigoAula}/${est.inscripcionId || 'N/A'}/${est.id || 'N/A'}/${est.nombres || 'N/A'}/${est.apellidos || 'N/A'}`;
      const qr = await QRCode.toDataURL(textToEncode, { errorCorrectionLevel: 'M' });
      const qrSize = 35;
      const qrX = 20;
      const qrY = 28;

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.75);
      doc.rect(qrX + desplazamientox, qrY, qrSize + 1, qrSize + 1, 'S');
      doc.addImage(qr, 'JPEG', qrX + desplazamientox + 0.5, qrY + 0.5, qrSize, qrSize);

      doc.text('CARTILLA DE RESPUESTAS', centerX / 2 + 35 + desplazamientox, 30, { align: 'center' });
      doc.text(`TURNO: ${turno.codigo}`, centerX / 2 - 5 + desplazamientox, 40, { align: 'center' });
      doc.text(`AULA: ${aula.codigoAula}`, centerX / 2 - 5 + desplazamientox, 47, { align: 'center' });

      doc.rect(87 + desplazamientox, 35, 48 + (alternativas > 4 ? 10 : 0), 165);
      doc.setLineWidth(0.5);

      let posx = 100;
      let posy = 42;
      let pregunta = 1;

      for (let x1 = 1; x1 <= 20 * alternativas; x1++) {
        doc.circle(posx + desplazamientox, posy, 3);
        doc.setTextColor(128, 128, 128);
        doc.text(altsMap[(x1 - 1) % alternativas] || '?', posx + desplazamientox, posy + 1, { align: 'center' });
        doc.setTextColor(0, 0, 0);

        if (x1 % alternativas === 0) {
          doc.text(pregunta + '.', posx + desplazamientox - (alternativas * 9), posy + 1);
          posx = 100;
          posy = posy + 8;
          pregunta += 1;
        } else {
          posx = posx + 9;
        }
      }

      doc.setFont('helvetica', 'bold');
      doc.text('DATOS DEL PARTICIPANTE', centerX / 4 + 5 + desplazamientox, 72, { align: 'center' });
      doc.text('DNI', 13 + desplazamientox, 79);
      doc.text('APELLIDOS', 13 + desplazamientox, 86);
      doc.text('NOMBRES', 13 + desplazamientox, 93);
      doc.text('DATOS DE LA I.E.', centerX / 4 + 5 + desplazamientox, 100, { align: 'center' });
      doc.text('I.E.', 13 + desplazamientox, 107);
      doc.text('GESTIÓN', 13 + desplazamientox, 114);
      doc.text('GRADO', 13 + desplazamientox, 121);
      doc.text('INSTRUCCIONES:', centerX / 4 + 5 + desplazamientox, 128, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.text('(Lápiz 2B - Rellenar completamente)', centerX / 4 + 5 + desplazamientox, 136, { align: 'center' });
      
      const numeroDoc = est.numeroDocumento || 'SIN NÚMERO';
      doc.text(': ' + numeroDoc, 35 + desplazamientox, 79);
      doc.text(': ' + doc.splitTextToSize(est.apellidos || '', 45)[0], 35 + desplazamientox, 86);
      doc.text(': ' + doc.splitTextToSize(est.nombres || '', 45)[0], 35 + desplazamientox, 93);
      
      const ieNom = doc.splitTextToSize(est.colegioObj?.IE || '—', 45);
      doc.text(': ' + ieNom[0], 35 + desplazamientox, 107);
      
      doc.text(': ' + (est.colegioObj?.GESTION || est.colegioObj?.gestion || '—'), 35 + desplazamientox, 114);
      doc.text(': ' + `${est.grado || ''} ${est.nivel || ''}`.trim(), 35 + desplazamientox, 121);

      const indc1 = doc.splitTextToSize('* Rellene el círculo completamente sin salir del contorno y uno por respuesta.', 62);
      const indc2 = doc.splitTextToSize('* No escribir ni manchar sobre el área de respuestas.', 62);
      const indc3 = doc.splitTextToSize('* Si ha errado la respuesta, borre con cuidado y proceda a rellenar.', 62);
      
      doc.text(indc1, 13 + desplazamientox, 145);
      doc.text(indc2, 13 + desplazamientox, 155);
      doc.text(indc3, 13 + desplazamientox, 165);

      if (x % 2 === 0 && x < estudiantes.length) {
        doc.addPage();
        inicioy = 10;
      }
    }

    doc.save(`CARTILLAS_Aula_${aula.codigoAula}_${turno.codigo}.pdf`);
  }

  private cargarImagenBase64(url: string): Promise<string | null> {
    if (!url) return Promise.resolve(null);
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      let timeoutId: any;

      img.onload = () => {
        clearTimeout(timeoutId);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };

      img.onerror = () => {
        clearTimeout(timeoutId);
        resolve(null);
      };

      timeoutId = setTimeout(() => {
        img.src = '';
        resolve(null);
      }, 5000);

      img.src = url;
    });
  }

  private generateBarcode(text: string): string {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, text, {
      format: 'CODE128',
    });
    return canvas.toDataURL('image/png');
  }
}
