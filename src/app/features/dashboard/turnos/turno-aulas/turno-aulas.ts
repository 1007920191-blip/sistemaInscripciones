// features/dashboard/turnos/turno-aulas/turno-aulas.ts
import { Component, EventEmitter, Input, OnInit, OnChanges, OnDestroy, Output, SimpleChanges, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TurnoAulaService } from '../../../../services/turno-aula.service';
import { AulaService } from '../../../../services/aula.service';
import { Turno, AulaTurnoDisplay, TurnoAulaAsignada } from '../../../../models/turno.model';
import { Aula } from '../../../../models/aula.model';
import { InscripcionService } from '../../../../services/inscripcion';
import { ConfiguracionService } from '../../../../services/configuracion';
import { ImpresionService } from '../../../../services/impresion';
import { jsPDF } from 'jspdf';

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
  
  // Impresión
  mostrarModalImpresion: boolean = false;
  tipoImpresion: 'TARJETA' | 'CARTILLA' = 'TARJETA';
  alternativasImpresion: number = 4;
  aulaParaImpresion?: AulaTurnoDisplay;
  
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
  private todasLasInscripciones: any[] = [];
  private inscripcionesActuales: any[] = [];
  private todasLasAulasActuales: AulaTurnoDisplay[] = [];
  // Control del recálculo automático de contadores: una vez por turno y por visita,
  // sin repetirse si ya está en curso.
  private recalculoEnCurso = false;
  private turnosRecalculados = new Set<string>();

  constructor(
    private turnoAulaService: TurnoAulaService,
    private aulaService: AulaService,
    private inscripcionService: InscripcionService,
    private configuracionService: ConfiguracionService,
    private impresionService: ImpresionService,
    private ngZone: NgZone
  ) {}

  async ngOnInit() {
    this.actualizarGradosDelTurno();
    await this.cargarAulasAsignadas();
    await this.recalcularInscritosDelTurno();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['turno'] && !changes['turno'].firstChange) {
      this.actualizarGradosDelTurno();
      this.cargarAulasAsignadas();
      this.recalcularInscritosDelTurno();
    }
  }

  /**
   * Deja al día los contadores (INSCRITOS / reparto por colegio) de las aulas de
   * este turno, contando a los alumnos realmente asignados. Es el respaldo para
   * que un borrado hecho por fuera de la app (consola de Firebase, borrado del
   * aula maestra, etc.) no deje el número descuadrado para siempre.
   *
   * Se ejecuta una sola vez por turno y por visita. Si los números ya están
   * correctos no escribe nada.
   */
  private async recalcularInscritosDelTurno() {
    const turnoId = String(this.turno?.id || '').trim();
    if (!turnoId || this.recalculoEnCurso || this.turnosRecalculados.has(turnoId)) return;

    this.recalculoEnCurso = true;
    try {
      const resultado = await this.turnoAulaService.recalcularInscritosDelTurno(turnoId);
      this.turnosRecalculados.add(turnoId);
      if (resultado.cambiadas > 0) {
        console.log(
          `[turno-aulas] Contadores corregidos: ${resultado.cambiadas} de ${resultado.aulas} aulas ` +
          `del turno ${turnoId} (${resultado.estudiantes} alumnos contados).`
        );
      }
    } catch (error) {
      console.warn('No se pudieron recalcular los inscritos del turno:', error);
    } finally {
      this.recalculoEnCurso = false;
    }
  }

  normalizarGradoDisplay(g: string): string {
    const t = (g || '').toUpperCase().trim().replace(/\s+/g, ' ');
    if (t === '4°' || t === '4' || t === 'CUARTO' || t.includes('4° PRIMARIA')) return 'CUARTO';
    if (t.includes('1°') || t === '1') return 'PRIMERO';
    if (t.includes('2°') || t === '2') return 'SEGUNDO';
    if (t.includes('3°') || t === '3') return 'TERCERO';
    if (t.includes('5°') || t === '5') return 'QUINTO';
    if (t.includes('6°') || t === '6') return 'SEXTO';
    return t;
  }

  private actualizarGradosDelTurno() {
    let rawGrados: string[] = [];

    if (this.turno.nivelesGrados && this.turno.nivelesGrados.length > 0) {
      rawGrados = this.turno.nivelesGrados.map(ng => {
        const gRaw = (ng.grado || '').trim();
        const g = this.normalizarGradoDisplay(gRaw);
        const n = (ng.nivel || '').trim();
        if (n && g.toUpperCase().includes(n.toUpperCase())) return g;
        if (g.toUpperCase().includes('PRIMARIA') || g.toUpperCase().includes('SECUNDARIA')) return g;
        return n ? `${g} ${this.capitalizar(n)}` : g;
      });
    } else {
      rawGrados = (this.turno.grados || []).map(g => {
        const gradeStr = (g || '').trim();
        const levelStr = (this.turno.nivel || '').trim();
        
        if (levelStr && gradeStr.toUpperCase().includes(levelStr.toUpperCase())) {
          return gradeStr;
        }
        if (gradeStr.toUpperCase().includes('PRIMARIA') || gradeStr.toUpperCase().includes('SECUNDARIA')) {
          return gradeStr;
        }
        return levelStr ? `${gradeStr} ${this.capitalizar(levelStr)}` : gradeStr;
      });
    }

    // Limpiar duplicados y guardar en gradosDelTurno
    this.gradosDelTurno = [...new Set(rawGrados)].map(g => g.trim());

    // Validación preventiva de cadenas anómalas
    this.gradosDelTurno.forEach(g => {
      const upper = g.toUpperCase();
      if (
        (upper.includes('PRIMARIA') && upper.includes('SECUNDARIA')) ||
        upper.includes('SECUNDARIA PRIMARIA') ||
        upper.includes('PRIMARIA SECUNDARIA')
      ) {
        console.warn(`[WARNING PREVENTIVO] Se detectó una cadena de grado anómala: "${g}" en el turno:`, this.turno);
      }
    });

    if (!this.gradosDelTurno.includes(this.gradoSeleccionado)) {
      this.gradoSeleccionado = this.gradosDelTurno[0] || '';
    }
  }

  private capitalizar(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  async cargarAulasAsignadas() {
    if (!this.turno || !this.turno.id) return;
    
    this.cargando = true;
    
    try {
      // Limpiar suscripciones anteriores
      if (this.unsubscribeAulas) this.unsubscribeAulas();
      if (this.unsubscribeInscripciones) this.unsubscribeInscripciones();

      console.log('Suscribiendo a aulas para turno:', this.turno.id!, 'grado:', this.gradoSeleccionado);
      
      // Se usan las inscripciones completadas para las listas de impresión.
      // Los contadores de ocupación provienen de turnosedicion.
      this.unsubscribeInscripciones = this.inscripcionService.escucharTodasLasInscripciones((inscripciones) => {
        this.ngZone.run(() => {
          this.todasLasInscripciones = inscripciones;
          this.inscripcionesActuales = inscripciones.filter((i:any)=> i.estado==='completada');
          this.procesarDatosCombinados();
        });
      });

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
    // turnosedicion es la fuente del contador operativo del aula en este turno.
    // No recalcularlo desde inscripciones completadas: una inscripción puede
    // quedar pendiente aunque algunos estudiantes sí hayan sido asignados.
    const aulasActualizadas = this.todasLasAulasActuales.map(aula => ({
      ...aula,
      inscritos: Number.isFinite(aula.inscritos) ? aula.inscritos : 0
    }));

    this.ngZone.run(() => {
      this.aulasAsignadas = aulasActualizadas.filter(aula => {
        const gradoAulaNorm = this.normalizarGradoDisplay(aula.grado).toUpperCase();
        const nivelAulaNorm = String(aula.nivel||'').toUpperCase().trim();
        const selRaw = String(this.gradoSeleccionado||'').trim();
        const selGradoRaw = selRaw.split(' ')[0] || selRaw;
        const selGrado = this.normalizarGradoDisplay(selGradoRaw).toUpperCase();
        const selNivel = selRaw.toUpperCase().includes('SECUNDARIA') ? 'SECUNDARIA' : selRaw.toUpperCase().includes('PRIMARIA') ? 'PRIMARIA' : String(this.turno.nivel||'').toUpperCase().trim();
        return gradoAulaNorm === selGrado && nivelAulaNorm === selNivel;
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
      const grado = this.normalizarGradoDisplay(
        (this.gradoSeleccionado || '').split(' ')[0] || this.gradoSeleccionado
      );
      const nivel = this.gradoSeleccionado.toUpperCase().includes('SECUNDARIA')
        ? 'Secundaria'
        : this.gradoSeleccionado.toUpperCase().includes('PRIMARIA')
          ? 'Primaria'
          : this.turno.nivel;
      this.aulasDisponibles = await this.turnoAulaService.obtenerAulasDisponibles(
        this.turno.id!,
        grado,
        nivel
      );
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

      const gradoSoloRaw = (this.gradoSeleccionado || '').split(' ')[0] || this.gradoSeleccionado;
      const gradoSolo = this.normalizarGradoDisplay(gradoSoloRaw);
      const data: TurnoAulaAsignada = {
        turnoId: this.turno.id!,
        aulaId: aula.id!,
        codigoAula: aula.codigo,
        grado: gradoSolo,
        nivel: (this.turno.nivel || this.gradoSeleccionado.includes('SECUNDARIA') ? 'SECUNDARIA' : 'PRIMARIA') as any,
        inscritos: 0,
        capacidad: aula.capacidad,
        local: this.LOCAL_DEFAULT,
        pabellon: aula.pabellon,
        piso: aula.piso,
        puertaAcceso: aula.puertaAcceso,
        sede: this.SEDE_DEFAULT
      };

      if (aula.gradosPermitidos !== undefined) {
        data.gradosPermitidos = [...aula.gradosPermitidos];
      }

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
  }

  // ============================================
  // GENERAR TARJETAS / CARTILLAS
  // ============================================

  abrirModalImpresion(aula: AulaTurnoDisplay) {
    if (!aula.inscritos || aula.inscritos === 0) {
      alert('No existen inscritos asignados a esta aula.');
      return;
    }
    this.aulaParaImpresion = aula;
    this.tipoImpresion = 'TARJETA';
    this.alternativasImpresion = 4;
    this.mostrarModalImpresion = true;
  }

  cerrarModalImpresion() {
    this.mostrarModalImpresion = false;
    this.aulaParaImpresion = undefined;
  }

  async confirmarImpresion() {
    if (!this.aulaParaImpresion) return;
    
    this.cargandoModal = true;
    try {
      let config: any = null;
      try {
        config = await this.configuracionService.obtenerConfiguracion();
      } catch (e) {
        console.warn('No se pudo cargar la configuración para la impresión');
      }

      const inscripcionesRelacionadas = this.inscripcionesActuales.filter(ins => 
        ins.asignacionesAula?.some((asig: any) => asig.aulaId === this.aulaParaImpresion!.aulaId || asig.aulaId === this.aulaParaImpresion!.id)
      );

      const estudiantesFinales: any[] = [];
      
      for (const ins of inscripcionesRelacionadas) {
        if (ins.id) {
          const estudiantes = await this.inscripcionService.obtenerEstudiantes(ins.id);
          for (const est of estudiantes) {
            if (est.aulaAsignadaId === this.aulaParaImpresion!.aulaId || est.aulaAsignadaId === this.aulaParaImpresion!.id) {
              estudiantesFinales.push({
                ...est,
                colegioObj: est.colegio || ins.colegio,
                inscripcionId: ins.id
              });
            }
          }
        }
      }

      estudiantesFinales.sort((a, b) => {
        const nomA = `${a.apellidos || ''} ${a.nombres || ''}`.trim().toLowerCase();
        const nomB = `${b.apellidos || ''} ${b.nombres || ''}`.trim().toLowerCase();
        return nomA.localeCompare(nomB);
      });

      if (this.tipoImpresion === 'TARJETA') {
        await this.impresionService.generarTarjetas(estudiantesFinales, this.aulaParaImpresion, this.turno, config);
      } else {
        await this.impresionService.generarCartillas(estudiantesFinales, this.aulaParaImpresion, this.turno, config, this.alternativasImpresion);
      }
      
      this.cerrarModalImpresion();
    } catch (error) {
      console.error('Error al generar impresión:', error);
      alert('Ocurrió un error al generar el documento.');
    } finally {
      this.cargandoModal = false;
    }
  }

  // ============================================
  // GENERAR LISTA DE INSCRITOS (PDF)
  // ============================================
  async generarListaPDF(aula: AulaTurnoDisplay) {
    if (!aula.inscritos || aula.inscritos === 0) {
      alert('No existen inscritos asignados a esta aula para generar la lista.');
      return;
    }

    this.cargando = true;
    try {
      // 1. Cargar Configuración
      let config: any = null;
      try {
        config = await this.configuracionService.obtenerConfiguracion();
      } catch (e) {
        console.warn('No se pudo cargar la configuración para el PDF');
      }

      const nombreConcurso = config?.nombreConcurso || 'CONCURSO NACIONAL';
      const edicion = config?.edicion || new Date().getFullYear().toString();
      const eslogan = config?.eslogan || '';
      
      const [logoIzquierdoB64, logoDerechoB64] = await Promise.all([
        this.cargarImagenBase64(config?.logoIzquierdo || ''),
        this.cargarImagenBase64(config?.logoDerecho || '')
      ]);

      // Leer la fuente canónica de la asignación por estudiante, sin filtrar
      // por el estado global de la inscripción: puede haber asignados en una
      // inscripción pendiente cuando otros estudiantes quedaron sin aula.
      const inscripcionesRelacionadas = this.todasLasInscripciones.filter(ins =>
        ins.asignacionesAula?.some((asig: any) => String(asig.aulaId || '').trim() === String(aula.id).trim()) ||
        ins.estudiantes?.some((est: any) => String(est.aulaAsignadaId || '').trim() === String(aula.id).trim())
      );

      const estudiantesFinales: any[] = [];
      
      for (const ins of inscripcionesRelacionadas) {
        if (ins.id) {
          const estudiantes = await this.inscripcionService.obtenerEstudiantes(ins.id);
          for (const est of estudiantes) {
            if (String(est.aulaAsignadaId || '').trim() === String(aula.id).trim()) {
              
              if (est.grado?.trim().toUpperCase() !== aula.grado?.trim().toUpperCase() || 
                  est.nivel?.trim().toUpperCase() !== aula.nivel?.trim().toUpperCase()) {
                console.warn(`[WARNING] Estudiante asignado incorrectamente al aula: ${est.numeroDocumento}`);
              }
              
              estudiantesFinales.push({
                ...est,
                colegioObj: est.colegio || ins.colegio
              });
            }
          }
        }
      }

      // Ordenar alfabéticamente por apellidos
      estudiantesFinales.sort((a, b) => {
        const nomA = `${a.apellidos || ''} ${a.nombres || ''}`.trim().toLowerCase();
        const nomB = `${b.apellidos || ''} ${b.nombres || ''}`.trim().toLowerCase();
        return nomA.localeCompare(nomB);
      });

      // 3. Generar PDF
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const drawHeader = () => {
        // Logos
        if (logoIzquierdoB64) {
          doc.addImage(logoIzquierdoB64, 'PNG', 15, 10, 18, 18);
        }
        if (logoDerechoB64) {
          doc.addImage(logoDerechoB64, 'PNG', pageWidth - 33, 10, 18, 18);
        }

        doc.setTextColor(33, 37, 41);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(11);
        doc.text(nombreConcurso.toUpperCase(), pageWidth / 2, 16, { align: 'center' });
        
        doc.setFontSize(9);
        doc.text(`${eslogan} - ${edicion}`.toUpperCase(), pageWidth / 2, 22, { align: 'center' });
        
        doc.setFontSize(9);
        doc.text(`SEDE: ${aula.sede || this.SEDE_DEFAULT}`, pageWidth / 2, 28, { align: 'center' });

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('LISTA DE INSCRITOS', pageWidth / 2, 38, { align: 'center' });

        const gradoNivelFix = aula.grado.toUpperCase().includes(aula.nivel.toUpperCase()) ? aula.grado.toUpperCase() : `${aula.grado.toUpperCase()} ${aula.nivel.toUpperCase()}`;
        const gradoFix = gradoNivelFix.replace(/4°/g, 'CUARTO').replace(/°/g, '').replace(/\s+/g, ' ').trim();
        doc.setFontSize(10);
        doc.text(`TURNO: ${this.turno.codigo}`, 20, 50);
        doc.text(`AULA: ${aula.codigoAula}`, 80, 50);
        doc.text(`GRADO: ${gradoFix}`, 140, 50);

        doc.setFillColor(240, 240, 240);
        doc.rect(15, 55, pageWidth - 30, 8, 'F');
        doc.setDrawColor(0, 0, 0);
        doc.rect(15, 55, pageWidth - 30, 8, 'S');

        doc.setFontSize(9);
        doc.text('N°', 17, 60);
        doc.text('DNI', 28, 60);
        doc.text('APELLIDOS Y NOMBRES', 52, 60);
        doc.text('GRADO', 142, 60);
        doc.text('NIVEL', 167, 60);
        doc.text('IE', 197, 60);
        doc.text('GESTIÓN', 262, 60);
      };

      const rowHeight = 7;
      let currentY = 63;
      let studentIndex = 0;
      
      drawHeader();

      estudiantesFinales.forEach((est) => {
        if (currentY > 190) {
          doc.addPage();
          currentY = 63;
          drawHeader();
        }

        const num = (studentIndex + 1).toString();
        const dni = est.numeroDocumento || '—';
        const nombres = `${est.apellidos || ''} ${est.nombres || ''}`.trim().toUpperCase();
        const grado = est.grado?.toUpperCase() || '—';
        const nivel = est.nivel?.toUpperCase() || '—';
        const ie = (est.colegioObj?.IE || '—').toUpperCase();
        const gestion = (est.colegioObj?.GESTION || est.colegioObj?.gestion || '—').toUpperCase();

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        
        doc.rect(15, currentY, pageWidth - 30, rowHeight, 'S');
        
        doc.line(26, currentY, 26, currentY + rowHeight);
        doc.line(50, currentY, 50, currentY + rowHeight);
        doc.line(140, currentY, 140, currentY + rowHeight);
        doc.line(165, currentY, 165, currentY + rowHeight);
        doc.line(195, currentY, 195, currentY + rowHeight);
        doc.line(260, currentY, 260, currentY + rowHeight);

        doc.text(num, 17, currentY + 5);
        doc.text(dni, 28, currentY + 5);
        doc.text(nombres.substring(0, 50), 52, currentY + 5);
        doc.text(grado.substring(0, 15), 142, currentY + 5);
        doc.text(nivel.substring(0, 15), 167, currentY + 5);
        doc.text(ie.substring(0, 40), 197, currentY + 5);
        doc.text(gestion.substring(0, 15), 262, currentY + 5);

        currentY += rowHeight;
        studentIndex++;
      });

      const totalPgs = doc.getNumberOfPages();
      for (let i = 1; i <= totalPgs; i++) {
        doc.setPage(i);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`Página ${i} de ${totalPgs}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
      }

      doc.save(`Lista_Aula_${aula.codigoAula}_${this.turno.codigo}.pdf`);
      
    } catch (error) {
      console.error('Error al generar lista PDF:', error);
      alert('Ocurrió un error al generar la lista.');
    } finally {
      this.cargando = false;
    }
  }

  private cargarImagenBase64(url: string): Promise<string | null> {
    if (!url) return Promise.resolve(null);
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      let timeoutId: any;

      img.onload = () => {
        clearTimeout(timeoutId);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const dataURL = canvas.toDataURL('image/png');
            resolve(dataURL);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };

      img.onerror = () => {
        clearTimeout(timeoutId);
        resolve(null);
      };

      timeoutId = setTimeout(() => {
        img.src = '';
        resolve(null);
      }, 5000);

      img.src = url;
    });
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
      await this.turnoAulaService.actualizarAulaTurno(this.aulaEditando.id, {
        codigoAula: this.aulaEditando.codigoAula,
        pabellon: this.aulaEditando.pabellon,
        piso: this.aulaEditando.piso,
        puertaAcceso: this.aulaEditando.puertaAcceso,
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
