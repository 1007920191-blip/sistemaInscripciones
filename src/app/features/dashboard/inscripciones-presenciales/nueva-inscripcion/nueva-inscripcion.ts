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
  private navegando = false;
  
  colegios: any[] = [];
  colegiosFiltrados: any[] = [];
  provincias: string[] = [];
  distritos: string[] = [];
  
  // ✅ ESTADO ÚNICO: Solo un paso visible a la vez
  pasoActual: PasoInscripcion = 'colegio';
  
  colegioSeleccionado: any = null;
  mostrarBusquedaColegios = false;
  colegioSeleccionadoAnterior: any = null;
  
  datosPago: any = null;
  estudiantesRegistrados: Estudiante[] = [];
  estudianteActual: number = 1;
  inscripcionId: string = '';
  
  guardandoEstudiante = false;
  
  @Output() volverLista = new EventEmitter<void>();
  @Output() inscripcionGuardada = new EventEmitter<void>();

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
    // ✅ En edición empezamos en 'colegio' para que el usuario decida
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
      // ✅ En edición: quedarse en colegio, mostrar botón "Continuar"
    } else {
      // ✅ NUEVA INSCRIPCIÓN: Ir a pago
      this.pasoActual = 'pago';
    }
  }

  // ✅ CONTINUAR CON COLEGIO (solo en edición)
  continuarDesdeColegio() {
    console.log("hola")
    if (this.modoEdicion && this.estudiantesRegistrados.length > 0) {
      // Si ya tiene estudiantes, ir directo a editarlos
      this.pasoActual = 'estudiante';
      this.estudianteActual = 1;
      console.log("adios")
    } else {
      // Si no tiene estudiantes, ir a pago primero
      console.log("hi")
      this.pasoActual = 'pago';
    }
  }

  // ============ MÉTODOS DE PAGO ============

  volverDesdePagoAColegio() {
    this.pasoActual = 'colegio';
  }

  onConfirmarPago(datos: any) {
    this.datosPago = datos;
    
    // ✅ Ajustar array de estudiantes según cantidad
    if (datos.cantidad < this.estudiantesRegistrados.length) {
      this.estudiantesRegistrados = this.estudiantesRegistrados.slice(0, datos.cantidad);
    }
    
    // ✅ SIEMPRE empezar desde el estudiante 1
    this.estudianteActual = 1;
    this.pasoActual = 'estudiante';
  }

  // ============ MÉTODOS DE ESTUDIANTES ============

  volverDesdeEstudianteAPago() {
    this.pasoActual = 'pago';
  }

  async onGuardarEstudiante(estudiante: Estudiante) {
    if (this.guardandoEstudiante) return;
    this.guardandoEstudiante = true;

    const index = this.estudianteActual - 1;
    
    // Guardar/actualizar en la posición correcta
    if (index < this.estudiantesRegistrados.length) {
      this.estudiantesRegistrados[index] = estudiante;
    } else {
      this.estudiantesRegistrados.push(estudiante);
    }
    
    console.log('Guardado estudiante', this.estudianteActual, ':', estudiante);
    console.log('Array actual:', this.estudiantesRegistrados);
    
    // ✅ VERIFICAR: Si estamos navegando, SOLO guardar y NO finalizar
    if (this.navegando) {
      this.navegando = false; // Resetear para la próxima vez
      this.guardandoEstudiante = false;
      return; // Solo guardamos, no avanzamos ni finalizamos
    }
    
    // ✅ Si NO estamos navegando (viene del botón "Guardar y Continuar")
    if (this.estudianteActual < this.datosPago.cantidad) {
      // Hay más estudiantes: avanzar al siguiente
      this.estudianteActual++;
      this.guardandoEstudiante = false;
    } else {
      // Es el último: finalizar inscripción
      this.guardandoEstudiante = false;
      await this.finalizarInscripcion();
    }
  }

  // ✅ NAVEGACIÓN ENTRE ESTUDIANTES (Anterior/Siguiente)
  onNavegarEstudiante(direccion: 'anterior' | 'siguiente') {
    // Primero guardar el estudiante actual en memoria (sin validar)
    //const estudianteActual = this.estudiantesRegistrados[this.estudianteActual - 1];
    this.navegando = true;
    if (direccion === 'anterior' && this.estudianteActual > 1) {
      this.estudianteActual--;
    } else if (direccion === 'siguiente' && this.estudianteActual < this.datosPago.cantidad) {
      this.estudianteActual++;
    }
    // El componente hijo se recicla automáticamente por el cambio de @Input()
  }

  // ============ FINALIZAR ============

  async finalizarInscripcion() {
    try {
      const inscripcionData = {
        colegio: this.colegioSeleccionado,
        metodoPago: this.datosPago.metodo,
        cantidadEstudiantes: this.datosPago.cantidad,
        montoTotal: this.datosPago.monto,
        telefonoApoderado: this.datosPago.telefono,
        estudiantes: this.estudiantesRegistrados,
        estado: 'completada'
      };

      if (this.modoEdicion) {
        await this.inscripcionService.actualizarInscripcion(this.inscripcionId, inscripcionData);
        await this.inscripcionService.eliminarEstudiantes(this.inscripcionId);
        
        for (const est of this.estudiantesRegistrados) {
          await this.inscripcionService.guardarEstudiante(est, this.inscripcionId);
        }
        
        alert('¡Inscripción actualizada exitosamente!');
      } else {
        this.inscripcionId = await this.inscripcionService.guardarInscripcion(inscripcionData as Inscripcion);
        
        for (const est of this.estudiantesRegistrados) {
          await this.inscripcionService.guardarEstudiante(est, this.inscripcionId);
        }
        
        alert('¡Inscripción guardada exitosamente!');
      }

      this.pasoActual = 'resumen';
      this.inscripcionGuardada.emit();
      
    } catch (error) {
      console.error('Error:', error);
      alert('Error al guardar. Intente nuevamente.');
      this.guardandoEstudiante = false;
    }
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
    this.limpiarFiltros();
  }

  volverALista() {
    this.volverLista.emit();
  }
}