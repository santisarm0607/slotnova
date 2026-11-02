# SlotNova

**Versión 2.0.0** · Planificación inteligente de horarios escolares sin cruces, para el reto Gnosoft de la Hackathon Colombia 5.0 Cúcuta (29 de octubre de 2026).
Equipo: Santiago Sarmiento, Cielo y Colmenares.

**Principio: la IA entiende, el motor garantiza.** Un motor de optimización arma el horario, un validador independiente lo certifica y la IA (Claude o Gemini, opcional) traduce lo que el coordinador escribe o dice a reglas y acciones. Contexto completo y registro de cambios: [CONTEXTO.md](CONTEXTO.md).

## Cómo ejecutarlo

1. **En línea (recomendado):** abrir la página publicada en GitHub Pages (ver «Publicar en GitHub Pages»). **Sin internet:** abrir `index.html` con doble clic (Chrome, Edge o Firefox actualizados). Todo funciona sin conexión salvo la IA.
2. Iniciar sesión (prototipo: la sesión vive en el navegador) o «Entrar como invitado».
3. En **Datos**, arrastrar o elegir el Excel (`datos/Datos_prueba_Gnosoft.xlsx` o cualquier libro con el mismo formato; hay plantilla descargable). Revisar la jornada (45, 50 u otra duración; descanso de 20 minutos después de B3) y pulsar **«Generar horario»**.
4. En **Horario**: cifras clave, vista por curso, docente, salón o todos (en celular, día por día), intercambio guiado, eventos, «Aplicar cambio» (D02 = Luis Vega sin martes), interruptor «Solo el docente asignado» y **Descargar** (Excel, PDF, PNG, JPEG o **código QR** para abrirlo en el celular).
5. En **Cambios**, escribir o **dictar** el cambio; con «Usar IA» activo lo interpreta Claude o Gemini. El botón **Asistente** (abajo a la derecha) conversa y ejecuta acciones.
6. En **Ausencias**, elegir quién falta: propone quién cubre y deja los avisos listos para WhatsApp.

> Dentro de una vista previa (por ejemplo, un artefacto de Claude) las descargas pueden estar bloqueadas y Imprimir se oculta.

## Qué hay en cada pantalla

| Dónde | Qué hace |
|---|---|
| Inicio de sesión | Prototipo visual: correo y contraseña (mínimo 6) o invitado. No hay servidor y la contraseña no se guarda |
| Cabecera | Logo, **Mis horarios** (guardar con nombre, abrir, borrar), **Opciones** (tema automático, claro o nocturno; letra normal, grande o muy grande; alto contraste; reducir animaciones) y la cuenta (cerrar sesión) |
| Datos | Zona para arrastrar el Excel y plantilla. Jornada: **45, 50 u otra duración**, entrada y descanso (visible en la lista de horas y en el horario); el **ID del bloque (B1 a B6) es la unidad de tiempo**. Revisión de los datos, botón «Generar horario», detalles a todo el ancho y «Editar datos» |
| Horario | Guardar, **+ Evento**, Otra versión, **Descargar** (Excel, PDF de la vista, PDF de todos los cursos, PNG, JPEG, QR) e Imprimir. Cuatro tarjetas (programadas, cruces, pendientes con enlace al motivo, calidad), interruptor estricto, aviso del cambio del archivo y «Qué cambió». Vistas con fila de descanso, «↻ Movida», etiquetas de eventos «★». **Intercambio guiado** en verde, Deshacer y Deshacer todo. **✎ Editar nombres** (docentes, materias, salones) sin mover el horario. Lista de eventos, clases pendientes, «Cómo se armó este horario» y «Reporte completo» |
| Cambios | Estado de la IA, interruptor **Usar IA** y «Configurar IA» (Claude o Gemini, clave propia, «Probar conexión», «Recordar»). Caja con **micrófono** y **sugerencias armadas con los nombres del Excel**. «Esto entendí» → Aplicar o Descartar; lista de cambios activos |
| Ausencias | Suplente de la misma materia → acompañamiento → cancelación (con salida anticipada o entrada tarde). Avisos editables con «Abrir en WhatsApp», «Copiar» y «Marcar como enviado». Nunca dicen la causa |
| Asistente | Chat con Claude o Gemini que **ejecuta acciones** (generar, restricciones, eventos, renombrar, máximo de un docente, jornada, ausencias, vistas, descargas, guardar) y responde preguntas del horario. Dictado por voz y lectura de respuestas en voz alta. Sin IA entiende las frases comunes y órdenes simples |
| Visor (enlace del QR) | Horario de solo lectura en el celular: elegir curso, docente o salón y descargar imagen o PDF |

