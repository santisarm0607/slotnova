---
name: horaria-entrega
description: "Esta skill debe usarse cuando HorarIA se va a entregar, presentar o mostrar: \"entregar\", \"empaquetar\", \"preparar la entrega\", \"el zip\", \"el README\", \"instrucciones de ejecución\", \"explicar el método\", \"límites\", \"integración con Gnosoft\", \"archivo de resultados\", \"la demo\", \"el pitch\", \"la presentación\", \"preguntas del jurado\", \"congelar el código\" o \"revisar que no falte nada\". Da la lista de entregables oficiales, la secuencia de verificación, las plantillas del README y el guion de la demo.\n"
metadata:
  version: "2.0.0"
---

# SlotNova · Entrega y demo

Una entrega incompleta pierde puntos aunque el motor sea bueno. Esta skill asegura que no falte nada y que la demo no falle.

## Entregables oficiales (todos obligatorios)

| # | Entregable | Dónde queda |
|---|---|---|
| 1 | Prototipo ejecutable | `index.html` publicado en GitHub Pages + `dist/HorarIA.html` (un archivo, sin internet) |
| 2 | Datos de entrada usados | `documentos-oficiales/Datos_prueba_Gnosoft.xlsx` dentro del zip |
| 3 | Vistas por curso y por docente | en la página |
| 4 | Resumen: requeridas, asignadas, pendientes, conflictos y preferencias | reporte en la página y hoja «Validación» del Excel |
| 5 | Archivo de resultados | `resultados/horario-base.xlsx` y `resultados/horario-cambio-D02.xlsx` |
| 6 | Instrucciones breves de ejecución | `README.md` (y `PITCH.md` para la presentación) |
| 7 | Método y sus límites | `README.md` (y una diapositiva) |
| 8 | Posible intercambio de datos con Gnosoft, sin asumir API | `README.md` |
| 9 | Prueba de cambio D02 martes con afectadas, movidas y pendientes | página + Excel de cambio |

## Secuencia de verificación (en este orden; parar y corregir si algo falla)

1. `powershell -ExecutionPolicy Bypass -File pruebas/correr-recorrido.ps1` → «N de N pasos correctos»; si hay Node, también `node pruebas/prueba.js`.
2. Auditor de **horaria-motor** en los dos modos → alternativa 120/120 sin colisiones; estricto 116/120 con 0 infracciones y 4 pendientes.
3. Generar los archivos de resultados con `node <ruta-skill>/scripts/generar-resultados.js --proyecto horaria --salida resultados` y auditarlos con el auditor de **horaria-motor**: `--resultado resultados/horario-base.xlsx`, `--resultado resultados/horario-estricto.xlsx --estricto` y `--resultado resultados/horario-cambio-D02.xlsx --escenario`. (`<ruta-skill>` es el directorio base de esta skill.)
4. Prueba de humo de **horaria-interfaz** sin errores de consola.
5. `empaquetar.js` → `dist/HorarIA.html`, `dist/horaria-artefacto.html`, `dist/horaria-entrega.zip`. Publicar el artefacto para probar dentro de Claude y entregar el zip.
6. Abrir `dist/HorarIA.html` con el Wi-Fi apagado: debe funcionar todo menos la IA (que usa el intérprete local).
7. Revisión final con el agente **auditor-horaria** (no vio el trabajo, compara contra el reto oficial). Corregir lo crítico.

## README

Usar `references/plantilla-readme.md`. Llenarlo con cifras reales del auditor, no estimadas. Máximo 2 páginas: el jurado lo lee rápido.

## Demo y jurado

Guion de 3 a 4 minutos, reparto de quién habla y respuestas a preguntas probables en `references/demo-y-jurado.md`. Ensayar 3 veces con cronómetro y grabar un video de respaldo de la página funcionando.

## Congelar

Una hora antes de presentar: no más funciones. Solo correcciones que el auditor o la prueba de humo marquen como críticas, y siempre volviendo a correr la secuencia completa.
