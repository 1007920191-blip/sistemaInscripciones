# Mejoras en el Sistema de Inscripciones Presenciales y Turnos

Este plan de implementación aborda los problemas críticos de sincronización al editar inscripciones, transforma el módulo de turnos en un panel de monitoreo en tiempo real, y mejora la experiencia de usuario del botón "LISTA", eliminando el uso de `ChangeDetectorRef` y adoptando un flujo completamente asíncrono con transacciones de Firestore.

## User Review Required

> [!IMPORTANT]
> **Cambio Arquitectónico en Turnos**: El algoritmo maneja la apertura de aulas automáticamente. Sin embargo, se **mantendrá el botón "Agregar Aula"** para casos de emergencia o ajustes manuales excepcionales. La tabla pasará a ser de **monitoreo en tiempo real** usando `onSnapshot` de Firestore, asegurando que cualquier cambio se refleje automáticamente sin recargar, conviviendo la automatización con la opción manual.

> [!WARNING]
> **Escucha en Tiempo Real**: Para lograr la actualización automática de la tabla de aulas sin recargar, implementaremos un `onSnapshot` de Firestore. Esto consumirá lecturas de base de datos de manera continua mientras el modal esté abierto. Dado que es para monitoreo, es el enfoque correcto, pero es importante tenerlo en cuenta para el uso de cuota de Firebase.

## Proposed Changes

### 1. Lógica de Reasignación y Transacciones (Core)

#### [MODIFY] `src/app/services/asignacion.service.ts`
- **Nuevo Método `liberarEstudiantes`**: Implementar una transacción que reciba las asignaciones previas de un estudiante y reduzca el contador de `inscritos` y el conteo de `porColegio` en los documentos correspondientes de la colección `turnosedicion`.
- Asegurar que todas las actualizaciones de base de datos se manejen con `runTransaction` o actualizaciones por lotes.

#### [MODIFY] `src/app/features/dashboard/inscripciones-presenciales/nueva-inscripcion/nueva-inscripcion.ts`
- Refactorizar `ejecutarFinalizacionConAsignacion`:
  - Si estamos en `modoEdicion`, antes de reasignar, invocar `liberarEstudiantes` pasándole las asignaciones anteriores (guardadas en `this.inscripcionEditar.asignacionesAula`).
  - Esperar (`await`) a que la liberación termine antes de proceder a la nueva asignación.
- Asegurar el manejo correcto de errores durante las transacciones y revertir los cambios visuales si falla.

### 2. Panel de Control de Aulas en Tiempo Real

#### [MODIFY] `src/app/features/dashboard/turnos/turno-aulas/turno-aulas.ts`
- Eliminar la dependencia de `ChangeDetectorRef`.
- Eliminar métodos de asignación manual (`abrirModalAsignar`, `confirmarAsignacion`).
- Cambiar `cargarAulasAsignadas` por una suscripción asíncrona a Firestore (`onSnapshot`) filtrada por `turnoId` y `grado`. Esto mantendrá el arreglo `aulasAsignadas` sincronizado automáticamente.
- Calcular y almacenar campos derivados (ej. `vacantesDisponibles = capacidad - inscritos`).

#### [MODIFY] `src/app/features/dashboard/turnos/turno-aulas/turno-aulas.html`
- Eliminar el botón de "Agregar Aula".
- Actualizar la tabla para mostrar: Código de aula, Grado, Nivel, Capacidad, Inscritos, **Vacantes Restantes**, y Estado (Abierta Automáticamente/Llena).
- Mantener la paginación y búsqueda operando sobre el arreglo actualizado en tiempo real.

### 3. Modal de Lista de Estudiantes

#### [MODIFY] `src/app/features/dashboard/inscripciones-presenciales/lista/lista.ts`
- Cambiar la acción de `verLista(ins)` para que no genere el PDF inmediatamente.
- Crear una nueva variable de estado `inscripcionParaLista` y `estudiantesParaLista`.
- Al hacer clic, cargar los estudiantes, asignarlos a las variables y establecer `mostrarModalLista = true`.
- Trasladar la lógica del PDF existente (`jsPDF`) a un nuevo método `descargarPDF()`.

#### [MODIFY] `src/app/features/dashboard/inscripciones-presenciales/lista/lista.html`
- Añadir el marcado HTML para el nuevo `modal-lista-estudiantes`.
- Diseñar una tabla dentro del modal que muestre: N°, Nombres y Apellidos, DNI, Colegio, Grado, Nivel, Turno, y Aula.
- Añadir el botón secundario "Descargar PDF" / "Imprimir" dentro del modal.

#### [MODIFY] `src/app/features/dashboard/inscripciones-presenciales/lista/lista.css`
- Agregar estilos modernos para el modal de lista, asegurando que se sienta fluido y coherente con el resto de modales del sistema (usando animaciones CSS de opacidad/transformación).

## Verification Plan

### Manual Verification
1. **Edición sin Vacantes Fantasma**: 
   - Crear una inscripción con 1 estudiante para "1ero Secundaria". 
   - Ir al modal de Turnos y verificar que el aula asignada tiene 1 inscrito.
   - Editar la inscripción, cambiando el grado a "2do Secundaria".
   - Verificar que el aula de 1ero redujo su conteo a 0, y el aula de 2do aumentó su conteo a 1.
2. **Monitoreo en Tiempo Real**:
   - Abrir el modal de Gestión de Aulas del Turno en una ventana.
   - En otra ventana, realizar una inscripción que afecte a ese turno.
   - Verificar que en la primera ventana la tabla se actualice sola (sumando 1 al inscrito) sin parpadeos extraños ni intervención manual.
3. **Flujo de Lista**:
   - Hacer clic en el botón "Lista".
   - Verificar que se abre un modal de forma inmediata con los datos de los estudiantes y el aula a la que fueron asignados.
   - Presionar "Descargar PDF" y verificar que el documento resultante sea correcto.