## Publicar en GitHub Pages

1. Subir la carpeta del proyecto a un repositorio de GitHub (la raíz debe tener `index.html`).
2. En el repositorio: **Settings → Pages → Build and deployment → Deploy from a branch**, rama `main`, carpeta `/ (root)`. Guardar.
3. En uno o dos minutos la página queda en `https://<usuario>.github.io/<repositorio>/`. Esa dirección es la que usa el **código QR**.
4. La IA funciona desde ahí: cada usuario escribe su propia clave en «Configurar IA» (no se sube nada al repositorio).

## IA: Claude o Gemini

- **Claude:** crear la clave en console.anthropic.com → API keys. Modelos: `claude-opus-5-5` (predeterminado), `claude-sonnet-5-5` o `claude-haiku-5-5`. La app usa la Messages API directo desde el navegador.
- **Gemini:** crear la clave en aistudio.google.com → Get API key. «Probar conexión» trae la lista real de modelos de la cuenta.
- El interruptor **Usar IA** la activa o apaga. Sin clave, sin internet o con la IA apagada, SlotNova usa su intérprete local en español.
- La clave queda en memoria; solo se guarda en el navegador si se marca «Recordar». No usarla en computadores compartidos.

## Resultados con los datos de Gnosoft

| Escenario | Resultado |
|---|---|
| Horario base, con alternativa del Léeme | **120/120 (100 %)**, 0 colisiones, 0 infracciones, calidad 97 a 98/100, de 5 a 9 huecos docentes según la semilla, unos 0,1 s. Decisión: el Inglés de 6B pasa de Carlos Peña (D4) a Andrés Castro (D6) porque D4 tendría 28 sesiones y su máximo es 24 |
| Modo estricto (solo el docente asignado) | **116/120 (96,7 %)**, 0 colisiones, 0 infracciones y 4 pendientes: Inglés de 6B, porque «Carlos Peña (D4) tendría 28 sesiones y su máximo semanal es 24». Sugerencia: activar la alternativa (D6) |
| Prueba de cambio: D02 sin martes (semilla 1) | 2 sesiones afectadas, 4 movidas, 0 pendientes, certificado válido |
| D1 sin lunes (prueba de imposible) | Horario parcial sin cruces: 1 sesión pendiente, explicada («24 sesiones y solo 23 bloques disponibles») |

**Hallazgos de los datos:** D4 no cabe en su máximo (28 > 24). D1 y D3 quedan al 100 % (24 de 24) y D1 no puede el viernes en B6. Los salones no son el cuello de botella (4 de cada tipo). La ficha escribe «D02» y el Excel «D2»: SlotNova los trata como el mismo docente. Las horas del Excel van en tramos de 60 minutos, pero el bloque dura 50: por eso las horas se recalculan desde la configuración.

## Reporte oficial (definiciones de la guía)

Se calcula **solo desde las filas finales** (`HorarIA.reporte`), sin confiar en el motor:

- **Requeridas:** suma de `sesiones_semana` de la Carga.
- **Asignadas:** filas con asignatura.
- **Válidas:** cumplen todas las reglas obligatorias. La segunda fila de un cruce, las duplicadas y las sobrantes no cuentan.
- **Pendientes:** requeridas − válidas, con curso, asignatura, docente titular, motivo y sugerencia.
- **Cobertura:** válidas ÷ requeridas × 100.
- **Colisiones:** cada **par** de asignaciones que comparte curso, docente o salón en el mismo día y bloque, separadas por categoría.
- **Infracciones** (aparte de las pendientes): disponibilidad, docente no asignado (modo estricto), docente no habilitado, tipo o capacidad de salón, máximo semanal, intensidad excedida y reglas del coordinador.
- **Preferencias** (aparte): sesiones consecutivas de la misma asignatura, asignatura repetida el mismo día, asignaturas repartidas en días distintos, huecos docentes y puntaje de calidad de 0 a 100.
- **Cambio:** sesiones afectadas, movidas (antes → ahora), reasignadas y pendientes nuevas.

## Método

