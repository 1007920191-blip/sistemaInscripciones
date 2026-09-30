import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type AvisoTipo = 'error' | 'alerta' | 'info';

/**
 * Aviso con el diseño del sistema (reemplaza los alert() del navegador).
 * - Un solo botón cuando es informativo.
 * - Dos botones (Aceptar / Cancelar) cuando se necesita confirmar.
 */
@Component({
  selector: 'app-aviso-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="aviso-overlay" *ngIf="visible" (click)="cancelar.emit()">
      <div class="aviso-card" [class.aviso-error]="tipo === 'error'" [class.aviso-alerta]="tipo === 'alerta'"
           [class.aviso-info]="tipo === 'info'" (click)="$event.stopPropagation()">
        <div class="aviso-cabecera">
          <span class="aviso-icono" aria-hidden="true">{{ tipo === 'error' ? '⛔' : (tipo === 'alerta' ? '⚠️' : 'ℹ️') }}</span>
          <h3>{{ titulo }}</h3>
        </div>
        <p class="aviso-mensaje" *ngIf="mensaje">{{ mensaje }}</p>
        <ul class="aviso-detalles" *ngIf="detalles.length">
          <li *ngFor="let d of detalles">{{ d }}</li>
        </ul>
        <div class="aviso-acciones">
          <button type="button" class="aviso-btn-aceptar" (click)="aceptar.emit()">{{ textoAceptar }}</button>
          <button type="button" class="aviso-btn-cancelar" *ngIf="textoCancelar" (click)="cancelar.emit()">{{ textoCancelar }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .aviso-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
    }
    .aviso-card {
      background: #fff;
      border-radius: 14px;
      width: 100%;
      max-width: 520px;
      box-shadow: 0 24px 60px rgba(2, 12, 27, 0.35);
      overflow: hidden;
      border-top: 5px solid #005cbf;
      animation: aviso-entrar 0.15s ease-out;
    }
    .aviso-card.aviso-error { border-top-color: #dc2626; }
    .aviso-card.aviso-alerta { border-top-color: #d97706; }
    .aviso-card.aviso-info { border-top-color: #005cbf; }
    @keyframes aviso-entrar { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .aviso-cabecera {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px 20px 8px;
    }
    .aviso-icono { font-size: 1.35rem; line-height: 1; }
    .aviso-cabecera h3 { margin: 0; font-size: 1.05rem; color: #0f172a; }
    .aviso-mensaje {
      margin: 0 20px 6px;
      color: #334155;
      font-size: 0.92rem;
      line-height: 1.45;
    }
    .aviso-detalles {
      margin: 6px 20px 0;
      padding: 10px 14px 10px 30px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      max-height: 210px;
      overflow-y: auto;
      color: #1e293b;
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .aviso-detalles li { margin: 2px 0; }
    .aviso-acciones {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 20px;
    }
    .aviso-btn-aceptar {
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 8px;
      min-width: 120px;
      padding: 10px 18px;
      font-weight: 700;
      font-size: 0.92rem;
      cursor: pointer;
    }
    .aviso-btn-aceptar:hover { background: #1d4ed8; }
    .aviso-btn-cancelar {
      background: #e5e7eb;
      color: #374151;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      min-width: 120px;
      padding: 10px 18px;
      font-weight: 700;
      font-size: 0.92rem;
      cursor: pointer;
    }
    .aviso-btn-cancelar:hover { background: #d7dbe2; }
  `]
})
export class AvisoModalComponent {
  @Input() visible = false;
  @Input() tipo: AvisoTipo = 'info';
  @Input() titulo = '';
  @Input() mensaje = '';
  @Input() detalles: string[] = [];
  @Input() textoAceptar = 'Entendido';
  @Input() textoCancelar = '';
  @Output() aceptar = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();
}
