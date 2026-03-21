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

  async onSubmit() {
    // Validaciones
    if (!this.aulaForm.codigo?.trim()) {
      alert('El código es obligatorio');
      return;
    }
    if (!this.aulaForm.local?.trim()) {
      alert('El local es obligatorio');
      return;
    }

    try {
    if (this.esEdicion && this.aulaForm.id) {
      const { id, ...data } = this.aulaForm;
      await this.aulaService.updateAula(id, data);
    } else {
      await this.aulaService.addAula(this.aulaForm);
    }
    
    // ✅ Emitir evento de éxito
    this.guardar.emit();
    
  } catch (error) {
    console.error('Error al guardar:', error);
    alert('Error al guardar el aula');
  }
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