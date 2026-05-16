import { Component, OnInit, Output, EventEmitter, Input, NgZone } from '@angular/core';
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
  modoEdicion = false;

  // Cache de turnos encontrados por estudiante
  turnosPorEstudiante: Map<number, Turno> = new Map();

  constructor(
    private inscripcionService: InscripcionService,
    private previewService: AsignacionPreviewService,
    private asignacionService: AsignacionService,
    private turnoGestion: TurnoGestionService,
    private turnoService: TurnoService,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    this.colegios = colegiosData as any[];
    this.colegiosFiltrados = [];
    
    if (this.inscripcionEditar) {
      this.cargarDatosEdicion();
    }
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
    
    this.estudiantesRegistrados = [...this.estudiantesEditar];
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
    
    if (this.modoEdicion) {
      this.mostrarBusquedaColegios = false;
    } else {
      this.pasoActual = 'pago';
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
    this.datosPago = datos;
    
    if (datos.cantidad < this.estudiantesRegistrados.length) {
      this.estudiantesRegistrados = this.estudiantesRegistrados.slice(0, datos.cantidad);
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
    
    if (this.estudianteActual > 1) {
      this.estudianteActual--;
    }
    
    this.guardando = false;
  }

  onNavegarSiguiente(estudiante: Estudiante) {
    if (this.guardando || this.finalizando) return;
    this.guardando = true;
    
    const index = this.estudianteActual - 1;
    this.guardarEnArray(estudiante, index);
    
    if (this.estudianteActual < this.datosPago.cantidad) {
      this.estudianteActual++;
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
    
    this.guardando = false;
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

  /**
   * Normaliza grado de "3° Primaria" → "Tercero"
   */
  private normalizarGrado(grado: string): string {
    const lower = grado.toLowerCase().trim();
    const numeroMatch = lower.match(/(\d+)/);
    const numero = numeroMatch ? numeroMatch[1] : '';
    
    const mapaNumeros: Record<string, string> = {
      '1': 'Primero', '2': 'Segundo', '3': 'Tercero',
      '4': 'Cuarto', '5': 'Quinto', '6': 'Sexto'
    };
    
    return mapaNumeros[numero] || grado;
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
      // Procesar cada estudiante individualmente
      for (let i = 0; i < this.estudiantesRegistrados.length; i++) {
        const estudiante = this.estudiantesRegistrados[i];
        
        // Buscar turno para este estudiante específico
        const turno = await this.obtenerTurnoParaEstudiante(estudiante);
        
        if (!turno) {
          this.previewAsignaciones.push({
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

        // Guardar turno encontrado
        this.turnosPorEstudiante.set(i, turno);

        // Determinar modo del turno
        const modo = await this.turnoGestion.determinarModoActual(turno);

        // Generar preview para este estudiante en su turno
        const preview = await this.previewService.generarPreviewParaEstudiante(
          turno,
          estudiante,
          this.colegioSeleccionado.CODIGOMODULAR,
          modo
        );

        this.previewAsignaciones.push(preview);
      }

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
    const inscripcionData: Partial<Inscripcion> = {
      colegio: this.colegioSeleccionado,
      metodoPago: this.datosPago.metodo,
      cantidadEstudiantes: this.datosPago.cantidad,
      montoTotal: this.datosPago.monto,
      telefonoApoderado: this.datosPago.telefono,
      estudiantes: [...this.estudiantesRegistrados],
      estado: 'completada',
      turnoId: '',
      turnoCodigo: '',
      asignacionesAula: []
    };

    // 1. Guardar inscripción base
    let inscripcionId: string;
    if (this.modoEdicion) {
      // Liberar las vacantes previas
      if (this.inscripcionEditar?.asignacionesAula && this.inscripcionEditar.colegio?.CODIGOMODULAR) {
        const asignacionesALiberar = this.inscripcionEditar.asignacionesAula.map((a: any) => ({
          aulaId: a.aulaId,
          colegioId: this.inscripcionEditar!.colegio.CODIGOMODULAR
        }));
        await this.asignacionService.liberarEstudiantes(asignacionesALiberar);
      }

      await this.inscripcionService.actualizarInscripcion(this.inscripcionId, inscripcionData);
      inscripcionId = this.inscripcionId;
      await this.inscripcionService.eliminarEstudiantes(this.inscripcionId);
    } else {
      inscripcionId = await this.inscripcionService.guardarInscripcion(inscripcionData as Inscripcion);
    }

    // 2. ASIGNAR CADA ESTUDIANTE A SU TURNO/AULA
    const asignacionesAula: any[] = [];
    const fallidos: string[] = [];

    for (let i = 0; i < this.estudiantesRegistrados.length; i++) {
      const estudiante = this.estudiantesRegistrados[i];
      const turno = this.turnosPorEstudiante.get(i);

      if (!turno) {
        fallidos.push(`${estudiante.nombres} ${estudiante.apellidos}: No hay turno para ${estudiante.grado}`);
        await this.inscripcionService.guardarEstudiante(estudiante, inscripcionId);
        continue;
      }

      // Actualizar turnoId de la inscripción (usar el del primer estudiante con turno)
      if (!inscripcionData.turnoId) {
        inscripcionData.turnoId = turno.id!;
        inscripcionData.turnoCodigo = turno.codigo;
      }

      try {
        // Asignar estudiante a aula en su turno
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

          console.log('Asignación creada:', asig);

          asignacionesAula.push({
            estudianteIndex: i,
            estudianteNombre: `${estudiante.nombres} ${estudiante.apellidos}`,
            aulaId: asig.aulaId,
            codigoAula: asig.codigoAula,
            grado: estudiante.grado,
            nivel: estudiante.nivel,
            turnoCodigo: turno.codigo
          });

          console.log('Array asignacionesAula:', asignacionesAula);
          
        } else if (resultado.fallidos.length > 0) {
          fallidos.push(`${estudiante.nombres}: ${resultado.fallidos[0].razon}`);
        }

      } catch (error: any) {
        fallidos.push(`${estudiante.nombres}: ${error.message}`);
      }

      // Guardar estudiante (con o sin aula)
      await this.inscripcionService.guardarEstudiante(estudiante, inscripcionId);
    }

    // 3. Actualizar inscripción con asignaciones
    await this.inscripcionService.actualizarInscripcion(inscripcionId, {
      turnoId: inscripcionData.turnoId || '',
      turnoCodigo: inscripcionData.turnoCodigo || '',
      asignacionesAula: asignacionesAula
    });

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

  // ✅ COPIA PROFUNDA
  const copia = structuredClone(estudiante);

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
    this.estudianteActual = 1;
    this.inscripcionId = '';
    this.modoEdicion = false;
    this.guardando = false;
    this.finalizando = false;
    this.previewAsignaciones = [];
    this.turnosPorEstudiante.clear();
    this.limpiarFiltros();
  }

  volverALista() {
    this.volverLista.emit();
  }
}