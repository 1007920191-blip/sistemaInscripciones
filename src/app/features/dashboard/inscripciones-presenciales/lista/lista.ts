import { Component, OnInit, Output, EventEmitter, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import { NuevaInscripcion } from '../nueva-inscripcion/nueva-inscripcion';
import { InscripcionService } from '../../../../services/inscripcion';
import { ConfiguracionService } from '../../../../services/configuracion';
import { ReciboService } from '../../../../services/recibo.service';
import { ImpresionService } from '../../../../services/impresion';
import { Inscripcion, Estudiante } from '../../../../models/inscripcion.model';
import { Configuracion } from '../../../../models/configuracion.model';
import { AulaTurnoDisplay, Turno } from '../../../../models/turno.model';
import { getAuth } from 'firebase/auth';
import { BehaviorSubject } from 'rxjs';
import { getFirestore, doc as firestoreDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { firebaseApp } from '../../../../firebase-config';

@Component({
  selector: 'app-lista-presenciales',
  standalone: true,
  imports: [CommonModule, NuevaInscripcion, FormsModule],
  templateUrl: './lista.html',
  styleUrls: ['./lista.css']
})
export class Lista implements OnInit {
  mostrarNuevaInscripcion = false;
  inscripciones: Inscripcion[] = [];
  cargando$ = new BehaviorSubject<boolean>(true);
  
  inscripcionEditar: Inscripcion | null = null;
  estudiantesEditar: Estudiante[] = [];
  
  // Modal Lista
  mostrarModalLista = false;
  inscripcionParaLista: Inscripcion | null = null;
  estudiantesParaLista: Estudiante[] = [];
  cargandoLista = false;

  // Filtros y BÃºsqueda
  fechaSeleccionada: string = this.obtenerFechaHoyTexto();
  terminoBusqueda = '';

  // SelecciÃ³n de estudiantes
  estudiantesSeleccionados: Set<string> = new Set();

  // Modal de ImpresiÃ³n â€” compartido individual/grupal
  mostrarModalImpresionIndividual = false;
  tipoImpresionIndividual: 'TARJETA' | 'CARTILLA' = 'TARJETA';
  alternativasImpresionIndividual: number = 4;
  estudianteParaImpresion: Estudiante | null = null;
  estudiantesParaImpresionGrupal: Estudiante[] = []; // usado en modo grupal
  modoImpresionGrupal = false;
  cargandoImpresion = false;
  
  // PaginaciÃ³n
  itemsPorPagina = this.obtenerItemsPorPagina();
  paginaActual = 1;
  Math = Math;
  
  estudiantesImportados: Estudiante[] = [];

  // Eliminar individual
  mostrarModalEliminar = false;
  estudianteAEliminar: Estudiante | null = null;
  eliminando = false;

  configuracion: Configuracion | null = null;

  @Output() volver = new EventEmitter<void>();
  @Output() inscripcionGuardada = new EventEmitter<void>();

  constructor(
    private inscripcionService: InscripcionService,
    private configuracionService: ConfiguracionService,
    private impresionService: ImpresionService,
    private reciboService: ReciboService,
    private ngZone: NgZone
  ) {}

  obtenerFechaHoyTexto(): string {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  async ngOnInit() {
    this.cargando$.next(true);
    try { this.configuracion = await this.configuracionService.obtenerConfiguracion(); } catch (e) { console.error('Error cargando configuracion', e); }
    await this.cargarInscripciones();
    this.cargando$.next(false);
  }

  async cargarInscripciones() {
    this.cargando$.next(true);
    try {
      const auth = getAuth(firebaseApp);
      const uidActual = (auth.currentUser?.email || auth.currentUser?.uid || '').toLowerCase().trim();
      const tieneBusqueda = !!this.terminoBusqueda.trim();

      // BÃºsqueda global (sin fecha) vs BÃºsqueda por fecha exacta
      // - Si hay bÃºsqueda: ignoramos fecha en Firestore (ignorarFecha = true).
      // - Si no hay bÃºsqueda: filtramos por fecha (ignorarFecha = false).
      let rawDocs: Inscripcion[] = await this.inscripcionService.obtenerInscripcionesFiltradas(
        this.fechaSeleccionada,
        uidActual,
        tieneBusqueda
      );

      console.log('=== LOGS DETALLADOS DE BÃšSQUEDA Y FILTROS ===');
      console.log('UsuarioId autenticado actual:', uidActual);
      console.log('Fecha seleccionada en interfaz:', this.fechaSeleccionada);
      console.log('Â¿Existe tÃ©rmino de bÃºsqueda?:', tieneBusqueda ? `SÃ­ ("${this.terminoBusqueda}")` : 'No');
      console.log('Â¿Buscador trabaja sobre la colecciÃ³n completa permitida?:', tieneBusqueda ? 'SÃ (ColecciÃ³n completa filtrada Ãºnicamente por usuarioId si no es modo histÃ³rico)' : 'NO (Solo sobre los registros de la fecha seleccionada)');
      console.log('1. Cantidad de registros cargados desde Firestore:', rawDocs.length);

      // Excluir inscripciones online del listado presencial
      const sinOnline = rawDocs.filter(ins => (ins as any).origen !== 'online');
      if (sinOnline.length !== rawDocs.length) {
        console.log(`1b. Excluidas ${rawDocs.length - sinOnline.length} inscripciones online`);
      }
      rawDocs = sinOnline;

      // Imprimir la estructura de los primeros documentos para ver sus campos raÃ­z (diagnÃ³stico)
      if (rawDocs.length > 0) {
        console.log('Estructura muestra del primer documento:', JSON.stringify(rawDocs[0]));
        console.log('Campos raÃ­z del primer documento:', Object.keys(rawDocs[0]));
      }

      let despuesFecha = [...rawDocs];

      // Filtro de usuario ya aplicado en Firestore (where usuarioId == uidActual)

      // Filtro de bÃºsqueda por texto
      let resultado = [...despuesFecha];
      let descartadosBusqueda = 0;
      if (tieneBusqueda) {
        resultado = this.inscripcionService.filtrarInscripcionesLocal(despuesFecha, this.terminoBusqueda);
        descartadosBusqueda = despuesFecha.length - resultado.length;
      }
      console.log('6. Cantidad de registros descartados por bÃºsqueda de texto:', descartadosBusqueda);
      console.log('7. Cantidad de registros finales en la lista:', resultado.length);
      console.log('============================================');

      this.inscripciones = resultado;
      this.paginaActual = 1;
    } catch (error) {
      console.error('Error al cargar inscripciones:', error);
      this.inscripciones = [];
    } finally {
      this.cargando$.next(false);
    }
  }

  async onFiltrar() {
    await this.cargarInscripciones();
  }

  async limpiarBusqueda() {
    this.terminoBusqueda = '';
    await this.cargarInscripciones();
  }

  // Guardar en localStorage
  private guardarItemsPorPagina() {
    localStorage.setItem('inscripciones_itemsPorPagina', this.itemsPorPagina.toString());
  }

  // Obtener de localStorage
  private obtenerItemsPorPagina(): number {
    const guardado = localStorage.getItem('inscripciones_itemsPorPagina');
    return guardado ? parseInt(guardado) : 5;
  }

  // Getters para paginaciÃ³n
  get totalItems(): number {
    return this.inscripciones.length;
  }

  get totalPaginas(): number {
    return Math.ceil(this.totalItems / this.itemsPorPagina) || 1;
  }

  get inscripcionesPaginadas(): Inscripcion[] {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    const fin = inicio + this.itemsPorPagina;
    return this.inscripciones.slice(inicio, fin);
  }

  // NÃºmero correlativo considerando paginaciÃ³n
  getNumeroCorrelativo(index: number): number {
    return (this.paginaActual - 1) * this.itemsPorPagina + index + 1;
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
    this.guardarItemsPorPagina();
    this.paginaActual = 1;
  }

  formatearFecha(fecha: any): string {
    if (!fecha) return '';
    const date = new Date(fecha);
    return date.toLocaleString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  formatearFechaPDF(fecha: any): string {
    if (!fecha) return '';
    const date = new Date(fecha);
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  // ============================================
  // BOTÃ“N LISTA - Abrir Modal
  // ============================================
  async verLista(ins: Inscripcion) {
    console.log('Abriendo lista para inscripciÃ³n:', ins.id);
    this.cargandoLista = true;
    this.inscripcionParaLista = ins;
    this.mostrarModalLista = true;
    this.estudiantesSeleccionados.clear();
    
    try {
      this.estudiantesParaLista = await this.inscripcionService.obtenerEstudiantes(ins.id!);
      if (!this.estudiantesParaLista || this.estudiantesParaLista.length === 0) {
        this.estudiantesParaLista = ins.estudiantes || [];
      }
      const seenL = new Set<string>();
      const dedupL: any[] = [];
      for (const est of this.estudiantesParaLista) {
        const k = `${String((est as any).numeroDocumento||'').trim().replace(/\D/g,'')}|${String((est as any).nombres||'').trim().toUpperCase()}|${String((est as any).apellidos||'').trim().toUpperCase()}`;
        if (k === '||') { dedupL.push(est); continue; }
        if (!seenL.has(k)) { seenL.add(k); dedupL.push(est); }
      }
      this.estudiantesParaLista = dedupL;
    } catch (error) {
      console.error('Error obteniendo estudiantes:', error);
      this.estudiantesParaLista = ins.estudiantes || [];
    } finally {
      this.cargandoLista = false;
    }
  }

  cerrarModalLista() {
    this.mostrarModalLista = false;
    this.inscripcionParaLista = null;
    this.estudiantesParaLista = [];
    this.estudiantesSeleccionados.clear();
  }

  private asignacionParaEstudiante(estudiante: Estudiante): any {
    const codigo = String((estudiante as any).codigo || (estudiante as any).id || '');
    const indice = codigo
      ? this.estudiantesParaLista.findIndex((e: any) => String(e.codigo || e.id || '') === codigo)
      : this.estudiantesParaLista.indexOf(estudiante);
    return this.inscripcionParaLista?.asignacionesAula?.find((a: any) => a.estudianteIndex === indice);
  }

  // Controles de SelecciÃ³n para Checkboxes
  toggleSeleccionarEstudiante(dni: string) {
    if (this.estudiantesSeleccionados.has(dni)) {
      this.estudiantesSeleccionados.delete(dni);
    } else {
      this.estudiantesSeleccionados.add(dni);
    }
  }

  toggleSeleccionarTodos() {
    const todosSeleccionados = this.esTodosSeleccionados();
    if (todosSeleccionados) {
      this.estudiantesSeleccionados.clear();
    } else {
      this.estudiantesParaLista.forEach(est => {
        if (est.numeroDocumento) {
          this.estudiantesSeleccionados.add(est.numeroDocumento);
        }
      });
    }
  }

  esTodosSeleccionados(): boolean {
    if (this.estudiantesParaLista.length === 0) return false;
    return this.estudiantesParaLista.every(est => est.numeroDocumento && this.estudiantesSeleccionados.has(est.numeroDocumento));
  }

  esEstudianteSeleccionado(dni: string): boolean {
    return this.estudiantesSeleccionados.has(dni);
  }

  // ============================================
  // GENERAR PDF DE ESTUDIANTES (Formato Lista Tradicional)
  // ============================================
  async descargarPDF() {
    if (!this.inscripcionParaLista || this.estudiantesParaLista.length === 0) {
      alert('No hay datos para generar el PDF');
      return;
    }
    const ins: any = this.inscripcionParaLista;
    const estudiantes: any[] = [...this.estudiantesParaLista].sort((a: any, b: any) => {
      const na = `${a.apellidos || ''} ${a.nombres || ''}`.toLowerCase();
      const nb = `${b.apellidos || ''} ${b.nombres || ''}`.toLowerCase();
      return na.localeCompare(nb);
    });
    let config: any = null;
    try { config = await this.configuracionService.obtenerConfiguracion(); } catch {}
    const nombreConcurso = config?.nombreConcurso || 'IV CONCURSO PROVINCIAL DE COMPRENSION LECTORA';
    const edicion = config?.edicion || '2026';
    const eslogan = config?.eslogan || '"Ã‘AWINCHASUN ALLIN KAWSANAPAQ"';
    const sedeCfg = config?.sede || 'ANDAHUAYLAS';
    const [logoIzq, logoDer] = await Promise.all([
      this.cargarImagenBase64(config?.logoIzquierdo || ''),
      this.cargarImagenBase64(config?.logoDerecho || '')
    ]);
    const codigo = (ins as any).codigo || ins.id || 'N/A';
    const colegioIE = ins.colegio?.IE || 'N/A';
    const colegioNombre = ins.colegio?.IE || ins.colegio?.nombre || colegioIE;
    const fechaStr = this.formatearFechaPDF(ins.fechaInscripcion);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const drawHeader = () => {
      if (logoIzq) { try { doc.addImage(logoIzq, 'PNG', 15, 10, 18, 18); } catch {} }
      if (logoDer) { try { doc.addImage(logoDer, 'PNG', pageWidth - 33, 10, 18, 18); } catch {} }
      doc.setTextColor(33, 37, 41);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(String(nombreConcurso).toUpperCase(), pageWidth / 2, 16, { align: 'center' });
      doc.setFontSize(8);
      const sloganLine = eslogan ? `${eslogan} - ${edicion}` : `${edicion}`;
      doc.text(String(sloganLine).toUpperCase(), pageWidth / 2, 21, { align: 'center' });
      const sedeTxt = `SEDE: ${sedeCfg}`.toUpperCase();
      doc.text(sedeTxt, pageWidth / 2, 26, { align: 'center' });
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('LISTA DE INSCRITOS', pageWidth / 2, 34, { align: 'center' });
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setFont('Helvetica', 'bold');
      doc.text(`CÃ“DIGO: ${codigo}`, 15, 42);
      doc.setFont('Helvetica', 'normal');
      doc.text(`COLEGIO: ${String(colegioNombre).toUpperCase().substring(0, 32)}`, 55, 42);
      doc.text(`FECHA: ${fechaStr}`, 170, 42);
      doc.text(`TOTAL: ${estudiantes.length}`, 250, 42);
      doc.setFillColor(240, 240, 240);
      doc.rect(15, 46, pageWidth - 30, 8, 'F');
      doc.setDrawColor(0, 0, 0);
      doc.rect(15, 46, pageWidth - 30, 8, 'S');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0);
      doc.text('NÂ°', 17, 51);
      doc.text('DNI', 28, 51);
      doc.text('APELLIDOS Y NOMBRES', 52, 51);
      doc.text('GRADO', 137, 51);
      doc.text('NIVEL', 162, 51);
      doc.text('IE', 187, 51);
      doc.text('TURNO', 239, 51);
      doc.text('AULA', 262, 51);
    };
    const rowHeight = 7;
    let currentY = 54;
    drawHeader();
    const indexMap = new Map<string, number>();
    (this.inscripcionParaLista.estudiantes as any[])?.forEach((e: any, i: number) => { if (e.numeroDocumento) indexMap.set(String(e.numeroDocumento), i); });
    estudiantes.forEach((est: any, orderIdx: number) => {
      const originalIdx = est.numeroDocumento && indexMap.has(String(est.numeroDocumento)) ? indexMap.get(String(est.numeroDocumento))! : orderIdx;
      if (currentY > 185) { doc.addPage(); currentY = 54; drawHeader(); }
      const dni = est.numeroDocumento || 'â€”';
      const nombres = `${est.apellidos || ''} ${est.nombres || ''}`.trim().toUpperCase().substring(0, 40);
      const grado = String(est.grado || 'â€”').toUpperCase();
      const nivel = String(est.nivel || 'â€”').toUpperCase();
      const ie = String(colegioIE).toUpperCase().substring(0, 26);
      const asig = (ins as any).asignacionesAula?.find((a: any) => a.estudianteIndex === originalIdx);
      const aula = asig?.codigoAula || (est as any).codigoAula || 'â€”';
      const turnoEst = asig?.turnoCodigo || (est as any).turnoCodigo || 'â€”';
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0);
      doc.rect(15, currentY, pageWidth - 30, rowHeight, 'S');
      doc.line(26, currentY, 26, currentY + rowHeight);
      doc.line(50, currentY, 50, currentY + rowHeight);
      doc.line(135, currentY, 135, currentY + rowHeight);
      doc.line(160, currentY, 160, currentY + rowHeight);
      doc.line(185, currentY, 185, currentY + rowHeight);
      doc.line(235, currentY, 235, currentY + rowHeight);
      doc.line(255, currentY, 255, currentY + rowHeight);
      doc.text(String(orderIdx + 1), 17, currentY + 4.5);
      doc.text(dni, 28, currentY + 4.5);
      doc.text(nombres, 52, currentY + 4.5);
      doc.text(grado.substring(0, 10), 137, currentY + 4.5);
      doc.text(nivel.substring(0, 10), 162, currentY + 4.5);
      doc.text(ie.substring(0, 24), 187, currentY + 4.5);
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(0, 90, 180);
      doc.text(String(turnoEst).toUpperCase(), 239, currentY + 4.5, { align: 'center' } as any);
      if (aula !== 'â€”') doc.setTextColor(13, 71, 161); else doc.setTextColor(80, 80, 80);
      doc.text(String(aula).toUpperCase(), 262, currentY + 4.5, { align: 'center' } as any);
      doc.setTextColor(0, 0, 0);
      currentY += rowHeight;
    });
    const totalPages = (doc as any).getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) { (doc as any).setPage(i); doc.setFont('Helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 100, 100); doc.text(`PÃ¡gina ${i} de ${totalPages}`, pageWidth - 15, pageHeight - 8, { align: 'right' }); }
    const safeColegio = String(colegioNombre).replace(/\s+/g, '_');
    doc.save(`Lista_${safeColegio}_${fechaStr.replace(/\//g, '-')}.pdf`);
  }

  // ============================================
  // GENERACIÃ“N DE CREDENCIALES PDF (Media Hoja A4, MÃ¡x 4 por pÃ¡g, 1 sola columna)
  // ============================================
  async generarCredencialesPDF(estudiantesAImprimir: Estudiante[]) {
    if (!estudiantesAImprimir || estudiantesAImprimir.length === 0) {
      alert('Por favor, seleccione al menos un estudiante para generar las credenciales.');
      return;
    }

    // 0. Validaciones Obligatorias
    const datosFaltantes = estudiantesAImprimir.some(est => {
      const asignacion = this.asignacionParaEstudiante(est);
      return !(asignacion?.codigoAula || (est as any).codigoAula)
        || !(asignacion?.turnoCodigo || (est as any).turnoCodigo)
        || !est.grado || !est.nivel;
    });

    if (datosFaltantes) {
      alert('Error: No se puede generar la credencial. Verifique que todos los estudiantes seleccionados tengan Aula, Turno, Grado y Nivel asignados y guardados en el sistema.');
      return;
    }

    this.cargandoLista = true;
    try {
      // 0.5 Obtener InformaciÃ³n de Turno y Aulas desde Firestore por cada estudiante
      const db = getFirestore(firebaseApp);
      const aulaCache = new Map<string, any>();
      const turnoCache = new Map<string, any>();

      for (const est of estudiantesAImprimir) {
        const asignacion = this.asignacionParaEstudiante(est);
        
        const aulaId = asignacion?.aulaId || (est as any).aulaAsignadaId;
        const turnoCodigo = asignacion?.turnoCodigo || (est as any).turnoCodigo;
        if (aulaId || turnoCodigo) {
          if (aulaId && !aulaCache.has(aulaId)) {
            const aulaRef = firestoreDoc(db, 'turnosedicion', aulaId);
            const aulaSnap = await getDoc(aulaRef);
            if (aulaSnap.exists()) {
              aulaCache.set(aulaId, aulaSnap.data());
            }
          }
          if (turnoCodigo && !turnoCache.has(turnoCodigo)) {
            const turnosRef = collection(db, 'turnos');
            const qTurno = query(turnosRef, where('codigo', '==', turnoCodigo));
            const snapTurno = await getDocs(qTurno);
            if (!snapTurno.empty) {
              turnoCache.set(turnoCodigo, snapTurno.docs[0].data());
            }
          }
        }
      }

      // 1. Obtener configuraciÃ³n general del sistema
      let config: any = null;
      try {
        config = await this.configuracionService.obtenerConfiguracion();
      } catch {
        // Config no disponible â€” se usarÃ¡n fallbacks vectoriales
      }
      const nombreConcurso = config?.nombreConcurso || 'Concurso Nacional de MatemÃ¡tica';
      const edicion = config?.edicion || new Date().getFullYear().toString();
      const eslogan = config?.eslogan || 'EdiciÃ³n Especial';
      
      // 2. Cargar imÃ¡genes
      const [logoIzquierdoB64, logoDerechoB64, fondoCredencialB64] = await Promise.all([
        this.cargarImagenBase64(config?.logoIzquierdo || ''),
        this.cargarImagenBase64(config?.logoDerecho || ''),
        this.cargarImagenBase64(config?.fondoCredencial || '')
      ]);

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [105, 297] });
      const stripWidth = 95;
      const stripHeight = 72.5;
      const spacing = 1.6;
      const startY = 2.5;
      const startX = 5;

      const totalEstudiantes = estudiantesAImprimir.length;
      
      for (let index = 0; index < totalEstudiantes; index++) {
        const est = estudiantesAImprimir[index];
        const posEnPagina = index % 4;
        
        // PaginaciÃ³n automÃ¡tica tras 4 credenciales
        if (index > 0 && posEnPagina === 0) {
          doc.addPage();
        }

        const x = startX; // Una sola columna
        const y = startY + posEnPagina * (stripHeight + spacing);

        const asignacion = this.asignacionParaEstudiante(est);
        
        const aulaAsignadaId = asignacion?.aulaId || est.aulaAsignadaId;
        const codigoAulaEst = asignacion?.codigoAula || est.codigoAula || 'PEND';
        const turnoCodigoEst = asignacion?.turnoCodigo || est.turnoCodigo || 'Tâ€”';

        const aulaInfo = aulaAsignadaId ? aulaCache.get(aulaAsignadaId) : null;
        const turnoInfo = turnoCodigoEst !== 'Tâ€”' ? turnoCache.get(turnoCodigoEst) : null;

        const sedeVal = aulaInfo?.local || aulaInfo?.sede || 'â€”';
        const pabellonVal = aulaInfo?.pabellon || 'â€”';
        const pisoVal = aulaInfo?.piso || 'â€”';
        const puertaVal = aulaInfo?.puertaAcceso || 'â€”';
        
        const fmtHora = (v:any): string => {
          if (!v) return 'â€”';
          if (typeof v === 'string') { const m=v.match(/^(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2,'0')}:${m[2]}` : v.slice(0,5); }
          let d: Date | null = null;
          if (v?.toDate) d = v.toDate();
          else if (v?.seconds != null) d = new Date(v.seconds*1000 + Math.floor((v.nanoseconds||0)/1e6));
          else if (v instanceof Date) d = v;
          else return String(v).slice(0,5);
          if (!d || isNaN(d.getTime())) return 'â€”';
          return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        };
        const hIniEnt = turnoInfo?.horaInicioEntrada ? fmtHora(turnoInfo.horaInicioEntrada) : 'â€”';
        const hFinEnt = turnoInfo?.horaFinEntrada ? fmtHora(turnoInfo.horaFinEntrada) : 'â€”';
        const hIniPru = turnoInfo?.horaInicioPrueba ? fmtHora(turnoInfo.horaInicioPrueba) : 'â€”';
        const hFinPru = turnoInfo?.horaFinPrueba ? fmtHora(turnoInfo.horaFinPrueba) : 'â€”';
        const ingresoStr = (hIniEnt !== 'â€”' && hFinEnt !== 'â€”') ? `${hIniEnt} - ${hFinEnt}` : (hIniEnt !== 'â€”' ? hIniEnt : 'â€”');
        const examenStr = (hIniPru !== 'â€”' && hFinPru !== 'â€”') ? `${hIniPru} - ${hFinPru}` : (hIniPru !== 'â€”' ? hIniPru : 'â€”');
        
        // Siempre usar inscripcion.colegio como fuente maestra (se sincroniza al guardar)
        const colInfo = this.inscripcionParaLista?.colegio || est.colegio;
        const gestionVal = colInfo?.GESTION || 'â€”';
        const areaVal = colInfo?.AREA || 'â€”';

        const azul = [0, 51, 102] as any;
        const azulClaro = [14, 99, 180] as any;
        const gris = [100, 100, 100] as any;
        const negro = [20, 20, 20] as any;
        const linea = [210, 210, 210] as any;
        const codPago = (this.inscripcionParaLista as any)?.codigo || this.inscripcionParaLista?.id || 'â€”';
        const codEst = (est as any).codigo || (est as any).id || 'â€”';
        const codigoUnido = `${codPago}-${codEst}`;
        const colNombre = (colInfo?.IE || 'N/A').toUpperCase();
        const codModular = colInfo?.CODIGOMODULAR || 'â€”';
        const ieLugar = aulaInfo?.local || colInfo?.DISTRITO || sedeVal;
        const fechaVal = '22-08-2026';
        const fechaTurno: any = turnoInfo?.fecha;
        const f = fechaTurno?.toDate ? fechaTurno.toDate() : fechaTurno ? new Date(fechaTurno) : null;
        const fechaStr = f ? `${String(f.getDate()).padStart(2,'0')}-${String(f.getMonth()+1).padStart(2,'0')}-${f.getFullYear()}` : fechaVal;

        if (fondoCredencialB64) {
          try { doc.addImage(fondoCredencialB64, 'JPEG', x, y, stripWidth, stripHeight, undefined, 'FAST'); } catch {
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(azul[0], azul[1], azul[2]);
            doc.setLineWidth(0.42);
            doc.roundedRect(x, y, stripWidth, stripHeight, 2, 2, 'FD');
          }
        } else {
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(azul[0], azul[1], azul[2]);
          doc.setLineWidth(0.42);
          doc.roundedRect(x, y, stripWidth, stripHeight, 2, 2, 'FD');
        }
        doc.setDrawColor(linea[0], linea[1], linea[2]);
        doc.setLineWidth(0.25);
        doc.setLineDashPattern([1.2, 1.2], 0);
        doc.rect(x, y, stripWidth, stripHeight);
        doc.setLineDashPattern([], 0);
        const l = 2.5; doc.setDrawColor(90, 90, 90); doc.setLineWidth(0.18);
        doc.line(x - l, y, x, y); doc.line(x, y - l, x, y);
        doc.line(x + stripWidth, y, x + stripWidth + l, y); doc.line(x + stripWidth, y - l, x + stripWidth, y);
        doc.line(x - l, y + stripHeight, x, y + stripHeight); doc.line(x, y + stripHeight, x, y + stripHeight + l);
        doc.line(x + stripWidth, y + stripHeight, x + stripWidth + l, y + stripHeight); doc.line(x + stripWidth, y + stripHeight, x + stripWidth, y + stripHeight + l);

        if (logoIzquierdoB64) {
          doc.addImage(logoIzquierdoB64, 'PNG', x + 2, y + 3, 10, 10, undefined, 'FAST');
        }
        if (logoDerechoB64) {
          doc.addImage(logoDerechoB64, 'PNG', x + stripWidth - 12, y + 3, 10, 10, undefined, 'FAST');
        }
        doc.setTextColor(azul[0], azul[1], azul[2]); doc.setFont('Helvetica', 'bold'); doc.setFontSize(11);
        doc.text(nombreConcurso.toUpperCase(), x + stripWidth / 2, y + 5, { align: 'center', maxWidth: stripWidth - 26 });
        doc.setFont('Helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(gris[0], gris[1], gris[2]);
        const esloganLine = eslogan ? `${eslogan} - EDICION ${edicion}`.toUpperCase() : `EDICION ${edicion}`.toUpperCase();
        doc.text(esloganLine, x + stripWidth / 2, y + 14.5, { align: 'center', maxWidth: stripWidth - 26 });

        let cy = y + 20.5;
        doc.setTextColor(negro[0], negro[1], negro[2]); doc.setFont('Helvetica', 'normal'); doc.setFontSize(7.5);
        doc.text('DNI:', x + 2.5, cy); doc.text('TURNO:', x + 27, cy); doc.text('PUERTA:', x + 46, cy); doc.setFontSize(7.5); // Aumenta de 6 a 7.5
doc.text('FECHA:', x + 64, cy);
doc.setFont('Helvetica', 'bold'); doc.setFontSize(8);
doc.text(fechaStr, x + 74, cy);
        doc.setTextColor(negro[0], negro[1], negro[2]); doc.setFont('Helvetica', 'bold'); doc.setFontSize(10);
        doc.text(est.numeroDocumento || '\u2014', x + 9, cy); doc.text(turnoCodigoEst, x + 38, cy); doc.text(puertaVal || 'C', x + 58, cy);
        cy += 4.5;
        doc.setTextColor(negro[0], negro[1], negro[2]); doc.setFont('Helvetica', 'normal'); doc.setFontSize(8); doc.text('PARTICIPANTE:', x + 3, cy);
        doc.setTextColor(negro[0], negro[1], negro[2]); doc.setFont('Helvetica', 'bold'); doc.setFontSize(8.5);
        const nomCompleto = `${est.apellidos || ''} ${est.nombres || ''}`.trim().toUpperCase();
        doc.text(nomCompleto, x + 27, cy, { maxWidth: stripWidth - 29 });
        cy += 4.2;
        doc.setTextColor(negro[0], negro[1], negro[2]); doc.setFont('Helvetica', 'normal'); doc.setFontSize(8);
        doc.text('CÓDIGO IE:', x + 3, cy); doc.text('ÁREA:', x + 42, cy);
        doc.setTextColor(negro[0], negro[1], negro[2]); doc.setFont('Helvetica', 'bold'); doc.setFontSize(9.5);
        doc.text(codModular, x + 20, cy); doc.text(areaVal.toUpperCase(), x + 53, cy);
        cy += 4.2;
        doc.setTextColor(negro[0], negro[1], negro[2]); doc.setFont('Helvetica', 'normal'); doc.setFontSize(8); doc.text('IE:', x + 3, cy);
        doc.setTextColor(azulClaro[0], azulClaro[1], azulClaro[2]); doc.setFont('Helvetica', 'bold'); doc.setFontSize(10.5);
        doc.text(colNombre, x + 15, cy, { maxWidth: stripWidth - 18 });
        cy += 3.8;
        doc.setTextColor(negro[0], negro[1], negro[2]); doc.setFont('Helvetica', 'normal'); doc.setFontSize(8);
        doc.text('GESTIÓN:', x + 3, cy); doc.text('GRADO:', x + 38, cy);
        doc.setTextColor(azulClaro[0], azulClaro[1], azulClaro[2]); doc.setFont('Helvetica', 'bold'); doc.setFontSize(10);
        const gradoNivelStr = `${String(est.grado||'').toUpperCase()} ${String(est.nivel||'').toUpperCase()}`.trim();
        doc.text(gestionVal.toUpperCase(), x + 17, cy); 
doc.text(gradoNivelStr, x + 50, cy, { maxWidth: stripWidth - 52 });
        cy += 4.2;
        doc.setTextColor(negro[0], negro[1], negro[2]); doc.setFont('Helvetica', 'normal'); doc.setFontSize(8);
        doc.text('LUGAR:', x + 3, cy);
        doc.setTextColor(negro[0], negro[1], negro[2]); doc.setFont('Helvetica', 'bold'); doc.setFontSize(8.5);
        // Se quitó substring(0,25) y se añadió maxWidth para que entre completo
        doc.text(ieLugar.toUpperCase(), x + 15, cy, { maxWidth: stripWidth - 17 });
        cy += 1.8;
        //doc.setDrawColor(linea[0], linea[1], linea[2]); doc.setLineWidth(0.18); doc.line(x + 2, cy, x + stripWidth - 2, cy);
        cy += 3.2;
const boxW1 = 52; 
const boxW2 = stripWidth - boxW1 - 8;
const boxH2 = 10.5;
const bx = x + 2; 
const by = cy;

// --- CAJAS SUPERIORES (AULA, CÓDIGO, PABELLÓN, PISO) ---
doc.setDrawColor(azul[0], azul[1], azul[2]); 
doc.setLineWidth(0.38);
doc.roundedRect(bx, by, boxW1, boxH2, 1, 1, 'D');
doc.roundedRect(bx + boxW1 + 2, by, boxW2, boxH2, 1, 1, 'D');

// Encabezados
doc.setFont('Helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(negro[0], negro[1], negro[2]);
doc.text('AULA', bx + boxW1 * 0.25, by + 3.0, { align: 'center' });
doc.text('CODIGO', bx + boxW1 * 0.75, by + 3.0, { align: 'center' });
doc.text('PABELLON', bx + boxW1 + 2 + boxW2 * 0.30, by + 3.0, { align: 'center' });
doc.text('PISO', bx + boxW1 + 2 + boxW2 * 0.72, by + 3.0, { align: 'center' });

// Valores ajustados en Y (by + 7.5 para centrar en caja de 10.5)
doc.setFont('Helvetica', 'bold'); doc.setTextColor(negro[0], negro[1], negro[2]); doc.setFontSize(12);
doc.text(codigoAulaEst.toUpperCase(), bx + boxW1 * 0.25, by + 7.5, { align: 'center' });

doc.setFontSize(10); doc.setTextColor(azul[0], azul[1], azul[2]);
doc.text(codigoUnido, bx + boxW1 * 0.75, by + 7.5, { align: 'center' } as any);

doc.setFont('Helvetica', 'bold'); doc.setTextColor(negro[0], negro[1], negro[2]); doc.setFontSize(13);
doc.text(pabellonVal.toUpperCase(), bx + boxW1 + 2 + boxW2 * 0.30, by + 7.5, { align: 'center' });
doc.text(String(pisoVal), bx + boxW1 + 2 + boxW2 * 0.72, by + 7.5, { align: 'center' });

// --- CAJA DE HORARIOS (Con AM/PM dinámico) ---
const horaY = by + boxH2 + 1.2;
const horaH = 11; // Mayor altura para dar espacio vertical a fuente grande

doc.setDrawColor(azul[0], azul[1], azul[2]); 
doc.setLineWidth(0.38);
doc.roundedRect(bx, horaY, stripWidth - 4, horaH, 0.8, 0.8, 'D');

doc.setFont('Helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(negro[0], negro[1], negro[2]);
doc.text('HORA INGRESO', bx + (stripWidth - 4) * 0.25, horaY + 3.2, { align: 'center' });
doc.text('HORA EXAMEN', bx + (stripWidth - 4) * 0.75, horaY + 3.2, { align: 'center' });

// Función para calcular AM / PM según la hora de inicio
const obtenerMeridiano = (rangoHoras: string) => {
  const horaInicial = parseInt(String(rangoHoras).split(':')[0], 10);
  return horaInicial >= 12 ? 'PM' : 'AM';
};

const sufijoIngreso = obtenerMeridiano(ingresoStr);
const sufijoExamen = obtenerMeridiano(examenStr);

// Horas impresas con tamaño 10 para evitar que rocen el marco inferior
doc.setFont('Helvetica', 'bold'); doc.setTextColor(negro[0], negro[1], negro[2]); doc.setFontSize(13);
doc.text(`${ingresoStr} ${sufijoIngreso}`, bx + (stripWidth - 4) * 0.25, horaY + 8.0, { align: 'center' });
doc.text(`${examenStr} ${sufijoExamen}`, bx + (stripWidth - 4) * 0.75, horaY + 8.0, { align: 'center' });
        doc.setTextColor(negro[0], negro[1], negro[2]); doc.setFont('Helvetica', 'normal'); doc.setFontSize(9);
        //doc.text('CÃ³digo claro para consultar resultados â€¢ Conservar', x + stripWidth / 2, y + stripHeight - 1.4, { align: 'center' });
      }

      const ieNombre = (this.inscripcionParaLista?.colegio?.IE || 'Credenciales').replace(/\s+/g, '_');
      const codPagoFinal = (this.inscripcionParaLista as any)?.codigo || (this.inscripcionParaLista as any)?.id || '';
      doc.save(`Credenciales_${ieNombre}_${codPagoFinal}.pdf`);
    } catch (error) {
      console.error('Error al generar credenciales:', error);
      alert('Ocurrio un error al generar las credenciales.');
    } finally {
      this.cargandoLista = false;
    }
  }

  descargarCredencialesGrupales() {
    const seleccionados = this.estudiantesParaLista.filter(est => 
      est.numeroDocumento && this.estudiantesSeleccionados.has(est.numeroDocumento)
    );
    
    if (seleccionados.length === 0) {
      alert('Debe seleccionar al menos un estudiante de la lista.');
      return;
    }

    this.generarCredencialesPDF(seleccionados);
  }

  descargarCredencialIndividual(estudiante: Estudiante) {
    this.generarCredencialesPDF([estudiante]);
  }

  // ============================================
  // IMPRIMIR TARJETA / CARTILLA INDIVIDUAL
  // ============================================
  abrirModalImpresionIndividual(est: Estudiante) {
    this.estudianteParaImpresion = est;
    this.modoImpresionGrupal = false;
    this.estudiantesParaImpresionGrupal = [];
    this.tipoImpresionIndividual = 'TARJETA';
    this.alternativasImpresionIndividual = 4;
    this.mostrarModalImpresionIndividual = true;
  }

  abrirModalImpresionGrupal() {
    const seleccionados = this.estudiantesParaLista.filter(est =>
      est.numeroDocumento && this.estudiantesSeleccionados.has(est.numeroDocumento)
    );
    if (seleccionados.length === 0) {
      alert('Debe seleccionar al menos un estudiante de la lista.');
      return;
    }
    this.estudiantesParaImpresionGrupal = seleccionados;
    this.estudianteParaImpresion = null;
    this.modoImpresionGrupal = true;
    this.tipoImpresionIndividual = 'TARJETA';
    this.alternativasImpresionIndividual = 4;
    this.mostrarModalImpresionIndividual = true;
  }

  cerrarModalImpresionIndividual() {
    this.mostrarModalImpresionIndividual = false;
    this.estudianteParaImpresion = null;
  }

  async confirmarImpresionIndividual() {
    this.cargandoImpresion = true;
    try {
      let config: any = null;
      try {
        config = await this.configuracionService.obtenerConfiguracion();
      } catch {
        console.warn('No se pudo cargar la configuraciÃ³n para la impresiÃ³n');
      }

      // Resolver lista de estudiantes: individual o grupal
      const listaEstudiantes: Estudiante[] = this.modoImpresionGrupal
        ? this.estudiantesParaImpresionGrupal
        : (this.estudianteParaImpresion ? [this.estudianteParaImpresion] : []);

      if (listaEstudiantes.length === 0) return;

      // Resolver datos de Aula y Turno por cada estudiante usando asignacionesAula
      const db = getFirestore(firebaseApp);
      const estudiantesEnriquecidos = await Promise.all(listaEstudiantes.map(async (est) => {
        const indexReal = this.inscripcionParaLista?.estudiantes?.findIndex(e => e.numeroDocumento === est.numeroDocumento) ?? -1;
        const asignacion = this.inscripcionParaLista?.asignacionesAula?.find(a => a.estudianteIndex === indexReal);
        
        const aulaId = asignacion?.aulaId || est.aulaAsignadaId || '';
        const codigoAula = asignacion?.codigoAula || est.codigoAula || 'â€”';
        const turnoCodigo = asignacion?.turnoCodigo || 'â€”';
        
        let turnoId = '';
        if (turnoCodigo !== 'â€”') {
          const turnosRef = collection(db, 'turnos');
          const qTurno = query(turnosRef, where('codigo', '==', turnoCodigo));
          const snapTurno = await getDocs(qTurno);
          if (!snapTurno.empty) {
            turnoId = snapTurno.docs[0].id;
          }
        }

        const estAulaDisplay: AulaTurnoDisplay = {
          id: aulaId,
          aulaId: aulaId,
          codigoAula: codigoAula,
          inscritos: 1,
          capacidad: 0,
          grado: est.grado || '',
          nivel: est.nivel || '',
          local: '',
          pabellon: '',
          piso: 0,
          puertaAcceso: '',
          sede: this.inscripcionParaLista?.colegio?.IE || '',
          turnoId: turnoId
        };

        const estTurnoObj: Turno = {
          id: turnoId,
          codigo: turnoCodigo,
          fecha: new Date(),
          horaInicioEntrada: '',
          horaFinEntrada: '',
          horaInicioPrueba: '',
          horaFinPrueba: '',
          nivel: (est.nivel === 'Primaria' || est.nivel === 'Secundaria') ? est.nivel : 'Primaria',
          grados: [est.grado || '']
        };

        return {
          ...est,
          // Siempre usar inscripcion.colegio como fuente maestra para colegioObj
          colegioObj: this.inscripcionParaLista?.colegio || est.colegio,
          inscripcionId: this.inscripcionParaLista?.id || 'N/A',
          aulaDisplay: estAulaDisplay,
          turnoObj: estTurnoObj
        };
      }));

      // Pasar un dummy aula y turno global (el servicio ahora priorizarÃ¡ el de cada estEnriquecido)
      const dummyAula = estudiantesEnriquecidos[0]?.aulaDisplay || {} as AulaTurnoDisplay;
      const dummyTurno = estudiantesEnriquecidos[0]?.turnoObj || {} as Turno;

      if (this.tipoImpresionIndividual === 'TARJETA') {
        await this.impresionService.generarTarjetas(estudiantesEnriquecidos, dummyAula, dummyTurno, config);
      } else {
        await this.impresionService.generarCartillas(estudiantesEnriquecidos, dummyAula, dummyTurno, config, this.alternativasImpresionIndividual);
      }

      this.cerrarModalImpresionIndividual();
    } catch (error) {
      console.error('Error al generar impresiÃ³n:', error);
      alert('OcurriÃ³ un error al generar el documento.');
    } finally {
      this.cargandoImpresion = false;
    }
  }

  /**
   * Carga una imagen desde URL y la convierte a Base64 para jsPDF.
   * - Timeout de 5 segundos: si la imagen tarda demasiado, resuelve con ''.
   * - Errores HTTP (402, 403, 404, CORS) se capturan silenciosamente; el PDF
   *   continuarÃ¡ con el diseÃ±o vectorial de respaldo sin lanzar errores en consola.
   */
  private cargarImagenBase64(url: string): Promise<string> {
    return new Promise((resolve) => {
      if (!url || url.trim() === '') {
        resolve('');
        return;
      }

      let resuelta = false;
      const resolver = (valor: string) => {
        if (!resuelta) {
          resuelta = true;
          resolve(valor);
        }
      };

      // Timeout de 5 segundos
      const timeoutId = setTimeout(() => resolver(''), 5000);

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        clearTimeout(timeoutId);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            resolver(canvas.toDataURL('image/png'));
          } else {
            resolver('');
          }
        } catch {
          // CORS tainted canvas u otro error
          resolver('');
        }
      };

      img.onerror = () => {
        clearTimeout(timeoutId);
        // Silencioso: no mostrar error de consola para 402/403/CORS
        resolver('');
      };

      img.src = url;
    });
  }

  async enviarWhatsapp(ins: Inscripcion): Promise<void> {
    const telRaw = String((ins as any).telefonoApoderado || '').replace(/\D/g, '');
    if (!telRaw) { alert('No hay telÃ©fono del apoderado registrado'); return; }
    const telefono = telRaw.startsWith('51') ? telRaw : `51${telRaw}`;
    const codigoIns = String((ins as any).codigo || ins.id || '').trim();
    if (!/^\d{4}$/.test(codigoIns)) { alert('CÃ³digo de inscripciÃ³n invÃ¡lido: ' + codigoIns); return; }
    let est: any = (ins.estudiantes && ins.estudiantes[0]) ? ins.estudiantes[0] as any : null;
    let codigoEst = String(est?.codigo || (est as any)?.id || '').trim();
    if (!/^\d{5}$/.test(codigoEst)) {
      try {
        const lista = await this.inscripcionService.obtenerEstudiantes(codigoIns);
        const primero = lista && lista.length ? (lista as any[]).sort((a:any,b:any)=> Number(a.codigo||a.id)-Number(b.codigo||b.id))[0] : null;
        if (primero) { est = primero; codigoEst = String((primero as any).codigo || (primero as any).id || '').trim(); }
      } catch {}
    }
    if (!/^\d{5}$/.test(codigoEst)) { alert('No se encontrÃ³ cÃ³digo de 5 dÃ­gitos del estudiante. Verifique que la inscripciÃ³n tenga estudiantes registrados.'); return; }
    const codigo = `${codigoIns}-${codigoEst}`;
    const nombre = est ? `${est.nombres || ''} ${est.apellidos || ''}`.trim() || 'PARTICIPANTE' : 'PARTICIPANTE';
    const baseUrl = 'https://solarislee-resultados.web.app/';
    const enlace = `${baseUrl}?tipo=individual&codigo=${codigo}`;
    const mensaje = `RESULTADOS SOLARISLEE 2026\nEstimado(a) participante:\nA traves de este enlace puede consultar su resultado:\n${enlace}\nParticipante: ${nombre}\nCÃ³digo: ${codigo}`;
    const whatsappUrl = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  }

  descargarRecibo(ins: Inscripcion): void {
    if (!this.configuracion) {
      alert('ConfiguraciÃ³n no cargada. Intente recargar la pÃ¡gina.');
      return;
    }
    try {
      this.reciboService.generarRecibo(ins, this.configuracion);
    } catch (error) {
      console.error('Error al generar recibo:', error);
      alert('Error al generar el recibo');
    }
  }

  enviarWhatsappEstudiante(est: Estudiante): void {
    const ins: any = this.inscripcionParaLista;
    if (!ins) return;
    const telRaw = String(ins.telefonoApoderado || '').replace(/\D/g, '');
    if (!telRaw) { alert('No hay telÃ©fono del apoderado registrado'); return; }
    const telefono = telRaw.startsWith('51') ? telRaw : `51${telRaw}`;
    const codigoIns = String(ins.codigo || ins.id || '').trim();
    const codigoEst = String((est as any).codigo || (est as any).id || '').trim();
    if (!/^\d{4}$/.test(codigoIns) || !/^\d{5}$/.test(codigoEst)) { alert('CÃ³digo invÃ¡lido: se esperaba 4 dÃ­gitos inscripciÃ³n y 5 dÃ­gitos estudiante. Actual: ' + codigoIns + '-' + codigoEst); return; }
    const codigo = `${codigoIns}-${codigoEst}`;
    const nombre = `${est.nombres || ''} ${est.apellidos || ''}`.trim();
    const baseUrl = 'https://solarislee-resultados.web.app/';
    const enlace = `${baseUrl}?tipo=individual&codigo=${codigo}`;
    const mensaje = `RESULTADOS SOLARISLEE 2026\nEstimado(a) participante:\nA traves de este enlace puede consultar su resultado:\n${enlace}\nParticipante: ${nombre}\nCÃ³digo: ${codigo}`;
    const whatsappUrl = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  }

  // ============================================
  // BOTÃ“N CREDENCIALES - Icono ðŸªª en la tabla principal
  // ============================================
  async verCredenciales(ins: Inscripcion) {
    // Al hacer clic en ðŸªª en la lista, abre automÃ¡ticamente el modal de lista
    // para que el usuario pueda seleccionar individual o grupalmente de forma intuitiva
    await this.verLista(ins);
  }

  // ============================================
  // BOTÃ“N EDITAR - Existente
  // ============================================
  async editarInscripcion(ins: Inscripcion) {
    console.log('Editando inscripciÃ³n:', ins.id);
    
    this.estudiantesEditar = await this.inscripcionService.obtenerEstudiantes(ins.id!);
    console.log('Estudiantes cargados:', this.estudiantesEditar.length);
    
    this.inscripcionEditar = ins;
    this.estudiantesImportados = [];
    this.mostrarNuevaInscripcion = true;
  }

  irANueva() {
    this.inscripcionEditar = null;
    this.estudiantesEditar = [];
    this.estudiantesImportados = [];
    this.mostrarNuevaInscripcion = true;
  }

  async onExcelSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const XLSX: any = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const headerRow = 7;
      const colMap: Record<string, number> = {};
      const headers: string[] = (rows[headerRow] || []).map((h: any) => String(h).trim().toUpperCase());
      headers.forEach((h, i) => {
        if (h.includes('TIPO')) colMap['TIPO'] = i;
        else if (h === 'NUMERO' || h.includes('NÃšMERO') || h.includes('NUMERO')) colMap['NUMERO'] = i;
        else if (h.includes('NOMBRES')) colMap['NOMBRES'] = i;
        else if (h.includes('APELLIDOS')) colMap['APELLIDOS'] = i;
        else if (h === 'GRADO') colMap['GRADO'] = i;
        else if (h.includes('NIVEL') || h.includes('NIEVL')) colMap['NIVEL'] = i;
      });
      if (colMap['NUMERO'] === undefined || colMap['NOMBRES'] === undefined) {
        alert('Plantilla no vÃ¡lida: no se encontrÃ³ cabecera TIPO/NUMERO/NOMBRES en fila 8');
        input.value = '';
        return;
      }
      const parsed: Estudiante[] = [];
      let omitidos = 0;
      const gradoMap: Record<string,string> = { '1':'PRIMERO','2':'SEGUNDO','3':'TERCERO','4':'CUARTO','5':'QUINTO','6':'SEXTO','1Â°':'PRIMERO','2Â°':'SEGUNDO','3Â°':'TERCERO','4Â°':'CUARTO','5Â°':'QUINTO','6Â°':'SEXTO','PRIMERO':'PRIMERO','SEGUNDO':'SEGUNDO','TERCERO':'TERCERO','CUARTO':'CUARTO','QUINTO':'QUINTO','SEXTO':'SEXTO' };
      for (let r = headerRow + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.every((c: any) => String(c).trim() === '')) continue;
        const tipo = String(row[colMap['TIPO']] || '').trim().toUpperCase() || 'DNI';
        const numero = String(row[colMap['NUMERO']] || '').trim();
        const nombres = String(row[colMap['NOMBRES']] || '').trim();
        const apellidos = String(row[colMap['APELLIDOS']] || '').trim();
        const gradoRaw = String(row[colMap['GRADO']] || '').trim().toUpperCase();
        const nivelRaw = String(row[colMap['NIVEL']] || '').trim().toUpperCase();
        if (!numero || !nombres || !apellidos || !gradoRaw || !nivelRaw) { omitidos++; continue; }
        if (!/^\d{6,9}$/.test(numero)) { omitidos++; continue; }
        const nivel = nivelRaw.includes('SEC') ? 'SECUNDARIA' : 'PRIMARIA';
        const gradoNum = gradoMap[gradoRaw] || gradoMap[gradoRaw.replace(/[^A-Z0-9]/g,'')] || '';
        const grado = gradoNum || gradoRaw.toUpperCase().trim();
        parsed.push({
          tipoDocumento: tipo.toLowerCase(),
          numeroDocumento: numero,
          nombres: nombres.toUpperCase(),
          apellidos: apellidos.toUpperCase(),
          grado,
          nivel,
          colegio: null as any,
          fechaRegistro: new Date()
        });
      }
      if (parsed.length === 0) {
        alert(`No se encontrÃ³ ningÃºn estudiante vÃ¡lido. Omitidos: ${omitidos}. Verifique que tenga TIPO, NUMERO, NOMBRES, APELLIDOS, GRADO, NIVEL completos.`);
        input.value = '';
        return;
      }
      if (omitidos > 0) alert(`Se importaron ${parsed.length} estudiantes. Se omitieron ${omitidos} filas incompletas.`);
      this.ngZone.run(() => {
        this.estudiantesImportados = parsed;
        this.inscripcionEditar = null;
        this.estudiantesEditar = [];
        this.mostrarNuevaInscripcion = true;
      });
    } catch (e: any) {
      console.error('Error leyendo Excel', e);
      alert('Error leyendo Excel: ' + (e?.message || e));
    } finally {
      input.value = '';
    }
  }

  abrirModalEliminar(est: Estudiante) {
    this.estudianteAEliminar = est;
    this.mostrarModalEliminar = true;
  }
  cerrarModalEliminar() {
    if (this.eliminando) return;
    this.mostrarModalEliminar = false;
    this.estudianteAEliminar = null;
  }
  async confirmarEliminarEstudiante() {
    if (!this.inscripcionParaLista?.id || !this.estudianteAEliminar) return;
    const codigoEst = String((this.estudianteAEliminar as any).codigo || (this.estudianteAEliminar as any).id);
    if (!codigoEst) { alert('CÃ³digo de estudiante invÃ¡lido'); return; }
    const estEliminado: any = { ...this.estudianteAEliminar as any };
    const insId = this.inscripcionParaLista.id!;
    this.mostrarModalEliminar = false;
    this.estudianteAEliminar = null;
    this.eliminando = true;
    try {
      await this.inscripcionService.eliminarEstudiante(insId, codigoEst);
    } catch (e: any) {
      console.error('Error eliminar', e);
      alert('Error al eliminar: ' + (e?.message || e));
      this.eliminando = false;
      return;
    }
    try {
      this.ngZone.run(() => {
        this.estudiantesParaLista = this.estudiantesParaLista.filter(e => String((e as any).codigo || (e as any).id) !== String(codigoEst));
        this.estudiantesSeleccionados.delete(estEliminado.numeroDocumento);
      });
    } catch {}
    this.eliminando = false;
    try {
      await this.cargarInscripciones();
      const fresh = await this.inscripcionService.obtenerEstudiantes(insId);
      const seen = new Set<string>();
      const dedup: any[] = [];
      for (const e of fresh as any[]) {
        const k = `${String((e as any).numeroDocumento||'').trim()}|${String((e as any).nombres||'').trim().toUpperCase()}|${String((e as any).apellidos||'').trim().toUpperCase()}`;
        if (k === '||') { dedup.push(e); continue; }
        if (!seen.has(k)) { seen.add(k); dedup.push(e); }
      }
      this.ngZone.run(() => {
        this.estudiantesParaLista = dedup.length ? dedup : fresh as any[];
        if (this.inscripcionParaLista) {
          (this.inscripcionParaLista as any).cantidadEstudiantes = this.estudiantesParaLista.length;
          this.inscripcionParaLista = this.inscripciones.find(i => i.id === insId) || this.inscripcionParaLista;
        }
      });
    } catch {}
  }

  async recargarInscripciones() {
    this.inscripcionEditar = null;
    this.estudiantesEditar = [];
    this.estudiantesImportados = [];
    await this.cargarInscripciones();
    this.mostrarNuevaInscripcion = false;
  }

  volverALista() {
    this.inscripcionEditar = null;
    this.estudiantesEditar = [];
    this.estudiantesImportados = [];
    this.mostrarNuevaInscripcion = false;
  }
}

