# Plan de Implementación: Optimización de Consultas, Filtro Multiusuario y Generación de Credenciales

Este plan detalla la extensión del sistema de inscripciones presenciales para optimizar el consumo de lecturas en Firestore y agregar un sistema dinámico de impresión de credenciales en PDF en formato vertical (tiras), 4 por página A4, conservando la arquitectura de componentes Standalone y la compatibilidad con registros históricos.

---

## 1. Goal Description

El objetivo es doble:
1. **Optimización de Lecturas en Firestore**: Implementar filtros de fecha y multiusuario del lado del servidor (Firestore) para que la tabla principal cargue únicamente las inscripciones del día del usuario autenticado actual. Esto evitará lecturas masivas de registros históricos. Asimismo, el buscador actual (en memoria) se reemplazará por consultas Firestore eficientes que busquen por DNI, Código Modular, Nombre del Estudiante o Colegio.
2. **Generación e Impresión de Credenciales**: Añadir checkboxes de selección en el flujo de lista de estudiantes que permita elegir quiénes imprimir, y generar a través de `jsPDF` credenciales en formato vertical tipo tiras (4 credenciales verticales por página A4), utilizando dinámicamente imágenes almacenadas en Firebase Storage para logos y fondo, configuradas previamente.

---

## 2. User Review Required

> [!IMPORTANT]
> **Compatibilidad Híbrida de Registros**:
> Las nuevas inscripciones guardarán `fechaTexto` (`YYYY-MM-DD`) y `usuarioId` (`auth.currentUser.uid`).
> Para los registros antiguos (que carecen de estos campos), las consultas estrictas con `where` no los devolverán. Añadiremos un control en la UI **"Ver Históricos / Todos"** que permitirá desactivar el filtro de Firestore para cargar registros antiguos o de otros usuarios según sea necesario, garantizando 100% de compatibilidad.

> [!IMPORTANT]
> **Indexación en Firestore**:
> El buscador optimizado utilizará búsquedas por coincidencia exacta de DNI (`numeroDocumento`) usando `collectionGroup('estudiantes')` y Código Modular (`colegio.CODIGOMODULAR`). Para búsquedas de nombres/colegios, se utilizará una estrategia de prefijo (`>=` y `<= term + '\uf8ff'`). Estas consultas no requieren índices complejos si se ejecutan por separado y luego se combinan en el frontend, lo cual minimiza errores de "Index Required".

---

## 3. Proposed Changes

### Componente `InscripcionService`

#### [MODIFY] `src/app/services/inscripcion.ts`
- **Guardado con Metadatos**: Modificar `guardarInscripcion` para incluir automáticamente `fechaTexto` en formato `YYYY-MM-DD` (en la zona horaria local) y `usuarioId` obtenido desde Firebase Auth. Ambos coexistirán con `fechaInscripcion` (Timestamp).
- **Consultas Optimizadas con Filtros**: Crear un método `obtenerInscripcionesFiltradas(fechaTexto: string, usuarioId: string, verTodos: boolean)`:
  - Si `verTodos` es `true`, ejecuta la consulta tradicional sin filtros.
  - Si `verTodos` es `false`, filtra por `where('fechaTexto', '==', fechaTexto)` y `where('usuarioId', '==', usuarioId)`.
- **Buscador en Firestore**: Crear un método `buscarInscripcionesEnFirestore(termino: string, usuarioId: string)`:
  - Si el término parece un DNI (8 dígitos) o código modular (7 dígitos), realiza consultas directas y eficientes usando `collectionGroup` o queries específicas en `inscripciones`.
  - Para nombres de estudiantes o colegios, realiza consultas de rango de prefijo en Firestore.
  - Fusiona y deduplica los resultados para evitar lecturas masivas.

---

### Componente `Lista` (Lista de Inscripciones Presenciales)

#### [MODIFY] `src/app/features/dashboard/inscripciones-presenciales/lista/lista.ts`
- **Estado de Filtros**:
  - `fechaSeleccionada: string` inicializada con el día de hoy (`YYYY-MM-DD`).
  - `verTodos: boolean = false` para activar la compatibilidad histórica.
  - `terminoBusqueda: string = ''` para manejar la búsqueda directamente en Firestore.
