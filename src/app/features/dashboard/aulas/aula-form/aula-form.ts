import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AulaService } from '../../../../services/aula.service';
import { Aula } from '../../../../models/aula.model';

@Component({
  selector: 'app-aula-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './aula-form.html',
  styleUrls: ['./aula-form.css']
})
export class AulaFormComponent {
  @Input() set aula(value: Aula | undefined) {
    if (value) {
      this.aulaForm = { ...value };
      this.esEdicion = true;
    } else {
      this.resetForm();
      this.esEdicion = false;
    }
  }
  
  @Output() guardar = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();

  aulaForm: Aula = {
    codigo: '',
    capacidad: 30,
    local: '',
    pabellon: '',
    piso: 1,
    puertaAcceso: ''
  };
  
  esEdicion: boolean = false;

  constructor(private aulaService: AulaService) {}

  cargando = false;

  async onSubmit() {
    if (this.cargando) return;
    const codigoNorm = this.aulaForm.codigo?.trim().toUpperCase();
    if (!codigoNorm) {
      alert('El código es obligatorio (Ej: A1)');
      return;
    }
    if (!/^[A-Z0-9\-]+$/.test(codigoNorm)) {
      alert('Código solo letras/números y guion. Ej: A1');
      return;
    }
    if (!this.aulaForm.local?.trim()) {
      alert('El local es obligatorio');
      return;
    }
    this.aulaForm.codigo = codigoNorm;
    this.cargando = true;
    const timeout = setTimeout(() => {
      console.warn('Timeout guardando, forzando cierre');
      this.cargando = false;
      this.guardar.emit();
    }, 4000);
    try {
      if (this.esEdicion && this.aulaForm.id) {
        const { id, ...data } = this.aulaForm;
        data.codigo = codigoNorm;
        await Promise.race([
          this.aulaService.updateAula(id, data),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout update')), 3000))
        ]);
      } else {
        await Promise.race([
          this.aulaService.addAula(this.aulaForm),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout creación')), 3500))
        ]);
      }
      clearTimeout(timeout);
    } catch (error: any) {
      clearTimeout(timeout);
      if (error?.message?.includes('Timeout')) {
        console.warn('Forzando cierre por timeout, datos probablemente guardados');
        this.cargando = false;
        this.guardar.emit();
        return;
      }
      console.error('Error al guardar:', error);
      alert(error?.message || 'Error al guardar el aula');
      this.cargando = false;
      return;
    }
    clearTimeout(timeout);
    this.cargando = false;
    this.guardar.emit();
}
  onCancelar() {
    this.cancelar.emit();
  }

  private resetForm() {
    this.aulaForm = {
      codigo: '',
      capacidad: 30,
      local: '',
      pabellon: '',
      piso: 1,
      puertaAcceso: ''
    };
  }
}