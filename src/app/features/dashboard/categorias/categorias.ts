import { Component, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CategoriaService, CategoriaCalificacion, CondicionCategoria } from '../../../services/categoria.service';
import colegiosData from '../../../../assets/data/colegios.json';

@Component({
  selector: 'app-categorias',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './categorias.html',
  styleUrls: ['./categorias.css']
})
export class CategoriasComponent implements OnInit {
  categorias: CategoriaCalificacion[] = [];
  filtradas: CategoriaCalificacion[] = [];
  busqueda = '';
  cargando = true;

  mostrarModal = false;
  editando: CategoriaCalificacion | null = null;
  guardando = false;

  form = {
    nombre: '',
    puestoPremiado: 1,
    tipo: 'NORMAL' as 'NORMAL' | 'INTERNA',
    activa: true,
    condiciones: [] as CondicionCategoria[],
    institucionesInternas: [] as any[]
  };

  busquedaInstitucion = '';
  resultadosInstitucion: any[] = [];
  colegios: any[] = colegiosData as any[];
  menuAbiertoId: string | null = null;

  campos = ['GESTION', 'AREA', 'NIVEL'];
  operadores = [
    { val: 'IGUAL', label: 'Es igual a' },
    { val: 'DIFERENTE', label: 'Es diferente de' }
  ];
  valoresPorCampo: Record<string, string[]> = {
    GESTION: ['PUBLICA', 'PRIVADA'],
    AREA: ['URBANA', 'RURAL'],
    NIVEL: ['PRIMARIA', 'SECUNDARIA']
  };

  constructor(private categoriaService: CategoriaService, private cdr: ChangeDetectorRef, private zone: NgZone) {}

  ngOnInit() { this.cargar(); }

  async cargar() {
    this.cargando = true;
    try {
      this.categorias = await this.categoriaService.obtenerCategorias();
      this.filtrar();
    } catch (e) { console.error(e); }
    this.cargando = false;
  }

  filtrar() {
    const t = this.busqueda.toLowerCase().trim();
    this.filtradas = !t ? [...this.categorias] : this.categorias.filter(c => c.nombre.toLowerCase().includes(t) || c.tipo.toLowerCase().includes(t));
  }

  abrirNueva() {
    this.editando = null;
    this.form = { nombre: '', puestoPremiado: 1, tipo: 'NORMAL', activa: true, condiciones: [{ campo: 'GESTION' as any, operador: 'IGUAL' as any, valor: '' }], institucionesInternas: [] };
    this.busquedaInstitucion = '';
    this.resultadosInstitucion = [];
    this.mostrarModal = true;
  }

  abrirEditar(cat: CategoriaCalificacion) {
    this.editando = cat;
    this.form = {
      nombre: cat.nombre,
      puestoPremiado: cat.PUESTOPREMIADO,
      tipo: cat.tipo,
      activa: cat.activa,
      condiciones: cat.condiciones?.length ? [...cat.condiciones] : [{ campo: 'GESTION' as any, operador: 'IGUAL' as any, valor: '' }],
      institucionesInternas: [...(cat.institucionesInternas || [])]
    };
    this.busquedaInstitucion = '';
    this.resultadosInstitucion = [];
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.editando = null;
    this.guardando = false;
    this.cdr.detectChanges();
  }

  agregarCriterio() {
    this.form.condiciones.push({ campo: 'GESTION' as any, operador: 'IGUAL' as any, valor: '' });
  }
  eliminarCriterio(i: number) { this.form.condiciones.splice(i, 1); }

