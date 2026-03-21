import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfiguracionService } from '../../../../services/configuracion';

@Component({
  selector: 'app-pago',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pago.html',
  styleUrls: ['./pago.css']
})
export class PagoComponent implements OnInit {
  @Input() colegioSeleccionado: any;
  @Input() datosEdicion: any = null;
  @Input() modoEdicion = false;
  
  @Output() volver = new EventEmitter<void>();
  @Output() confirmarPago = new EventEmitter<{
    metodo: string;
    cantidad: number;
    monto: number;
    telefono: string;
  }>();

  metodoPago = '';
  telefonoApoderado = '';
  cantidadEstudiantes = 1;
  precioPorEstudiante = 15; // Valor por defecto, se actualizará

  metodosPago = [
    { id: 'yape', nombre: 'YAPE', icono: '💜' },
    { id: 'transferencia', nombre: 'TRANSFERENCIA', icono: '🏦' },
    { id: 'efectivo', nombre: 'EFECTIVO', icono: '💵' }
  ];

  constructor(private configService: ConfiguracionService) {}

  async ngOnInit() {
    // Cargar precio desde configuración
    try {
      const costo = await this.configService.obtenerCostoInscripcion();
      this.precioPorEstudiante = costo;
    } catch (error) {
      console.error('Error al cargar costo:', error);
      // Mantener valor por defecto si hay error
    }

    if (this.modoEdicion && this.datosEdicion) {
      this.metodoPago = this.datosEdicion.metodo;
      this.cantidadEstudiantes = this.datosEdicion.cantidad;
      this.telefonoApoderado = this.datosEdicion.telefono;
    }
  }

  get montoTotal(): number {
    return this.cantidadEstudiantes * this.precioPorEstudiante;
  }

  get datosPago(): any {
    const monto = this.montoTotal;
    switch (this.metodoPago) {
      case 'yape':
        return {
          titulo: 'Pago con YAPE',
          telefono: '930943272',
          nombre: 'Jenny E. S.',
          monto: monto
        };
      case 'transferencia':
        return {
          titulo: 'Transferencia Bancaria',
          cuenta: '205-10884895-0-28',
          cci: '002-20511088489502833',
          entidad: 'BCP',
          nombre: 'Geni Elizabeth Salazar Gutierrez',
          monto: monto
        };
      case 'efectivo':
        return {
          titulo: 'Pago en Efectivo',
          lugares: [
            'I.E. 54078 (Andahuaylas)',
            'I.E. 54182 (Chincheros)',
            'I.E. 54004 (Abancay)',
            'I.E. ARMANDO BONIFAZ'
          ],
          nombre: 'EFECTIVO',
          monto: monto
        };
      default:
        return null;
    }
  }

  incrementar() {
    this.cantidadEstudiantes++;
  }

  decrementar() {
    if (this.cantidadEstudiantes > 1) {
      this.cantidadEstudiantes--;
    }
  }

  onVolver() {
    this.volver.emit();
  }

  onConfirmar() {
    if (!this.metodoPago) {
      alert('Seleccione un método de pago');
      return;
    }
    
    if (!this.telefonoApoderado) {
      alert('Ingrese el teléfono del apoderado');
      return;
    }

    this.confirmarPago.emit({
      metodo: this.metodoPago,
      cantidad: this.cantidadEstudiantes,
      monto: this.montoTotal,
      telefono: this.telefonoApoderado
    });
  }
}