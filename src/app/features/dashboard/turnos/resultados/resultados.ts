import { Component, Input, Output, EventEmitter, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  getFirestore,
  collection,
  collectionGroup,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
  serverTimestamp,
  deleteField,
  Timestamp
} from 'firebase/firestore';
import { firebaseApp } from '../../../../firebase-config';
import { ConfiguracionService } from '../../../../services/configuracion';

/**
 * Procesar resultados de un TURNO (sistema presencial).
 *
 * - Agrupa por las pestañas PRIMARIA / SECUNDARIA del grado elegido.
 * - Lee los participantes de las inscripciones del turno (subcolección `estudiantes`).
 * - Usa los MISMOS campos que la app móvil y el portal de resultados:
 *     ASISTENCIA, FECHAASISTENCIA, PUNTAJE_FINAL / PUNTAJEFINAL, PUESTO,
 *     MOSTRARHORA, OBSERVACIONES + Correctas / Incorrectas / En blanco.
 * - No modifica ninguna otra parte del sistema.
 */
interface FilaResultado {
  inscripcionId: string;
  inscripcionCodigo: string;
  estudianteId: string;
  documento: string;
  apellidos: string;
  nombres: string;
  ie: string;
  area?: string;
  codigoModular: string;
  gestion: string;
  grado: string;
  nivel: string;
  asistencia: string;
  fechaAsistencia: Date | null;
  puntaje: number | null;
  puesto: number | null;
  observaciones: string;
  aula: string;
  mostrarHora: boolean;
  correctas: number | null;
  incorrectas: number | null;
  enBlanco: number | null;
  /** Nombres reales de los campos de calificación en la base (para regrabarlos igual). */
  claveCorrectas: string;
  claveIncorrectas: string;
  claveBlanco: string;
}

