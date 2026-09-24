import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Estudiante } from '../../../../models/inscripcion.model';
import { PersonasService } from '../../../../services/personas.service';

@Component({
  selector: 'app-registro-estudiante',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './registro-estudiante.html',
  styleUrls: ['./registro-estudiante.css']
})
export class RegistroEstudianteComponent implements OnInit, OnChanges {
  @Input() colegio: any;
  @Input() numeroEstudiante: number = 1;
  @Input() totalEstudiantes: number = 1;
  @Input() estudianteEdicion: Estudiante | null = null;
  @Input() slotNuevo = false;
  @Input() modoEdicion = false;

  // ✅ EVENTOS SEPARADOS Y CLAROS
  @Output() guardar = new EventEmitter<Estudiante>();        // Solo guarda, el padre decide si avanzar
  @Output() finalizar = new EventEmitter<Estudiante>();      // Guarda y cierra inscripción
  @Output() navegarAnterior = new EventEmitter<Estudiante>(); // Guarda y navega atrás
  @Output() navegarSiguiente = new EventEmitter<Estudiante>(); // Guarda y navega adelante
  @Output() cancelar = new EventEmitter<void>();
  @Output() volver = new EventEmitter<void>();

  tiposDocumento = [
    { id: 'dni', nombre: 'DNI' },
    { id: 'ce', nombre: 'Carnet de Extranjería' },
    { id: 'sd', nombre: 'Sin Documento' }
  ];

  gradosPrimaria = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO'];
  gradosSecundaria = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO'];

  estudiante!: Estudiante;
  procesando = false;

  // --- Consulta automática de personas por documento (colección `personas`) ---
  buscandoPersona = false;
  mensajePersona = '';
  estadoPersona: 'inactivo' | 'encontrada' | 'no-encontrada' | 'error' = 'inactivo';
  private personaTimer: any = null;
  private personaAutocompletada: { numero: string; nombres: string; apellidos: string } | null = null;

  constructor(private personasService: PersonasService) {}

  // ✅ DEBUG: Para mostrar en pantalla qué está pasando
  debugInfo = {
    numeroEstudiante: 0,
    tieneDatosEdicion: false,
    datosCargados: {} as any
  };

