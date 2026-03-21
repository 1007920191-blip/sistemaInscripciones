import { Component, OnInit, ChangeDetectorRef } from '@angular/core'; // ← Agrega ChangeDetectorRef
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfiguracionService } from '../../services/configuracion';
import { Configuracion } from '../../models/configuracion.model';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './configuracion.html',
  styleUrls: ['./configuracion.css']
})
export class ConfiguracionComponent implements OnInit {
  config: Configuracion = {
    nombreConcurso: '',
    edicion: new Date().getFullYear().toString(),
    eslogan: '',
    logoIzquierdo: '',
    logoDerecho: '',
    fondoCredencial: '',
    costoInscripcion: 15
  };

  logoIzquierdoFile: File | null = null;
  logoDerechoFile: File | null = null;
  fondoCredencialFile: File | null = null;
  logoIzquierdoPreview: string = '';
  logoDerechoPreview: string = '';
  fondoCredencialPreview: string = '';
  cargando = false;
  guardando = false;
  mensajeExito = '';
  mensajeError = '';

  constructor(
    private configService: ConfiguracionService,
    private cdr: ChangeDetectorRef, // ← Inyecta ChangeDetectorRef
    private router: Router
  ) {}

   volverAlMenu() {
    this.router.navigate(['/dashboard']);
  }

  async ngOnInit() {
    console.log('✅ ngOnInit ejecutado');
    await this.cargarConfiguracion();
  }

  async cargarConfiguracion() {
    console.log('✅ cargarConfiguracion iniciado');
    this.cargando = true;
    this.cdr.detectChanges(); // ← Forzar actualización
    
    try {
      const configExistente = await this.configService.obtenerConfiguracion();
      console.log('✅ Configuración obtenida:', configExistente);
      
      if (configExistente) {
        this.config = { ...configExistente };
        this.logoIzquierdoPreview = this.config.logoIzquierdo || '';
        this.logoDerechoPreview = this.config.logoDerecho || '';
        this.fondoCredencialPreview = this.config.fondoCredencial || '';
        console.log('✅ Config asignada:', this.config);
      }
    } catch (error) {
      console.error('❌ Error:', error);
      this.mostrarError('Error al cargar la configuración');
    } finally {
      this.cargando = false;
      this.cdr.detectChanges(); // ← Forzar actualización
      console.log('✅ cargando = false');
    }
  }

  onFileSelected(event: any, tipo: 'logoIzquierdo' | 'logoDerecho' | 'fondoCredencial') {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.mostrarError('Por favor seleccione un archivo de imagen válido');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.mostrarError('La imagen no debe superar los 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const result = e.target.result;
      switch (tipo) {
        case 'logoIzquierdo':
          this.logoIzquierdoFile = file;
          this.logoIzquierdoPreview = result;
          break;
        case 'logoDerecho':
          this.logoDerechoFile = file;
          this.logoDerechoPreview = result;
          break;
        case 'fondoCredencial':
          this.fondoCredencialFile = file;
          this.fondoCredencialPreview = result;
          break;
      }
      this.cdr.detectChanges();
    console.log(`✅ ${tipo} seleccionado, preview actualizado`);
    };
    reader.readAsDataURL(file);
  }

  eliminarImagen(tipo: 'logoIzquierdo' | 'logoDerecho' | 'fondoCredencial') {
  switch (tipo) {
    case 'logoIzquierdo':
      this.logoIzquierdoFile = null;
      this.config.logoIzquierdo = ''; // ← Limpiar URL guardada
      this.logoIzquierdoPreview = ''; // ← Limpiar preview
      break;
    case 'logoDerecho':
      this.logoDerechoFile = null;
      this.config.logoDerecho = '';
      this.logoDerechoPreview = '';
      break;
    case 'fondoCredencial':
      this.fondoCredencialFile = null;
      this.config.fondoCredencial = '';
      this.fondoCredencialPreview = '';
      break;
  }
  this.cdr.detectChanges(); // ← Forzar actualización de la vista
}

  async guardarConfiguracion() {
  console.log('✅ Iniciando guardarConfiguracion');

  // Validaciones
  if (!this.config.nombreConcurso.trim()) {
    this.mostrarError('El nombre del concurso es obligatorio');
    return;
  }
  if (!this.config.edicion.trim()) {
    this.mostrarError('La edición del concurso es obligatoria');
    return;
  }
  if (this.config.costoInscripcion <= 0) {
    this.mostrarError('El costo de inscripción debe ser mayor a 0');
    return;
  }

  this.guardando = true;
  this.cdr.detectChanges(); // ← Forzar actualización del botón
  this.mensajeExito = '';
  this.mensajeError = '';

  try {
    console.log('✅ Subiendo imágenes...');
    
    // Subir imágenes nuevas si existen
    if (this.logoIzquierdoFile) {
      console.log('✅ Subiendo logo izquierdo...');
      this.config.logoIzquierdo = await this.configService.subirImagen(
        this.logoIzquierdoFile, 
        'logoIzquierdo'
      );
    }
    
    if (this.logoDerechoFile) {
      console.log('✅ Subiendo logo derecho...');
      this.config.logoDerecho = await this.configService.subirImagen(
        this.logoDerechoFile, 
        'logoDerecho'
      );
    }
    
    if (this.fondoCredencialFile) {
      console.log('✅ Subiendo fondo...');
      this.config.fondoCredencial = await this.configService.subirImagen(
        this.fondoCredencialFile, 
        'fondoCredencial'
      );
    }

    console.log('✅ Guardando en Firestore...');
    console.log('Datos a guardar:', this.config);
    
    // Guardar configuración
    await this.configService.guardarConfiguracion(this.config);
    console.log('✅ Guardado exitoso');
    
    // Limpiar archivos temporales
    this.logoIzquierdoFile = null;
    this.logoDerechoFile = null;
    this.fondoCredencialFile = null;

    this.mostrarExito('Configuración guardada exitosamente');
  } catch (error) {
    console.error('❌ Error en guardarConfiguracion:', error);
    this.mostrarError('Error al guardar la configuración: ' + error);
  } finally {
    this.guardando = false;
    this.cdr.detectChanges(); // ← Forzar actualización del botón
    console.log('✅ guardando = false');
  }
}

  private mostrarExito(mensaje: string) {
    this.mensajeExito = mensaje;
    setTimeout(() => this.mensajeExito = '', 3000);
  }

  private mostrarError(mensaje: string) {
    this.mensajeError = mensaje;
    setTimeout(() => this.mensajeError = '', 5000);
  }
}