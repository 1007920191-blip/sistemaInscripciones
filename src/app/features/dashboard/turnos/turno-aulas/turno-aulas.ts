// features/dashboard/turnos/turno-aulas/turno-aulas.ts
import { Component, EventEmitter, Input, OnInit, OnChanges, OnDestroy, Output, SimpleChanges, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TurnoAulaService } from '../../../../services/turno-aula.service';
import { AulaService } from '../../../../services/aula.service';
import { Turno, AulaTurnoDisplay, TurnoAulaAsignada } from '../../../../models/turno.model';
import { Aula } from '../../../../models/aula.model';
import { InscripcionService } from '../../../../services/inscripcion';

@Component({
  selector: 'app-turno-aulas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './turno-aulas.html',
  styleUrls: ['./turno-aulas.css']
})
export class TurnoAulasComponent implements OnInit, OnChanges, OnDestroy {
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
    codigoAula: '',
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

  // Constantes por defecto (se pueden mover a config)
  private readonly LOCAL_DEFAULT = 'I.E. BELEN DE OSMA Y PARDO';
  private readonly SEDE_DEFAULT = 'Andahuaylas';

  private normalizarTexto(texto: string): string {

  let t = (texto || '')
    .toLowerCase()
    .replace('°', '')
    .replace(/\s+/g, ' ')
    .trim();

  t = t
    .replace('primero', '1')
    .replace('segundo', '2')
    .replace('tercero', '3')
    .replace('cuarto', '4')
    .replace('quinto', '5')
    .replace('sexto', '6');

  return t;
}

  cargando: boolean = false;
  cargandoModal: boolean = false;

  // Paginación
  itemsPorPagina: number = 4;
  paginaActual: number = 1;
  Math = Math;

  private unsubscribeAulas?: () => void;
  private unsubscribeInscripciones?: () => void;
  private inscripcionesActuales: any[] = [];
  private todasLasAulasActuales: AulaTurnoDisplay[] = [];

  constructor(
    private turnoAulaService: TurnoAulaService,
    private aulaService: AulaService,
    private inscripcionService: InscripcionService,
    private ngZone: NgZone
  ) {}

