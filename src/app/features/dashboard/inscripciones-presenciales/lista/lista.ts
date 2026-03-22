import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NuevaInscripcion } from '../nueva-inscripcion/nueva-inscripcion';
import { InscripcionService } from '../../../../services/inscripcion';
import { Inscripcion, Estudiante } from '../../../../models/inscripcion.model';

@Component({
  selector: 'app-lista-presenciales',
  standalone: true,
  imports: [CommonModule, NuevaInscripcion],
  templateUrl: './lista.html',
  styleUrls: ['./lista.css']
})
export class Lista implements OnInit {
  mostrarNuevaInscripcion = false;
  inscripciones: Inscripcion[] = [];
  cargando = true;
  
  inscripcionEditar: Inscripcion | null = null;
  estudiantesEditar: Estudiante[] = [];
  
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