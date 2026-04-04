import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Estudiante } from '../../../../models/inscripcion.model';

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

  gradosPrimaria = ['1° Primaria', '2° Primaria', '3° Primaria', '4° Primaria', '5° Primaria', '6° Primaria'];
  gradosSecundaria = ['1° Secundaria', '2° Secundaria', '3° Secundaria', '4° Secundaria', '5° Secundaria'];

  estudiante!: Estudiante;
  procesando = false;

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
    console.log('[Hijo] ngOnChanges:', changes);
    
    if (changes['numeroEstudiante']) {
      console.log('[Hijo] Cambió numeroEstudiante de', 
        changes['numeroEstudiante'].previousValue, 
        'a', 
        changes['numeroEstudiante'].currentValue);
      console.log('[Hijo] estudianteEdicion recibido:', this.estudianteEdicion);
      this.cargarEstudiante();
    }
    
    if (changes['estudianteEdicion'] && !changes['estudianteEdicion'].firstChange) {
      console.log('[Hijo] Cambió estudianteEdicion:', this.estudianteEdicion);
      this.cargarEstudiante();
    }
  }

  private cargarEstudiante() {
    this.procesando = false;
    
    // ✅ USAR TU CÓDIGO ORIGINAL (funciona igual)
    if (this.estudianteEdicion?.numeroDocumento) {
      console.log('[Hijo] Cargando datos EXISTENTES del estudiante', this.numeroEstudiante);
      
      this.estudiante = {
        tipoDocumento: this.estudianteEdicion.tipoDocumento,
        numeroDocumento: this.estudianteEdicion.numeroDocumento,
        nombres: this.estudianteEdicion.nombres,
        apellidos: this.estudianteEdicion.apellidos,
        nivel: this.estudianteEdicion.nivel,
        grado: this.estudianteEdicion.grado,
        colegio: this.estudianteEdicion.colegio,
        fechaRegistro: this.estudianteEdicion.fechaRegistro
      };
      
      // Debug
      this.debugInfo = {
        numeroEstudiante: this.numeroEstudiante,
        tieneDatosEdicion: true,
        datosCargados: { ...this.estudiante }
      };
      
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

  validarFormulario(): boolean {
    if (!this.estudiante.tipoDocumento) {
      alert('Seleccione tipo de documento');
      return false;
    }
    if (!this.estudiante.numeroDocumento && this.estudiante.tipoDocumento !== 'sd') {
      alert('Ingrese número de documento');
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
    if (!this.estudiante.grado) {
      alert('Seleccione grado');
      return false;
    }
    return true;
  }
}