- **Checbox de Selección en Estudiantes**:
  - `estudiantesSeleccionados: Set<string> = new Set()` para guardar los IDs de los estudiantes elegidos para credenciales.
  - Métodos `toggleSeleccionarEstudiante()`, `toggleSeleccionarTodos()`, `esEstudianteSeleccionado()`.
- **Integración con Firebase Auth**:
  - Obtener el `uid` del usuario autenticado actual al cargar y filtrar los datos.
- **Generación de Credenciales PDF (4 por página A4)**:
  - Cargar las imágenes configuradas (`logoIzquierdo`, `logoDerecho`, `fondoCredencial`) de forma asíncrona mediante URLs de Storage.
  - Si no existen o fallan (CORS), usar un fallback con colores premium y bordes vectoriales elegantes.
  - Usar `jsPDF` con tamaño A4 vertical (`210mm x 297mm`).
  - Dividir la página en 4 columnas verticales (tiras) de ancho ~48mm cada una, con espaciado de 2mm.
  - Renderizar en cada tira:
    - Fondo dinámico.
    - Logos a la izquierda y derecha.
    - Nombre del Concurso y Edición.
    - Datos del Estudiante (Nombre completo, Colegio, Grado/Nivel).
    - Asignación destacada (Aula asignada, Turno).
    - Un código de barras o QR vectorial autogenerado mediante trazos jsPDF.
  - Soporte para páginas adicionales si se seleccionan más de 4 estudiantes (paginación de credenciales: 4 por página, el 5to va a la página 2).

#### [MODIFY] `src/app/features/dashboard/inscripciones-presenciales/lista/lista.html`
- **Filtros en el Header**:
  - Agregar un selector `<input type="date">` enlazado a `fechaSeleccionada`.
  - Agregar un switch/checkbox "Ver Históricos / Todos".
  - Agregar botón de "Buscar" junto al input de búsqueda para disparar la consulta en Firestore.
- **Lista de Estudiantes en el Modal**:
  - Añadir una columna de Checkboxes en la tabla del modal.
  - Añadir el checkbox "Seleccionar todos" en el `thead` de la tabla del modal.
  - En la parte inferior, junto a "Descargar PDF", añadir el botón "🪪 Generar Credenciales" (para los estudiantes seleccionados).
  - Añadir un botón individual de credencial "🪪" en cada fila para impresión instantánea.

#### [MODIFY] `src/app/features/dashboard/inscripciones-presenciales/lista/lista.css`
- Agregar estilos para los selectores de fecha, el switch "Ver Históricos" y los nuevos elementos interactivos.
- Mejorar el diseño del modal con una presentación premium de los checkboxes.

---

## 4. Verification Plan

### Automated/Unit Tests & Build Verification
- Ejecutar compilación de producción de Angular (`npm run build` o `ng build`) para verificar que no haya errores de tipado o módulos.

### Manual Verification
1. **Filtro de Lecturas del Día**:
   - Registrar una inscripción hoy.
   - Cambiar el selector de fecha al día de ayer; la tabla debe mostrarse vacía.
   - Activar el switch "Ver Históricos"; la tabla debe mostrar todas las inscripciones históricas inmediatamente sin importar la fecha.
2. **Buscador en Firestore**:
   - Escribir un DNI exacto en el buscador y presionar Enter / Buscar. Verificar que la tabla cargue únicamente la inscripción correspondiente realizando llamadas optimizadas.
3. **Generación de Credenciales (4 por Página A4)**:
   - Abrir el modal de lista de una inscripción con 5 estudiantes.
   - Hacer clic en "Seleccionar todos", luego desmarcar uno (quedando 4).
   - Hacer clic en "Generar Credenciales".
   - Abrir el PDF resultante:
     - Debe ser una única página A4 vertical.
     - Debe contener exactamente 4 tiras verticales alineadas horizontalmente.
     - Debe mostrar fondo, logos, nombre de concurso y la información de aula asignada y turno en tiempo real.
     - Si se seleccionan 5 estudiantes, verificar que genere un PDF de 2 páginas (la primera con 4 tiras, la segunda con 1 tira).
