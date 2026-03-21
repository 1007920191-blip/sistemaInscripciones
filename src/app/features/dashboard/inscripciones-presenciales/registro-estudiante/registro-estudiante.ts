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

  @Output() guardar = new EventEmitter<Estudiante>();
  @Output() cancelar = new EventEmitter<void>();
  @Output() volver = new EventEmitter<void>();
  @Output() anterior = new EventEmitter<void>();
  @Output() siguiente = new EventEmitter<void>();

  tiposDocumento = [
    { id: 'dni', nombre: 'DNI' },
    { id: 'ce', nombre: 'Carnet de Extranjería' },
    { id: 'sd', nombre: 'Sin Documento' }
  ];

  gradosPrimaria = ['1° Primaria', '2° Primaria', '3° Primaria', '4° Primaria', '5° Primaria', '6° Primaria'];
  gradosSecundaria = ['1° Secundaria', '2° Secundaria', '3° Secundaria', '4° Secundaria', '5° Secundaria'];

  estudiante!: Estudiante;
  procesando = false;

  ngOnInit() {
    this.cargarEstudiante();
  }

  // ✅ DETECTAR CAMBIOS EN LOS INPUTS
  ngOnChanges(changes: SimpleChanges) {
    // Si cambia el número de estudiante o los datos de edición, recargar
    if (changes['numeroEstudiante'] || changes['estudianteEdicion']) {
      this.cargarEstudiante();
    }
  }

  private cargarEstudiante() {
    this.procesando = false;
    
    // ✅ Cargar datos si existen, si no crear vacío
    if (this.estudianteEdicion?.numeroDocumento) {
      // ✅ IMPORTANTE: Crear copia nueva para evitar referencias compartidas
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
    } else {
      this.estudiante = this.crearEstudianteVacio();
      this.estudiante.nivel = this.colegio?.NIVEL || '';
      this.estudiante.colegio = this.colegio;
    }
  }

  private crearEstudianteVacio(): Estudiante {
    return {
      tipoDocumento: '',
      numeroDocumento: '',
      nombres: '',
      apellidos: '',
      nivel: '',
      grado: '',
      colegio: null,
      fechaRegistro: new Date()
    };
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

  onGuardar() {
    if (this.validarFormulario()) {
      this.guardar.emit({ ...this.estudiante });
    }
  }

  onCancelar() {
    this.cancelar.emit();
  }

  onVolver() {
    this.volver.emit();
  }

  irAnterior() {
    this.anterior.emit();
  }

  irSiguiente() {
    this.siguiente.emit();
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