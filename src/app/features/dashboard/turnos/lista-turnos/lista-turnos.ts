import { Component, OnInit, Output, EventEmitter, Input, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TurnoService } from '../../../../services/turno.service';
import { Turno, ModoAsignacion } from '../../../../models/turno.model';
import { TurnoAulasComponent } from '../turno-aulas/turno-aulas';
import { TurnoGestionService } from '../../../../services/turno-gestion.service';

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
  turnosConModo: (Turno & { modoActual: ModoAsignacion })[] = [];
  itemsPorPagina = 3;
  paginaActual = 1;
  totalItems = 0;
  Math = Math;

  mostrarModalAulas: boolean = false;
  turnoSeleccionado?: Turno;

  constructor(
    private turnoService: TurnoService,
    private turnoGestion: TurnoGestionService
  ) {}

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
    const turnos = await this.turnoService.obtenerTurnos();
    this.turnos = turnos;
    
    this.turnosConModo = await Promise.all(turnos.map(async t => ({
      ...t,
      modoActual: await this.turnoGestion.determinarModoActual(t)
    })));
    
    this.totalItems = turnos.length;
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
    console.log('Cambios guardados en aulas del turno');
  }

  async onEliminarTurno(turno: Turno) {
    if (!turno.id) return;
    
    if (confirm('¿Está seguro de eliminar este turno?')) {
      await this.turnoService.eliminarTurno(turno.id);
      await this.cargarTurnos();
    }
  }

  // ============ MÉTODOS PARA MODO DE ASIGNACIÓN ============

  getModoActual(turno: Turno): ModoAsignacion {
    const encontrado = this.turnosConModo.find(t => t.id === turno.id);
    return encontrado?.modoActual || 'normal';
  }

  async toggleModoTurno(turno: Turno, event: Event) {
    event.stopPropagation();
    
    const modoActual = this.getModoActual(turno);
    const accion = modoActual === 'normal' ? 'cerrar' : 'reabrir';
    
    if (!confirm(`¿${accion === 'cerrar' ? 'Cerrar' : 'Reabrir'} inscripciones para ${turno.codigo}?\n\n${accion === 'cerrar' ? 'Esto activará la fase de contingencia (rezagados).' : 'Esto reactivará las inscripciones normales.'}`)) return;
    
    if (accion === 'cerrar') {
      await this.turnoGestion.cerrarInscripciones(turno.id!);
    } else {
      await this.turnoGestion.reabrirInscripciones(turno.id!);
    }
    
    await this.cargarTurnos();
  }

  // ============ BOTÓN TEMPORAL: Migración ============

  async ejecutarMigracion() {
    if (!confirm('¿Ejecutar migración de datos? Solo hacer una vez.\n\nEsto agregará los campos modoAsignacion, cierreManual y porColegio a tus documentos existentes.')) return;
    
    try {
      const { migrarTurnos } = await import('../../../../migrations/migrar-turnos');
      await migrarTurnos();
      alert('✅ Migración completada. Recargando...');
      await this.cargarTurnos();
    } catch (error: any) {
      console.error('Error en migración:', error);
      alert('❌ Error: ' + error.message);
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