1. **Diagnóstico:** compara la carga de cada docente con su máximo semanal y sus bloques disponibles.
2. **Reparto de docentes:** usa el docente asignado. Si alguno se pasa, busca por *backtracking* la alternativa habilitada que cambie lo mínimo. En modo estricto no hay alternativas: el exceso se recorta y queda como **pendiente con su motivo**, empezando por las asignaturas que tienen alternativa (para que la sugerencia sea accionable).
3. **Ubicación:** recocido simulado sobre la cuadrícula de cada curso. Intercambia dos clases del mismo curso y las reglas obligatorias pesan 1000 veces más que las preferencias (materia repetida el mismo día, huecos, reglas «evitar» y clases movidas al reprogramar). Usa una semilla para que la demo sea reproducible.
4. **Nunca entrega cruces:** si al terminar alguna celda sigue en conflicto, sale de la cuadrícula y pasa a pendientes con su causa.
5. **Salones:** el aula propia del curso para GENERAL y, para los demás tipos, un salón del tipo y la capacidad requeridos, por emparejamiento sin cruces.
6. **Reprogramación:** parte del horario anterior y penaliza cada clase movida.
7. **Validador independiente:** certificado regla por regla contra los datos originales.
8. **IA:** convierte frases como «Luis no viene el martes» en reglas JSON (`bloquear_docente`, `prohibir`, `evitar`, `max_por_dia`). La regla se muestra para confirmarla y la aplica el motor. Sin clave o sin internet funciona el intérprete local en español.

## Límites

- Es una heurística con tiempo máximo (4 s): si no encuentra una solución completa no demuestra que no exista. Por eso lo que no cabe se informa como pendiente con su causa y una sugerencia, en lugar de ocultarse.
- Con cientos de grupos o reglas contradictorias puede tardar más o dejar pendientes. «Otra versión» prueba otra semilla.
- La IA puede interpretar mal una frase: la regla se muestra para confirmarla y el validador impide un horario con errores.
- Las preferencias (repartir materias y reducir huecos) se optimizan, pero no siempre llegan a cero.
- Los horarios guardados («Mis horarios») viven en el navegador de ese computador: no se sincronizan entre equipos. Para compartir uno, se descarga el Excel.
- El inicio de sesión es un prototipo visual: no hay servidor ni cuentas reales.
- La IA depende de la clave y del saldo de cada usuario; la clave queda visible para quien use ese navegador. El dictado por voz funciona en Chrome, Edge y Safari (no en Firefox).
- El código QR necesita la página publicada (GitHub Pages); el horario viaja dentro del enlace, sin servidor.
- La novedad del día propone coberturas para un solo día y no reescribe la semana. El envío de avisos se hace con un toque desde WhatsApp; el envío automático queda como integración futura.

## Integración con Gnosoft (sin suponer que hay una API)

