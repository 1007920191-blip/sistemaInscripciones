import { Component, OnInit, Output, EventEmitter, Input, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TurnoService } from '../../../../services/turno.service';
import { Turno } from '../../../../models/turno.model';
import { TurnoAulasComponent } from '../turno-aulas/turno-aulas';

@Component({
  selector: 'app-lista-turnos',
  standalone: true,
  imports: [CommonModule, FormsModule, TurnoAulasComponent],
  templateUrl: './lista-turnos.html',
  styleUrls: ['./lista-turnos.css']
})
export class ListaTurnos implements OnInit {
  @Output() cambiarSeccion = new EventEmitter<string>();
  @Output() editarTurno = new EventEmitter<Turno>();
  
  turnos: Turno[] = [];
  itemsPorPagina = 3;
  paginaActual = 1;
  totalItems = 0;
  Math = Math;

  //Estado para el modal de aulas
  mostrarModalAulas: boolean = false;
  turnoSeleccionado?: Turno;

  constructor(private turnoService: TurnoService) {}

  @Input() recargar: boolean = false;
  
  ngOnChanges(changes: SimpleChanges) {
    if (changes['recargar'] && this.recargar) {
      this.cargarTurnos();
    }
  }

  async ngOnInit() {
    await this.cargarTurnos();
  }
  async recargarDatos() {
    await this.cargarTurnos();
  }

  async cargarTurnos() {
    this.turnos = await this.turnoService.obtenerTurnos();
    this.totalItems = this.turnos.length;
    this.paginaActual = 1;
  }

  get turnosPaginados(): Turno[] {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    const fin = inicio + this.itemsPorPagina;
    return this.turnos.slice(inicio, fin);
  }

  get totalPaginas(): number {
    return Math.ceil(this.totalItems / this.itemsPorPagina) || 1;
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
    this.paginaActual = 1;
  }

  nuevoTurno() {
    this.cambiarSeccion.emit('nuevo-turno');
  }

  onEditarTurno(turno: Turno) {
    this.editarTurno.emit(turno);
  }

  onVerAulas(turno: Turno) {
    this.turnoSeleccionado = turno;
    this.mostrarModalAulas = true;
  }
  onCerrarModalAulas() {
    this.mostrarModalAulas = false;
    this.turnoSeleccionado = undefined;
  }
  onGuardarModalAulas() {
    // Opcional: recargar datos del turno si se necesita
    console.log('Cambios guardados en aulas del turno');
  }

  async onEliminarTurno(turno: Turno) {
    if (!turno.id) return;
    
    if (confirm('¿Está seguro de eliminar este turno?')) {
      await this.turnoService.eliminarTurno(turno.id);
      await this.cargarTurnos();
    }
  }

  formatearGrados(grados: string[]): string {
    if (!grados || grados.length === 0) return '-';
    return grados.join(', ');
  }

  formatearFecha(fecha: Date): string {
    if (!fecha) return '-';
    const d = new Date(fecha);
    return d.toLocaleDateString('es-ES');
  }
}