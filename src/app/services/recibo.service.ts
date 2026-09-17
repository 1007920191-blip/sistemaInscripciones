import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

@Injectable({ providedIn: 'root' })
export class ReciboService {
  constructor() {}

  generarRecibo(ins: any, config: any): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [58, 220] });
    const pw = doc.internal.pageSize.getWidth();
    const mL = 3; const mR = 3; const cw = pw - mL - mR;
    let y = 5;

    const center = (t: string, yp: number, fs: number, st = 'normal') => { doc.setFontSize(fs); doc.setFont('Helvetica', st); doc.text(t, pw / 2, yp, { align: 'center' }); };
    const left = (t: string, yp: number, fs: number, st = 'normal') => { doc.setFontSize(fs); doc.setFont('Helvetica', st); doc.text(t, mL, yp); };
    const right = (t: string, yp: number, fs: number, st = 'normal') => { doc.setFontSize(fs); doc.setFont('Helvetica', st); doc.text(t, pw - mR, yp, { align: 'right' }); };
    const line = (yp: number) => { doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3); doc.line(mL, yp, pw - mR, yp); };
    const dashLine = (yp: number) => { doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.2); let x = mL; while (x < pw - mR) { doc.line(x, yp, Math.min(x + 1.5, pw - mR), yp); x += 2.5; } };

    const col = ins?.colegio || {};
    const est0 = ins?.estudiantes?.[0] || {};
    const cantidad = Number(ins?.cantidadEstudiantes) || 1;
    const costoUnitario = Number(ins?.costoInscripcion) || Number(config?.costoInscripcion) || 15;
    const totalFinal = cantidad * costoUnitario;
    const codigo = ins?.codigo || ins?.id || 'N/A';
    const sede = config?.sede || 'ANDAHUAYLAS';

    center('SOLARISLEE - 2026', y, 11, 'bold'); y += 5;
    center(String(sede).toUpperCase(), y, 8, 'normal'); y += 6;
    line(y); y += 4;

    const barcodeValue = String(codigo).replace(/\D/g, '');
    if (barcodeValue && barcodeValue.length >= 3) {
      try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcodeValue, { format: 'CODE128', width: 1.5, height: 28, displayValue: true, fontSize: 10, margin: 0, textMargin: 1, background: 'transparent', lineColor: '#000000' });
        const imgData = canvas.toDataURL('image/png');
        const imgH = (canvas.height / canvas.width) * cw;
        doc.addImage(imgData, 'PNG', mL, y, cw, Math.min(imgH, 22));
        y += Math.min(imgH, 22) + 3;
      } catch { center(String(codigo), y, 8, 'bold'); y += 5; }
    }

    line(y); y += 4;

    left('FECHA:', y, 7, 'bold');
    right(this.formatearFecha(ins?.fechaInscripcion), y, 7, 'normal'); y += 5;

    const codMod = col?.CODIGOMODULAR || col?.codigoModular || '';
    left('COD. MOD.:', y, 7, 'bold');
    right(String(codMod || 'N/A'), y, 7, 'normal'); y += 5;

    left('NOMBRE I.E.:', y, 7, 'bold'); y += 4;
    left(String(col?.IE || col?.nombre || 'N/A').toUpperCase().substring(0, 32), y, 7, 'normal'); y += 5;

    const provincia = col?.PROVINCIA || col?.provincia || sede;
    left('PROVINCIA:', y, 7, 'bold'); right(String(provincia).toUpperCase(), y, 7, 'normal'); y += 5;

    const nivel = est0?.nivel || ins?.nivel || 'PRIMARIA';
    left('NIVEL:', y, 7, 'bold'); right(String(nivel).toUpperCase(), y, 7, 'normal'); y += 5;

    const gestion = col?.GESTION || col?.gestion || 'PUBLICA';
    left('GESTION:', y, 7, 'bold'); right(String(gestion).toUpperCase(), y, 7, 'normal'); y += 5;

    const area = col?.AREA || col?.area || 'URBANA';
    left('AREA:', y, 7, 'bold'); right(String(area).toUpperCase(), y, 7, 'normal'); y += 5;

    dashLine(y); y += 4;

    const dniApoderado = ins?.telefonoApoderado || '';
    const nombreTitular = config?.nombreCompletoTitularYape || config?.titularYape || '';
    left('A NOMBRE DE:', y, 7, 'bold'); y += 4;
    if (dniApoderado) { left(String(dniApoderado), y, 7, 'normal'); y += 4; }
    if (nombreTitular) { left(String(nombreTitular).toUpperCase().substring(0, 32), y, 7, 'normal'); y += 5; }
    else { y += 1; }

    left('MET. PAGO:', y, 7, 'bold'); right(String(ins?.metodoPago || 'N/A').toUpperCase(), y, 7, 'normal'); y += 5;

    const numOp = ins?.numeroOperacion || 'NO APLICA';
    left('NO. OP.:', y, 7, 'bold'); right(String(numOp).toUpperCase(), y, 7, 'normal'); y += 5;

    left('CANTIDAD:', y, 7, 'bold'); right(String(cantidad), y, 7, 'normal'); y += 5;

    left('ESCALA:', y, 7, 'bold'); right('S/ ' + costoUnitario.toFixed(2), y, 7, 'normal'); y += 5;

    dashLine(y); y += 4;

    left('TOTAL:', y, 10, 'bold'); right('S/ ' + totalFinal.toFixed(2), y, 10, 'bold'); y += 7;

    dashLine(y); y += 4;

    const usuario = ins?.usuarioId || '';
    if (usuario) { left('USUARIO:', y, 7, 'bold'); y += 4; left(String(usuario).substring(0, 35), y, 6, 'normal'); y += 5; }

    y += 2;
    center('GRACIAS POR PARTICIPAR', y, 7, 'bold');

    doc.save('Recibo_' + codigo + '.pdf');
  }

  private formatearFecha(fecha: any): string {
    if (!fecha) return '';
    let date: Date;
    if (fecha?.toDate) { date = fecha.toDate(); }
    else if (fecha?.seconds != null) { date = new Date(fecha.seconds * 1000 + Math.floor((fecha.nanoseconds || 0) / 1e6)); }
    else if (fecha instanceof Date) { date = fecha; }
    else { date = new Date(fecha); }
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  }
}