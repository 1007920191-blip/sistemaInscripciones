import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import { NuevaInscripcion } from '../nueva-inscripcion/nueva-inscripcion';
import { InscripcionService } from '../../../../services/inscripcion';
import { ConfiguracionService } from '../../../../services/configuracion';
import { Inscripcion, Estudiante } from '../../../../models/inscripcion.model';
import { getAuth } from 'firebase/auth';
import { firebaseApp } from '../../../../firebase-config';

@Component({
  selector: 'app-lista-presenciales',
  standalone: true,
  imports: [CommonModule, NuevaInscripcion, FormsModule],
  templateUrl: './lista.html',
  styleUrls: ['./lista.css']
})
export class Lista implements OnInit {
  mostrarNuevaInscripcion = false;
  inscripciones: Inscripcion[] = [];
  cargando = true;
  
  inscripcionEditar: Inscripcion | null = null;
  estudiantesEditar: Estudiante[] = [];
  
  // Modal Lista
  mostrarModalLista = false;
  inscripcionParaLista: Inscripcion | null = null;
  estudiantesParaLista: Estudiante[] = [];
  cargandoLista = false;

  // Filtros y Búsqueda
  fechaSeleccionada: string = this.obtenerFechaHoyTexto();
  verTodos = false;
  terminoBusqueda = '';

  // Selección de estudiantes
  estudiantesSeleccionados: Set<string> = new Set();
  
  // Paginación
  itemsPorPagina = this.obtenerItemsPorPagina();
  paginaActual = 1;
  Math = Math;
  
  @Output() volver = new EventEmitter<void>();
  @Output() inscripcionGuardada = new EventEmitter<void>();

  constructor(
    private inscripcionService: InscripcionService,
    private configuracionService: ConfiguracionService
  ) {}