@Component({
  selector: 'app-resultados-turno',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="fondo" (click)="cerrar.emit()"></div>
<div class="ventana">
  <div class="barra">
    <div>
      <h2>Previsualización de resultados</h2>
      <p>Ranking de {{ grado }} {{ nivel }}{{ sede ? ' · ' + sede : '' }}</p>
    </div>
    <div class="acciones-principales">
      <button class="btn-verde" (click)="guardarPuestos()" [disabled]="ocupado || cargando">
        💾 {{ ocupado ? 'Procesando...' : 'Guardar puestos' }}
      </button>
      <button class="btn-morado" (click)="descargarExcel()" [disabled]="ocupado">
        ⬇ Descargar Excel
      </button>
      <button class="btn-cerrar" (click)="cerrar.emit()">✕</button>
    </div>
  </div>

  <div class="datos-evento">
    <div><span>Evento</span><strong>{{ evento }}</strong></div>
    <div><span>Edición</span><strong>{{ edicion }}</strong></div>
    <div><span>Sede</span><strong>{{ sede || '—' }}</strong></div>
    <div><span>Grado</span><strong>{{ grado }}</strong></div>
  </div>

  <!-- Pestañas por nivel (como la ventana del asesor) -->
  <div class="tabs">
        <button class="tab" *ngFor="let cat of categoriasVisibles"
          [class.activo]="categoriaActiva === cat.nombre" (click)="cambiarCategoria(cat.nombre)">
          {{ cat.nombre }} <span class="contador-tab">{{ porCategoria(cat.nombre).length }}</span>
        </button>
      </div>

      <!-- Botones de filtro (leyenda): al pulsarlos se filtra la tabla -->
      <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:8px 0 10px;">
        <button type="button" (click)="cambiarFiltroLeyenda('HORA_PENDIENTE')"
          [style.box-shadow]="filtroLeyenda === 'HORA_PENDIENTE' ? 'inset 0 0 0 2px #ef4444' : 'none'"
          style="display:inline-flex; align-items:center; gap:8px; background:#fff; border:1px solid #fecaca; color:#b91c1c; border-radius:999px; padding:7px 14px; font-weight:700; font-size:0.82rem; cursor:pointer;">
          &#9201; HORA PENDIENTE <span style="background:#fee2e2; border-radius:999px; padding:1px 8px;">{{ filasHoraPendiente.length }}</span>
        </button>
        <button type="button" (click)="cambiarFiltroLeyenda('NO_SE_PRESENTO')"
          [style.box-shadow]="filtroLeyenda === 'NO_SE_PRESENTO' ? 'inset 0 0 0 2px #2563eb' : 'none'"
          style="display:inline-flex; align-items:center; gap:8px; background:#fff; border:1px solid #bfdbfe; color:#1d4ed8; border-radius:999px; padding:7px 14px; font-weight:700; font-size:0.82rem; cursor:pointer;">
          &#128683; NO SE PRESENTARON <span style="background:#dbeafe; border-radius:999px; padding:1px 8px;">{{ filasNoSePresento.length }}</span>
        </button>
        <button type="button" (click)="cambiarFiltroLeyenda('SIN_ASISTENCIA')"
          [style.box-shadow]="filtroLeyenda === 'SIN_ASISTENCIA' ? 'inset 0 0 0 2px #db2777' : 'none'"
          style="display:inline-flex; align-items:center; gap:8px; background:#fff; border:1px solid #fbcfe8; color:#be185d; border-radius:999px; padding:7px 14px; font-weight:700; font-size:0.82rem; cursor:pointer;">
          &#128101; SIN ASISTENCIA <span style="background:#fce7f3; border-radius:999px; padding:1px 8px;">{{ filasSinAsistencia.length }}</span>
        </button>
        <button type="button" (click)="cambiarFiltroLeyenda('DUPLICADOS')"
          [style.box-shadow]="filtroLeyenda === 'DUPLICADOS' ? 'inset 0 0 0 2px #d97706' : 'none'"
          style="display:inline-flex; align-items:center; gap:8px; background:#fff; border:1px solid #fde68a; color:#b45309; border-radius:999px; padding:7px 14px; font-weight:700; font-size:0.82rem; cursor:pointer;">
          &#128196; DUPLICADOS <span style="background:#fef3c7; border-radius:999px; padding:1px 8px;">{{ filasDuplicadas.length }}</span>
        </button>
        <button type="button" (click)="cambiarFiltroLeyenda('COMPLETO')"
          [style.box-shadow]="filtroLeyenda === 'COMPLETO' ? 'inset 0 0 0 2px #059669' : 'none'"
          style="display:inline-flex; align-items:center; gap:8px; background:#fff; border:1px solid #bbf7d0; color:#047857; border-radius:999px; padding:7px 14px; font-weight:700; font-size:0.82rem; cursor:pointer;">
          &#9989; COMPLETO <span style="background:#dcfce7; border-radius:999px; padding:1px 8px;">{{ filasCompletas.length }}</span>
        </button>
        <span style="margin-left:auto; font-weight:800; color:#0f172a; font-size:0.85rem;">TOTAL EN LA CATEGOR&#205;A {{ filasNivel.length }}</span>
      </div>
      <div class="tarjetas">
    <div class="tarjeta">
      <span>Total participantes</span>
      <strong>{{ filasNivel.length }}</strong>
    </div>
    <div class="tarjeta verde">
      <span>Clasificados</span>
      <strong>{{ totalClasificados }}</strong>
    </div>
    <div class="tarjeta ambar">
      <span>Sin categoría</span>
      <strong>{{ filasNivel.length - totalClasificados }}</strong>
    </div>
  </div>

  <div class="leyenda">
    <b>Leyenda:</b>
    <span class="chip gris">No se presentó: {{ sinAsistir }}</span>
    <span class="chip rojo">Sin puntaje: {{ sinPuntaje }}</span>
    <span class="chip ambar">Posible duplicado: {{ duplicados }}</span>
    <span class="chip verde">Completo: {{ totalClasificados }}</span>
  </div>

  <div class="buscador">
    <input [(ngModel)]="busqueda" placeholder="🔍 Buscar por apellidos o nombres">
    <span class="contador">{{ filtradas.length }} participante(s)</span>
  </div>

  <div class="tabla-wrap">
    <div *ngIf="cargando" class="aviso">Cargando participantes del turno... {{ mensajeCarga }}</div>
    <div *ngIf="!cargando && !filasNivel.length" class="aviso">Sin participantes registrados para {{ grado }} {{ nivelActivo }} en este turno.</div>
    <table *ngIf="!cargando && filtradas.length">
      <thead>
        <tr>
          <th>Puesto</th>
          <th>Documento</th>
          <th>Participante</th>
          <th>Institución educativa</th>
          <th>Asistencia</th>
          <th>Puntaje</th>
          <th>Fecha de asistencia</th>
          <th>Mostrar hora</th>
          <th>Observaciones</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let f of filtradas">
          <td class="centro"><b>{{ f.puesto ?? '—' }}</b></td>
          <td>
            {{ f.documento || '—' }}
            <div class="mini" *ngIf="f.aula">{{ f.aula }}</div>
          </td>
          <td>
            <b>{{ f.apellidos }}</b>, {{ f.nombres }}
            <div class="mini">Inscripción: {{ f.inscripcionCodigo }} · ID: {{ f.estudianteId }}</div>
          </td>
          <td>
            {{ f.ie || '—' }}
            <div class="mini">{{ f.gestion }}{{ f.codigoModular ? ' · ' + f.codigoModular : '' }}</div>
          </td>
          <td class="centro">
            <span class="estado" [class.presente]="f.asistencia === 'PRESENTE'"
                  [class.ausente]="f.asistencia === 'NO SE PRESENTÓ'">{{ f.asistencia || '—' }}</span>
          </td>
          <td class="centro">
            <b>{{ f.puntaje ?? '—' }}</b>
            <div class="mini" *ngIf="f.correctas !== null || f.incorrectas !== null || f.enBlanco !== null">
              C: {{ f.correctas ?? '—' }} · I: {{ f.incorrectas ?? '—' }} · B: {{ f.enBlanco ?? '—' }}
            </div>
          </td>
          <td class="centro mini">{{ f.fechaAsistencia ? (f.fechaAsistencia | date:'dd/MM/yyyy HH:mm') : '—' }}</td>
          <td class="centro"><span class="estado">{{ f.mostrarHora ? 'SI' : 'NO' }}</span></td>
          <td>
            <span class="estado" [class.presente]="esCompleto(f)" [class.ausente]="f.asistencia === 'NO SE PRESENTÓ'">
              {{ esCompleto(f) ? 'Registro correcto' : (f.asistencia === 'NO SE PRESENTÓ' ? 'No se presentó' : 'Sin puntaje') }}
            </span>
            <div class="mini" *ngIf="f.observaciones">{{ f.observaciones }}</div>
          </td>
          <td class="centro">
            <div class="acciones-celda">
              <button class="btn-mini" (click)="abrirMenuAsistencia(f)">👤 Asistencia</button>
              <button class="btn-mini" (click)="abrirEditar(f)">✏️ Editar</button>
            </div>
            <div class="menu-asistencia" *ngIf="menuAsistencia === f.estudianteId">
              <button (click)="marcar(f, 'PRESENTE')">✔ PRESENTE</button>
              <button (click)="marcar(f, 'NO SE PRESENTÓ')">✖ NO SE PRESENTÓ</button>
              <button (click)="marcar(f, '')">— Sin marcar</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="pie">
    <span>ⓘ ASISTENCIA indica si participó y la fecha/hora las registra el escáner móvil; aquí puedes corregirlas.</span>
    <button class="btn-gris" (click)="cerrar.emit()">Cerrar</button>
  </div>
</div>

<!-- Modal "Editar resultado" -->
<div class="fondo" *ngIf="editando" (click)="cancelarEdicion()"></div>
<div class="modal-editar" *ngIf="editando && filaEditando">
  <div class="modal-editar-barra">
    <h3>✏️ Editar resultado</h3>
    <button class="btn-cerrar" (click)="cancelarEdicion()">✕</button>
  </div>
  <div class="modal-editar-cuerpo">
    <div class="dos-columnas">
      <div class="campo">
        <label>PARTICIPANTE</label>
        <div class="valor">{{ filaEditando.apellidos }}, {{ filaEditando.nombres }}</div>
      </div>
      <div class="campo">
        <label>DOCUMENTO</label>
        <div class="valor">{{ filaEditando.documento || '—' }}</div>
      </div>
    </div>

    <label class="etiqueta">Asistencia *</label>
    <select [(ngModel)]="editAsistencia">
      <option value="PRESENTE">Presente</option>
      <option value="NO SE PRESENTÓ">No se presentó</option>
      <option value="">— Sin marcar (borra la asistencia) —</option>
    </select>

    <div class="dos-columnas">
      <div class="campo">
        <label>Fecha de asistencia</label>
        <input type="date" [(ngModel)]="editFechaTexto" name="fechaAsistencia">
      </div>
      <div class="campo">
        <label>Hora</label>
        <input type="time" [(ngModel)]="editHoraTexto" name="horaAsistencia">
      </div>
    </div>
    <p class="mini">Estos datos los registra el escáner móvil al marcar la asistencia. Aquí se muestran tal cual; si los modificas y guardas, se guardará lo que tú pongas.</p>

    <div class="bloque-calificacion">
      <h4>📝 Calificación</h4>
      <div class="tres-columnas">
        <div class="campo">
          <label>Correctas</label>
          <input type="number" [(ngModel)]="editCorrectas">
        </div>
        <div class="campo">
          <label>Incorrectas</label>
          <input type="number" [(ngModel)]="editIncorrectas">
        </div>
        <div class="campo">
          <label>En blanco</label>
          <input type="number" [(ngModel)]="editEnBlanco">
        </div>
      </div>
      <label class="etiqueta">Puntaje final (déjalo vacío para borrarlo)</label>
      <input type="number" [(ngModel)]="editPuntaje" placeholder="Puntaje final">
      <p class="mini">Lo que registra el escáner móvil se muestra aquí; puedes corregirlo.</p>
    </div>

    <label class="etiqueta">Observaciones</label>
    <input type="text" [(ngModel)]="editObservaciones" placeholder="Observaciones (opcional)">

    <label class="check">
      <input type="checkbox" [(ngModel)]="editMostrarHora"> Mostrar hora en el resultado
    </label>

    <div class="aviso-verde">Las horas, observaciones y el ranking se recalcularán automáticamente después de guardar.</div>
  </div>
  <div class="modal-editar-pie">
    <button class="btn-gris" (click)="cancelarEdicion()">Cancelar</button>
    <button class="btn-morado" (click)="guardarEdicion()" [disabled]="ocupado">💾 Guardar cambios</button>
  </div>
</div>
  `,
  styles: [`
    .fondo { position: fixed; inset: 0; background: rgba(15,23,42,0.55); z-index: 2000; }
    .ventana { position: fixed; inset: 2% 2% 2% 2%; background: #f6f7fb; border-radius: 14px; z-index: 2001;
               display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,.35); }
    .barra { display:flex; justify-content:space-between; align-items:center; padding:14px 18px; background:#fff; border-bottom:1px solid #e2e8f0; }
    .barra h2 { margin:0; font-size:1.15rem; color:#0f172a; }
    .barra p { margin:2px 0 0; font-size:.85rem; color:#64748b; }
    .acciones-principales { display:flex; gap:8px; align-items:center; }
    .btn-verde { background:#16a34a; color:#fff; border:none; padding:10px 14px; border-radius:8px; font-weight:700; cursor:pointer; }
    .btn-morado { background:#7c3aed; color:#fff; border:none; padding:10px 14px; border-radius:8px; font-weight:700; cursor:pointer; }
    .btn-gris { background:#e2e8f0; color:#0f172a; border:none; padding:9px 16px; border-radius:8px; font-weight:700; cursor:pointer; }
    .btn-cerrar { background:#e2e8f0; border:none; width:36px; height:36px; border-radius:50%; font-size:1rem; cursor:pointer; }
    .datos-evento { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; padding:12px 18px; background:#fff; border-bottom:1px solid #e2e8f0; }
    .datos-evento span { display:block; font-size:.72rem; color:#64748b; text-transform:uppercase; }
    .tabs { display:flex; gap:6px; padding:10px 18px 0; background:#fff; }
    .tab { flex:1; background:#f1f5f9; border:none; padding:10px; border-radius:8px; font-weight:800; color:#475569; cursor:pointer; }
    .tab.activo { background:#1d4ed8; color:#fff; }
    .contador-tab { background:rgba(255,255,255,.35); border-radius:999px; padding:1px 8px; margin-left:6px; font-size:.8rem; }
    .tarjetas { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; padding:12px 18px 6px; }
    .tarjeta { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; }
    .tarjeta span { display:block; font-size:.75rem; color:#64748b; text-transform:uppercase; }
    .tarjeta strong { font-size:1.5rem; color:#0f172a; }
    .tarjeta.verde strong { color:#15803d; } .tarjeta.ambar strong { color:#b45309; }
    .leyenda { display:flex; gap:8px; flex-wrap:wrap; align-items:center; padding:6px 18px 10px; font-size:.8rem; color:#475569; }
    .chip { padding:3px 10px; border-radius:999px; border:1px solid #e2e8f0; background:#fff; }
    .chip.gris { background:#f1f5f9; } .chip.rojo { background:#fee2e2; color:#b91c1c; }
    .chip.ambar { background:#fef3c7; color:#92400e; } .chip.verde { background:#dcfce7; color:#166534; }
    .buscador { display:flex; gap:10px; align-items:center; padding:0 18px 10px; }
    .buscador input { flex:1; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px; }
    .contador { font-size:.85rem; color:#475569; }
    .tabla-wrap { flex:1; overflow:auto; padding:0 18px 12px; }
    table { width:100%; border-collapse:collapse; background:#fff; border-radius:10px; overflow:hidden; }
    th { background:#f1f5f9; text-align:left; padding:9px 8px; font-size:.7rem; text-transform:uppercase; color:#475569; }
    td { padding:9px 8px; border-top:1px solid #f1f5f9; font-size:.84rem; vertical-align:top; }
    td.centro { text-align:center; }
    .mini { font-size:.72rem; color:#64748b; }
    .estado { padding:3px 9px; border-radius:999px; background:#f1f5f9; font-weight:700; font-size:.72rem; display:inline-block; }
    .estado.presente { background:#dcfce7; color:#166534; }
    .estado.ausente { background:#fee2e2; color:#b91c1c; }
    .btn-mini { background:#e2e8f0; border:none; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:.75rem; margin:1px; }
    .acciones-celda { display:flex; flex-direction:column; gap:4px; }
    .menu-asistencia { position:absolute; background:#fff; border:1px solid #cbd5e1; border-radius:8px; box-shadow:0 8px 20px rgba(0,0,0,.18); z-index:2010; margin-top:4px; }
    .menu-asistencia button { display:block; width:100%; background:#fff; border:none; padding:8px 14px; text-align:left; font-size:.78rem; font-weight:700; cursor:pointer; }
    .menu-asistencia button:hover { background:#f1f5f9; }
    .aviso { background:#fff; padding:26px; text-align:center; color:#64748b; border-radius:10px; }
    .pie { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 18px; background:#fff; border-top:1px solid #e2e8f0; font-size:.78rem; color:#475569; }
    .modal-editar { position: fixed; top: 4%; left: 50%; transform: translateX(-50%); width: min(760px, 94vw);
                    max-height: 92vh; overflow: auto; background: #fff; border-radius: 14px; z-index: 2002; box-shadow: 0 20px 50px rgba(0,0,0,.35); }
    .modal-editar-barra { display:flex; justify-content:space-between; align-items:center; padding:14px 18px; border-bottom:1px solid #e2e8f0; }
    .modal-editar-barra h3 { margin:0; color:#0f172a; }
    .modal-editar-cuerpo { padding:16px 18px; display:flex; flex-direction: column; gap:10px; }
    .dos-columnas { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .tres-columnas { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
    .campo label, .etiqueta { display:block; font-size:.75rem; color:#475569; text-transform:uppercase; margin-bottom:4px; font-weight:700; }
    .valor { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; font-weight:700; color:#0f172a; }
    select, input[type=text], input[type=number], input[type=date], input[type=time] { width:100%; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:.9rem; }
    .bloque-calificacion { border:1px solid #e2e8f0; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px; }
    .bloque-calificacion h4 { margin:0; color:#1d4ed8; font-size:.9rem; }
    .check { display:flex; align-items:center; gap:8px; font-size:.85rem; color:#334155; }
    .aviso-verde { background:#dcfce7; color:#166534; border-radius:8px; padding:10px 12px; font-size:.8rem; }
    .modal-editar-pie { display:flex; justify-content:flex-end; gap:10px; padding:14px 18px; border-top:1px solid #e2e8f0; }
  `]
})
export class ResultadosTurno implements OnInit {
  @Input() turnoId = '';
  @Input() turnoCodigo = '';
  @Input() grado = '';
  @Input() nivel = '';
  @Input() sede = '';
  @Output() cerrar = new EventEmitter<void>();

  private db = getFirestore(firebaseApp);
  private configService = inject(ConfiguracionService);
  private cdr = inject(ChangeDetectorRef);

  evento = '';
  edicion = '';
  cargando = true;
  ocupado = false;
  busqueda = '';
  mensajeCarga = '';
  nivelActivo = 'PRIMARIA';
  /** Categorías de calificación configuradas (INTERNA, PRIVADA, PUBLICA RURAL, PUBLICA URBANA...). */
  categorias: any[] = [];
  /** Categoría activa (pestaña). */
  categoriaActiva = '';
  /** Filtro por leyenda: TODOS | HORA_PENDIENTE | NO_SE_PRESENTO | SIN_ASISTENCIA | DUPLICADOS | COMPLETO */
  filtroLeyenda = 'TODOS';

  cambiarFiltroLeyenda(f: string): void {
    this.filtroLeyenda = this.filtroLeyenda === f ? 'TODOS' : f;
    this.refrescar();
  }

  private esNoSePresento(f: any): boolean { return String(f?.asistencia || '').toUpperCase().includes('NO SE PRESENT'); }
  private esSinAsistencia(f: any): boolean { const a = String(f?.asistencia || '').trim(); return !a || a === '—' || a === '-'; }
  private esHoraPendiente(f: any): boolean { return !f?.mostrarHora; }

  /** DNI que se repiten (solo los que realmente están repetidos). */
  private dnisRepetidos(): Set<string> {
    const vistos = new Set<string>(); const repetidos = new Set<string>();
    for (const f of this.filas || []) {
      const d = String(f?.documento || '').trim();
      if (!d) continue;
      if (vistos.has(d)) { repetidos.add(d); } else { vistos.add(d); }
    }
    return repetidos;
  }

  get filasHoraPendiente(): any[] { return this.filasNivel.filter(f => this.esHoraPendiente(f)); }
  get filasNoSePresento(): any[] { return this.filasNivel.filter(f => this.esNoSePresento(f)); }
  get filasSinAsistencia(): any[] { return this.filasNivel.filter(f => this.esSinAsistencia(f)); }
  get filasDuplicadas(): any[] {
    const rep = this.dnisRepetidos();
    return this.filasNivel.filter(f => rep.has(String(f?.documento || '').trim()));
  }
  get filasCompletas(): any[] { return this.filasNivel.filter(f => this.esCompleto(f)); }

  /** Aplica el filtro de leyenda sobre la lista (para la tabla). */
  private aplicarFiltroLeyenda(lista: any[]): any[] {
    switch (this.filtroLeyenda) {
      case 'HORA_PENDIENTE': return lista.filter(f => this.esHoraPendiente(f));
      case 'NO_SE_PRESENTO': return lista.filter(f => this.esNoSePresento(f));
      case 'SIN_ASISTENCIA': return lista.filter(f => this.esSinAsistencia(f));
      case 'COMPLETO': return lista.filter(f => this.esCompleto(f));
      case 'DUPLICADOS': { const rep = this.dnisRepetidos(); return lista.filter(f => rep.has(String(f?.documento || '').trim())); }
      default: return lista;
    }
  }

  private normalizarTxt(v: any): string {
    return String(v || '').trim().toUpperCase()
      .replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
      .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U');
  }

  /** Categorías visibles en las pestañas (activas y ordenadas como en el módulo Categorías). */
  get categoriasVisibles(): any[] {
    const activas = (this.categorias || []).filter((c: any) => c && c.activa !== false);
    const orden: string[] = ['INTERNA', 'PRIVADA', 'PUBLICA RURAL', 'PUBLICA URBANA'];
    return activas.slice().sort((a: any, b: any) => {
      const ia = orden.indexOf(this.normalizarTxt(a.nombre).replace('PÚBLICA', 'PUBLICA'));
      const ib = orden.indexOf(this.normalizarTxt(b.nombre).replace('PÚBLICA', 'PUBLICA'));
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }

  /** Categoría que le corresponde a una fila según el colegio de su inscripción. */
  categoriaDe(f: any): string {
    const codMod = this.normalizarTxt(f?.codigoModular);
    const valores: any = {
      GESTION: this.normalizarTxt(f?.gestion),
      AREA: this.normalizarTxt(f?.area),
      NIVEL: this.normalizarTxt(f?.nivel)
    };
    // 1) INTERNA: los códigos modulares de las instituciones internas quedan solo en esa categoría
    for (const c of this.categorias || []) {
      if (this.normalizarTxt(c?.tipo) !== 'INTERNA') continue;
      const lista = (c.institucionesInternas || []).map((i: any) =>
        this.normalizarTxt(typeof i === 'string' ? i : (i?.CODIGOMODULAR || i?.codigoModular || i?.codigo || i?.ie || '')));
      if (codMod && lista.includes(codMod)) return String(c.nombre || 'INTERNA');
    }
    // 2) Categorías normales por condiciones (GESTION / AREA / NIVEL)
    for (const c of this.categorias || []) {
      if (this.normalizarTxt(c?.tipo) === 'INTERNA') continue;
      const conds = c?.condiciones || [];
      if (!conds.length) continue;
      const cumple = conds.every((cd: any) => {
        const campo = this.normalizarTxt(cd?.campo);
        return this.normalizarTxt(valores[campo]) === this.normalizarTxt(cd?.valor);
      });
      if (cumple) return String(c.nombre || '');
    }
    return 'SIN CATEGORÍA';
  }

  /** Carga las categorías desde Firestore (módulo Categorías). */
  async cargarCategorias(): Promise<void> {
    try {
      const snap = await getDocs(collection(this.db, 'categoriasCalificacion'));
      this.categorias = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!this.categoriaActiva) {
        const primera = this.categoriasVisibles[0];
        this.categoriaActiva = primera ? String(primera.nombre) : '';
      }
      this.refrescar();
    } catch (e) { console.warn('No se pudieron cargar las categorías:', e); }
  }

  cambiarCategoria(nombre: string): void {
    this.categoriaActiva = nombre;
    this.refrescar();
  }

  porCategoria(nombre: string): any[] {
    return (this.filas || []).filter(f => this.categoriaDe(f) === nombre);
  }
  menuAsistencia = '';
  filas: FilaResultado[] = [];

  editando = false;
  filaEditando: FilaResultado | null = null;
  editAsistencia = 'PRESENTE';
  editPuntaje: number | null = null;
  editCorrectas: number | null = null;
  editIncorrectas: number | null = null;
  editEnBlanco: number | null = null;
  editObservaciones = '';
  editMostrarHora = false;
  editFechaTexto = '';
  editHoraTexto = '';

  private editFecha: Date | null = null;

  async ngOnInit(): Promise<void> {
    this.nivelActivo = this.normalizar(this.nivel) === 'SECUNDARIA' ? 'SECUNDARIA' : 'PRIMARIA';
    try {
      const cfg: any = await this.configService.obtenerConfiguracion();
      this.evento = String(cfg?.nombreConcurso || '').trim() || 'SOLARISLEE';
      this.edicion = String(cfg?.edicion || '').trim() || String(new Date().getFullYear());
    } catch { this.evento = this.evento || 'SOLARISLEE'; }
    this.refrescar();
    await this.cargar();
  }

  /** Las respuestas de Firebase llegan fuera de la zona de Angular: se fuerza el repintado. */
  private refrescar(): void {
    try { this.cdr.detectChanges(); } catch { /* aún no inicializado */ }
  }

  cambiarNivel(n: string): void {
    this.nivelActivo = n;
    this.refrescar();
  }

  /** Participantes del nivel de la pestaña activa. */
  get filasNivel(): FilaResultado[] {
    return this.filas.filter(f => !this.categoriaActiva || this.categoriaDe(f) === this.categoriaActiva); // por categoría
  }

  /** Participantes de un nivel (para los contadores de las pestañas). */
  porNivel(nivel: string): FilaResultado[] {
    return this.filas.filter(f => this.normalizar(f.nivel) === nivel);
  }

  get filtradas(): FilaResultado[] {
    const t = this.busqueda.trim().toLowerCase();
    const base = [...this.filasNivel].sort((a, b) => {
      const pa = a.puntaje ?? -1, pb = b.puntaje ?? -1;
      if (pb !== pa) return pb - pa;
      return (a.apellidos + ' ' + a.nombres).localeCompare(b.apellidos + ' ' + b.nombres);
    });
    const baseConFiltro = this.aplicarFiltroLeyenda(base);
    if (!t) return baseConFiltro;
    return baseConFiltro.filter(f => (f.apellidos + ' ' + f.nombres + ' ' + f.documento + ' ' + f.ie).toLowerCase().includes(t));
  }

  get sinAsistir(): number { return this.filasNivel.filter(f => f.asistencia === 'NO SE PRESENTÓ').length; }
  get sinPuntaje(): number { return this.filasNivel.filter(f => f.puntaje === null).length; }
  get duplicados(): number {
    const vistos = new Set<string>();
    let dup = 0;
    for (const f of this.filasNivel) {
      const d = (f.documento || '').trim();
      if (!d) continue;
      if (vistos.has(d)) dup++; else vistos.add(d);
    }
    return dup;
  }
  get totalClasificados(): number { return this.filasNivel.filter(f => this.esCompleto(f)).length; }

  esCompleto(f: FilaResultado): boolean {
    return f.asistencia === 'PRESENTE' && !!f.fechaAsistencia && f.puntaje !== null;
  }

  private async cargar(): Promise<void> {
    this.cargando = true;
    this.filas = [];
    this.mensajeCarga = '';
    this.refrescar();
    try {
      const gradoBuscado = this.normalizar(this.grado);
    const nivelBuscado = this.normalizar(this.nivel);

      if (!this.categorias.length) { void this.cargarCategorias(); }
    const mapaCodigos = new Map<string, string>();
      let inscripciones: any[] = [];
      const refIns = collection(this.db, 'inscripciones');
    // Se leen TODAS las inscripciones (no depende de turnoCodigo ni de mayúsculas) y
    // luego los alumnos se filtran localmente por grado.
    try {
      const snapTodas = await getDocs(refIns);
      inscripciones = snapTodas.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn('No se pudieron leer todas las inscripciones:', e);
      inscripciones = [];
    }
    if (!inscripciones.length && this.turnoCodigo) {
      try {
        const snapTurno = await getDocs(query(refIns, where('turnoCodigo', '==', this.turnoCodigo)));
        inscripciones = snapTurno.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) { inscripciones = []; }
    }
    for (const ins of inscripciones) mapaCodigos.set(ins.id, String(ins.codigo || ins.id || '').trim());

      // 1) Intento rápido: estudiantes del turno en UNA consulta
      let crudos: any[] = [];
      if (this.turnoCodigo) {
        try {
          this.mensajeCarga = '(consulta rápida)';
          this.refrescar();
          const cg = await getDocs(query(
            collectionGroup(this.db, 'estudiantes'),
            where('turnoCodigo', '==', this.turnoCodigo)
          ));
          crudos = cg.docs.map(d => ({
            id: d.id,
            inscripcionId: d.ref.parent && d.ref.parent.parent ? d.ref.parent.parent.id : '',
            ...d.data()
          }));
        } catch { crudos = []; }
      }

    // 1b) Consulta por GRADO: trae a TODOS los alumnos de ese grado, aunque su turnoCodigo esté vacío o distinto.
    if (this.grado) {
      try {
        this.mensajeCarga = '(consulta por grado)';
        this.refrescar();
        const gNorm = this.normalizar(this.grado);            // p. ej. TERCERO
        const gCap = gNorm.charAt(0) + gNorm.slice(1).toLowerCase(); // p. ej. Tercero
        for (const variante of [gNorm, gCap]) {
          try {
            const cgGrado = await getDocs(query(
              collectionGroup(this.db, 'estudiantes'),
              where('grado', '==', variante)
            ));
            for (const d of cgGrado.docs) {
              crudos.push({
                id: d.id,
                inscripcionId: d.ref.parent && d.ref.parent.parent ? d.ref.parent.parent.id : '',
                ...d.data()
              });
            }
          } catch (e) { console.warn('No se pudo consultar por grado (' + variante + '):', e); }
        }
      } catch (e) { console.warn('No se pudo consultar por grado:', e); }
    }

      // 2) Respaldo: inscripción por inscripción (en paralelo)
      {
        this.mensajeCarga = 'leyendo ' + inscripciones.length + ' inscripciones...';
        this.refrescar();
        const conEstudiantes = await Promise.all(inscripciones.map(async (ins) => {
          let propios: any[] = [];
          try {
            const sub = await getDocs(collection(doc(this.db, 'inscripciones', ins.id), 'estudiantes'));
            propios = sub.docs.map(d => ({ id: d.id, inscripcionId: ins.id, ...d.data() }));
          } catch { propios = []; }
          if (!propios.length && Array.isArray(ins.estudiantes)) {
            propios = ins.estudiantes.map((e: any) => ({ ...e, inscripcionId: ins.id }));
          }
          return propios;
        }));
        for (const lista of conEstudiantes) crudos.push(...lista);
      }

    // Quitar repetidos: un mismo alumno puede venir de la consulta rápida y del respaldo.
    const vistosCarga = new Set<string>();
    crudos = crudos.filter((e: any) => {
      const k = String(e.inscripcionId || '') + '|' + String(e.codigo || e.id || '');
      if (vistosCarga.has(k)) { return false; }
      vistosCarga.add(k);
      return true;
    });

      for (const est of crudos) {
        const nivelEst = this.normalizar(est.nivel || '');
        const gradoEst = this.normalizar(est.grado || '');
        if (gradoBuscado && gradoEst && gradoEst !== gradoBuscado) continue;
      // Además del grado, se respeta el NIVEL (Cuarto PRIMARIA ≠ Cuarto SECUNDARIA)
      if (nivelBuscado && nivelEst && nivelEst !== nivelBuscado) continue;

        const puntajeRaw = est.PUNTAJE_FINAL ?? est.PUNTAJEFINAL ?? est.puntajeFinal ?? est.puntaje ?? null;
        const puntaje = puntajeRaw === null || puntajeRaw === '' || isNaN(Number(puntajeRaw)) ? null : Number(puntajeRaw);
        const fechaRaw = est.FECHAASISTENCIA ?? est.fechaAsistencia ?? null;
        const fecha = fechaRaw && fechaRaw.toDate ? fechaRaw.toDate() : (fechaRaw ? new Date(fechaRaw) : null);

        // Campos de calificación: se buscan con varios nombres posibles.
        const cCorrectas = this.buscarClave(est, ['CORRECTAS', 'correctas', 'ACIERTOS', 'aciertos', 'BUENAS', 'PUNTAJECORRECTAS']);
        const cIncorrectas = this.buscarClave(est, ['INCORRECTAS', 'incorrectas', 'ERRORES', 'errores', 'MALAS']);
        const cBlanco = this.buscarClave(est, ['ENBLANCO', 'enBlanco', 'BLANCO', 'blanco', 'SINRESPUESTA', 'SIN_RESPUESTA', 'NO_RESPONDIDAS']);

        this.filas.push({
          inscripcionId: est.inscripcionId || '',
          inscripcionCodigo: mapaCodigos.get(est.inscripcionId || '') || String(est.inscripcionCodigo || '').trim(),
          estudianteId: String(est.codigo || est.id || '').trim(),
          documento: String(est.numeroDocumento || '').trim(),
          apellidos: String(est.apellidos || '').trim(),
          nombres: String(est.nombres || '').trim(),
          ie: String((est.colegio && est.colegio.IE) || '').trim(),
          codigoModular: String((est.colegio && est.colegio.CODIGOMODULAR) || '').trim(),
          gestion: String((est.colegio && est.colegio.GESTION) || '').trim(),
      area: String((est.colegio && est.colegio.AREA) || '').trim(),
          grado: String(est.grado || '').trim(),
          nivel: String(est.nivel || '').trim(),
          asistencia: String(est.ASISTENCIA || est.asistencia || '').trim().toUpperCase(),
          fechaAsistencia: fecha,
          puntaje,
          puesto: est.PUESTO ?? null,
          observaciones: String(est.OBSERVACIONES || '').trim(),
          aula: String(est.codigoAula || '').trim(),
          mostrarHora: est.MOSTRARHORA === true,
          correctas: this.aNumero(cCorrectas.encontrada ? est[cCorrectas.clave] : null),
          incorrectas: this.aNumero(cIncorrectas.encontrada ? est[cIncorrectas.clave] : null),
          enBlanco: this.aNumero(cBlanco.encontrada ? est[cBlanco.clave] : null),
          claveCorrectas: cCorrectas.encontrada ? cCorrectas.clave : 'CORRECTAS',
          claveIncorrectas: cIncorrectas.encontrada ? cIncorrectas.clave : 'INCORRECTAS',
          claveBlanco: cBlanco.encontrada ? cBlanco.clave : 'ENBLANCO'
        });
      }
    } catch (error) {
      console.error('Error cargando participantes:', error);
    } finally {
      this.cargando = false;
      this.mensajeCarga = '';
      this.refrescar();
    }
  }

  /** Busca en el documento alguna de las claves candidatas. */
  private buscarClave(obj: any, claves: string[]): { encontrada: boolean; clave: string } {
    for (const c of claves) {
      if (obj && obj[c] !== undefined && obj[c] !== null && obj[c] !== '') return { encontrada: true, clave: c };
    }
    return { encontrada: false, clave: claves[0] };
  }

  private aNumero(v: any): number | null {
    if (v === null || v === undefined || v === '' || isNaN(Number(v))) return null;
    return Number(v);
  }

  private normalizar(v: string): string {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  // ---------------- Menú rápido de asistencia ----------------
  abrirMenuAsistencia(f: FilaResultado): void {
    this.menuAsistencia = this.menuAsistencia === f.estudianteId ? '' : f.estudianteId;
    this.refrescar();
  }

  /** Marca (o borra con '') la asistencia. La fecha/hora se registra en ese momento. */
  async marcar(f: FilaResultado, estado: string): Promise<void> {
    if (this.ocupado) return;
    this.ocupado = true;
    this.menuAsistencia = '';
    this.refrescar();
    try {
      const ref = doc(this.db, 'inscripciones', f.inscripcionId, 'estudiantes', f.estudianteId);
      await updateDoc(ref, {
        ASISTENCIA: estado ? estado : deleteField(),
        FECHAASISTENCIA: estado ? serverTimestamp() : deleteField()
      });
      f.asistencia = estado;
      f.fechaAsistencia = estado ? new Date() : null;
    } catch (error: any) {
      alert('No se pudo guardar la asistencia: ' + (error?.message || ''));
    } finally {
      this.ocupado = false;
      this.refrescar();
    }
  }

  // ---------------- Editar resultado ----------------
  abrirEditar(f: FilaResultado): void {
    this.filaEditando = f;
    this.editAsistencia = f.asistencia === 'NO SE PRESENTÓ' ? 'NO SE PRESENTÓ' : (f.asistencia === 'PRESENTE' ? 'PRESENTE' : '');
    this.editPuntaje = f.puntaje;
    this.editCorrectas = f.correctas;
    this.editIncorrectas = f.incorrectas;
    this.editEnBlanco = f.enBlanco;
    this.editObservaciones = f.observaciones;
    this.editMostrarHora = f.mostrarHora;
    const d = f.fechaAsistencia ? new Date(f.fechaAsistencia) : new Date();
    this.editFecha = d;
    this.editFechaTexto = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    this.editHoraTexto = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    this.editando = true;
    this.refrescar();
  }

  cancelarEdicion(): void {
    this.editando = false;
    this.filaEditando = null;
    this.refrescar();
  }

  async guardarEdicion(): Promise<void> {
    const f = this.filaEditando;
    if (!f || this.ocupado) return;
    this.ocupado = true;
    this.refrescar();
    try {
      const ref = doc(this.db, 'inscripciones', f.inscripcionId, 'estudiantes', f.estudianteId);

      // Fecha y hora: se respeta lo que hay en el formulario (lo que registró el
      // escáner móvil, o lo que el operador escriba).
      const fechaHora = new Date(this.editFecha || new Date());
      const partesFecha = String(this.editFechaTexto || '').split('-').map(Number);
      const partesHora = String(this.editHoraTexto || '').split(':').map(Number);
      if (partesFecha[0] && partesFecha[1] && partesFecha[2]) {
        fechaHora.setFullYear(partesFecha[0], partesFecha[1] - 1, partesFecha[2]);
      }
      if (Number.isFinite(partesHora[0]) && Number.isFinite(partesHora[1])) {
        fechaHora.setHours(partesHora[0], partesHora[1], 0, 0);
      }

      const observaciones = String(this.editObservaciones || '').trim();
      const cambios: any = {
        ASISTENCIA: this.editAsistencia ? this.editAsistencia : deleteField(),
        FECHAASISTENCIA: this.editAsistencia ? Timestamp.fromDate(fechaHora) : deleteField(),
        MOSTRARHORA: this.editMostrarHora,
        OBSERVACIONES: observaciones
      };

      // Puntaje: se guardan las dos formas (PUNTAJE_FINAL la lee el portal).
      if (this.editPuntaje === null || this.editPuntaje === undefined || isNaN(Number(this.editPuntaje))) {
        cambios.PUNTAJE_FINAL = deleteField();
        cambios.PUNTAJEFINAL = deleteField();
      } else {
        cambios.PUNTAJE_FINAL = Number(this.editPuntaje);
        cambios.PUNTAJEFINAL = Number(this.editPuntaje);
      }

      // Calificación (correctas / incorrectas / en blanco) con el MISMO nombre
      // con el que vino el dato (o el estándar si aún no existía).
      cambios[f.claveCorrectas] = this.editCorrectas === null || this.editCorrectas === undefined ? deleteField() : Number(this.editCorrectas);
      cambios[f.claveIncorrectas] = this.editIncorrectas === null || this.editIncorrectas === undefined ? deleteField() : Number(this.editIncorrectas);
      cambios[f.claveBlanco] = this.editEnBlanco === null || this.editEnBlanco === undefined ? deleteField() : Number(this.editEnBlanco);

      await updateDoc(ref, cambios);

      f.asistencia = this.editAsistencia;
      f.fechaAsistencia = this.editAsistencia ? fechaHora : null;
      f.puntaje = this.editPuntaje === null || this.editPuntaje === undefined ? null : Number(this.editPuntaje);
      f.correctas = this.editCorrectas;
      f.incorrectas = this.editIncorrectas;
      f.enBlanco = this.editEnBlanco;
      f.observaciones = observaciones;
      f.mostrarHora = this.editMostrarHora;
      this.editando = false;
      this.filaEditando = null;
    } catch (error: any) {
      alert('No se pudo guardar el resultado: ' + (error?.message || ''));
    } finally {
      this.ocupado = false;
      this.refrescar();
    }
  }

  /** Guarda los puestos de los clasificados del nivel activo. */
  async guardarPuestos(): Promise<void> {
    if (this.ocupado) return;
    if (!confirm('¿Está seguro de guardar los puestos en los participantes?\nLos puestos guardados anteriormente serán actualizados.')) return;

    this.ocupado = true;
    this.refrescar();
    try {
      const clasificados = this.filasNivel.filter(f => this.esCompleto(f))
        .sort((a, b) => (b.puntaje !== null ? b.puntaje : 0) - (a.puntaje !== null ? a.puntaje : 0));
      let puesto = 0;
      for (const f of clasificados) {
        puesto++;
        f.puesto = puesto;
        const ref = doc(this.db, 'inscripciones', f.inscripcionId, 'estudiantes', f.estudianteId);
        await updateDoc(ref, { PUESTO: puesto, CATEGORIA: this.categoriaActiva, MOSTRARHORA: true, FECHAPROCESAMIENTOPUESTOS: serverTimestamp() });
      }
      alert('Puestos guardados: ' + puesto + ' clasificado(s) en la categoría ' + (this.categoriaActiva || '') + '.');
    } catch (error: any) {
      alert('No se pudieron guardar los puestos: ' + (error?.message || ''));
    } finally {
      this.ocupado = false;
      this.refrescar();
    }
  }

  /** Excel con una hoja por nivel (PRIMARIA / SECUNDARIA). */
  async descargarExcel(): Promise<void> {
    if (this.ocupado) return;
    this.ocupado = true;
    this.refrescar();
    try {
      const XLSX: any = await import('xlsx');
      const orden = (n: string) => this.normalizar(n) === 'SECUNDARIA' ? 1 : 0;
      const lista = [...this.filas].sort((a, b) =>
        orden(a.nivel) - orden(b.nivel) || ((a.puesto === null ? 9999 : a.puesto) - (b.puesto === null ? 9999 : b.puesto)));

      const armar = (categoria: string) => this.filas.filter(f => this.categoriaDe(f) === categoria).map(f => ({
        PUESTO: f.puesto === null ? '' : f.puesto,
        CODIGO: f.inscripcionCodigo + '-' + f.estudianteId,
        APELLIDOS: f.apellidos,
        NOMBRES: f.nombres,
        DNI: f.documento,
        AULA: f.aula,
        IE: f.ie,
        CODIGOMODULAR: f.codigoModular,
        GESTION: f.gestion,
        GRADO: f.grado,
        NIVEL: f.nivel,
        PUNTAJE: f.puntaje === null ? '' : f.puntaje,
        CORRECTAS: f.correctas === null ? '' : f.correctas,
        INCORRECTAS: f.incorrectas === null ? '' : f.incorrectas,
        ENBLANCO: f.enBlanco === null ? '' : f.enBlanco,
        ASISTENCIA: f.asistencia,
        MOSTRARHORA: f.mostrarHora ? 'SI' : 'NO',
        OBSERVACIONES: f.observaciones,
        FECHA: f.fechaAsistencia ? new Date(f.fechaAsistencia).toLocaleString('es-PE') : ''
      }));

      const wb = XLSX.utils.book_new();
    // Una hoja por CATEGORÍA (INTERNA, PRIVADA, PUBLICA RURAL, PUBLICA URBANA...)
    const catsXls: any[] = this.categoriasVisibles.length
      ? this.categoriasVisibles
      : [{ nombre: 'PRIMARIA' }, { nombre: 'SECUNDARIA' }];
    for (const catXls of catsXls) {
      const nombreCat = String(catXls?.nombre || '').substring(0, 31) || 'CATEGORIA';
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(armar(String(catXls?.nombre || ''))), nombreCat);
    }
      const nombre = ('Resultados_' + this.grado + (this.sede ? '_' + this.sede : '') + '.xlsx').replace(/\s+/g, '_');
      XLSX.writeFile(wb, nombre);
    } catch (error: any) {
      alert('No se pudo generar el Excel: ' + (error?.message || ''));
    } finally {
      this.ocupado = false;
      this.refrescar();
    }
  }
}
