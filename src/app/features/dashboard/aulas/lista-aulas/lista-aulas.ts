import { Component, OnInit, Output, EventEmitter, Input, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AulaService } from '../../../../services/aula.service';
import { Aula } from '../../../../models/aula.model';

@Component({
  selector: 'app-lista-aulas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lista-aulas.html',
  styleUrls: ['./lista-aulas.css']
})
export class ListaAulasComponent implements OnInit {
  @Output() cambiarSeccion = new EventEmitter<string>();
  @Output() editarAula = new EventEmitter<Aula>();
  @Output() guardarAula = new EventEmitter<void>();
  @Output() cancelarAula = new EventEmitter<void>();
  
  @Input() mostrarFormulario: boolean = false;
  @Input() aulaEditar?: Aula;
  @Input() recargar: boolean = false;
  
  aulas: Aula[] = [];
  aulasFiltradas: Aula[] = [];
  busqueda: string = '';

  // ← NUEVO: Paginación
  itemsPorPagina = this.obtenerItemsPorPagina();
  paginaActual = 1;
  Math = Math;

  constructor(private aulaService: AulaService) {}

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['recargar'] && changes['recargar'].currentValue === true) {
      await this.cargarDatos();
    }
  }
  
  async ngOnInit() {
    await this.cargarDatos();
  }

  async cargarDatos() {
    try {
      this.aulas = await this.aulaService.getAulas();
      console.log("Aulas cargadas:", this.aulas);
      this.filtrarAulas(); // ← Aplicar filtro y paginación
    } catch (error) {
      console.error("Error cargando aulas:", error);
    }
  }

  async recargarDatos() {
    await this.cargarDatos();
  }

  // ← NUEVO: Guardar en localStorage
  private guardarItemsPorPagina() {
    localStorage.setItem('aulas_itemsPorPagina', this.itemsPorPagina.toString());
  }

  // ← NUEVO: Obtener de localStorage
  private obtenerItemsPorPagina(): number {
    const guardado = localStorage.getItem('aulas_itemsPorPagina');
    return guardado ? parseInt(guardado) : 10; // Default 10 para aulas
  }

  filtrarAulas() {
    let filtradas: Aula[];
    
    if (!this.busqueda.trim()) {
      filtradas = [...this.aulas];
    } else {
      const termino = this.busqueda.toLowerCase();
      filtradas = this.aulas.filter(aula => 
        aula.codigo.toLowerCase().includes(termino) ||
        aula.pabellon?.toLowerCase().includes(termino) ||
        aula.local?.toLowerCase().includes(termino)
      );
    }
    
    this.aulasFiltradas = filtradas;
    this.paginaActual = 1; // Reset a página 1 al filtrar
  }

  // ← NUEVO: Getters para paginación
  get totalItems(): number {
    return this.aulasFiltradas.length;
  }

  get totalPaginas(): number {
    return Math.ceil(this.totalItems / this.itemsPorPagina) || 1;
  }

  get aulasPaginadas(): Aula[] {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    const fin = inicio + this.itemsPorPagina;
    return this.aulasFiltradas.slice(inicio, fin);
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

  nuevaAula() {
    this.cambiarSeccion.emit('nueva-aula');
  }

  editar(aula: Aula) {
    this.editarAula.emit(aula);
  }

  async eliminarAula(aula: Aula) {
    if (!aula.id) return;
    try {
      // Un aula con estudiantes inscritos NO se puede borrar: primero hay que
      // reasignar a los participantes (pantalla Turnos → Gestionar aulas).
      const uso = await this.aulaService.estaEnUso(aula.id);
      if (uso.conInscritos > 0) {
        alert(`No se puede eliminar el aula ${aula.codigo} porque tiene estudiantes inscritos en ${uso.conInscritos} turno(s).\n\nPrimero reasigne a los participantes desde Turnos → Gestionar aulas del turno.`);
        return;
      }
      const aviso = uso.asignaciones > 0
        ? `El aula ${aula.codigo} está asignada a ${uso.asignaciones} turno(s), pero sin estudiantes inscritos.\n\n¿Está seguro de eliminarla?`
        : `¿Eliminar el aula ${aula.codigo}?`;
      if (!confirm(aviso)) return;
      await this.aulaService.deleteAula(aula.id);
      await this.cargarDatos();
    } catch (error) {
      console.error('Error al eliminar aula:', error);
      alert('No se pudo eliminar el aula.');
    }
  }

  onGuardar() {
    this.guardarAula.emit();
  }

  onCancelar() {
    this.cancelarAula.emit();
  }
}