  async ngOnInit() {
    this.actualizarGradosDelTurno();
    await this.cargarAulasAsignadas();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['turno'] && !changes['turno'].firstChange) {
      this.actualizarGradosDelTurno();
      this.cargarAulasAsignadas();
    }
  }

  private actualizarGradosDelTurno() {

  if (
    this.turno.nivelesGrados &&
    this.turno.nivelesGrados.length > 0
  ) {

    this.gradosDelTurno = [
      ...new Set(
        this.turno.nivelesGrados.map(ng =>
          `${ng.grado} ${ng.nivel}`
        )
      )
    ];

  } else {

    this.gradosDelTurno = [
      ...new Set(
        (this.turno.grados || []).map(g =>
          `${g} ${this.turno.nivel || ''}`
        )
      )
    ];
  }

  if (
    !this.gradosDelTurno.includes(this.gradoSeleccionado)
  ) {
    this.gradoSeleccionado =
      this.gradosDelTurno[0] || '';
  }
}

  async cargarAulasAsignadas() {
    if (!this.turno || !this.turno.id) return;
    
    this.cargando = true;
    
    try {
      // Limpiar suscripciones anteriores
      if (this.unsubscribeAulas) this.unsubscribeAulas();
      if (this.unsubscribeInscripciones) this.unsubscribeInscripciones();

      console.log('Suscribiendo a aulas para turno:', this.turno.id!, 'grado:', this.gradoSeleccionado);
      
      this.unsubscribeInscripciones = this.inscripcionService.escucharInscripcionesPorTurno(this.turno.id!, (inscripciones) => {
        this.ngZone.run(() => {
          this.inscripcionesActuales = inscripciones;
          this.procesarDatosCombinados();
        });
      }, this.turno.codigo);

      this.unsubscribeAulas = this.turnoAulaService.escucharAulasPorTurno(this.turno.id!, (todasLasAulas) => {
        this.ngZone.run(() => {
          this.todasLasAulasActuales = todasLasAulas;
          this.procesarDatosCombinados();
        });
      }, this.turno.codigo);
      
    } catch (error) {
      console.error('Error suscribiendo aulas:', error);
      this.cargando = false;
    }
  }

  private procesarDatosCombinados() {
    // Calcular inscritos por aula a partir de las inscripciones reales
    const conteoPorAula = new Map<string, number>();
    
    for (const inscripcion of this.inscripcionesActuales) {
      if (inscripcion.asignacionesAula) {
        for (const asignacion of inscripcion.asignacionesAula) {
          if (asignacion.aulaId) {
            const current = conteoPorAula.get(asignacion.aulaId) || 0;
            conteoPorAula.set(asignacion.aulaId, current + 1);
          }
        }
      }
    }

    // Actualizar las aulas con el conteo real
    const aulasActualizadas = this.todasLasAulasActuales.map(aula => ({
  ...aula,
  inscritos: conteoPorAula.get(aula.id) || 0
}));

    // Filtrar por el grado seleccionado con trim y case-insensitive
    this.ngZone.run(() => {
      this.aulasAsignadas = aulasActualizadas.filter(aula => {

  const gradoAula = this.normalizarTexto(aula.grado);
  const gradoSel = this.normalizarTexto(this.gradoSeleccionado);

  console.log('Comparando:', gradoAula, 'vs', gradoSel);

  return gradoAula.includes(gradoSel)
    || gradoSel.includes(gradoAula);
});
      
      this.filtrarAulas();
      this.cargando = false;
    });
  }

  ngOnDestroy() {
    if (this.unsubscribeAulas) {
      this.unsubscribeAulas();
    }
    if (this.unsubscribeInscripciones) {
      this.unsubscribeInscripciones();
    }
  }

  onGradoChange() {
    this.cargarAulasAsignadas();
  }

  filtrarAulas() {
    if (!this.busqueda.trim()) {
      this.aulasFiltradas = [...this.aulasAsignadas];
    } else {
      const termino = this.busqueda.toLowerCase().trim();
      this.aulasFiltradas = this.aulasAsignadas.filter(aula => 
        (aula.codigoAula || '').toLowerCase().includes(termino) ||
        (aula.grado || '').toLowerCase().includes(termino) ||
        (aula.nivel || '').toLowerCase().includes(termino) ||
        (aula.pabellon || '').toLowerCase().includes(termino)
      );
    }
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
  }

  onItemsPorPaginaChange(event: any) {
    this.itemsPorPagina = parseInt(event.target.value);
    this.paginaActual = 1;
  }

  // Gestión de aulas
  async abrirModalAsignar() {
    this.cargandoModal = true;
    try {
      this.aulasDisponibles = await this.turnoAulaService.obtenerAulasDisponibles(this.turno.id!);
      this.mostrarModalAsignar = true;
    } catch (error) {
      console.error('Error cargando aulas:', error);
      alert('Error al cargar aulas disponibles');
    } finally {
      this.cargandoModal = false;
    }
  }

  cerrarModalAsignar() {
    this.mostrarModalAsignar = false;
    this.aulaSeleccionadaId = '';
    this.aulaParaAsignar = undefined;
  }

  onAulaSeleccionadaChange() {
    if (this.aulaSeleccionadaId) {
      this.aulaParaAsignar = this.aulasDisponibles.find(a => a.id === this.aulaSeleccionadaId);
    } else {
      this.aulaParaAsignar = undefined;
    }
  }

  async confirmarAsignacion() {
    if (!this.aulaSeleccionadaId || this.cargando) return;
    
    this.cargando = true;
    
    try {
      const aula = this.aulasDisponibles.find(a => a.id === this.aulaSeleccionadaId);
      if (!aula) {
        alert('Error: Aula no encontrada');
        this.cargando = false;
        return;
      }

      const data: TurnoAulaAsignada = {
        turnoId: this.turno.id!,
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

      await this.turnoAulaService.asignarAulaATurno(data);
      
      this.cerrarModalAsignar();
      
      // Emitir evento
      this.guardar.emit();
      
    } catch (error) {
      console.error('Error asignando aula:', error);
      alert('Error al asignar el aula');
    } finally {
      this.cargando = false;
    }
  }

  // Editar aula (todos los campos)
  abrirModalEditar(aula: AulaTurnoDisplay) {
    this.aulaEditando = { ...aula };
    this.mostrarModalEditar = true;
  }

  cerrarModalEditar() {
    this.mostrarModalEditar = false;
    this.resetAulaEditando();
  }

  resetAulaEditando() {
    this.aulaEditando = {
      id: '',
      aulaId: '',
      codigoAula: '',
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

    try {
      if (this.aulaEditando.inscritos > this.aulaEditando.capacidad) {
        alert(`Error: Los inscritos no pueden exceder la capacidad`);
        this.cargando = false;
        return;
      }

      await this.turnoAulaService.actualizarAulaTurno(this.aulaEditando.id, {
        codigoAula: this.aulaEditando.codigoAula,
        capacidad: this.aulaEditando.capacidad,
        pabellon: this.aulaEditando.pabellon,
        piso: this.aulaEditando.piso,
        puertaAcceso: this.aulaEditando.puertaAcceso,
        inscritos: this.aulaEditando.inscritos,
        local: this.aulaEditando.local,
        sede: this.aulaEditando.sede
      });
      
      this.cerrarModalEditar();
      // onSnapshot actualiza la tabla automáticamente
      this.guardar.emit();
      
    } catch (error) {
      console.error('Error actualizando:', error);
      alert('Error al actualizar el aula');
    } finally {
      this.cargando = false;
    }
  }

  // Eliminar asignación
  async eliminarAsignacion(aula: AulaTurnoDisplay) {
    const tieneInscritos = await this.turnoAulaService.verificarInscritos(aula.id);
    
    if (tieneInscritos) {
      alert('No se puede eliminar el aula porque tiene inscritos. Reasigne los participantes primero.');
      return;
    }
    
    if (confirm(`¿Está seguro de eliminar el aula ${aula.codigoAula} de este turno?`)) {
      try {
        await this.turnoAulaService.eliminarAsignacion(aula.id);
        // onSnapshot actualiza automáticamente
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