// features/dashboard/turnos/turno-aulas/turno-aulas.ts
import { Component, EventEmitter, Input, OnInit, Output, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TurnoAulaService } from '../../../../services/turno-aula.service';
import { AulaService } from '../../../../services/aula.service';
import { Turno, AulaTurnoDisplay, TurnoAulaAsignada } from '../../../../models/turno.model';
import { Aula } from '../../../../models/aula.model';

@Component({
  selector: 'app-turno-aulas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './turno-aulas.html',
  styleUrls: ['./turno-aulas.css']
})
export class TurnoAulasComponent implements OnInit {
  @Input() turno!: Turno;
  @Output() cerrar = new EventEmitter<void>();
  @Output() guardar = new EventEmitter<void>();

  // Datos de la tabla
  aulasAsignadas: AulaTurnoDisplay[] = [];
  aulasFiltradas: AulaTurnoDisplay[] = [];
  
  // Para agregar nueva aula
  aulasDisponibles: Aula[] = [];
  aulaSeleccionadaId: string = '';
  
  // Grados disponibles del turno actual (solo los que tiene el turno)
  gradosDelTurno: string[] = [];
  gradoSeleccionado: string = '';
  
  // Aula seleccionada para mostrar en preview
  aulaParaAsignar?: Aula;
  
  // Estados de modales
  mostrarModalAsignar: boolean = false;
  mostrarModalEditar: boolean = false;
  
  // Aula en edición (todos los campos editables)
  aulaEditando: AulaTurnoDisplay = {
    id: '',
    aulaId: '',
    codigo: '',
    inscritos: 0,
    capacidad: 0,
    grado: '',
    nivel: '',
    local: '',
    pabellon: '',
    piso: 0,
    puertaAcceso: '',
    sede: '',
    turnoId: ''
  };
  
  // Búsqueda
  busqueda: string = '';
  
  // Loading
  cargando: boolean = false;
  cargandoModal: boolean = false;

  // Constantes
  readonly SEDE_DEFAULT = 'ANDAHUAYLAS';
  readonly LOCAL_DEFAULT = 'I.E. BELEN DE OSMA Y PARDO';

  // Paginación
  itemsPorPagina: number = 4;
  paginaActual: number = 1;
  Math = Math;

  constructor(
    private turnoAulaService: TurnoAulaService,
    private aulaService: AulaService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    // Extraer grados únicos del turno
    this.gradosDelTurno = [...new Set(this.turno.grados)];
    this.gradoSeleccionado = this.gradosDelTurno[0] || '';
    
    await this.cargarAulasAsignadas();
  }

  async cargarAulasAsignadas() {
    this.cargando = true;
    this.cdr.detectChanges(); // Forzar actualización
    try {
      console.log('Cargando aulas para turno:', this.turno.codigo, 'grado:', this.gradoSeleccionado);
      
      const todasLasAulas = await this.turnoAulaService.obtenerAulasPorTurno(this.turno.codigo);
      console.log('Todas las aulas del turno:', todasLasAulas);
      
      // Filtrar por el grado seleccionado
      this.aulasAsignadas = todasLasAulas.filter(aula => 
        aula.grado.toLowerCase() === this.gradoSeleccionado.toLowerCase()
      );
      
      console.log('Aulas filtradas por grado:', this.aulasAsignadas);
      
      this.filtrarAulas();
      this.paginaActual = 1;
      
    } catch (error) {
      console.error('Error cargando aulas:', error);
      alert('Error al cargar las aulas asignadas');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges(); // Forzar actualización
    }
  }

  onGradoChange() {
    this.cargarAulasAsignadas();
  }

  filtrarAulas() {
    if (!this.busqueda.trim()) {
      this.aulasFiltradas = [...this.aulasAsignadas];
    } else {
      const termino = this.busqueda.toLowerCase();
      this.aulasFiltradas = this.aulasAsignadas.filter(aula => 
        aula.codigo.toLowerCase().includes(termino) ||
        aula.grado.toLowerCase().includes(termino) ||
        aula.nivel.toLowerCase().includes(termino) ||
        aula.pabellon.toLowerCase().includes(termino)
      );
    }
    this.cdr.detectChanges(); // Forzar actualización
  }

  // Paginación
  get totalPaginas(): number {
    return Math.ceil(this.aulasFiltradas.length / this.itemsPorPagina) || 1;
  }

  get aulasPaginadas(): AulaTurnoDisplay[] {
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
    this.cdr.detectChanges(); // Forzar actualización
  }

  onItemsPorPaginaChange(event: any) {
    this.itemsPorPagina = parseInt(event.target.value);
    this.paginaActual = 1;
    this.cdr.detectChanges(); // Forzar actualización
  }

  // Abrir modal para agregar aula
  async abrirModalAsignar() {
    // Prevenir doble ejecución
    if (this.cargandoModal || this.mostrarModalAsignar) {
      console.log('Ignorando click: cargandoModal=', this.cargandoModal, 'mostrarModalAsignar=', this.mostrarModalAsignar);
      return;
    }
    
    console.log('=== Abriendo modal asignar ===');
    this.cargandoModal = true;
    this.cdr.detectChanges(); // <-- FORZAR ACTUALIZACIÓN INMEDIATA
    
    try {
      console.log('Obteniendo aulas disponibles para turno:', this.turno.codigo);
      this.aulasDisponibles = await this.turnoAulaService.obtenerAulasDisponibles(this.turno.codigo);
      
      console.log('Aulas disponibles:', this.aulasDisponibles.length);
      
      if (this.aulasDisponibles.length === 0) {
        alert('No hay aulas disponibles para asignar');
        this.cargandoModal = false;
        this.cdr.detectChanges(); // <-- FORZAR ACTUALIZACIÓN
        return;
      }
      
      // Resetear selección
      this.aulaSeleccionadaId = '';
      this.aulaParaAsignar = undefined;
      
      // ABRIR MODAL - ESTE ES EL CAMBIO CLAVE
      console.log('Abriendo modal...');
      this.mostrarModalAsignar = true;
      this.cdr.detectChanges(); // <-- FORZAR ACTUALIZACIÓN INMEDIATA
      
    } catch (error) {
      console.error('Error abriendo modal:', error);
      alert('Error al cargar aulas disponibles');
    } finally {
      this.cargandoModal = false;
      this.cdr.detectChanges(); // <-- FORZAR ACTUALIZACIÓN FINAL
      console.log('=== Finalizando carga ===');
    }
  }

