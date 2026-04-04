import { Component, OnInit, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import colegiosData from '../../../../../assets/data/colegios.json';
import { PagoComponent } from '../pago/pago';
import { RegistroEstudianteComponent } from '../registro-estudiante/registro-estudiante';
import { InscripcionService } from '../../../../services/inscripcion';
import { Inscripcion, Estudiante } from '../../../../models/inscripcion.model';

type PasoInscripcion = 'colegio' | 'pago' | 'estudiante' | 'resumen';

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
  departamentos = ['APURIMAC', 'AYACUCHO', 'CUSCO'];
  
  filtros = {
    departamento: '',
    provincia: '',
    distrito: '',
    busqueda: ''
  };
  
  // 🔴 ELIMINADA: private navegando = false;
  
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
  
  // ✅ BANDERAS SEPARADAS
  guardando = false;
  finalizando = false;
  
  @Output() volverLista = new EventEmitter<void>();
  @Output() inscripcionGuardada = new EventEmitter<void>();
  @Output() cerrarModal = new EventEmitter<void>();

  @Input() inscripcionEditar: Inscripcion | null = null;
  @Input() estudiantesEditar: Estudiante[] = [];
  modoEdicion = false;

  constructor(private inscripcionService: InscripcionService) {}

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

  // ============ MÉTODOS DE COLEGIO (sin cambios) ============

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

  // ============ MÉTODOS DE PAGO (sin cambios) ============

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

  // ============ MÉTODOS DE ESTUDIANTES - CORREGIDOS ============

  volverDesdeEstudianteAPago() {
    this.pasoActual = 'pago';
  }

  // ✅ NAVEGAR ANTERIOR: Guarda y retrocede
  onNavegarAnterior(estudiante: Estudiante) {
    console.log('[Padre] onNavegarAnterior llamado');
    
    if (this.guardando || this.finalizando) return;
    this.guardando = true;
    
    // 1. GUARDAR en posición actual
    const index = this.estudianteActual - 1;
    this.guardarEnArray(estudiante, index);
    console.log(`[Padre] Guardado en posición ${index}:`, estudiante);
    
    // 2. RETROCEDER
    if (this.estudianteActual > 1) {
      this.estudianteActual--;
      console.log(`[Padre] Retrocediendo a estudiante ${this.estudianteActual}`);
    }
    
    this.guardando = false;
  }

  // ✅ NAVEGAR SIGUIENTE: Guarda y avanza (SECUENCIAL)
  onNavegarSiguiente(estudiante: Estudiante) {
    console.log('[Padre] onNavegarSiguiente llamado');
    
    if (this.guardando || this.finalizando) return;
    this.guardando = true;
    
    // 1. GUARDAR en posición actual
    const index = this.estudianteActual - 1;
    this.guardarEnArray(estudiante, index);
    console.log(`[Padre] Guardado en posición ${index}:`, estudiante);
    
    // 2. AVANZAR 1 (no saltar)
    if (this.estudianteActual < this.datosPago.cantidad) {
      this.estudianteActual++;
      console.log(`[Padre] Avanzando a estudiante ${this.estudianteActual}`);
    }
    
    this.guardando = false;
  }

  // ✅ GUARDAR Y CONTINUAR: Guarda y avanza automáticamente
  onGuardarEstudiante(estudiante: Estudiante) {
    console.log('[Padre] onGuardarEstudiante (continuar) llamado');
    
    if (this.guardando || this.finalizando) return;
    this.guardando = true;
    
    // 1. GUARDAR
    const index = this.estudianteActual - 1;
    this.guardarEnArray(estudiante, index);
    console.log(`[Padre] Guardado en posición ${index}:`, estudiante);
    
    // 2. AVANZAR automáticamente
    if (this.estudianteActual < this.datosPago.cantidad) {
      this.estudianteActual++;
      console.log(`[Padre] Continuando a estudiante ${this.estudianteActual}`);
    }
    
    this.guardando = false;
  }

  // ✅ FINALIZAR: Guarda y CIERRA (primer click)
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
      console.log('[Padre] Array completo:', this.estudiantesRegistrados);
      
      // 2. Guardar en BD
      await this.ejecutarFinalizacion();
      
    } catch (error) {
      console.error('[Padre] Error:', error);
      alert('Error al guardar. Intente nuevamente.');
      this.finalizando = false;
    }
  }

  private guardarEnArray(estudiante: Estudiante, index: number) {
    if (index < this.estudiantesRegistrados.length) {
      this.estudiantesRegistrados[index] = { ...estudiante };
    } else {
      this.estudiantesRegistrados.push({ ...estudiante });
    }
  }

  private async ejecutarFinalizacion() {
    const inscripcionData = {
      colegio: this.colegioSeleccionado,
      metodoPago: this.datosPago.metodo,
      cantidadEstudiantes: this.datosPago.cantidad,
      montoTotal: this.datosPago.monto,
      telefonoApoderado: this.datosPago.telefono,
      estudiantes: [...this.estudiantesRegistrados],
      estado: 'completada'
    };

    try {
    // 1. Guardar en BD
    if (this.modoEdicion) {
      await this.inscripcionService.actualizarInscripcion(this.inscripcionId, inscripcionData);
      await this.inscripcionService.eliminarEstudiantes(this.inscripcionId);
      for (const est of this.estudiantesRegistrados) {
        await this.inscripcionService.guardarEstudiante(est, this.inscripcionId);
      }
    } else {
      this.inscripcionId = await this.inscripcionService.guardarInscripcion(inscripcionData as Inscripcion);
      for (const est of this.estudiantesRegistrados) {
        await this.inscripcionService.guardarEstudiante(est, this.inscripcionId);
      }
    }

    console.log('[Padre] Guardado exitoso, cerrando...');
    
    // 2. ✅ CERRAR INMEDIATAMENTE (antes del alert)
    this.inscripcionGuardada.emit();
    this.cerrarModal.emit();
    
    // 3. Alert opcional (no bloquea el cierre porque ya emitimos)
    setTimeout(() => {
      alert(`¡Inscripción ${this.modoEdicion ? 'actualizada' : 'guardada'} exitosamente!`);
    }, 0);

  } catch (error) {
    console.error('[Padre] Error:', error);
    alert('Error al guardar. Intente nuevamente.');
    this.finalizando = false;
  }
}

// ✅ NUEVO MÉTODO: Centraliza el cierre
private cerrarVentana() {
  console.log('[Padre] Cerrando ventana...');
  this.inscripcionGuardada.emit();
  this.cerrarModal.emit();
  // No resetear finalizando porque el componente se destruye
}

  // ============ CANCELAR / VOLVER ============

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
    this.limpiarFiltros();
  }

  volverALista() {
    this.volverLista.emit();
  }
}