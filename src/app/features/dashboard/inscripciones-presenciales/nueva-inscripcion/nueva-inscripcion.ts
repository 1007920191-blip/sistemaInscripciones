import { Component, OnInit, Output, EventEmitter, Input, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import colegiosData from '../../../../../assets/data/colegios.json';
import { PagoComponent } from '../pago/pago';
import { RegistroEstudianteComponent } from '../registro-estudiante/registro-estudiante';
import { InscripcionService } from '../../../../services/inscripcion';
import { Inscripcion, Estudiante } from '../../../../models/inscripcion.model';
import { Turno } from '../../../../models/turno.model';

import { AsignacionPreviewService, PreviewAsignacion } from '../../../../services/asignacion-preview.service';
import { AsignacionService, ResultadoAsignacion } from '../../../../services/asignacion.service';
import { TurnoGestionService } from '../../../../services/turno-gestion.service';
import { TurnoService } from '../../../../services/turno.service';

type PasoInscripcion = 'colegio' | 'pago' | 'estudiante' | 'preview' | 'resumen';

@Component({
  selector: 'app-nueva-inscripcion',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    PagoComponent,
    RegistroEstudianteComponent
  ],
  templateUrl: './nueva-inscripcion.html',
  styleUrls: ['./nueva-inscripcion.css']
})
export class NuevaInscripcion implements OnInit {
  @Input() turnoActual: any; 
  departamentos = ['APURIMAC', 'AYACUCHO', 'CUSCO'];
  
  filtros = {
    departamento: '',
    provincia: '',
    distrito: '',
    busqueda: ''
  };
  
  colegios: any[] = [];
  colegiosFiltrados: any[] = [];
  provincias: string[] = [];
  distritos: string[] = [];
  
  pasoActual: PasoInscripcion = 'colegio';
  
  colegioSeleccionado: any = null;
  mostrarBusquedaColegios = false;
  colegioSeleccionadoAnterior: any = null;
  
  datosPago: any = null;
  estudiantesRegistrados: Estudiante[] = [];
  estudianteActual: number = 1;
  inscripcionId: string = '';
  busquedaEstudiante: string = '';
  cantidadOriginal: number = 0;
  voucherOriginal: string | null = null;
  
  // Preview de asignación
  previewAsignaciones: PreviewAsignacion[] = [];
  modoAsignacionActual: 'normal' | 'contingencia' = 'normal';
  
  guardando = false;
  finalizando = false;
  
  @Output() volverLista = new EventEmitter<void>();
  @Output() inscripcionGuardada = new EventEmitter<void>();
  @Output() cerrarModal = new EventEmitter<void>();

  @Input() inscripcionEditar: Inscripcion | null = null;
  @Input() estudiantesEditar: Estudiante[] = [];
  @Input() estudiantesImportados: Estudiante[] = [];
  modoEdicion = false;
  estudiantesExistentes: Estudiante[] = [];
  private firmasOriginales = new Map<string, string>();
  private originalesMap = new Map<string, any>();

  // Cache de turnos encontrados por estudiante
  turnosPorEstudiante: Map<number, Turno> = new Map();

  inicioCronometro: number | null = null;
  tiempoVivo = 0;
  private timerSub: any = null;

  constructor(
    private inscripcionService: InscripcionService,
    private previewService: AsignacionPreviewService,
    private asignacionService: AsignacionService,
    private turnoGestion: TurnoGestionService,
    private turnoService: TurnoService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.colegios = colegiosData as any[];
    this.colegiosFiltrados = [];
    if (!this.inscripcionEditar) {
      this.inicioCronometro = Date.now();
      this.iniciarTimerVivo();
    }
    if (this.inscripcionEditar) {
      this.cargarDatosEdicion();
    } else if (this.estudiantesImportados && this.estudiantesImportados.length > 0) {
      this.estudiantesRegistrados = this.estudiantesImportados.map(e => ({ ...e }));
    }
  }

  ngOnDestroy() {
    if (this.timerSub) clearInterval(this.timerSub);
  }

  private iniciarTimerVivo() {
    if (this.timerSub) clearInterval(this.timerSub);
    this.ngZone.runOutsideAngular(() => {
      this.timerSub = setInterval(() => {
        if (this.inicioCronometro) {
          const s = Math.floor((Date.now() - this.inicioCronometro) / 1000);
          this.ngZone.run(() => this.tiempoVivo = s);
        }
      }, 1000);
    });
  }