  ngOnInit() {
    console.log('[Hijo] ngOnInit - numero:', this.numeroEstudiante, 'edicion:', this.estudianteEdicion);
    this.cargarEstudiante();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['numeroEstudiante'] && !changes['numeroEstudiante'].firstChange) {
      this.cargarEstudiante();
      return;
    }
    if (changes['estudianteEdicion'] && !changes['estudianteEdicion'].firstChange) {
      this.cargarEstudiante();
      return;
    }
    if (changes['slotNuevo'] && !changes['slotNuevo'].firstChange) {
      this.cargarEstudiante();
      return;
    }
    if (changes['colegio'] && this.estudiante) {
      this.estudiante.colegio = this.colegio;
      const nivelNuevo = String(this.colegio?.NIVEL || '').toUpperCase().trim();
      if (nivelNuevo && String(this.estudiante.nivel).toUpperCase().trim() !== nivelNuevo) {
        this.estudiante.nivel = nivelNuevo;
        const validos = this.gradosDisponibles;
        if (this.estudiante.grado && validos.length && !validos.includes(String(this.estudiante.grado).toUpperCase().trim())) {
          this.estudiante.grado = '';
        }
      }
    }
  }

  private cargarEstudiante() {
    this.procesando = false;
    // Al cambiar de estudiante se reinicia el estado de la consulta de personas.
    this.mensajePersona = '';
    this.estadoPersona = 'inactivo';
    this.buscandoPersona = false;
    this.personaAutocompletada = null;
    if (this.personaTimer) { clearTimeout(this.personaTimer); this.personaTimer = null; }
    const ed: any = this.estudianteEdicion as any;
    if (this.slotNuevo) {
      // Un slot agregado no representa un documento existente. Esta bandera
      // tiene prioridad sobre cualquier valor residual de los demás inputs.
      console.log('[Hijo] Slot NUEVO: formulario vacío', this.numeroEstudiante);
      this.estudiante = {
        tipoDocumento: 'dni', numeroDocumento: '', nombres: '', apellidos: '',
        nivel: this.colegio?.NIVEL || '', grado: '', colegio: this.colegio,
        fechaRegistro: new Date()
      } as any;
      return;
    }
    const hasData = !!(ed?.numeroDocumento && String(ed.numeroDocumento).trim());
    if (hasData) {
      console.log('[Hijo] Cargando datos EXISTENTES del estudiante', this.numeroEstudiante);
      this.estudiante = {
        tipoDocumento: ed.tipoDocumento || 'dni',
        numeroDocumento: ed.numeroDocumento,
        nombres: ed.nombres || '',
        apellidos: ed.apellidos || '',
        nivel: ed.nivel || this.colegio?.NIVEL || '',
        grado: ed.grado || '',
        colegio: this.colegio ?? ed.colegio,
        fechaRegistro: ed.fechaRegistro || new Date(),
        codigo: ed.codigo || ed.id,
        id: ed.id || ed.codigo,
        aulaAsignadaId: ed.aulaAsignadaId,
        codigoAula: ed.codigoAula,
        turnoCodigo: ed.turnoCodigo
      } as any;
    } else if (this.estudianteEdicion) {
      // Es un slot nuevo vacío (creado al aumentar cantidad) - mantener vacío, no copiar del anterior
      console.log('[Hijo] Slot NUEVO vacío para estudiante', this.numeroEstudiante);
      this.estudiante = {
        tipoDocumento: 'dni',
        numeroDocumento: '',
        nombres: '',
        apellidos: '',
        nivel: this.colegio?.NIVEL || '',
        grado: '',
        colegio: this.colegio,
        fechaRegistro: new Date()
      } as any;
    } else {
      console.log('[Hijo] Creando estudiante VACÍO', this.numeroEstudiante);
      this.estudiante = {
        tipoDocumento: '',
        numeroDocumento: '',
        nombres: '',
        apellidos: '',
        nivel: this.colegio?.NIVEL || '',
        grado: '',
        colegio: this.colegio,
        fechaRegistro: new Date()
      };
      
      // Debug
      this.debugInfo = {
        numeroEstudiante: this.numeroEstudiante,
        tieneDatosEdicion: false,
        datosCargados: {}
      };
    }
  }

  get gradosDisponibles(): string[] {
    return this.colegio?.NIVEL === 'PRIMARIA' ? this.gradosPrimaria : this.gradosSecundaria;
  }

  get progreso(): string {
    return `Estudiante ${this.numeroEstudiante} de ${this.totalEstudiantes}`;
  }

  get esUltimoEstudiante(): boolean {
    return this.numeroEstudiante >= this.totalEstudiantes;
  }

  get esPrimeroEstudiante(): boolean {
    return this.numeroEstudiante <= 1;
  }

  // ✅ ANTERIOR: Guarda sin validar y emite navegación
  irAnterior() {
    console.log('[Hijo] Botón ANTERIOR clickeado');
    if (this.esPrimeroEstudiante) return;
    
    this.navegarAnterior.emit({ ...this.estudiante });
  }

  // ✅ SIGUIENTE: Valida, guarda y emite navegación
  irSiguiente() {
    console.log('[Hijo] Botón SIGUIENTE clickeado');
    if (this.esUltimoEstudiante) return;
    
    if (!this.validarFormulario()) return;
    
    this.navegarSiguiente.emit({ ...this.estudiante });
  }

  // ✅ BOTÓN SUBMIT: Decide entre guardar/continuar o finalizar
  onGuardar() {
    console.log('[Hijo] Botón SUBMIT clickeado, esUltimo:', this.esUltimoEstudiante);
    
    if (!this.validarFormulario()) return;
    
    this.procesando = true;
    
    if (this.esUltimoEstudiante) {
      console.log('[Hijo] Emitiendo FINALIZAR');
      this.finalizar.emit({ ...this.estudiante });
      // No resetear procesando aquí, el padre cierra la ventana
    } else {
      console.log('[Hijo] Emitiendo GUARDAR (continuar)');
      this.guardar.emit({ ...this.estudiante });
      // El padre avanzará y el componente se reciclará, procesando se resetea en cargarEstudiante
    }
  }

  onCancelar() {
    this.cancelar.emit();
  }

  onVolver() {
    this.volver.emit();
  }

  aMayusculas(campo: 'nombres'|'apellidos', e: any) {
    const v = (e.target.value || '').toUpperCase();
    e.target.value = v;
    (this.estudiante as any)[campo] = v;
  }
  soloNumeros(e: KeyboardEvent) {
    if (this.estudiante.tipoDocumento === 'dni' && !/[0-9]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
  }
  onDocumentoInput(e: any) {
    let v = e.target.value || '';
    if (this.estudiante.tipoDocumento === 'dni') v = v.replace(/\D/g, '').slice(0, 8);
    else if (this.estudiante.tipoDocumento === 'ce') v = v.replace(/\D/g, '').slice(0, 12);
    e.target.value = v;
    this.estudiante.numeroDocumento = v;
    this.programarBusquedaPersona();
  }

  /** El tipo de documento cambió: se reinicia el estado de la consulta. */
  onTipoDocumentoChange() {
    this.mensajePersona = '';
    this.estadoPersona = 'inactivo';
    this.limpiarAutocompletadoSiCorresponde();
  }

  /** Al salir del campo se consulta de inmediato (cubre tipos de longitud libre). */
  consultarPersonaAlPerderFoco() {
    if (this.personaTimer) { clearTimeout(this.personaTimer); this.personaTimer = null; }
    void this.consultarPersona();
  }

  /**
   * Programa la consulta en la colección `personas` SOLO cuando el número ya
   * tiene una longitud válida para su tipo y el usuario dejó de teclear. Así
   * nunca se hace una consulta por cada tecla.
   */
  private programarBusquedaPersona() {
    const numero = String(this.estudiante.numeroDocumento || '').trim();
    this.mensajePersona = '';
    this.estadoPersona = 'inactivo';
    this.limpiarAutocompletadoSiCorresponde();

    if (this.personaTimer) { clearTimeout(this.personaTimer); this.personaTimer = null; }
    if (!this.personasService.longitudSuficiente(this.estudiante.tipoDocumento, numero)) return;

    this.personaTimer = setTimeout(() => {
      this.personaTimer = null;
      void this.consultarPersona();
    }, 450);
  }

  private async consultarPersona() {
    const numero = String(this.estudiante.numeroDocumento || '').trim();
    if (!numero) return;
    if (!this.personasService.longitudSuficiente(this.estudiante.tipoDocumento, numero)) return;
    // Ya resuelto para este mismo documento: no se repite la consulta.
    if (this.estadoPersona === 'encontrada' && this.personaAutocompletada?.numero === numero) return;

    this.buscandoPersona = true;
    const resultado = await this.personasService.buscarPorDocumento(numero);
    this.buscandoPersona = false;

    // Si el documento cambió mientras se consultaba, se descarta el resultado.
    if (String(this.estudiante.numeroDocumento || '').trim() !== numero) return;

    if (resultado.estado === 'encontrada') {
      const { nombres, apellidos, tipoDocumentoId } = resultado.persona;
      this.estudiante.nombres = nombres;
      this.estudiante.apellidos = apellidos;
      // El tipo de documento solo se ajusta si corresponde a una opción del formulario.
      if (tipoDocumentoId && tipoDocumentoId !== this.estudiante.tipoDocumento) {
        this.estudiante.tipoDocumento = tipoDocumentoId;
      }
      this.personaAutocompletada = { numero, nombres, apellidos };
      this.estadoPersona = 'encontrada';
      this.mensajePersona = `✓ Persona encontrada: ${nombres} ${apellidos}`;
      return;
    }

    if (resultado.estado === 'no-encontrada') {
      this.estadoPersona = 'no-encontrada';
      this.mensajePersona = 'No se encontró una persona registrada con ese documento. Puede continuar escribiendo los datos manualmente.';
      return;
    }

    this.estadoPersona = 'error';
    this.mensajePersona = 'No se pudo consultar la persona registrada. Puede continuar escribiendo los datos manualmente.';
  }

  /**
   * Si el documento cambió, borra los datos que vinieron de la persona anterior
   * (solo si el operador no los modificó a mano).
   */
  private limpiarAutocompletadoSiCorresponde() {
    const auto = this.personaAutocompletada;
    if (!auto) return;
    const numero = String(this.estudiante.numeroDocumento || '').trim();
    if (auto.numero === numero) return;
    if (String(this.estudiante.nombres || '').trim() === auto.nombres) this.estudiante.nombres = '';
    if (String(this.estudiante.apellidos || '').trim() === auto.apellidos) this.estudiante.apellidos = '';
    this.personaAutocompletada = null;
  }
  validarFormulario(): boolean {
    if (!this.estudiante.tipoDocumento) {
      alert('Seleccione tipo de documento');
      return false;
    }
    if (!this.estudiante.numeroDocumento && this.estudiante.tipoDocumento !== 'sd') {
      alert('Ingrese número de documento');
      return false;
    }
    if (this.estudiante.tipoDocumento === 'dni' && !/^\d{8}$/.test(this.estudiante.numeroDocumento)) {
      alert('DNI debe tener 8 dígitos numéricos');
      return false;
    }
    if (!this.estudiante.nombres) {
      alert('Ingrese nombres');
      return false;
    }
    if (!this.estudiante.apellidos) {
      alert('Ingrese apellidos');
      return false;
    }
    this.estudiante.nombres = this.estudiante.nombres.toUpperCase().trim();
    this.estudiante.apellidos = this.estudiante.apellidos.toUpperCase().trim();
    if (!this.estudiante.grado) {
      alert('Seleccione grado');
      return false;
    }
    this.estudiante.grado = String(this.estudiante.grado).toUpperCase().trim();
    this.estudiante.nivel = String(this.estudiante.nivel || this.colegio?.NIVEL || '').toUpperCase().trim();
    return true;
  }
}
