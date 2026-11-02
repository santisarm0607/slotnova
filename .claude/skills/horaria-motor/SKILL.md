---
name: horaria-motor
description: "Esta skill debe usarse cuando se modifica o se revisa la lógica de HorarIA: el motor de horarios (js/motor.js), el validador (js/validador.js), el diagnóstico, el reporte de métricas o los datos. Se activa con pedidos como \"modo estricto\", \"sesiones pendientes\", \"reporte oficial\", \"cobertura\", \"colisiones\", \"huecos\", \"prueba de cambio\", \"D02 martes\", \"reprogramar\", \"el horario sale con cruces\", \"optimizar el motor\" o \"verificar el horario\". Incluye un auditor independiente con las fórmulas de la guía.\n"
metadata:
  version: "2.0.0"
---

# SlotNova · Motor, validador y métricas

La efectividad vale el 40 % de la nota. Aquí un error cuesta caro: pensar con cuidado, cambiar poco y medir siempre.

## Herramienta principal: el auditor

`scripts/auditar.js` (en esta skill) recalcula las métricas oficiales **sin usar el validador del proyecto**: cobertura, pendientes, colisiones por pares y categoría, infracciones por tipo, preferencias (consecutivas, misma materia el mismo día, huecos docentes) y la prueba de cambio (afectadas y movidas). Salida de 5 a 10 líneas.

```bash
node <ruta-skill>/scripts/auditar.js --proyecto horaria                 # modo con alternativa
node <ruta-skill>/scripts/auditar.js --proyecto horaria --estricto      # solo docente asignado
node <ruta-skill>/scripts/auditar.js --proyecto horaria --resultado horario.xlsx   # audita el Excel exportado
```
`<ruta-skill>` es el directorio base de esta skill, que aparece al cargarla. Opciones: `--excel datos.xlsx`, `--semilla N`, `--json`. Código de salida 1 si hay colisiones o infracciones.

Usar el auditor **en lugar de leer código** para saber cómo va el motor. Estado esperado al cerrar la prioridad 1:
- Alternativa: 120/120, 0 colisiones, 0 infracciones. Cambio: 0 pendientes.
- Estricto: 116/120, **0 infracciones**, 4 pendientes (Inglés de un curso) reportadas por el motor en `resultado.pendientes`.

## Protocolo para cualquier cambio en motor o validador

1. **Medir antes**: `node pruebas/prueba.js` y el auditor. Guardar las dos líneas de resultado.
2. **Plan en 3 líneas**: qué cambia, qué invariante puede romperse, qué prueba lo demuestra.
3. **Agregar la prueba primero** en `pruebas/prueba.js` (un `revisar(...)` nuevo) para el comportamiento pedido.
4. **Editar poco**: ubicar la función con Grep y leer solo ese rango. No reescribir el archivo.
5. **Medir después**: pruebas + auditor (los dos modos). Si algo empeora, deshacer antes de seguir.
6. **Actualizar `ESTADO.md`** con las cifras nuevas.

## Invariantes (nunca romper)

- Ninguna fila con cruce de curso, docente o salón. Lo que no cabe → `resultado.pendientes` con motivo.
- Cada (curso, asignatura) nunca supera su intensidad.
- `validador.js` no importa nada de `motor.js`: es la segunda opinión.
- La misma semilla da el mismo horario (la demo debe ser reproducible).
- Base en menos de 1 s y reprogramación en menos de 0,5 s con los datos de prueba.
- Reprogramar mueve lo mínimo: nunca regenerar desde cero si se puede ajustar.
- Las salidas siguen el contrato de `horaria-contexto/references/arquitectura.md`. Si se agrega un campo, documentarlo ahí también en `ESTADO.md`.

## Tareas pendientes de esta área

La especificación exacta está en `references/especificacion.md`. Leerla antes de empezar cualquiera de estas:
1. Modo estricto y sesiones pendientes (`opciones.modoDocente`, `resultado.pendientes`, retiro de conflictos residuales).
2. `HorarIA.reporte(datos, filas, reglas, opciones)` con las fórmulas oficiales, igual al auditor.
3. `HorarIA.compararCambio(base, nuevo, datosEscenario)` → afectadas, movidas y pendientes.
4. Normalizar IDs (D02 = D2) y configuración de bloques 45/50 minutos.

## Errores comunes a evitar

- Confundir celdas cambiadas con sesiones movidas: contar movidas por (curso, asignatura) comparando posiciones, como el auditor.
- Contar colisiones por asignación en vez de por **pares**.
- Mezclar preferencias con reglas obligatorias en el reporte.
- Usar las horas del Excel como duración del bloque.
- Subir iteraciones para "arreglar" un caso: primero revisar el diagnóstico; si es imposible, reportar pendientes.

## Novedades de la versión 2.0 que tocan el motor

- Los **eventos con hora reservada** se traducen en reglas `prohibir` por curso (con `eventoId`); el motor deja libres esas horas y, si no caben las clases, quedan pendientes con su motivo. Las reglas de eventos no aparecen en «Cambios activos».
- El asistente de IA llama al motor solo a través de `HorarIA.app.ejecutar` (`generar_horario`, `agregar_restriccion`, `editar_docente`…): nunca escribe filas del horario.
- La jornada admite cualquier duración de clase (45, 50 u «Otra»); el ID del bloque sigue siendo la unidad de tiempo.