  onAulaSeleccionadaChange() {
    this.aulaParaAsignar = this.aulasDisponibles.find(a => a.id === this.aulaSeleccionadaId);
    this.cdr.detectChanges(); // Forzar actualización
  }

  cerrarModalAsignar() {
    this.mostrarModalAsignar = false;
    this.aulaSeleccionadaId = '';
    this.aulaParaAsignar = undefined;
    this.cdr.detectChanges(); // Forzar actualización
  }

  // Confirmar asignación de aula
  async confirmarAsignacion() {
    if (!this.aulaSeleccionadaId || this.cargando) return;
    
    // Prevenir doble ejecución
    if (this.cargando) return;
    
    this.cargando = true;
    this.cdr.detectChanges(); // Forzar actualización
    
    try {
      const aula = this.aulasDisponibles.find(a => a.id === this.aulaSeleccionadaId);
      if (!aula) {
        alert('Error: Aula no encontrada');
        this.cargando = false;
        this.cdr.detectChanges();
        return;
      }

      const data: TurnoAulaAsignada = {
        turnoId: this.turno.codigo,
        aulaId: aula.id!,
        codigoAula: aula.codigo,
        grado: this.gradoSeleccionado,
        nivel: this.turno.nivel,
        inscritos: 0,
        capacidad: aula.capacidad,
        local: this.LOCAL_DEFAULT,
        pabellon: aula.pabellon,
        piso: aula.piso,
        puertaAcceso: aula.puertaAcceso,
        sede: this.SEDE_DEFAULT
      };

      console.log('Guardando aula:', data);
      
      // Guardar en Firebase
      await this.turnoAulaService.asignarAulaATurno(data);
      
      // Cerrar modal PRIMERO
      this.cerrarModalAsignar();
      
      // Recargar datos
      await this.cargarAulasAsignadas();
      
      // Emitir evento
      this.guardar.emit();
      
    } catch (error) {
      console.error('Error asignando aula:', error);
      alert('Error al asignar el aula');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges(); // Forzar actualización
    }
  }
  // Editar aula (todos los campos)
  abrirModalEditar(aula: AulaTurnoDisplay) {
    this.aulaEditando = { ...aula };
    this.mostrarModalEditar = true;
    this.cdr.detectChanges(); // Forzar actualización
  }

  cerrarModalEditar() {
    this.mostrarModalEditar = false;
    this.resetAulaEditando();
    this.cdr.detectChanges(); // Forzar actualización
  }

  resetAulaEditando() {
    this.aulaEditando = {
      id: '',
      aulaId: '',
      codigo: '',
      inscritos: 0,
      capacidad: 0,
      grado: '',
      nivel: '',
      local: '',
      pabellon: '',
      piso: 0,
      puertaAcceso: '',
      sede: '',
      turnoId: ''
    };
  }

  async guardarEdicion() {
    if (!this.aulaEditando.id || this.cargando) return;
    
    this.cargando = true;
    this.cdr.detectChanges(); // Forzar actualización

    try {
      if (this.aulaEditando.inscritos > this.aulaEditando.capacidad) {
        alert(`Error: Los inscritos no pueden exceder la capacidad`);
        this.cargando = false;
        this.cdr.detectChanges();
        return;
      }

      await this.turnoAulaService.actualizarAulaTurno(this.aulaEditando.id, {
        codigoAula: this.aulaEditando.codigo,
        capacidad: this.aulaEditando.capacidad,
        pabellon: this.aulaEditando.pabellon,
        piso: this.aulaEditando.piso,
        puertaAcceso: this.aulaEditando.puertaAcceso,
        inscritos: this.aulaEditando.inscritos,
        local: this.aulaEditando.local,
        sede: this.aulaEditando.sede
      });
      
      this.cerrarModalEditar();
      await this.cargarAulasAsignadas();
      this.guardar.emit();
      
    } catch (error) {
      console.error('Error actualizando:', error);
      alert('Error al actualizar el aula');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges(); // Forzar actualización
    }
  }

  // Eliminar asignación
  async eliminarAsignacion(aula: AulaTurnoDisplay) {
    const tieneInscritos = await this.turnoAulaService.verificarInscritos(aula.id);
    
    if (tieneInscritos) {
      alert('No se puede eliminar el aula porque tiene inscritos. Reasigne los participantes primero.');
      return;
    }
    
    if (confirm(`¿Está seguro de eliminar el aula ${aula.codigo} de este turno?`)) {
      try {
        await this.turnoAulaService.eliminarAsignacion(aula.id);
        await this.cargarAulasAsignadas();
        this.guardar.emit();
      } catch (error) {
        console.error('Error eliminando:', error);
        alert('Error al eliminar la asignación');
      }
    }
  }

  onCerrar() {
    this.cerrar.emit();
  }
}