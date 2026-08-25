import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InscripcionService } from '../../../../services/inscripcion';
import { Inscripcion, Estudiante } from '../../../../models/inscripcion.model';

@Component({
  selector: 'app-lista-online',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lista.html',
  styleUrls: ['./lista.css'],
})
export class ListaO implements OnInit {
  cargando = true;
  inscripciones: Inscripcion[] = [];
  inscripcionExpandida: string | null = null;

  mostrarModalValidar = false;
  inscripcionAValidar: Inscripcion | null = null;
  confirmacionValidacion = false;
  validando = false;

  constructor(
    private inscripcionService: InscripcionService
  ) {}

  async ngOnInit() {
    await this.cargarInscripciones();
  }

  async cargarInscripciones() {
    this.cargando = true;
    try {
      this.inscripciones = await this.inscripcionService.obtenerInscripcionesPorOrigen('online');
    } catch (error) {
      console.error('Error al cargar inscripciones online:', error);
      this.inscripciones = [];
    } finally {
      this.cargando = false;
    }
  }

  toggleExpandir(ins: Inscripcion) {
    this.inscripcionExpandida = this.inscripcionExpandida === ins.id ? null : ins.id!;
  }

  abrirModalValidar(ins: Inscripcion) {
    this.inscripcionAValidar = ins;
    this.confirmacionValidacion = false;
    this.mostrarModalValidar = true;
  }

  cerrarModalValidar() {
    this.mostrarModalValidar = false;
    this.inscripcionAValidar = null;
    this.confirmacionValidacion = false;
  }

  async confirmarValidacion() {
    if (!this.inscripcionAValidar?.id || !this.confirmacionValidacion) return;
    this.validando = true;
    try {
      await this.inscripcionService.actualizarInscripcion(
        this.inscripcionAValidar.id,
        { estado: 'completada' }
      );
      this.inscripcionAValidar.estado = 'completada';
    } catch (error) {
      console.error('Error al validar inscripción:', error);
    } finally {
      this.cerrarModalValidar();
      this.validando = false;
    }
  }

  getEstadoClase(estado: string): string {
    switch (estado) {
      case 'completada': return 'estado-completada';
      case 'pendiente': return 'estado-pendiente';
      case 'cancelada': return 'estado-cancelada';
      default: return '';
    }
  }

  formatearFecha(fecha: any): string {
    if (!fecha) return '-';
    const d = fecha instanceof Date ? fecha : (fecha.toDate ? fecha.toDate() : new Date(fecha));
    return d.toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  tieneVoucher(ins: any): boolean {
    return !!(ins.voucherUrl || ins.voucherStoragePath);
  }

  obtenerVoucherUrl(ins: any): string {
    return ins.voucherUrl || ins.voucherStoragePath || '';
  }

  cantidadEstudiantesValidos(ins: Inscripcion): number {
    return ins.estudiantes?.length || 0;
  }

  obtenerCorreoResponsable(ins: any): string {
    const correo = ins.correoApoderado
      || ins.apoderado?.correo
      || (typeof ins.nombreContacto === 'string' && ins.nombreContacto.includes('@') ? ins.nombreContacto : null)
      || '—';
    return correo;
  }
}
