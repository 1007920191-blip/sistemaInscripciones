import { Component, OnInit, Output, EventEmitter, Input, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AulaService } from '../../../../services/aula.service';
import { Aula } from '../../../../models/aula.model';
import { AulaFormComponent } from '../aula-form/aula-form';

@Component({
  selector: 'app-lista-aulas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lista-aulas.html',
  styleUrls: ['./lista-aulas.css']
})
export class ListaAulasComponent implements OnInit {
  @Output() cambiarSeccion = new EventEmitter<string>();
  @Output() editarAula = new EventEmitter<Aula>();
  @Output() guardarAula = new EventEmitter<void>();
  @Output() cancelarAula = new EventEmitter<void>();
  
  @Input() mostrarFormulario: boolean = false;
  @Input() aulaEditar?: Aula;
  @Input() recargar: boolean = false;
  
  async ngOnChanges(changes: SimpleChanges) {
  if (changes['recargar'] && changes['recargar'].currentValue === true) {
    await this.cargarDatos();
  }
}
  
  aulas: Aula[] = [];
  aulasFiltradas: Aula[] = [];
  busqueda: string = '';

  constructor(private aulaService: AulaService) {}

  async ngOnInit() {
    await this.cargarDatos();
  }

  async cargarDatos() {
  try {
    this.aulas = await this.aulaService.getAulas();
    console.log("Aulas cargadas:", this.aulas);

    this.aulasFiltradas = [...this.aulas];

  } catch (error) {
    console.error("Error cargando aulas:", error);
  }
}
  async recargarDatos() {
    await this.cargarDatos();
  }

  filtrarAulas() {
    if (!this.busqueda.trim()) {
      this.aulasFiltradas = [...this.aulas];
    } else {
      const termino = this.busqueda.toLowerCase();
      this.aulasFiltradas = this.aulas.filter(aula => 
        aula.codigo.toLowerCase().includes(termino)
      );
    }
  }

  nuevaAula() {
    this.cambiarSeccion.emit('nueva-aula');
  }

  editar(aula: Aula) {
    this.editarAula.emit(aula);
  }

  async eliminarAula(aula: Aula) {
    if (aula.id && confirm(`¿Eliminar el aula ${aula.codigo}?`)) {
      await this.aulaService.deleteAula(aula.id);
      await this.cargarDatos(); // Recargar después de eliminar
    }
  }

  onGuardar() {
    this.guardarAula.emit();
  }

  onCancelar() {
    this.cancelarAula.emit();
  }
}