  get tiempoFormateado(): string {
    const m = Math.floor(this.tiempoVivo / 60).toString().padStart(2, '0');
    const s = (this.tiempoVivo % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  private cargarDatosEdicion() {
    this.modoEdicion = true;
    this.inscripcionId = this.inscripcionEditar!.id || '';
    this.mostrarBusquedaColegios = false;
    this.colegioSeleccionado = this.inscripcionEditar!.colegio;
    
    this.datosPago = {
      metodo: this.inscripcionEditar!.metodoPago,
      cantidad: this.inscripcionEditar!.cantidadEstudiantes,
      monto: this.inscripcionEditar!.montoTotal,
      telefono: this.inscripcionEditar!.telefonoApoderado
    };
    // Un documento de la subcolección equivale a un estudiante real. Su
    // identidad es su código/documentId, nunca el DNI ni su posición visual.
    this.estudiantesExistentes = this.estudiantesEditar
      .filter((est: any) => !!(est?.codigo || est?.id))
      .sort((a: any, b: any) => Number(a.codigo || a.id) - Number(b.codigo || b.id))
      .map((est: any) => ({ ...est }));
    this.firmasOriginales.clear();
    this.originalesMap.clear();
    for (const est of this.estudiantesExistentes) {
      const codigo = String((est as any).codigo || (est as any).id);
      this.firmasOriginales.set(codigo, this.firmaEstudiante(est));
      this.originalesMap.set(codigo, { ...est });
    }
    this.cantidadOriginal = this.estudiantesExistentes.length;
    this.estudiantesRegistrados = this.estudiantesExistentes.map((est: any) => ({ ...est }));
    this.estudianteActual = 1;
    this.pasoActual = 'colegio';
  }

  // ============ MÉTODOS DE COLEGIO ============

  iniciarCambioColegio() {
    this.mostrarBusquedaColegios = true;
    this.colegioSeleccionadoAnterior = this.colegioSeleccionado;
    this.colegioSeleccionado = null;
    this.limpiarFiltros();
  }

  cancelarCambioColegio() {
    this.mostrarBusquedaColegios = false;
    this.colegioSeleccionado = this.colegioSeleccionadoAnterior;
  }

  limpiarFiltros() {
    this.filtros.departamento = '';
    this.filtros.provincia = '';
    this.filtros.distrito = '';
    this.filtros.busqueda = '';
    this.provincias = [];
    this.distritos = [];
    this.colegiosFiltrados = [];
  }

  onDepartamentoChange() {
    this.provincias = [...new Set(this.colegios
      .filter(c => c.DEPARTAMENTO === this.filtros.departamento)
      .map(c => c.PROVINCIA))].sort();
    
    this.filtros.provincia = '';
    this.filtros.distrito = '';
    this.distritos = [];
    this.filtrar();
  }

  onProvinciaChange() {
    this.distritos = [...new Set(this.colegios
      .filter(c => c.DEPARTAMENTO === this.filtros.departamento && 
                   c.PROVINCIA === this.filtros.provincia)
      .map(c => c.DISTRITO))].sort();
    
    this.filtros.distrito = '';
    this.filtrar();
  }

  onDistritoChange() {
    this.filtrar();
  }

  filtrar() {
    const busquedaLower = this.filtros.busqueda.toLowerCase().trim();
    
    this.colegiosFiltrados = this.colegios.filter(c => {
      const matchDep = !this.filtros.departamento || 
        c.DEPARTAMENTO === this.filtros.departamento;
      const matchProv = !this.filtros.provincia || 
        c.PROVINCIA === this.filtros.provincia;
      const matchDist = !this.filtros.distrito || 
        c.DISTRITO === this.filtros.distrito;
      
      const matchBusq = !busquedaLower || 
        c.IE?.toLowerCase().includes(busquedaLower) ||
        c.CODIGOMODULAR?.toLowerCase().includes(busquedaLower) ||
        c.CODIGOMODULAR?.includes(this.filtros.busqueda);
      
      return matchDep && matchProv && matchDist && matchBusq;
    }).slice(0, 10);
  }

  seleccionarColegio(colegio: any) {
    this.colegioSeleccionado = colegio;
    this.sincronizarNivelConColegio();
    if (this.modoEdicion) {
      this.mostrarBusquedaColegios = false;
    } else {
      this.pasoActual = 'pago';
    }
  }

  private sincronizarNivelConColegio() {
    const nivelNuevo = String(this.colegioSeleccionado?.NIVEL || '').toUpperCase().trim();
    if (!nivelNuevo) return;
    const validos = nivelNuevo === 'SECUNDARIA'
      ? ['PRIMERO','SEGUNDO','TERCERO','CUARTO','QUINTO']
      : nivelNuevo === 'PRIMARIA'
      ? ['PRIMERO','SEGUNDO','TERCERO','CUARTO','QUINTO','SEXTO']
      : [];
    for (const est of this.estudiantesRegistrados) {
      if (String(est.nivel).toUpperCase().trim() !== nivelNuevo) {
        est.nivel = nivelNuevo;
        if (est.grado && validos.length && !validos.includes(String(est.grado).toUpperCase().trim())) {
          est.grado = '';
        }
      }
    }
  }

  continuarDesdeColegio() {
    if (this.modoEdicion && this.estudiantesRegistrados.length > 0) {
      this.pasoActual = 'estudiante';
      this.estudianteActual = 1;
    } else {
      this.pasoActual = 'pago';
    }
  }

  // ============ MÉTODOS DE PAGO ============

  volverDesdePagoAColegio() {
    this.pasoActual = 'colegio';
  }

  onConfirmarPago(datos: any) {
    if (this.modoEdicion) {
      const reales = this.estudiantesExistentes.length;
      if (datos.cantidad !== reales) {
        if (datos.cantidad > reales) {
          if (!confirm(`Cambió la cantidad de ${reales} a ${datos.cantidad}. ¿Desea añadir ${datos.cantidad - reales} estudiante(s) nuevo(s)? Se abrirá un formulario vacío.`)) return;
        } else {
          alert(`No se eliminarán estudiantes automáticamente. Tiene ${reales} real(es). Se mantiene en ${reales}.`);
          datos.cantidad = reales;
          datos.monto = reales * 5;
        }
      }
    }
    if (this.estudiantesImportados.length > 0 && datos.cantidad !== this.estudiantesRegistrados.length) {
      datos.cantidad = this.estudiantesRegistrados.length;
      datos.monto = this.estudiantesRegistrados.length * 5;
    }
    this.datosPago = datos;
    if (this.modoEdicion) {
      const reales = this.estudiantesExistentes.length;
      const deseados = datos.cantidad;
      // Reconstruir slots: existentes + vacíos nuevos (sin clonar existentes)
      const nuevosSlots: any[] = this.estudiantesExistentes.map((est: any) => ({ ...est }));
      if (deseados > reales) {
        for (let i = reales; i < deseados; i++) {
          nuevosSlots.push({
            tipoDocumento: 'dni',
            numeroDocumento: '',
            nombres: '',
            apellidos: '',
            grado: '',
            nivel: this.colegioSeleccionado?.NIVEL || 'PRIMARIA',
            colegio: this.colegioSeleccionado,
            fechaRegistro: new Date(),
            // Marca de interfaz: este slot jamás puede cargar datos de un
            // documento histórico, aunque exista uno duplicado en Firebase.
            __slotNuevo: true
          } as any);
        }
      }
      this.estudiantesRegistrados = nuevosSlots;
    } else {
      if (datos.cantidad < this.estudiantesRegistrados.length) {
        this.estudiantesRegistrados = this.estudiantesRegistrados.slice(0, datos.cantidad);
      }
    }
    this.estudianteActual = 1;
    this.pasoActual = 'estudiante';
  }

  // ============ MÉTODOS DE ESTUDIANTES ============

  volverDesdeEstudianteAPago() {
    this.pasoActual = 'pago';
  }

  onNavegarAnterior(estudiante: Estudiante) {
    if (this.guardando || this.finalizando) return;
    this.guardando = true;
    const index = this.estudianteActual - 1;
    this.guardarEnArray(estudiante, index);
    // Incrementar ANTES para que Angular detecte el cambio de binding
    if (this.estudianteActual > 1) {
      this.estudianteActual--;
    }
    this.cdr.detectChanges();
    // Guardar en Firestore en background (sin bloquear navegación)
    if (this.modoEdicion && this.inscripcionId && this.tieneDatosEstudiante(estudiante)) {
      this.guardarSlotEdicion(estudiante, index).catch(() => {});
    }
    this.guardando = false;
  }

  onNavegarSiguiente(estudiante: Estudiante) {
    if (this.guardando || this.finalizando) return;
    this.guardando = true;
    const index = this.estudianteActual - 1;
    this.guardarEnArray(estudiante, index);
    // Incrementar ANTES para que Angular detecte el cambio de binding
    if (this.estudianteActual < this.datosPago.cantidad) {
      this.estudianteActual++;
    }
    this.cdr.detectChanges();
    // Guardar en Firestore en background (sin bloquear navegación)
    if (this.modoEdicion && this.inscripcionId && this.tieneDatosEstudiante(estudiante)) {
      this.guardarSlotEdicion(estudiante, index).catch(() => {});
    }
    this.guardando = false;
  }

  onGuardarEstudiante(estudiante: Estudiante) {
    if (this.guardando || this.finalizando) return;
    this.guardando = true;
    const index = this.estudianteActual - 1;
    this.guardarEnArray(estudiante, index);
    if (this.estudianteActual < this.datosPago.cantidad) {
      this.estudianteActual++;
    }
    this.cdr.detectChanges();
    // Guardar en Firestore en background (sin bloquear)
    if (this.modoEdicion && this.inscripcionId && this.tieneDatosEstudiante(estudiante)) {
      this.guardarSlotEdicion(estudiante, index).catch(() => {});
    }
    this.guardando = false;
  }

  onBuscarEstudianteVent() {
    // Guardar当前 estudiante en background (sin await)
    if (this.modoEdicion && this.estudiantesRegistrados[this.estudianteActual - 1]) {
      const cur = this.estudiantesRegistrados[this.estudianteActual - 1];
      if (this.tieneDatosEstudiante(cur)) {
        this.guardarSlotEdicion(cur, this.estudianteActual - 1).catch(() => {});
      }
    }
    const term = (this.busquedaEstudiante || '').toLowerCase().trim();
    if (!term) return;
    const idx = this.estudiantesRegistrados.findIndex(e =>
      String(e.nombres || '').toLowerCase().includes(term) ||
      String(e.apellidos || '').toLowerCase().includes(term) ||
      String(e.numeroDocumento || '').toLowerCase().includes(term)
    );
    if (idx >= 0) {
      this.estudianteActual = idx + 1;
      this.cdr.detectChanges();
    }
  }

  // ============ FINALIZAR CON PREVIEW ============

  async onFinalizar(estudiante: Estudiante) {
    console.log('[Padre] onFinalizar llamado');
    
    if (this.finalizando) {
      console.log('[Padre] Ya finalizando, ignorando...');
      return;
    }
    this.finalizando = true;
    
    try {
      // 1. Guardar último estudiante
      const index = this.estudianteActual - 1;
      this.guardarEnArray(estudiante, index);
      console.log(`[Padre] Último estudiante guardado en posición ${index}`);
      
      // 2. GENERAR PREVIEW DE ASIGNACIÓN
      await this.generarPreview();
      
    } catch (error) {
      console.error('[Padre] Error:', error);
      this.ngZone.run(() => {
        alert('Error al preparar asignación. Intente nuevamente.');
        this.finalizando = false;
      });
    }
  }

  // ============ ASIGNACIÓN AUTOMÁTICA POR GRADO ============

  private normalizarGrado(grado: string): string {
    const up = String(grado || '').toUpperCase().trim();
    const numMatch = up.match(/(\d+)/);
    const numero = numMatch ? numMatch[1] : '';
    const mapaNumeros: Record<string, string> = {
      '1': 'PRIMERO', '2': 'SEGUNDO', '3': 'TERCERO',
      '4': 'CUARTO', '5': 'QUINTO', '6': 'SEXTO'
    };
    if (numero && mapaNumeros[numero]) return mapaNumeros[numero];
    const mapaTexto: Record<string,string> = {'PRIMERO':'PRIMERO','SEGUNDO':'SEGUNDO','TERCERO':'TERCERO','CUARTO':'CUARTO','QUINTO':'QUINTO','SEXTO':'SEXTO'};
    if (mapaTexto[up]) return mapaTexto[up];
    return up;
  }

  /**
   * Busca turno que contenga el grado/nivel del estudiante
   */
  async obtenerTurnoParaEstudiante(estudiante: Estudiante): Promise<Turno | null> {
    const turnos = await this.turnoService.obtenerTurnos();
    
    const gradoNormalizado = this.normalizarGrado(estudiante.grado);
    const nivelNormalizado = estudiante.nivel.toUpperCase();
    
    for (const turno of turnos) {
      // Buscar en nivelesGrados (formato nuevo)
      if (turno.nivelesGrados && turno.nivelesGrados.length > 0) {
        const encontrado = turno.nivelesGrados.find(ng => {
          const ngGrado = ng.grado.toLowerCase().trim();
          const ngNivel = ng.nivel.toUpperCase();
          return ngGrado.includes(gradoNormalizado.toLowerCase()) && ngNivel === nivelNormalizado;
        });
        if (encontrado) return turno;
      }
      
      // Fallback: buscar en grados (formato antiguo)
      if (turno.grados?.some(g => {
        const gLower = g.toLowerCase();
        return gLower.includes(gradoNormalizado.toLowerCase());
      })) {
        if (turno.nivel?.toUpperCase() === nivelNormalizado) return turno;
      }
    }
    
    return null;
  }

  /**
   * Genera preview de asignación para TODOS los estudiantes
   */
  async generarPreview() {
    if (!this.colegioSeleccionado) {
      alert('Error: No hay colegio seleccionado');
      this.finalizando = false;
      return;
    }

    if (this.estudiantesRegistrados.length === 0) {
      alert('Error: No hay estudiantes registrados');
      this.finalizando = false;
      return;
    }

    this.guardando = true;
    this.previewAsignaciones = [];
    this.turnosPorEstudiante.clear();

    try {
      // En edición solo se previsualizan los slots nuevos; los documentos
      // existentes ya tienen su asignación y no deben volver a contarse.
      const indices = this.modoEdicion
        ? this.estudiantesRegistrados
            .map((est: any, i) => est.__slotNuevo && String(est.numeroDocumento || '').trim() ? i : -1)
            .filter(i => i >= 0)
        : this.estudiantesRegistrados.map((_, i) => i);

      if (this.modoEdicion && indices.length === 0) {
        await this.ejecutarFinalizacionConAsignacion();
        return;
      }

      const gruposPorTurno = new Map<string, { turno: Turno; entradas: { indice: number; estudiante: Estudiante }[] }>();
      const previewsPorIndice = new Map<number, PreviewAsignacion>();

      for (const i of indices) {
        const estudiante = this.estudiantesRegistrados[i];
        const turno = await this.obtenerTurnoParaEstudiante(estudiante);

        if (!turno) {
          previewsPorIndice.set(i, {
            estudiante,
            modo: 'normal',
            sugerencia: {
              mensaje: `No hay turno configurado para ${estudiante.grado} ${estudiante.nivel}`,
              exito: false,
              espacioDisponible: 0,
              inscritosActuales: 0,
              capacidad: 30
            }
          });
          continue;
        }

        this.turnosPorEstudiante.set(i, turno);
        const claveTurno = String(turno.id || turno.codigo);
        const grupo = gruposPorTurno.get(claveTurno) || { turno, entradas: [] };
        grupo.entradas.push({ indice: i, estudiante });
        gruposPorTurno.set(claveTurno, grupo);
      }

      // Simular por turno y en el mismo orden de registro, compartiendo el
      // estado acumulado de aulas que actualiza AsignacionPreviewService.
      for (const grupo of gruposPorTurno.values()) {
        const previews = await this.previewService.generarPreview(
          grupo.turno,
          grupo.entradas.map(entrada => entrada.estudiante),
          this.colegioSeleccionado.CODIGOMODULAR
        );
        grupo.entradas.forEach((entrada, posicion) => {
          const preview = previews[posicion];
          if (preview) previewsPorIndice.set(entrada.indice, preview);
        });
      }

      this.previewAsignaciones = indices
        .map(i => previewsPorIndice.get(i))
        .filter((preview): preview is PreviewAsignacion => !!preview);

      // Determinar modo global
      const primerExito = this.previewAsignaciones.find(p => p.sugerencia.exito);
      
      this.ngZone.run(() => {
        if (primerExito) {
          this.modoAsignacionActual = primerExito.modo;
        }
        this.pasoActual = 'preview';
        this.finalizando = false;
        this.guardando = false;
      });
      
    } catch (error) {
      console.error('Error en preview:', error);
      this.ngZone.run(() => {
        alert('Error al generar vista previa de asignación');
        this.finalizando = false;
        this.guardando = false;
      });
    }
  }

  // ============ CONFIRMAR DESDE PREVIEW ============

  async confirmarDesdePreview() {
    console.log('[Padre] confirmarDesdePreview llamado');
    
    if (this.finalizando) return;
    this.finalizando = true;
    
    try {
      await this.ejecutarFinalizacionConAsignacion();
    } catch (error) {
      console.error('Error:', error);
      this.ngZone.run(() => {
        alert('Error al guardar. Intente nuevamente.');
        this.finalizando = false;
      });
    }
  }

  volverDesdePreview() {
    this.pasoActual = 'estudiante';
    this.previewAsignaciones = [];
    this.turnosPorEstudiante.clear();
  }

  // ============ GUARDAR CON ASIGNACIÓN REAL ============

  private async ejecutarFinalizacionConAsignacion() {
    const fin = Date.now();
    const inicio = this.inicioCronometro || fin;
    const tiempoSeg = Math.max(1, Math.round((fin - inicio) / 1000));
    const estudiantesConColegioActualizado = this.estudiantesRegistrados.map(est => ({
      ...est,
      colegio: this.colegioSeleccionado
    }));
    const esEdicionOnline = this.modoEdicion && (this.inscripcionEditar as any)?.origen === 'online';
    const estadoFinal: Inscripcion['estado'] = esEdicionOnline ? ((this.inscripcionEditar as any)?.estado === 'completada' ? 'pendiente' : ((this.inscripcionEditar as any)?.estado || 'pendiente')) as any : 'completada';

    const inscripcionData: any = {
      colegio: this.colegioSeleccionado || null,
      metodoPago: this.datosPago?.metodo || 'yape',
      cantidadEstudiantes: this.datosPago?.cantidad ?? estudiantesConColegioActualizado.length,
      montoTotal: this.datosPago?.monto ?? (estudiantesConColegioActualizado.length * 5),
      telefonoApoderado: this.datosPago?.telefono || '',
      estudiantes: estudiantesConColegioActualizado.map((e:any)=> {
        const clean: any = {};
        for (const k of Object.keys(e)) {
          const v = (e as any)[k];
          if (v !== undefined) clean[k] = v;
        }
        return clean;
      }),
      // La inscripción nueva permanece pendiente hasta confirmar todas las aulas.
      estado: this.modoEdicion ? estadoFinal : 'pendiente',
      turnoId: '',
      turnoCodigo: '',
      asignacionesAula: [],
      TIEMPO: tiempoSeg,
      tiempoInscripcion: tiempoSeg,
      inicioInscripcion: new Date(inicio),
      finInscripcion: new Date(fin)
    };
    // Limpiar undefined top-level
    for (const k of Object.keys(inscripcionData)) {
      if ((inscripcionData as any)[k] === undefined) delete (inscripcionData as any)[k];
    }
    if (esEdicionOnline) (inscripcionData as any).origen = 'online';

    // Usar la lista sincronizada desde ahora en adelante
    this.estudiantesRegistrados = estudiantesConColegioActualizado;

    let inscripcionId: string;
    if (this.modoEdicion) {
      const realesCount = this.estudiantesExistentes.length;
      const slotsLlenos = this.estudiantesRegistrados.filter((s:any)=> String(s.numeroDocumento||'').trim()).length;
      // Cantidad real es max entre existentes y llenos (no contar vacíos)
      const cantidadReal = Math.max(realesCount, slotsLlenos);
      await this.inscripcionService.actualizarInscripcion(this.inscripcionId, {
        colegio: inscripcionData.colegio,
        metodoPago: inscripcionData.metodoPago,
        cantidadEstudiantes: cantidadReal,
        montoTotal: inscripcionData.montoTotal,
        telefonoApoderado: inscripcionData.telefonoApoderado,
        TIEMPO: inscripcionData.TIEMPO,
        tiempoInscripcion: inscripcionData.tiempoInscripcion,
        inicioInscripcion: inscripcionData.inicioInscripcion,
        finInscripcion: inscripcionData.finInscripcion
      });
      inscripcionId = this.inscripcionId;
    } else {
      inscripcionId = await this.inscripcionService.guardarInscripcion(inscripcionData as Inscripcion);
    }

    let asignacionesAula: any[] = this.modoEdicion
      ? [...((this.inscripcionEditar as any)?.asignacionesAula || [])]
      : [];
    const fallidos: string[] = [];
    const estudiantesReales = this.estudiantesRegistrados.filter((s:any)=> String(s.numeroDocumento||'').trim());
    const originalColegioId = String((this.inscripcionEditar as any)?.colegio?.CODIGOMODULAR || this.colegioSeleccionado?.CODIGOMODULAR || '').trim();

    const estudiantesParaAsignar = this.modoEdicion
      ? estudiantesReales.filter((s: any) => !!s.__slotNuevo)
      : estudiantesReales;

    const movidos = this.modoEdicion ? estudiantesReales.filter((s:any)=> !s.__slotNuevo && this.necesitaReasignacion(s)) : [];

    if (this.modoEdicion) {
      const aulaIdsAntes = new Set(asignacionesAula.map((a:any)=> String(a.aulaId||'')));
      for (const asig of [...asignacionesAula]) {
        const nombreAsig = String(asig.estudianteNombre||'').trim().toUpperCase();
        const estDueño = estudiantesReales.find((e:any)=> `${String(e.nombres||'').trim()} ${String(e.apellidos||'').trim()}`.toUpperCase() === nombreAsig);
        const aulaAsig = String(asig.aulaId||'');
        const dueñoTieneAula = estDueño ? String((estDueño as any).aulaAsignadaId||'').trim() === aulaAsig : false;
        const gradoAsig = String(asig.grado||'').toUpperCase().trim();
        const gradoEst = estDueño ? String((estDueño as any).grado||'').toUpperCase().trim() : '';
        const desyncGrado = gradoAsig && gradoEst && gradoAsig !== gradoEst;
        if (!estDueño || !dueñoTieneAula || desyncGrado) {
          const esDeMovido = movidos.some((m:any)=> `${String(m.nombres||'').trim()} ${String(m.apellidos||'').trim()}`.toUpperCase() === nombreAsig);
          if (!esDeMovido) {
            try { if (aulaAsig) await this.asignacionService.liberarEstudiantes([{ aulaId: aulaAsig, colegioId: originalColegioId }]); } catch {}
            asignacionesAula = asignacionesAula.filter((x:any)=> x !== asig);
          }
        }
      }
      for (const estudiante of estudiantesReales) {
        if (!(estudiante as any).__slotNuevo && this.debeActualizarExistente(estudiante) && !this.necesitaReasignacion(estudiante)) {
          await this.inscripcionService.guardarEstudiante({ ...estudiante, colegio: this.colegioSeleccionado } as any, inscripcionId);
          const cod = String((estudiante as any).codigo || (estudiante as any).id);
          this.firmasOriginales.set(cod, this.firmaEstudiante(estudiante));
        }
      }
      for (const estudiante of movidos) {
        const origIdx = this.estudiantesRegistrados.indexOf(estudiante);
        const codMov = String((estudiante as any).codigo || (estudiante as any).id);
        const origMov: any = this.originalesMap.get(codMov) || {};
        const nombreMovNorm = `${String(origMov.nombres||'').trim()} ${String(origMov.apellidos||'').trim()}`.toUpperCase().trim();
        const nombreActualNorm = `${String(estudiante.nombres||'').trim()} ${String(estudiante.apellidos||'').trim()}`.toUpperCase().trim();
        let aulaIdALiberar: string | null = origMov.aulaAsignadaId ? String(origMov.aulaAsignadaId) : null;
        if (!aulaIdALiberar) {
          const fb = asignacionesAula.find((a:any)=> String(a.estudianteNombre||'').trim().toUpperCase()===nombreMovNorm || a.estudianteIndex===origIdx);
          if (fb) aulaIdALiberar = String((fb as any).aulaId||'');
        }
        if (aulaIdALiberar) {
          try { await this.asignacionService.liberarEstudiantes([{ aulaId: aulaIdALiberar, colegioId: originalColegioId }]); } catch(e){ console.warn('liberar fallo',e); }
          const antes = asignacionesAula.length;
          asignacionesAula = asignacionesAula.filter((a:any)=>{
            const n = String(a.estudianteNombre||'').trim().toUpperCase();
            if (n && (n===nombreMovNorm || n===nombreActualNorm)) return false;
            if (a.estudianteIndex===origIdx) return false;
            return true;
          });
          if (asignacionesAula.length===antes) {
            asignacionesAula = asignacionesAula.filter((a:any)=> String(a.aulaId||'')!==String(aulaIdALiberar));
          }
        }
        const turno = await this.obtenerTurnoParaEstudiante(estudiante);
        if (!turno) {
          fallidos.push(`${estudiante.nombres} ${estudiante.apellidos}: No hay turno para ${estudiante.grado} ${estudiante.nivel}`);
          (estudiante as any).turnoCodigo = '';
          (estudiante as any).aulaAsignadaId = '';
          (estudiante as any).codigoAula = '';
          await this.inscripcionService.guardarEstudiante({ ...estudiante, colegio: this.colegioSeleccionado } as any, inscripcionId);
          continue;
        }
        const modo = await this.turnoGestion.determinarModoActual(turno);
        try {
          const resultado = await this.asignacionService.asignarEstudiantes(turno, [estudiante], this.colegioSeleccionado.CODIGOMODULAR, modo);
          if (resultado.exito && resultado.asignaciones.length>0) {
            const asig = resultado.asignaciones[0];
            (estudiante as any).aulaAsignadaId = asig.aulaId;
            (estudiante as any).codigoAula = asig.codigoAula;
            (estudiante as any).turnoCodigo = turno.codigo;
            asignacionesAula.push({ estudianteIndex: origIdx, estudianteNombre: `${estudiante.nombres} ${estudiante.apellidos}`, aulaId: asig.aulaId, codigoAula: asig.codigoAula, grado: estudiante.grado, nivel: estudiante.nivel, turnoCodigo: turno.codigo });
          } else {
            fallidos.push(`${estudiante.nombres}: ${resultado.fallidos[0]?.razon || 'sin aula'}`);
            (estudiante as any).turnoCodigo = turno.codigo;
            // La plaza anterior ya fue liberada arriba: no dejar el aula vieja
            // apuntando al estudiante. Si no, una edición posterior volvería a
            // liberar la misma plaza y descuadraría el contador de turnosedicion.
            (estudiante as any).aulaAsignadaId = '';
            (estudiante as any).codigoAula = '';
          }
        } catch(e:any){ fallidos.push(`${estudiante.nombres}: ${e.message}`); }
        await this.inscripcionService.guardarEstudiante({ ...estudiante, colegio: this.colegioSeleccionado } as any, inscripcionId);
        const cod2 = String((estudiante as any).codigo || (estudiante as any).id);
        this.firmasOriginales.set(cod2, this.firmaEstudiante(estudiante));
        if (!inscripcionData.turnoId) { inscripcionData.turnoId = turno.id!; inscripcionData.turnoCodigo = turno.codigo; }
      }
    }

    for (let i = 0; i < estudiantesParaAsignar.length; i++) {
      const estudiante: any = estudiantesParaAsignar[i];
      const origIdx = this.estudiantesRegistrados.indexOf(estudiante);
      const turno = this.turnosPorEstudiante.get(origIdx) || this.turnosPorEstudiante.get(i);

      if (!turno) {
        fallidos.push(`${estudiante.nombres} ${estudiante.apellidos}: No hay turno para ${estudiante.grado}`);
        (estudiante as any).turnoCodigo = '';
        const codigo = await this.inscripcionService.guardarEstudiante({ ...estudiante, colegio: this.colegioSeleccionado } as any, inscripcionId);
        estudiante.codigo = codigo;
        estudiante.id = codigo;
        continue;
      }

      if (!inscripcionData.turnoId) {
        inscripcionData.turnoId = turno.id!;
        inscripcionData.turnoCodigo = turno.codigo;
      }

      try {
        const resultado = await this.asignacionService.asignarEstudiantes(
          turno,
          [estudiante],
          this.colegioSeleccionado.CODIGOMODULAR,
          this.modoAsignacionActual
        );

        if (resultado.exito && resultado.asignaciones.length > 0) {
          const asig = resultado.asignaciones[0];
          estudiante.aulaAsignadaId = asig.aulaId;
          estudiante.codigoAula = asig.codigoAula;
          (estudiante as any).turnoCodigo = turno.codigo;
          asignacionesAula.push({
            estudianteIndex: origIdx,
            estudianteNombre: `${estudiante.nombres} ${estudiante.apellidos}`,
            aulaId: asig.aulaId,
            codigoAula: asig.codigoAula,
            grado: estudiante.grado,
            nivel: estudiante.nivel,
            turnoCodigo: turno.codigo
          });
        } else if (resultado.fallidos.length > 0) {
          fallidos.push(`${estudiante.nombres}: ${resultado.fallidos[0].razon}`);
        }

      } catch (error: any) {
        fallidos.push(`${estudiante.nombres}: ${error.message}`);
      }

      const codigo = await this.inscripcionService.guardarEstudiante({ ...estudiante, colegio: this.colegioSeleccionado } as any, inscripcionId);
      estudiante.codigo = codigo;
      estudiante.id = codigo;
    }

    if (this.modoEdicion) {
      // Reconstruir SOLO las entradas de estudiantes que no están en movidos.
      // Los movidos ya actualizaron su entrada en el loop anterior (línea 744).
      const movidosNombres = new Set(movidos.map((m: any) =>
        `${String(m.nombres || '').trim()} ${String(m.apellidos || '').trim()}`.toUpperCase()
      ));
      const entradasNoMovidas = ((this.inscripcionEditar as any)?.asignacionesAula || [])
        .filter((a: any) => {
          const nombreAsig = String(a.estudianteNombre || '').trim().toUpperCase();
          if (movidosNombres.has(nombreAsig)) return false;
          // Conservar solo si el estudiante sigue existiendo y tiene esa aula
          const estDueño = estudiantesReales.find((e: any) =>
            `${String(e.nombres || '').trim()} ${String(e.apellidos || '').trim()}`.toUpperCase() === nombreAsig
          );
          return estDueño && String((estDueño as any).aulaAsignadaId || '').trim() === String(a.aulaId || '').trim();
        });
      // Las entradas de movidos ya están en asignacionesAula desde el loop.
      // Agregar las entradas no movidas que no estén ya presentes.
      for (const entrada of entradasNoMovidas) {
        const yaExiste = asignacionesAula.some((a: any) =>
          String(a.estudianteNombre || '').trim().toUpperCase() === String(entrada.estudianteNombre || '').trim().toUpperCase()
        );
        if (!yaExiste) {
          asignacionesAula.push(entrada);
        }
      }
    }

    const estudiantesParaResumen = estudiantesReales.map((e:any)=> {
      const clean:any={}; for(const k of Object.keys(e)){ const v=(e as any)[k]; if(v!==undefined) clean[k]=v; } clean.colegio = this.colegioSeleccionado; return clean;
    });
    if (this.timerSub) clearInterval(this.timerSub);
    // Calcular turnoId/turnoCodigo basado en TODOS los estudiantes, no solo el último movido
    let turnoIdFinal = (this.inscripcionEditar as any)?.turnoId || '';
    let turnoCodigoFinal = (this.inscripcionEditar as any)?.turnoCodigo || '';
    if (this.modoEdicion) {
      const turnosConteo = new Map<string, { id: string; codigo: string; count: number }>();
      for (const est of estudiantesReales) {
        const tc = String((est as any).turnoCodigo || '').trim();
        const tid = String((est as any).turnoId || '').trim();
        if (!tc) continue;
        const existing = turnosConteo.get(tc);
        if (existing) {
          existing.count++;
        } else {
          turnosConteo.set(tc, { id: tid || tc, codigo: tc, count: 1 });
        }
      }
      if (turnosConteo.size > 0) {
        const principal = [...turnosConteo.values()].sort((a, b) => b.count - a.count)[0];
        turnoIdFinal = principal.id || turnoIdFinal;
        turnoCodigoFinal = principal.codigo || turnoCodigoFinal;
      }
    } else {
      turnoIdFinal = inscripcionData.turnoId || '';
      turnoCodigoFinal = inscripcionData.turnoCodigo || '';
    }
    await this.inscripcionService.actualizarInscripcion(inscripcionId, {
      estado: fallidos.length === 0 ? estadoFinal : 'pendiente',
      turnoId: turnoIdFinal,
      turnoCodigo: turnoCodigoFinal,
      asignacionesAula: asignacionesAula,
      estudiantes: estudiantesParaResumen,
      cantidadEstudiantes: estudiantesReales.length,
      montoTotal: (this.datosPago?.monto ?? estudiantesReales.length * 5),
      TIEMPO: (inscripcionData as any).TIEMPO,
      tiempoInscripcion: (inscripcionData as any).tiempoInscripcion,
      inicioInscripcion: (inscripcionData as any).inicioInscripcion,
      finInscripcion: (inscripcionData as any).finInscripcion
    });

    if (fallidos.length > 0) {
      alert(`La inscripción quedó pendiente porque no se pudo asignar aula a todos los estudiantes.\n\n${fallidos.join('\n')}`);
    }

    // 4. MOSTRAR RESULTADO Y CERRAR
    console.log('Guardado exitoso, cerrando...');
    
    // Ejecutar la redirección y cierre dentro de la zona de Angular
    this.ngZone.run(() => {
      // Emitir eventos para cerrar y redirigir
      this.inscripcionGuardada.emit();
      this.cerrarModal.emit();
      this.volverLista.emit();
      
      // Resetear estado
      this.resetearTodo();
    });
  }

  // ============ MÉTODOS AUXILIARES ============

  private guardarEnArray(estudiante: Estudiante, index: number) {

  const copia: any = structuredClone(estudiante);
  // Mantener la naturaleza del slot al navegar. Un alumno nuevo aún no tiene
  // código; guardarlo en memoria no puede convertirlo en existente.
  if (this.esSlotNuevo(index)) copia.__slotNuevo = true;

  if (index < this.estudiantesRegistrados.length) {
    this.estudiantesRegistrados[index] = copia;
  } else {
    this.estudiantesRegistrados.push(copia);
  }

  console.log('Estudiantes guardados:', this.estudiantesRegistrados);
}

  tieneAsignacionesExitosas(): boolean {
  return this.previewAsignaciones?.some(
    p => p?.sugerencia?.exito
  ) ?? false;
}

  cancelarInscripcion() {
    if (confirm('¿Está seguro de cancelar? Se perderán todos los datos ingresados.')) {
      this.resetearTodo();
      this.volverLista.emit();
    }
  }

  private resetearTodo() {
    this.pasoActual = 'colegio';
    this.colegioSeleccionado = null;
    this.mostrarBusquedaColegios = false;
    this.colegioSeleccionadoAnterior = null;
    this.datosPago = null;
    this.estudiantesRegistrados = [];
    this.estudiantesExistentes = [];
    this.estudiantesImportados = [];
    this.cantidadOriginal = 0;
    this.estudianteActual = 1;
    this.inscripcionId = '';
    this.modoEdicion = false;
    this.guardando = false;
    this.finalizando = false;
    this.previewAsignaciones = [];
    this.turnosPorEstudiante.clear();
    this.firmasOriginales.clear();
    this.originalesMap.clear();
    this.inicioCronometro = null;
    this.limpiarFiltros();
  }

  volverALista() {
    this.volverLista.emit();
  }

  turnoDePreview(indicePreview: number): Turno | undefined {
    const preview = this.previewAsignaciones[indicePreview];
    const indiceSlot = preview ? this.estudiantesRegistrados.indexOf(preview.estudiante) : -1;
    return indiceSlot >= 0 ? this.turnosPorEstudiante.get(indiceSlot) : undefined;
  }

  private tieneDatosEstudiante(estudiante: Estudiante | null | undefined): boolean {
    if (!estudiante) return false;
    const documento = String((estudiante as any).numeroDocumento || '').trim();
    const nombres = String((estudiante as any).nombres || '').trim();
    const apellidos = String((estudiante as any).apellidos || '').trim();
    return !!documento || !!nombres || !!apellidos;
  }

  esSlotNuevo(indice: number): boolean {
    return !!(this.estudiantesRegistrados[indice] as any)?.__slotNuevo;
  }

  private firmaEstudiante(estudiante: Estudiante): string {
    const e: any = estudiante;
    return JSON.stringify({
      tipoDocumento: e.tipoDocumento || '', numeroDocumento: e.numeroDocumento || '',
      nombres: e.nombres || '', apellidos: e.apellidos || '', nivel: e.nivel || '',
      grado: e.grado || '', colegio: e.colegio || null
    });
  }

  private debeActualizarExistente(estudiante: Estudiante): boolean {
    const codigo = String((estudiante as any).codigo || (estudiante as any).id || '');
    return !!codigo && this.firmasOriginales.get(codigo) !== this.firmaEstudiante(estudiante);
  }

  private necesitaReasignacion(est: Estudiante): boolean {
    const codigo = String((est as any).codigo || (est as any).id || '');
    const orig: any = this.originalesMap.get(codigo);
    if (!orig) return false;
    const gOrig = String(orig.grado||'').toUpperCase().trim();
    const gNew = String(est.grado||'').toUpperCase().trim();
    const nOrig = String(orig.nivel||'').toUpperCase().trim();
    const nNew = String(est.nivel||'').toUpperCase().trim();
    const cOrig = String(orig.colegio?.CODIGOMODULAR|| (this.inscripcionEditar as any)?.colegio?.CODIGOMODULAR || '').trim();
    const cNew = String(this.colegioSeleccionado?.CODIGOMODULAR || (est as any).colegio?.CODIGOMODULAR || '').trim();
    return gOrig !== gNew || nOrig !== nNew || cOrig !== cNew;
  }

  private async guardarSlotEdicion(estudiante: Estudiante, index: number): Promise<void> {
    if (this.esSlotNuevo(index) || !this.debeActualizarExistente(estudiante)) return;
    if (this.necesitaReasignacion(estudiante)) return;
    const codigo = await this.inscripcionService.guardarEstudiante(
      { ...estudiante, colegio: this.colegioSeleccionado } as any,
      this.inscripcionId
    );
    estudiante.codigo = codigo;
    estudiante.id = codigo;
    const slot = this.estudiantesRegistrados[index] as any;
    if (slot) {
      slot.codigo = codigo;
      slot.id = codigo;
    }
    this.firmasOriginales.set(codigo, this.firmaEstudiante(estudiante));
  }
}
