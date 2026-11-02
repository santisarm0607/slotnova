---
name: horaria-contexto
description: "Esta skill debe usarse al iniciar cualquier trabajo en SlotNova (antes HorarIA), el proyecto de la Hackathon Colombia 5.0 Cúcuta para el reto Gnosoft de horarios escolares con IA. Se activa cuando el usuario menciona \"SlotNova\", \"HorarIA\", \"la hackathon\", \"el reto de Gnosoft\", \"horarios escolares\", \"seguir con el proyecto\", \"qué falta\", \"en qué vamos\", o pide cualquier cambio en esta carpeta. Da el arranque, los hechos clave, las decisiones y las reglas para trabajar rápido y dejar el contexto actualizado.\n"
metadata:
  version: "2.0.0"
---

# SlotNova · Contexto del proyecto

Equipo de 3 en la Hackathon Colombia 5.0 Cúcuta (29 de octubre de 2026), reto de **Gnosoft**: generar horarios escolares con IA. Producto: **SlotNova · Planificación inteligente**. Santiago Sarmiento (UX e integración), Cielo (diseño), Colmenares (prompts y diseño). Todo en español, HTML + CSS + JavaScript puro.

**Principio: «la IA entiende, el motor garantiza».** El motor arma el horario, un validador independiente lo certifica y la IA (Claude o Gemini, opcional) solo traduce lo que dice el coordinador a reglas y acciones.

## Arranque de cada sesión (en este orden)

1. Leer **`CONTEXTO.md`** en la raíz del proyecto: versión, registro de cambios, mapa de archivos, contratos y pendientes. Es la fuente única de verdad.
2. Verificar que todo funciona:
   - `powershell -ExecutionPolicy Bypass -File pruebas/correr-recorrido.ps1` (recorrido en Chrome sin interfaz; no necesita Node). Esperado: «RESULTADO: N de N pasos correctos».
   - Si hay Node: `node pruebas/prueba.js` (motor, validador, reglas, Excel).
3. Abrir una referencia de esta skill **solo** si la tarea la necesita:

| Necesito… | Leer |
|---|---|
| Reglas oficiales, fórmulas de métricas, entregables, evaluación | `references/reto-oficial.md` |
| Datos de Gnosoft, trampas, cifras verificadas | `references/datos-y-trampas.md` |
| Qué hace cada archivo, API, contratos | `references/arquitectura.md` |

Skills especializadas: **horaria-motor** (motor, validador, reporte), **horaria-interfaz** (página, diseño, pruebas de pantalla), **horaria-ia-avisos** (IA, asistente, voz, avisos), **horaria-entrega** (README, pitch, demo, empaquetar). Agente **auditor-horaria** para la revisión final.

## Al terminar cada tarea (obligatorio)

Actualizar `CONTEXTO.md` antes de cerrar: subir la versión (semver), agregar una entrada al registro de cambios con fecha, cifras verificadas y pruebas corridas, y actualizar «Estado y pendientes». Si cambió un contrato (atributos `data-*`, API `HorarIA.*`, archivos), actualizar también la sección correspondiente y la skill afectada. Un hook del proyecto lo recuerda si se olvida.

## Hechos que no se pueden olvidar

- 120 sesiones requeridas (4 cursos × 30). Bloques B1–B6, lunes a viernes. **El tiempo es el ID del bloque**; la duración se configura en 45, 50 u otra cantidad de minutos.
- **D4 Carlos Peña: 28 sesiones asignadas, máximo 24.** Modo estricto → 116/120 con 4 pendientes explicadas. Modo con la alternativa del Léeme (Inglés con D4 o D6) → 120/120.
- Prueba de cambio obligatoria: **D02 (= D2, Luis Vega) no disponible el martes** → 2 afectadas, 4 movidas, 0 pendientes (semilla 1).
- Nunca entregar un horario con cruces: lo que no cabe queda **pendiente con motivo**.
- Evaluación: efectividad 40 %, usabilidad 20 %, flexibilidad 20 %, innovación e IA 20 %.

## Decisiones tomadas (no cambiarlas sin preguntar)

- JavaScript puro, **scripts clásicos** (no `import`), objeto global `window.HorarIA`. Abre con doble clic (`file://`) y funciona **sin internet**, salvo la IA. Se publica en **GitHub Pages**.
- Sin librerías externas ni CDN: lector y escritor de .xlsx, PDF, PNG/JPEG y código QR propios.
- IA directa desde el navegador con la clave de cada usuario (Claude o Gemini), activable y desactivable. La clave solo se guarda si el usuario marca «Recordar».
- Ya no hay botón de datos de ejemplo: se sube el Excel. El inicio de sesión es un prototipo visual (sin servidor).
- Avisos a familias sin la causa de la ausencia. Envío por enlace de WhatsApp.

## Cómo trabajar (eficacia con pocos tokens)

- Una tarea a la vez. Ubicar con Grep y leer con offset y límite; no releer archivos recién editados.
- Antes de algo no trivial: decir en 2 o 3 líneas qué cambia, qué invariante podría romperse y cómo se prueba.
- Verificar ejecutando (recorrido del navegador y, si hay Node, `pruebas/prueba.js`). Mostrar solo la línea de resultado.
- Si un pedido contradice el reto oficial o una decisión tomada, decirlo en una línea y preguntar.
