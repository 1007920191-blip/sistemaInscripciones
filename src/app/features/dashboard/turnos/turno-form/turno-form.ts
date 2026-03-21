import { Component, EventEmitter, Output, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TurnoService } from '../../../../services/turno.service';
import { Turno, NIVELES, GRADOS_POR_NIVEL, NivelGrado } from '../../../../models/turno.model';

@Component({
  selector: 'app-turno-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './turno-form.html',
  styleUrls: ['./turno-form.css']
})
export class TurnoForm implements OnInit {
  @Output() guardar = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();
  @Input() turnoEditar?: Turno;

  // Opciones
  niveles = NIVELES;
  gradosPorNivel = GRADOS_POR_NIVEL;
  gradosDisponibles: readonly string[] = [];
  
  // Niveles y grados seleccionados para agregar
  nivelSeleccionado: 'Primaria' | 'Secundaria' = 'Primaria';
  gradoSeleccionado: string = '';
  
  // Lista de niveles/grados agregados
  nivelesGrados: NivelGrado[] = [];

  // Datos del formulario
  turno: Partial<Turno> = {
    codigo: '',
    fecha: new Date(),
    horaInicioEntrada: '',
    horaFinEntrada: '',
    horaInicioPrueba: '',
    horaFinPrueba: '',
    nivel: 'Primaria',
    grados: []
  };

  // Fecha formateada para el input date
  fechaString: string = '';

  constructor(private turnoService: TurnoService) {}

  ngOnInit() {
    this.actualizarGradosDisponibles();
    
    if (this.turnoEditar) {
      // Modo edición
      this.turno = { ...this.turnoEditar };
      this.fechaString = this.formatearFechaParaInput(this.turnoEditar.fecha);
      
      // Reconstruir nivelesGrados desde los grados guardados
      this.nivelesGrados = this.turnoEditar.grados.map(grado => ({
        nivel: this.turnoEditar!.nivel,
        grado
      }));
    } else {
      // Modo creación - fecha por defecto hoy
      this.fechaString = this.formatearFechaParaInput(new Date());
    }
  }

  formatearFechaParaInput(fecha: Date): string {
    const d = new Date(fecha);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  onNivelChange() {
    this.actualizarGradosDisponibles();
    this.gradoSeleccionado = '';
  }

  actualizarGradosDisponibles() {
    this.gradosDisponibles = this.gradosPorNivel[this.nivelSeleccionado];
  }

  agregarNivelGrado() {
    if (!this.gradoSeleccionado) return;
    
    // Verificar si ya existe
    const existe = this.nivelesGrados.some(
      ng => ng.nivel === this.nivelSeleccionado && ng.grado === this.gradoSeleccionado
    );
    
    if (existe) {
      alert('Este nivel y grado ya han sido agregados');
      return;
    }
    
    this.nivelesGrados.push({
      nivel: this.nivelSeleccionado,
      grado: this.gradoSeleccionado
    });
    
    this.actualizarTurnoDesdeNivelesGrados();
  }

  eliminarNivelGrado(index: number) {
    this.nivelesGrados.splice(index, 1);
    this.actualizarTurnoDesdeNivelesGrados();
  }

  actualizarTurnoDesdeNivelesGrados() {
    if (this.nivelesGrados.length === 0) {
      this.turno.nivel = 'Primaria';
      this.turno.grados = [];
      return;
    }
    
    // Tomar el nivel del primer elemento (todos deben ser del mismo nivel en un turno)
    // o permitir mixtos según necesidad
    const nivelesUnicos = [...new Set(this.nivelesGrados.map(ng => ng.nivel))];
    
    if (nivelesUnicos.length === 1) {
      this.turno.nivel = nivelesUnicos[0];
    }
    
    this.turno.grados = this.nivelesGrados.map(ng => ng.grado);
  }

  onFechaChange(event: any) {
  // Manejar tanto evento del input como valor directo
  const valor = event?.target?.value ?? event;
  this.fechaString = valor;
  if (valor) {
    this.turno.fecha = new Date(valor);
  }
}

  async onGuardar() {
    // Validaciones
    if (!this.turno.codigo?.trim()) {
      alert('El código es obligatorio');
      return;
    }
    
    if (!this.turno.horaInicioEntrada || !this.turno.horaFinEntrada || 
        !this.turno.horaInicioPrueba || !this.turno.horaFinPrueba) {
      alert('Todas las horas son obligatorias');
      return;
    }
    
    if (this.nivelesGrados.length === 0) {
      alert('Debe agregar al menos un nivel y grado');
      return;
    }

    this.actualizarTurnoDesdeNivelesGrados();

    try {
      if (this.turnoEditar?.id) {
        // Actualizar existente
        await this.turnoService.actualizarTurno(this.turnoEditar.id, this.turno);
      } else {
        // Crear nuevo
        await this.turnoService.guardarTurno(this.turno as Turno);
      }
      this.resetFormulario();
      this.guardar.emit();
    } catch (error) {
      console.error('Error al guardar turno:', error);
      alert('Error al guardar el turno');
    }
  }
  resetFormulario() {
  this.turno = {
    codigo: '',
    fecha: new Date(),
    horaInicioEntrada: '',
    horaFinEntrada: '',
    horaInicioPrueba: '',
    horaFinPrueba: '',
    nivel: 'Primaria',
    grados: []
  };
  this.fechaString = this.formatearFechaParaInput(new Date());
  this.nivelesGrados = [];
  this.nivelSeleccionado = 'Primaria';
  this.gradoSeleccionado = '';
  this.actualizarGradosDisponibles();
}

  onCancelar() {
    this.cancelar.emit();
  }
}