  obtenerFechaHoyTexto(): string {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  async ngOnInit() {
    this.cargando = true;
    await this.cargarInscripciones();
    this.cargando = false;
  }

  async cargarInscripciones() {
    this.cargando = true;
    try {
      const auth = getAuth(firebaseApp);
      const uidActual = auth.currentUser?.uid || '';

      // 1. Firestore filtra SOLO por fecha y usuarioId (sin índices complejos)
      let resultado: Inscripcion[] = await this.inscripcionService.obtenerInscripcionesFiltradas(
        this.fechaSeleccionada,
        uidActual,
        this.verTodos
      );

      // Si está en modo histórico (verTodos = true), filtramos por la fecha seleccionada en el cliente
      // de forma compatible con registros con fechaTexto y con fechaInscripcion (Date/Timestamp)
      if (this.verTodos) {
        resultado = resultado.filter(ins => {
          if (ins.fechaTexto) {
            return ins.fechaTexto === this.fechaSeleccionada;
          }
          if (ins.fechaInscripcion) {
            const de = new Date(ins.fechaInscripcion);
            const anio = de.getFullYear();
            const mes = String(de.getMonth() + 1).padStart(2, '0');
            const dia = String(de.getDate()).padStart(2, '0');
            const fechaDoc = `${anio}-${mes}-${dia}`;
            return fechaDoc === this.fechaSeleccionada;
          }
          return false;
        });
      }

      // 2. Filtro flexible LOCAL en memoria: nombre, colegio, DNI, código modular
      // Instantáneo, sin índices Firestore, sin lecturas extra
      if (this.terminoBusqueda.trim()) {
        resultado = this.inscripcionService.filtrarInscripcionesLocal(resultado, this.terminoBusqueda);
      }

      this.inscripciones = resultado;
      this.paginaActual = 1;
    } catch (error) {
      console.error('Error al cargar inscripciones:', error);
      this.inscripciones = [];
    } finally {
      // Siempre liberar loading aunque Firestore falle
      this.cargando = false;
    }
  }

  async onFiltrar() {
    await this.cargarInscripciones();
  }

  async limpiarBusqueda() {
    this.terminoBusqueda = '';
    await this.cargarInscripciones();
  }

  // Guardar en localStorage
  private guardarItemsPorPagina() {
    localStorage.setItem('inscripciones_itemsPorPagina', this.itemsPorPagina.toString());
  }

  // Obtener de localStorage
  private obtenerItemsPorPagina(): number {
    const guardado = localStorage.getItem('inscripciones_itemsPorPagina');
    return guardado ? parseInt(guardado) : 5;
  }

  // Getters para paginación
  get totalItems(): number {
    return this.inscripciones.length;
  }

  get totalPaginas(): number {
    return Math.ceil(this.totalItems / this.itemsPorPagina) || 1;
  }

  get inscripcionesPaginadas(): Inscripcion[] {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    const fin = inicio + this.itemsPorPagina;
    return this.inscripciones.slice(inicio, fin);
  }

  // Número correlativo considerando paginación
  getNumeroCorrelativo(index: number): number {
    return (this.paginaActual - 1) * this.itemsPorPagina + index + 1;
  }

  cambiarPagina(direccion: 'anterior' | 'siguiente') {
    if (direccion === 'anterior' && this.paginaActual > 1) {
      this.paginaActual--;
    } else if (direccion === 'siguiente' && this.paginaActual < this.totalPaginas) {
      this.paginaActual++;
    }
  }

  onItemsPorPaginaChange(event: any) {
    this.itemsPorPagina = parseInt(event.target.value);
    this.guardarItemsPorPagina();
    this.paginaActual = 1;
  }

  formatearFecha(fecha: any): string {
    if (!fecha) return '';
    const date = new Date(fecha);
    return date.toLocaleString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  formatearFechaPDF(fecha: any): string {
    if (!fecha) return '';
    const date = new Date(fecha);
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  // ============================================
  // BOTÓN LISTA - Abrir Modal
  // ============================================
  async verLista(ins: Inscripcion) {
    console.log('Abriendo lista para inscripción:', ins.id);
    this.cargandoLista = true;
    this.inscripcionParaLista = ins;
    this.mostrarModalLista = true;
    this.estudiantesSeleccionados.clear();
    
    try {
      this.estudiantesParaLista = await this.inscripcionService.obtenerEstudiantes(ins.id!);
      if (!this.estudiantesParaLista || this.estudiantesParaLista.length === 0) {
        this.estudiantesParaLista = ins.estudiantes || [];
      }
    } catch (error) {
      console.error('Error obteniendo estudiantes:', error);
      this.estudiantesParaLista = ins.estudiantes || [];
    } finally {
      this.cargandoLista = false;
    }
  }

  cerrarModalLista() {
    this.mostrarModalLista = false;
    this.inscripcionParaLista = null;
    this.estudiantesParaLista = [];
    this.estudiantesSeleccionados.clear();
  }

  // Controles de Selección para Checkboxes
  toggleSeleccionarEstudiante(dni: string) {
    if (this.estudiantesSeleccionados.has(dni)) {
      this.estudiantesSeleccionados.delete(dni);
    } else {
      this.estudiantesSeleccionados.add(dni);
    }
  }

  toggleSeleccionarTodos() {
    const todosSeleccionados = this.esTodosSeleccionados();
    if (todosSeleccionados) {
      this.estudiantesSeleccionados.clear();
    } else {
      this.estudiantesParaLista.forEach(est => {
        if (est.numeroDocumento) {
          this.estudiantesSeleccionados.add(est.numeroDocumento);
        }
      });
    }
  }

  esTodosSeleccionados(): boolean {
    if (this.estudiantesParaLista.length === 0) return false;
    return this.estudiantesParaLista.every(est => est.numeroDocumento && this.estudiantesSeleccionados.has(est.numeroDocumento));
  }

  esEstudianteSeleccionado(dni: string): boolean {
    return this.estudiantesSeleccionados.has(dni);
  }

  // ============================================
  // GENERAR PDF DE ESTUDIANTES (Formato Lista Tradicional)
  // ============================================
  descargarPDF() {
    if (!this.inscripcionParaLista || this.estudiantesParaLista.length === 0) {
      alert('No hay datos para generar el PDF');
      return;
    }
    
    const ins = this.inscripcionParaLista;
    const estudiantes = this.estudiantesParaLista;

    // Crear documento PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // ===== TÍTULO =====
    doc.setFontSize(18);
    doc.setTextColor(33, 37, 41);
    doc.text('LISTA DE ESTUDIANTES INSCRITOS', pageWidth / 2, 20, { align: 'center' });
    
    // ===== INFORMACIÓN GENERAL =====
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Código de inscripción: ${ins.id || 'N/A'}`, 14, 35);
    doc.text(`Fecha de inscripción: ${this.formatearFechaPDF(ins.fechaInscripcion)}`, 14, 42);
    doc.text(`Colegio: ${ins.colegio?.IE || 'N/A'}`, 14, 49);
    doc.text(`Total de estudiantes: ${estudiantes.length}`, 14, 56);
    
    // Línea separadora
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 62, pageWidth - 14, 62);
    
    // ===== TABLA DE ESTUDIANTES =====
    const startY = 72;
    const rowHeight = 10;
    
    // Configurar columnas: N°, Nombres, DNI, Colegio, Grado, Nivel, Fecha
    const headers = ['N°', 'Nombres y Apellidos', 'DNI', 'Colegio', 'Grado', 'Nivel', 'Aula', 'Fecha'];
    const colWidths = [8, 50, 22, 40, 18, 20, 20, 22];

    const colPositions: number[] = [];
    
    // Calcular posiciones de columnas
    let currentX = 14;
    colWidths.forEach((width) => {
      colPositions.push(currentX);
      currentX += width;
    });
    
    // Dibujar encabezados
    doc.setFillColor(0, 123, 255); // Azul
    doc.rect(14, startY - 6, pageWidth - 28, 8, 'F');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255); // Blanco
    
    headers.forEach((header, i) => {
      doc.text(header, colPositions[i] + 2, startY);
    });
    
    // Dibujar filas de estudiantes
    let currentY = startY + rowHeight;
    
    estudiantes.forEach((est, index) => {
      if (currentY > 270) {
        doc.addPage();
        currentY = 20;
        
        doc.setFillColor(0, 123, 255);
        doc.rect(14, currentY - 6, pageWidth - 28, 8, 'F');
        doc.setTextColor(255, 255, 255);
        headers.forEach((header, i) => {
          doc.text(header, colPositions[i] + 2, currentY);
        });
        currentY += rowHeight;
      }
      
      if (index % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(14, currentY - 6, pageWidth - 28, 8, 'F');
      }
      
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      
      const nombreCompleto = `${est.nombres || ''} ${est.apellidos || ''}`.trim() || 'N/A';
      const dni = est.numeroDocumento || 'N/A';
      const colegio = ins.colegio?.IE || 'N/A';
      const grado = est.grado || 'N/A';
      const nivel = est.nivel || 'N/A';
      const aula = est.codigoAula || '—';
      const fecha = this.formatearFechaPDF(ins.fechaInscripcion);
      
      doc.text(`${index + 1}`, colPositions[0] + 2, currentY);
      doc.text(nombreCompleto.substring(0, 30), colPositions[1] + 2, currentY);
      doc.text(dni, colPositions[2] + 2, currentY);
      doc.text(colegio.substring(0, 25), colPositions[3] + 2, currentY);
      doc.text(grado, colPositions[4] + 2, currentY);
      doc.text(nivel, colPositions[5] + 2, currentY);
      doc.text(aula, colPositions[6] + 2, currentY);
      doc.text(fecha, colPositions[7] + 2, currentY);
      
      doc.setDrawColor(220, 220, 220);
      doc.line(14, currentY + 2, pageWidth - 14, currentY + 2);
      
      currentY += rowHeight;
    });
    
    // ===== PIE DE PÁGINA =====
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Documento generado el ${new Date().toLocaleDateString('es-PE')}`, 
      pageWidth / 2, 
      285, 
      { align: 'center' }
    );
    
    // ===== DESCARGAR PDF =====
    const nombreArchivo = `Lista_${ins.colegio?.IE || 'Inscripcion'}_${this.formatearFechaPDF(ins.fechaInscripcion)}.pdf`;
    doc.save(nombreArchivo);
  }

  // ============================================
  // GENERACIÓN DE CREDENCIALES PDF (4 por página A4, tiras verticales)
  // ============================================
  async generarCredencialesPDF(estudiantesAImprimir: Estudiante[]) {
    if (!estudiantesAImprimir || estudiantesAImprimir.length === 0) {
      alert('Por favor, seleccione al menos un estudiante para generar las credenciales.');
      return;
    }

    this.cargandoLista = true;
    try {
      // 1. Obtener configuración general del sistema
      // Si falla (Firestore o red), se usan valores por defecto — el PDF continúa igual
      let config: any = null;
      try {
        config = await this.configuracionService.obtenerConfiguracion();
      } catch {
        // Config no disponible — se usarán fallbacks vectoriales
      }
      const nombreConcurso = config?.nombreConcurso || 'Concurso Nacional de Matemática';
      const edicion = config?.edicion || new Date().getFullYear().toString();
      const eslogan = config?.eslogan || 'Edición Especial';
      
      // 2. Cargar imágenes (cada una tiene timeout 5s y fallback silencioso ante 402/403/CORS)
      const [logoIzquierdoB64, logoDerechoB64, fondoCredencialB64] = await Promise.all([
        this.cargarImagenBase64(config?.logoIzquierdo || ''),
        this.cargarImagenBase64(config?.logoDerecho || ''),
        this.cargarImagenBase64(config?.fondoCredencial || '')
      ]);

      // 3. Crear jsPDF A4 Vertical
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const stripWidth = 47;
      const stripHeight = 287;
      const spacing = 2.66;
      const startY = 5;
      const startX = 5;

      const totalEstudiantes = estudiantesAImprimir.length;
      
      for (let index = 0; index < totalEstudiantes; index++) {
        const est = estudiantesAImprimir[index];
        const posEnPagina = index % 4;
        
        if (index > 0 && posEnPagina === 0) {
          doc.addPage();
        }

        const x = startX + posEnPagina * (stripWidth + spacing);
        const y = startY;

        // Borde y Fondo de Credencial
        if (fondoCredencialB64) {
          doc.addImage(fondoCredencialB64, 'JPEG', x, y, stripWidth, stripHeight);
        } else {
          doc.setFillColor(248, 249, 250); 
          doc.setDrawColor(0, 92, 191); 
          doc.setLineWidth(0.8);
          doc.roundedRect(x, y, stripWidth, stripHeight, 3, 3, 'FD');

          doc.setFillColor(0, 92, 191);
          doc.rect(x + 0.4, y + 0.4, stripWidth - 0.8, 22, 'F');
          
          doc.setFillColor(220, 53, 69);
          doc.rect(x + 0.4, y + stripHeight - 6.4, stripWidth - 0.8, 6, 'F');
        }

        // Logos de Cabecera
        if (logoIzquierdoB64) {
          doc.addImage(logoIzquierdoB64, 'PNG', x + 3, y + 4, 10, 10);
        } else {
          doc.setFillColor(255, 255, 255, 0.2);
          doc.circle(x + 8, y + 9, 5, 'F');
        }

        if (logoDerechoB64) {
          doc.addImage(logoDerechoB64, 'PNG', x + stripWidth - 13, y + 4, 10, 10);
        } else {
          doc.setFillColor(255, 255, 255, 0.2);
          doc.circle(x + stripWidth - 8, y + 9, 5, 'F');
        }

        // Texto Cabecera
        doc.setTextColor(255, 255, 255);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.text(nombreConcurso.toUpperCase(), x + stripWidth / 2, y + 8, { align: 'center', maxWidth: 22 });
        
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(4.5);
        doc.text(`${eslogan} - EDICIÓN ${edicion}`, x + stripWidth / 2, y + 16, { align: 'center', maxWidth: 22 });

        // Tarjeta Blanca de Datos
        const rectX = x + 3;
        const rectY = y + 26;
        const rectW = stripWidth - 6; 
        const rectH = 135;

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(220, 224, 230);
        doc.setLineWidth(0.3);
        doc.roundedRect(rectX, rectY, rectW, rectH, 3, 3, 'FD');

        doc.setTextColor(0, 92, 191);
        doc.setFontSize(8.5);
        doc.setFont('Helvetica', 'bold');
        doc.text('CREDENCIAL OFICIAL', rectX + rectW / 2, rectY + 6, { align: 'center' });

        doc.setDrawColor(230, 235, 240);
        doc.line(rectX + 4, rectY + 9, rectX + rectW - 4, rectY + 9);

        // Estudiante
        doc.setTextColor(100, 110, 120);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.text('ESTUDIANTE:', rectX + 4, rectY + 14);

        doc.setTextColor(33, 37, 41);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        const nomCompleto = `${est.nombres || ''} ${est.apellidos || ''}`.trim().toUpperCase();
        doc.text(nomCompleto, rectX + 4, rectY + 19, { maxWidth: rectW - 8 });

        // DNI
        doc.setTextColor(100, 110, 120);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.text('DNI / DOCUMENTO DE IDENTIDAD:', rectX + 4, rectY + 31);
        
        doc.setTextColor(33, 37, 41);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text(est.numeroDocumento || '—', rectX + 4, rectY + 36);

        // Colegio
        doc.setTextColor(100, 110, 120);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.text('INSTITUCIÓN EDUCATIVA:', rectX + 4, rectY + 44);

        doc.setTextColor(33, 37, 41);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        const colNombre = (est.colegio?.IE || this.inscripcionParaLista?.colegio?.IE || 'N/A').toUpperCase();
        doc.text(colNombre, rectX + 4, rectY + 49, { maxWidth: rectW - 8 });

        // Grado y Nivel
        doc.setTextColor(100, 110, 120);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.text('GRADO Y NIVEL:', rectX + 4, rectY + 62);

        doc.setTextColor(33, 37, 41);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        const gradNivel = `${est.grado || '—'} - ${est.nivel || '—'}`.toUpperCase();
        doc.text(gradNivel, rectX + 4, rectY + 67, { maxWidth: rectW - 8 });

        doc.setDrawColor(230, 235, 240);
        doc.line(rectX + 4, rectY + 74, rectX + rectW - 4, rectY + 74);

        // Asignación de Aula y Turno
        const badgeY = rectY + 78;
        const badgeW = 16;
        const badgeH = 13;

        doc.setFillColor(0, 92, 191); 
        doc.roundedRect(rectX + 3, badgeY, badgeW, badgeH, 1, 1, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(4.5);
        doc.text('AULA', rectX + 3 + badgeW / 2, badgeY + 4, { align: 'center' });
        
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text(est.codigoAula || 'PEND', rectX + 3 + badgeW / 2, badgeY + 10, { align: 'center' });

        doc.setFillColor(40, 167, 69); 
        doc.roundedRect(rectX + 22, badgeY, badgeW, badgeH, 1, 1, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(4.5);
        doc.text('TURNO', rectX + 22 + badgeW / 2, badgeY + 4, { align: 'center' });

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        const turnoCod = this.inscripcionParaLista?.turnoCodigo || 'T—';
        doc.text(turnoCod, rectX + 22 + badgeW / 2, badgeY + 10, { align: 'center' });

        // Mensaje Aula
        doc.setTextColor(220, 53, 69);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(5);
        doc.text('¡REVISA TU AULA Y MESA ASIGNADA!', rectX + rectW / 2, rectY + 98, { align: 'center' });

        // Código de barras vectorial
        const barcodeX = rectX + 4;
        const barcodeY = rectY + 104;
        const barcodeW = rectW - 8;
        const barcodeH = 14;

        doc.setDrawColor(210, 215, 220);
        doc.setLineWidth(0.2);
        doc.rect(barcodeX - 2, barcodeY - 2, barcodeW + 4, barcodeH + 5);

        doc.setDrawColor(0, 0, 0);
        let currX = barcodeX;
        const dniText = est.numeroDocumento || '00000000';
        const numDNI = dniText.replace(/\D/g, '');
        const seedPattern = numDNI.split('').map(x => parseInt(x) % 3 + 1);
        while(seedPattern.length < 16) {
          seedPattern.push(2);
        }
        seedPattern.forEach((w, k) => {
          doc.setLineWidth(w * 0.4);
          doc.line(currX, barcodeY, currX, barcodeY + barcodeH);
          currX += w * 0.6 + 0.4;
        });

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(4.5);
        doc.setTextColor(80, 90, 100);
        doc.text(`*${dniText}*`, rectX + rectW / 2, barcodeY + barcodeH + 2.2, { align: 'center' });

        doc.setFont('Helvetica', 'italic');
        doc.setFontSize(4);
        doc.text('Presentar esta credencial impresa obligatoriamente el día del evento.', rectX + rectW / 2, rectY + 127, { align: 'center', maxWidth: rectW - 6 });

        // Pie de Credencial
        doc.setTextColor(255, 255, 255);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(5);
        doc.text('ORGANIZACIÓN DEL CONCURSO DE MATEMÁTICA', x + stripWidth / 2, y + stripHeight - 2.5, { align: 'center' });
      }

      const ieNombre = (this.inscripcionParaLista?.colegio?.IE || 'Credenciales').replace(/\s+/g, '_');
      doc.save(`Credenciales_${ieNombre}_${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error('Error al generar credenciales:', error);
      alert('Ocurrió un error al generar las credenciales.');
    } finally {
      this.cargandoLista = false;
    }
  }

  descargarCredencialesGrupales() {
    const seleccionados = this.estudiantesParaLista.filter(est => 
      est.numeroDocumento && this.estudiantesSeleccionados.has(est.numeroDocumento)
    );
    
    if (seleccionados.length === 0) {
      alert('Debe seleccionar al menos un estudiante de la lista.');
      return;
    }

    this.generarCredencialesPDF(seleccionados);
  }

  descargarCredencialIndividual(estudiante: Estudiante) {
    this.generarCredencialesPDF([estudiante]);
  }

  /**
   * Carga una imagen desde URL y la convierte a Base64 para jsPDF.
   * - Timeout de 5 segundos: si la imagen tarda demasiado, resuelve con ''.
   * - Errores HTTP (402, 403, 404, CORS) se capturan silenciosamente; el PDF
   *   continuará con el diseño vectorial de respaldo sin lanzar errores en consola.
   */
  private cargarImagenBase64(url: string): Promise<string> {
    return new Promise((resolve) => {
      if (!url || url.trim() === '') {
        resolve('');
        return;
      }

      let resuelta = false;
      const resolver = (valor: string) => {
        if (!resuelta) {
          resuelta = true;
          resolve(valor);
        }
      };

      // Timeout de 5 segundos
      const timeoutId = setTimeout(() => resolver(''), 5000);

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        clearTimeout(timeoutId);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            resolver(canvas.toDataURL('image/png'));
          } else {
            resolver('');
          }
        } catch {
          // CORS tainted canvas u otro error
          resolver('');
        }
      };

      img.onerror = () => {
        clearTimeout(timeoutId);
        // Silencioso: no mostrar error de consola para 402/403/CORS
        resolver('');
      };

      img.src = url;
    });
  }

  // ============================================
  // BOTÓN CREDENCIALES - Icono 🪪 en la tabla principal
  // ============================================
  async verCredenciales(ins: Inscripcion) {
    // Al hacer clic en 🪪 en la lista, abre automáticamente el modal de lista
    // para que el usuario pueda seleccionar individual o grupalmente de forma intuitiva
    await this.verLista(ins);
  }

  // ============================================
  // BOTÓN EDITAR - Existente
  // ============================================
  async editarInscripcion(ins: Inscripcion) {
    console.log('Editando inscripción:', ins.id);
    
    this.estudiantesEditar = await this.inscripcionService.obtenerEstudiantes(ins.id!);
    console.log('Estudiantes cargados:', this.estudiantesEditar.length);
    
    this.inscripcionEditar = ins;
    this.mostrarNuevaInscripcion = true;
  }

  irANueva() {
    this.inscripcionEditar = null;
    this.estudiantesEditar = [];
    this.mostrarNuevaInscripcion = true;
  }

  async recargarInscripciones() {
    this.inscripcionEditar = null;
    this.estudiantesEditar = [];
    await this.cargarInscripciones();
    this.mostrarNuevaInscripcion = false;
  }

  volverALista() {
    this.inscripcionEditar = null;
    this.estudiantesEditar = [];
    this.mostrarNuevaInscripcion = false;
  }
}