- **Entrada:** el mismo libro .xlsx de Gnosoft (o CSV con las mismas columnas) con los mismos identificadores: `curso_id`, `docente_id`, `asignatura`, `salon_id` y `bloque_id`. El enlace «Descarga la plantilla» genera ese formato.
- **Salida:** `SlotNova_Horario.xlsx` con la hoja `Horario` (una fila por sesión: curso_id, día, bloque_id, inicio, fin, asignatura, docente_id, salon_id, cambio), una hoja por curso y por docente, `Reporte`, `Pendientes`, `Carga usada` y `Validación`. Se puede importar de vuelta con los mismos IDs.
- **A futuro:** el motor es JavaScript sin dependencias y podría correr como servicio dentro de la plataforma sin cambiar el formato de intercambio.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Página (HTML5 semántico y accesible) |
| `css/estilos.css` | Estilos: tokens, modo oscuro, colores por materia, impresión |
| `js/app.js` | Controlador de la interfaz: pestañas, eventos, nombres, descargas, QR, visor, sesión y herramientas para la IA (`HorarIA.app`) |
| `js/asistente.js` | Asistente: chat con Claude o Gemini que ejecuta acciones, modo local y voz |
| `js/ia.js` | Conexión con Claude y Gemini desde el navegador, con herramientas |
| `js/exportar.js` | Horario a imagen (PNG, JPEG), PDF y enlace compartido para el QR |
| `js/qr.js` | Generador de códigos QR sin librerías |
| `js/xlsx-lector.js` | Lee .xlsx sin librerías (ZIP + XML con `DecompressionStream`) |
| `js/datos.js` | Hojas de Gnosoft → modelo. `aplicarEscenario`, `configurarTiempo` y `normalizarId` (D02 = D2) |
| `js/datos-prueba.js` | Datos de Gnosoft ya convertidos (los usan las pruebas automáticas y la lista de horas antes de subir el Excel) |
| `img/` | Logo de SlotNova (completo e ícono). En la página el ícono va dibujado en SVG |
| `PITCH.md` | Guía del proyecto para el pitch y la demo |
| `CONTEXTO.md` | Versión, registro de cambios y contexto completo para quien continúe el proyecto (personas u otras IA) |
| `CLAUDE.md`, `AGENTS.md` | Instrucciones de arranque para Claude y otras IA; apuntan a `CONTEXTO.md` |
| `.claude/` | Skills, agente auditor y hook del proyecto para Claude Code |
| `js/diagnostico.js` | Semáforo antes de generar, según el modo |
| `js/motor.js` | Genera y reprograma: modo estricto o con alternativas y pendientes con motivo |
| `js/validador.js` | `validar` (certificado) y `reporte` (métricas de la guía) |
| `js/reglas.js` | Reglas JSON, intérprete local y conexión con la IA |
| `js/xlsx-escritor.js` | Exporta los resultados a .xlsx |
| `prompts/agente-ia.md` | Prompt de sistema del agente |
| `pruebas/prueba.js` | Pruebas automáticas del motor (Node) |
| `pruebas/recorrido-navegador.js`, `pruebas/correr-recorrido.ps1` | Recorrido de la página en Chrome sin interfaz (34 verificaciones, no necesita Node) |
| `datos/Datos_prueba_Gnosoft.xlsx` | Datos de entrada oficiales |

Los scripts son clásicos (sin `import`), para que funcionen al abrir el archivo con doble clic (`file://`).

## Pruebas

**Página completa (sin Node):** `powershell -ExecutionPolicy Bypass -File pruebas/correr-recorrido.ps1` → «34 de 34 pasos correctos».

**Motor y datos** (requiere Node 18 o superior):

```bash
node pruebas/prueba.js
node pruebas/prueba.js datos/Datos_prueba_Gnosoft.xlsx
```

Cubren: lectura del Excel, D02 = D2, bloques de 45 y 50 minutos, diagnóstico en los dos modos, horario base con 5 semillas, modo estricto (116/120), prueba de cambio, reglas del coordinador, un caso imposible con pendiente explicada, el intérprete local, colisiones por pares, filas duplicadas y la exportación a Excel.

## API rápida

```js
const H = window.HorarIA; // también window.SlotNova

const datos = H.configurarTiempo(H.DATOS_PRUEBA, { duracionMinutos: 50, horaInicio: '07:00' });
const dx = H.diagnosticar(datos, reglas, { modoDocente: 'alternativas' });
const r = H.motor.generar(datos, { semilla: 1, reglas, modoDocente: 'alternativas' | 'estricto' });
// r = { ok, completo, filas, pendientes:[{curso, asignatura, docente, sesiones, motivo, sugerencia}], decisiones, carga, estadisticas }
const cert = H.validar(datos, r.filas, reglas, { modoDocente });
const rep = H.reporte(datos, r.filas, reglas, anterior, { modoDocente, pendientes: r.pendientes });
const cambio = H.motor.reprogramar(H.aplicarEscenario(datos), r, { semilla: 1, modoDocente });
const { reglas: nuevas, dudas } = H.reglas.interpretarLocal('Luis Vega (D02) no está disponible el martes', datos);
H.descargar(H.libroHorario(datos, r, cert, rep), 'SlotNova_Horario.xlsx');
```

## Checklist antes de presentar

- [ ] `index.html` abre con doble clic en los 3 computadores, con el Wi-Fi apagado.
- [ ] El Excel `datos/Datos_prueba_Gnosoft.xlsx` carga bien en el computador de la demo (ya no hay botón de datos de ejemplo: llevar el archivo también en la USB).
- [ ] Horario base 120/120 y prueba de cambio sin cruces (tarjetas en verde).
- [ ] El modo estricto muestra las 4 pendientes explicadas.
- [ ] Sin IA, el intérprete local entiende las frases de ejemplo.
- [ ] Excel de resultados exportado y guardado.
- [ ] Video de respaldo de la demo y copia del proyecto en una USB.