  onBuscarInstitucion() {
    const q = this.busquedaInstitucion.toLowerCase().trim();
    if (q.length < 2) { this.resultadosInstitucion = []; return; }
    this.resultadosInstitucion = this.colegios.filter(c =>
      c.IE.toLowerCase().includes(q) || String(c.CODIGOMODULAR).includes(q)
    ).slice(0, 8);
  }
  agregarInstitucion(c: any) {
    if (this.form.institucionesInternas.some((x: any) => x.CODIGOMODULAR === c.CODIGOMODULAR)) return;
    this.form.institucionesInternas.push({ ...c });
    this.busquedaInstitucion = '';
    this.resultadosInstitucion = [];
  }
  quitarInstitucion(i: number) { this.form.institucionesInternas.splice(i, 1); }

  toggleMenu(id: string) { this.menuAbiertoId = this.menuAbiertoId === id ? null : id; }
  cerrarMenu() { this.menuAbiertoId = null; }

  async guardar() {
    if (!this.form.nombre.trim()) { alert('Nombre requerido'); return; }
    if (!this.form.puestoPremiado || this.form.puestoPremiado < 1) { alert('Puesto premiado requerido'); return; }
    if (this.form.tipo === 'NORMAL') {
      if (!this.form.condiciones.length) { alert('Agregue al menos un criterio'); return; }
      for (const co of this.form.condiciones) if (!co.campo || !co.operador || !co.valor) { alert('Complete todos los criterios'); return; }
    } else {
      if (!this.form.institucionesInternas.length) { alert('Agregue al menos una institución interna'); return; }
    }
    this.guardando = true;
    this.cdr.detectChanges();
    const esEdicion = !!this.editando?.id;
    const nombreUpper = this.form.nombre.toUpperCase().trim();
    const payload: CategoriaCalificacion = {
      nombre: nombreUpper,
      tipo: this.form.tipo,
      PUESTOPREMIADO: Number(this.form.puestoPremiado),
      activa: this.form.activa,
      condiciones: this.form.tipo === 'NORMAL' ? [...this.form.condiciones] : [],
      institucionesInternas: this.form.tipo === 'INTERNA' ? [...this.form.institucionesInternas] : []
    };
    const withTimeout = <T>(p: Promise<T>, ms = 10000): Promise<T> =>
      Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('Tiempo de espera agotado. Se guardó en el servidor pero la confirmación tardó. Cierre y recargue.')), ms))]) as Promise<T>;
    try {
      if (esEdicion) {
        await withTimeout(this.categoriaService.actualizarCategoria(this.editando!.id!, payload as any));
        const idx = this.categorias.findIndex(c => c.id === this.editando!.id);
        if (idx >= 0) this.categorias[idx] = { ...this.categorias[idx], ...payload };
      } else {
        const id = await withTimeout(this.categoriaService.crearCategoria(payload));
        this.categorias.push({ id, ...payload } as CategoriaCalificacion);
      }
      this.zone.run(() => {
        this.filtrar();
        this.mostrarModal = false;
        this.editando = null;
        this.guardando = false;
        this.cdr.detectChanges();
      });
    } catch (e: any) {
      const msg = e?.message || String(e);
      const esTimeout = msg.includes('Tiempo de espera');
      if (esTimeout && esEdicion) {
        const idx = this.categorias.findIndex(c => c.id === this.editando!.id);
        if (idx >= 0) this.categorias[idx] = { ...this.categorias[idx], ...payload };
        this.filtrar();
        this.zone.run(() => {
          this.mostrarModal = false;
          this.editando = null;
          this.guardando = false;
          this.cdr.detectChanges();
        });
        await this.cargar();
      } else {
        alert('Error: ' + msg);
        this.zone.run(() => {
          this.guardando = false;
          this.cdr.detectChanges();
        });
      }
    }
  }

  async eliminar(cat: CategoriaCalificacion) {
    if (!confirm(`¿Eliminar categoría "${cat.nombre}"?`)) return;
    await this.categoriaService.eliminarCategoria(cat.id!);
    await this.cargar();
  }

  async toggleActiva(cat: CategoriaCalificacion) {
    await this.categoriaService.toggleActiva(cat);
    cat.activa = !cat.activa;
  }
}
