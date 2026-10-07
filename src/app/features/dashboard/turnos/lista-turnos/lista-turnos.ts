import { Component, OnInit, Output, EventEmitter, Input, SimpleChanges, inject } from '@angular/core';
import { firebaseApp } from '../../../../firebase-config';
import { ConfiguracionService } from '../../../../services/configuracion';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TurnoService } from '../../../../services/turno.service';
import { getFirestore, collection, collectionGroup, doc, getDocs } from 'firebase/firestore';
import { Turno, ModoAsignacion } from '../../../../models/turno.model';
import { TurnoAulasComponent } from '../turno-aulas/turno-aulas';
import { TurnoGestionService } from '../../../../services/turno-gestion.service';

@Component({
  selector: 'app-lista-turnos',
  standalone: true,
  imports: [CommonModule, FormsModule, TurnoAulasComponent],
  templateUrl: './lista-turnos.html',
  styleUrls: ['./lista-turnos.css']
})
export class ListaTurnos implements OnInit {
  /** --- REPORTE DE INSCRITOS (PDF): Grado · Nivel · Inscritos · Capacidad --- */
  generandoReporte = false;
  private db = getFirestore(firebaseApp);
  private configService = inject(ConfiguracionService);

  private norm(v: string): string {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  private ordenGrado(g: string): number {
    const map: any = { PRIMERO: 1, SEGUNDO: 2, TERCERO: 3, CUARTO: 4, QUINTO: 5, SEXTO: 6 };
    return map[this.norm(g)] || 99;
  }

  async descargarReporteInscritos(): Promise<void> {
    if (this.generandoReporte) return;
    this.generandoReporte = true;
    try {
      const { jsPDF } = await import('jspdf');
      // 1) Inscritos por grado y nivel (estudiantes de todas las inscripciones)
      const conteo = new Map<string, { grado: string; nivel: string; inscritos: number }>();
      let crudos: any[] = [];
      try {
        const cg = await getDocs(collectionGroup(this.db, 'estudiantes'));
        crudos = cg.docs.map(d => d.data());
      } catch { crudos = []; }
      if (!crudos.length) {
        const ins = await getDocs(collection(this.db, 'inscripciones'));
        const listas = await Promise.all(ins.docs.map(async (d) => {
          try {
            const sub = await getDocs(collection(doc(this.db, 'inscripciones', d.id), 'estudiantes'));
            return sub.docs.map(s => s.data());
          } catch { return []; }
        }));
        for (const l of listas) crudos.push(...l);
      }
      for (const e of crudos) {
        const g = this.norm(e.grado || ''); const nv = this.norm(e.nivel || '');
        if (!g || !nv) continue;
        const k = g + '|' + nv;
        const cur = conteo.get(k) || { grado: String(e.grado || ''), nivel: String(e.nivel || ''), inscritos: 0 };
        cur.inscritos++;
        conteo.set(k, cur);
      }
      // 2) Capacidad por grado y nivel (aulas asignadas a los turnos)
      const cap = new Map<string, number>();
      try {
        const asg = await getDocs(collection(this.db, 'turnosedicion'));
        for (const d of asg.docs) {
          const a: any = d.data();
          const k = this.norm(a.grado || '') + '|' + this.norm(a.nivel || '');
          if (k === '|') continue;
          cap.set(k, (cap.get(k) || 0) + Number(a.capacidad || 0));
        }
      } catch { /* sin datos de capacidad */ }

      // 3) PDF
      const docPdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const ancho = docPdf.internal.pageSize.getWidth();
      docPdf.setFont('helvetica', 'bold'); docPdf.setFontSize(15);
      docPdf.text('REPORTE DE INSCRITOS', ancho / 2, 52, { align: 'center' });
      docPdf.setFont('helvetica', 'normal'); docPdf.setFontSize(9);
      docPdf.text('Fecha y hora de impresión: ' + new Date().toLocaleString('es-PE'), ancho / 2, 68, { align: 'center' });

      // 3) Gráfico circular: Inscritos vs Remanente (dibujado en canvas)
      const totalInscritos = [...conteo.values()].reduce((s, f) => s + f.inscritos, 0);
      const totalCapacidad = [...cap.values()].reduce((s, n) => s + n, 0);
      const remanente = Math.max(0, totalCapacidad - totalInscritos);
      const lienzo = document.createElement('canvas');
      lienzo.width = 900; lienzo.height = 460;
      const ctx = lienzo.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, lienzo.width, lienzo.height);
        const total = Math.max(1, totalInscritos + remanente);
        const cx = 260, cy = 210, r = 165;
        let ang = -Math.PI / 2;
        const sector = (valor: number, color: string) => {
          const a2 = ang + (valor / total) * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, ang, a2); ctx.closePath();
          ctx.fillStyle = color; ctx.fill();
          ang = a2;
        };
        sector(totalInscritos, '#cfe4f7');
        sector(remanente, '#f8d7da');
        ctx.fillStyle = '#333333'; ctx.font = 'bold 20px Arial';
        ctx.fillText(Math.round(totalInscritos * 100 / total) + '% (' + totalInscritos + ')', cx - 210, cy + 70);
        ctx.fillText(Math.round(remanente * 100 / total) + '% (' + remanente + ')', cx + 40, cy - 30);
        ctx.fillStyle = '#f8d7da'; ctx.fillRect(560, 70, 30, 20);
        ctx.fillStyle = '#cfe4f7'; ctx.fillRect(720, 70, 30, 20);
        ctx.fillStyle = '#333333'; ctx.font = '17px Arial';
        ctx.fillText('Remanente', 598, 86);
        ctx.fillText('Inscritos', 758, 86);
      }
      docPdf.addImage((lienzo as any).toDataURL('image/png'), 'PNG', 65, 84, 465, 238);
      let y = 348;
      const seccion = (nivel: string) => {
        docPdf.setFont('helvetica', 'bold'); docPdf.setFontSize(10);
        docPdf.text('Grado', 50, y); docPdf.text('Nivel', 190, y);
        docPdf.text('Inscritos', 320, y); docPdf.text('Capacidad', 420, y);
        y += 5; docPdf.line(50, y, ancho - 50, y); y += 16;
        docPdf.setFont('helvetica', 'normal');
        const filas = [...conteo.values()].filter(f => this.norm(f.nivel) === nivel)
          .sort((a, b) => this.ordenGrado(a.grado) - this.ordenGrado(b.grado));
        for (const f of filas) {
          docPdf.text(String(f.grado).toUpperCase(), 50, y);
          docPdf.text(nivel, 190, y);
          docPdf.text(String(f.inscritos), 320, y);
          docPdf.text(String(cap.get(this.norm(f.grado) + '|' + nivel) || 0), 420, y);
          y += 16;
          if (y > 760) { docPdf.addPage(); y = 60; }
        }
        y += 14;
      };
      seccion('PRIMARIA');
      seccion('SECUNDARIA');
      docPdf.save('REPORTE DE INSCRITOS.pdf');
    } catch (error: any) {
      alert('No se pudo generar el reporte: ' + (error?.message || ''));
    } finally {
      this.generandoReporte = false;
    }
  }

  @Output() cambiarSeccion = new EventEmitter<string>();
  @Output() editarTurno = new EventEmitter<Turno>();
  
  turnos: Turno[] = [];
  turnosConModo: (Turno & { modoActual: ModoAsignacion })[] = [];
  itemsPorPagina = 3;
  paginaActual = 1;
  totalItems = 0;
  Math = Math;

  mostrarModalAulas: boolean = false;
  turnoSeleccionado?: Turno;

  constructor(
    private turnoService: TurnoService,
    private turnoGestion: TurnoGestionService
  ) {}

  @Input() recargar: boolean = false;
  
  ngOnChanges(changes: SimpleChanges) {
    if (changes['recargar'] && this.recargar) {
      this.cargarTurnos();
    }
  }

  async ngOnInit() {
    await this.cargarTurnos();
  }

  async recargarDatos() {
    await this.cargarTurnos();
  }

  async cargarTurnos() {
    const turnos = await this.turnoService.obtenerTurnos();
    this.turnos = turnos;
    
    this.turnosConModo = await Promise.all(turnos.map(async t => ({
      ...t,
      modoActual: await this.turnoGestion.determinarModoActual(t)
    })));
    
    this.totalItems = turnos.length;
    this.paginaActual = 1;
  }

  get turnosPaginados(): Turno[] {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    const fin = inicio + this.itemsPorPagina;
    return this.turnos.slice(inicio, fin);
  }

  get totalPaginas(): number {
    return Math.ceil(this.totalItems / this.itemsPorPagina) || 1;
  }

  cambiarPagina(direccion: 'anterior' | 'siguiente') {
    if (direccion === 'anterior' && this.paginaActual > 1) {
      this.paginaActual--;
    } else if (direccion === 'siguiente' && this.paginaActual < this.totalPaginas) {
      this.paginaActual++;
    }
  }

  onItemsPorPaginaChange(event: any) {
    this.itemsPorPagina = parseInt(event.target.value);
    this.paginaActual = 1;
  }

  nuevoTurno() {
    this.cambiarSeccion.emit('nuevo-turno');
  }

  onEditarTurno(turno: Turno) {
    this.editarTurno.emit(turno);
  }

  onVerAulas(turno: Turno) {
    this.turnoSeleccionado = turno;
    this.mostrarModalAulas = true;
  }

  onCerrarModalAulas() {
    this.mostrarModalAulas = false;
    this.turnoSeleccionado = undefined;
  }

  onGuardarModalAulas() {
    console.log('Cambios guardados en aulas del turno');
  }

  async onEliminarTurno(turno: Turno) {
    if (!turno.id) return;
    
    if (confirm('¿Está seguro de eliminar este turno?')) {
      await this.turnoService.eliminarTurno(turno.id);
      await this.cargarTurnos();
    }
  }

  // ============ MÉTODOS PARA MODO DE ASIGNACIÓN ============

  getModoActual(turno: Turno): ModoAsignacion {
    const encontrado = this.turnosConModo.find(t => t.id === turno.id);
    return encontrado?.modoActual || 'normal';
  }

  async toggleModoTurno(turno: Turno, event: Event) {
    event.stopPropagation();
    
    const modoActual = this.getModoActual(turno);
    const accion = modoActual === 'normal' ? 'cerrar' : 'reabrir';
    
    if (!confirm(`¿${accion === 'cerrar' ? 'Cerrar' : 'Reabrir'} inscripciones para ${turno.codigo}?\n\n${accion === 'cerrar' ? 'Esto activará la fase de contingencia (rezagados).' : 'Esto reactivará las inscripciones normales.'}`)) return;
    
    if (accion === 'cerrar') {
      await this.turnoGestion.cerrarInscripciones(turno.id!);
    } else {
      await this.turnoGestion.reabrirInscripciones(turno.id!);
    }
    
    await this.cargarTurnos();
  }

  // ============ BOTÓN TEMPORAL: Migración ============

  async ejecutarMigracion() {
    if (!confirm('¿Ejecutar migración de datos? Solo hacer una vez.\n\nEsto agregará los campos modoAsignacion, cierreManual y porColegio a tus documentos existentes.')) return;
    
    try {
      const { migrarTurnos } = await import('../../../../migrations/migrar-turnos');
      await migrarTurnos();
      alert('✅ Migración completada. Recargando...');
      await this.cargarTurnos();
    } catch (error: any) {
      console.error('Error en migración:', error);
      alert('❌ Error: ' + error.message);
    }
  }

  formatearGrados(grados: string[]): string {
    if (!grados || grados.length === 0) return '-';
    return grados.join(', ');
  }

  formatearFecha(fecha: any): string {
    if (!fecha) return '-';
    let d: Date;
    if (fecha?.toDate) d = fecha.toDate();
    else if (fecha?.seconds) d = new Date(fecha.seconds*1000);
    else d = new Date(fecha);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('es-ES');
  }

  formatearHora(hora: any): string {
    if (!hora) return '--:--';
    if (typeof hora === 'string') return hora.slice(0,5);
    if (hora?.toDate) {
      const d = hora.toDate();
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
    if (hora?.seconds) {
      const d = new Date(hora.seconds*1000);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
    if (hora instanceof Date) return `${String(hora.getHours()).padStart(2,'0')}:${String(hora.getMinutes()).padStart(2,'0')}`;
    return String(hora).slice(0,5);
  }
}