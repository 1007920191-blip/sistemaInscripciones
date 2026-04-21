import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import { NuevaInscripcion } from '../nueva-inscripcion/nueva-inscripcion';
import { InscripcionService } from '../../../../services/inscripcion';
import { Inscripcion, Estudiante } from '../../../../models/inscripcion.model';

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
  
  // Paginación
  itemsPorPagina = this.obtenerItemsPorPagina();
  paginaActual = 1;
  Math = Math;
  
  @Output() volver = new EventEmitter<void>();
  @Output() inscripcionGuardada = new EventEmitter<void>();

  constructor(
    private inscripcionService: InscripcionService
  ) {}

  async ngOnInit() {
    this.cargando = true;
    await this.cargarInscripciones();
    this.cargando = false;
  }

  async cargarInscripciones() {
    const resultado = await this.inscripcionService.obtenerInscripciones();
    this.inscripciones = resultado;
    this.paginaActual = 1;
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
  // BOTÓN LISTA - Generar PDF
  // ============================================
  async verLista(ins: Inscripcion) {
    console.log('Generando PDF para inscripción:', ins.id);
    
    // Obtener estudiantes actualizados
    let estudiantes: Estudiante[] = [];
    try {
      estudiantes = await this.inscripcionService.obtenerEstudiantes(ins.id!);
    } catch (error) {
      console.error('Error obteniendo estudiantes:', error);
      estudiantes = ins.estudiantes || [];
    }

    if (!estudiantes || estudiantes.length === 0) {
      alert('No hay estudiantes para mostrar en esta inscripción');
      return;
    }

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
    const headers = ['N°', 'Nombres y Apellidos', 'DNI', 'Colegio', 'Grado', 'Nivel', 'Fecha'];
    const colWidths = [10, 55, 25, 45, 20, 25, 25];
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
      // Verificar si necesita nueva página
      if (currentY > 270) {
        doc.addPage();
        currentY = 20;
        
        // Repetir encabezados en nueva página
        doc.setFillColor(0, 123, 255);
        doc.rect(14, currentY - 6, pageWidth - 28, 8, 'F');
        doc.setTextColor(255, 255, 255);
        headers.forEach((header, i) => {
          doc.text(header, colPositions[i] + 2, currentY);
        });
        currentY += rowHeight;
      }
      
      // Alternar color de fondo (gris claro / blanco)
      if (index % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(14, currentY - 6, pageWidth - 28, 8, 'F');
      }
      
      // Datos del estudiante
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      
      const nombreCompleto = `${est.nombres || ''} ${est.apellidos || ''}`.trim() || 'N/A';
      const dni = est.numeroDocumento || 'N/A';
      const colegio = ins.colegio?.IE || 'N/A';
      const grado = est.grado || 'N/A';
      const nivel = est.nivel || 'N/A';
      const fecha = this.formatearFechaPDF(ins.fechaInscripcion);
      
      doc.text(`${index + 1}`, colPositions[0] + 2, currentY);
      doc.text(nombreCompleto.substring(0, 30), colPositions[1] + 2, currentY); // Limitar longitud
      doc.text(dni, colPositions[2] + 2, currentY);
      doc.text(colegio.substring(0, 25), colPositions[3] + 2, currentY);
      doc.text(grado, colPositions[4] + 2, currentY);
      doc.text(nivel, colPositions[5] + 2, currentY);
      doc.text(fecha, colPositions[6] + 2, currentY);
      
      // Línea de borde inferior
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
  // BOTÓN CREDENCIALES - Icono 🪪
  // ============================================
  verCredenciales(ins: Inscripcion) {
    console.log('Ver credenciales de inscripción:', ins.id);
    alert(`Función de credenciales en desarrollo para ${ins.estudiantes?.length || 0} estudiante(s)`);
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