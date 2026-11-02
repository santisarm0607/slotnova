---
name: horaria-ia-avisos
description: "Esta skill debe usarse cuando se trabaja en la parte de IA de HorarIA o en los avisos: el agente que convierte frases del coordinador en reglas (js/reglas.js, prompts/agente-ia.md), el intérprete local sin internet, la conexión con la API de un modelo, las novedades (\"Luis no viene el martes\"), la novedad del día con suplente, acompañamiento o clase cancelada, y los mensajes para padres de familia y docentes. Se activa con \"la IA\", \"el prompt\", \"el agente\", \"novedades\", \"que entienda frases\", \"conectar la API\", \"avisos a padres\", \"WhatsApp\", \"suplente\".\n"
metadata:
  version: "2.0.0"
---

# SlotNova · IA, asistente, voz y avisos

Innovación e integración de IA vale 20 %. La IA debe verse útil y **nunca** poner en riesgo el horario.

## Reglas del agente

- **Dos proveedores, ambos opcionales** (`js/ia.js`): Claude (Messages API, `anthropic-version: 2026-10-21`, cabecera `anthropic-dangerous-direct-browser-access`, modelo por defecto `claude-opus-5-5` con `fallbacks: "default"` y la beta `server-side-fallback-2026-07-01`) o Gemini (`generateContent`; «Probar conexión» trae la lista real de modelos de la cuenta). No enviar `temperature`, `top_p` ni `top_k`: la API los rechaza.
- **Pestaña Cambios**: la IA devuelve JSON `{reglas, respuesta, dudas}` (ver `horaria-contexto/references/arquitectura.md`); cada regla pasa por `reglas.normalizarRegla` y el coordinador la **confirma**. Si la frase es ambigua, la IA pregunta en `dudas`.
- **Asistente** (`js/asistente.js`): conversa y usa las herramientas de `HERRAMIENTAS` en `app.js` (ver horario, generar, restricciones, cambio del archivo, renombrar, editar docente, eventos, ausencias, jornada, mostrar, descargar, guardar). Cada turno lleva el bloque «Contexto actualizado por SlotNova» (`HorarIA.app.resumen()`). El historial solo se agrega al final: nunca editar turnos viejos.
- La IA **nunca** toca el horario: pide acciones; el motor las ejecuta y el validador las certifica.
- **Plan B siempre**: sin clave, con la IA apagada (interruptor «Usar IA») o sin internet, se usa `reglas.interpretarLocal` y órdenes simples en el asistente («genera el horario», «descarga el PDF»). Si la API falla, el asistente lo dice y responde en modo local.
- La clave la escribe cada usuario en «Configurar IA»; vive en memoria y solo se guarda en `localStorage` si marca «Recordar». Nunca en el código ni en el repositorio.
- **Voz**: dictado con Web Speech API (`es-CO`) en Cambios y en el asistente; lectura de respuestas con `speechSynthesis` (botón del parlante). Firefox no tiene dictado.
- Las sugerencias de Cambios y del asistente se arman con los nombres del Excel subido y se validan con el intérprete local antes de mostrarse.

## Evaluar antes de cambiar

`scripts/evaluar-frases.js` pasa el conjunto `references/frases-prueba.json` (frases reales del coordinador, con la regla esperada) por el intérprete local y, con `--ia`, por la API. Imprime aciertos y solo las fallas.

```bash
node <ruta-skill>/scripts/evaluar-frases.js --proyecto horaria
node <ruta-skill>/scripts/evaluar-frases.js --proyecto horaria --ia --proveedor anthropic --modelo <modelo> --clave $CLAVE
```
`<ruta-skill>` es el directorio base de esta skill, que aparece al cargarla. Protocolo: correr la evaluación, agregar al JSON las frases nuevas que pida el equipo (con su resultado esperado), cambiar el prompt o el intérprete y volver a correr. No dar por bueno un cambio que baje los aciertos.

## Novedad del día y avisos

Especificación del flujo (suplente → acompañamiento → cancelada, salida anticipada) y plantillas de mensajes en `references/novedad-y-avisos.md`. Leerla antes de construir esta parte. Puntos fijos:
- Los avisos **nunca** dicen la causa de la ausencia (salud o motivos personales): dicen «novedad del docente».
- Solo se generan para los cursos afectados. Cada aviso: curso, día, hora calculada con la configuración de bloques, materia, qué pasa y, si cambia, la hora de salida o de entrada.
- Envío: botón «Copiar» y enlace `https://wa.me/?text=` + `encodeURIComponent(texto)`. No prometer envío automático.
- Es prioridad 3: construirlo solo cuando lo obligatorio pase la prueba de humo.

## Qué mostrar al jurado

Frase escrita o dictada en vivo → «Esto entendí» → «Aplicar al horario» → horario reacomodado sin cruces. Luego el asistente: «Agrega una izada de bandera el lunes a primera hora para todos» o «¿Qué clases tiene Carlos Peña el lunes?». Tener a mano las sugerencias de Cambios, que funcionan **sin internet**.
