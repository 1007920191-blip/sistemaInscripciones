import { Component, EventEmitter, Output, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Timestamp } from 'firebase/firestore';
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

  niveles = NIVELES;
  gradosPorNivel = GRADOS_POR_NIVEL;
  gradosDisponibles: readonly string[] = [];
  
  nivelSeleccionado: 'Primaria' | 'Secundaria' = 'Primaria';
  gradoSeleccionado: string = '';
  
  nivelesGrados: NivelGrado[] = [];

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

  fechaString: string = '';

  constructor(private turnoService: TurnoService) {}

  ngOnInit() {
    console.log('=== ngOnInit ===');
    this.actualizarGradosDisponibles();
    
    if (this.turnoEditar) {
       console.log('turnoEditar completo:', this.turnoEditar);
    console.log('turnoEditar.nivelesGrados:', this.turnoEditar.nivelesGrados);
    console.log('turnoEditar.nivel:', this.turnoEditar.nivel);
    console.log('turnoEditar.grados:', this.turnoEditar.grados);
      // Modo edición
      this.turno = { 
        ...this.turnoEditar,
        codigo: this.turnoEditar.codigo,
        horaInicioEntrada: this.horaToStr((this.turnoEditar as any).horaInicioEntrada),
        horaFinEntrada: this.horaToStr((this.turnoEditar as any).horaFinEntrada),
        horaInicioPrueba: this.horaToStr((this.turnoEditar as any).horaInicioPrueba),
        horaFinPrueba: this.horaToStr((this.turnoEditar as any).horaFinPrueba),
      };
      
      const f:any = this.turnoEditar.fecha;
      const fechaObj = f?.toDate ? f.toDate() : (f?.seconds ? new Date(f.seconds*1000) : new Date(f));
      this.fechaString = this.formatearFechaParaInput(fechaObj);
      
      // ← CAMBIO CLAVE: Usar nivelesGrados si existe, sino reconstruir
      if (this.turnoEditar.nivelesGrados && this.turnoEditar.nivelesGrados.length > 0) {
        this.nivelesGrados = [...this.turnoEditar.nivelesGrados];
      } else {
        // Fallback para datos antiguos
        this.nivelesGrados = this.turnoEditar.grados.map(grado => ({
          nivel: this.turnoEditar!.nivel,
          grado
        }));
      }
      
      // Actualizar selector al primer nivel
      if (this.nivelesGrados.length > 0) {
        this.nivelSeleccionado = this.nivelesGrados[0].nivel;
        this.actualizarGradosDisponibles();
      }
      
    } else {
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
    
    const nivelesUnicos = [...new Set(this.nivelesGrados.map(ng => ng.nivel))];
    
    // Para compatibilidad con tabla/listado existente
    if (nivelesUnicos.length === 1) {
      this.turno.nivel = nivelesUnicos[0];
    } else {
      this.turno.nivel = this.nivelesGrados[0].nivel;
    }
    
    this.turno.grados = this.nivelesGrados.map(ng => ng.grado);
  }

  private parseFechaLocal(s: string): Date {
    if (!s) return new Date();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10));
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  onFechaChange(event: any) {
    const valor = event?.target?.value ?? event;
    this.fechaString = valor;
    if (valor) {
      this.turno.fecha = this.parseFechaLocal(valor);
    }
  }

  private toTimestamp(fecha: Date, horaStr: any): Timestamp {
    if (!horaStr) return Timestamp.fromDate(fecha);
    if (horaStr && typeof (horaStr as any).toDate === 'function') return horaStr as Timestamp;
    if (horaStr && typeof (horaStr as any).seconds === 'number') return new Timestamp((horaStr as any).seconds, (horaStr as any).nanoseconds || 0);
    if (horaStr instanceof Date) return Timestamp.fromDate(horaStr);
    const s = String(horaStr);
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (m) {
      const d = new Date(fecha);
      d.setHours(parseInt(m[1],10), parseInt(m[2],10), 0, 0);
      return Timestamp.fromDate(d);
    }
    return Timestamp.fromDate(fecha);
  }

  private horaToStr(v:any): string {
    if (!v) return '';
    if (typeof v === 'string') return v.slice(0,5);
    if (typeof (v as any).toDate === 'function') {
      const d=(v as any).toDate(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
    if ((v as any).seconds) { const d=new Date((v as any).seconds*1000); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
    return String(v).slice(0,5);
  }

  async onGuardar() {
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

    const codigoFinal = this.turno.codigo.trim().toUpperCase();
    const fechaBaseRaw: any = this.turno.fecha;
    const fechaBase: Date = fechaBaseRaw instanceof Date ? new Date(fechaBaseRaw.getFullYear(), fechaBaseRaw.getMonth(), fechaBaseRaw.getDate()) : fechaBaseRaw?.toDate ? (()=>{ const d=fechaBaseRaw.toDate(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); })() : fechaBaseRaw?.seconds ? (()=>{ const d=new Date(fechaBaseRaw.seconds*1000); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); })() : this.parseFechaLocal(String(this.fechaString || fechaBaseRaw || ''));

    try {
      const datosTurno: any = {
        ...this.turno,
        codigo: codigoFinal,
        fecha: fechaBase,
        horaInicioEntrada: this.toTimestamp(fechaBase, this.turno.horaInicioEntrada),
        horaFinEntrada: this.toTimestamp(fechaBase, this.turno.horaFinEntrada),
        horaInicioPrueba: this.toTimestamp(fechaBase, this.turno.horaInicioPrueba),
        horaFinPrueba: this.toTimestamp(fechaBase, this.turno.horaFinPrueba),
        nivelesGrados: this.nivelesGrados,
        grados: this.nivelesGrados.map(ng => ng.grado),
        nivel: this.nivelesGrados[0]?.nivel || 'Primaria'
      };

      if (this.turnoEditar?.id) {
        const idReal = this.turnoEditar.id.trim().toUpperCase();
        if (idReal !== codigoFinal) {
          await this.turnoService.guardarTurno({ ...datosTurno, id: codigoFinal } as Turno);
          await this.turnoService.eliminarTurno(idReal);
        } else {
          await this.turnoService.actualizarTurno(idReal, datosTurno);
        }
      } else {
        await this.turnoService.guardarTurno(datosTurno as Turno);
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