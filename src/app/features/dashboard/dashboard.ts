import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Lista } from './inscripciones-presenciales/lista/lista';
import { ListaO } from './inscripciones-online/lista/lista';
import { NuevaInscripcion } from './inscripciones-presenciales/nueva-inscripcion/nueva-inscripcion';
import { ListaTurnos } from './turnos/lista-turnos/lista-turnos';
import { TurnoForm } from './turnos/turno-form/turno-form';

import { Turno } from '../../models/turno.model';
import { ListaAulasComponent } from './aulas/lista-aulas/lista-aulas';
import { AulaFormComponent } from './aulas/aula-form/aula-form';
import { Aula } from '../../models/aula.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, 
    Lista, 
    ListaO,
    NuevaInscripcion,
    ListaTurnos,
    TurnoForm,
    ListaAulasComponent,
    AulaFormComponent  // <-- AÑADIDO
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent {
  @ViewChild(ListaTurnos) listaTurnos?: ListaTurnos;
  @ViewChild(ListaAulasComponent) listaAulas?: ListaAulasComponent;  // <-- AÑADIDO
  
  section = 'inscripciones-presenciales';
  turnoEnEdicion?: Turno;
  aulaEnEdicion?: Aula;  // <-- AÑADIDO

  constructor(private router: Router) {}

  // Navegación de secciones
  onCambiarSeccion(seccion: string) {
    this.section = seccion;
    this.turnoEnEdicion = undefined;
    this.aulaEnEdicion = undefined;  // <-- AÑADIDO
  }

  // ========== TURNOS (ya existente) ==========
  onEditarTurno(turno: Turno) {
    this.turnoEnEdicion = turno;
    this.section = 'editar-turno';
  }

  async onTurnoGuardado() {
    this.section = 'turnos';
    this.turnoEnEdicion = undefined;
    setTimeout(() => {
      this.listaTurnos?.recargarDatos();
    }, 100);
  }

  onCancelarTurno() {
    this.section = 'turnos';
    this.turnoEnEdicion = undefined;
  }

  // ========== AULAS (NUEVO) ==========
  onEditarAula(aula: Aula) {  // <-- AÑADIDO
    this.aulaEnEdicion = aula;
    this.section = 'editar-aula';
  }

  recargarAulas: boolean = false;

  async onAulaGuardada() {
  this.section = 'aulas';
  this.aulaEnEdicion = undefined;

  setTimeout(() => {
    this.listaAulas?.recargarDatos();
  }, 100);
}

  onCancelarAula() {  // <-- AÑADIDO
    this.section = 'aulas';
    this.aulaEnEdicion = undefined;
  }

  irAConfiguracion() {
    this.router.navigate(['/configuracion']);
  }

  logout() {
    localStorage.removeItem('user');
    location.href = '/';
  }
}