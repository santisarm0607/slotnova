# CONTEXTO · SlotNova

> **Versión actual: 2.0.0** · Última actualización: 31 de octubre de 2026 · Por: Claude (Opus 5.5, Claude Code) con Santiago Sarmiento.
> Fuente única de verdad del proyecto. Si eres una persona nueva u otra IA (Claude, Gemini, Codex, Copilot…), lee este archivo completo antes de tocar nada.

---

## 0. Protocolo de actualización (obligatorio para personas e IA)

**Cuándo:** al terminar cualquier cambio en código, estilos, pruebas, skills o documentos. Sin excepción.

**Qué hacer, en este orden:**
1. **Versión** (semver): MAYOR = cambia un flujo o un contrato (`data-*`, `HorarIA.*`, formato del enlace QR, archivos); MENOR = función nueva compatible; PARCHE = arreglo. Cambiarla aquí arriba, en `README.md` (línea «Versión») y en `PITCH.md` (encabezado).
2. **Registro de cambios** (sección 3): entrada nueva **arriba**, con fecha absoluta, autor (persona o IA y modelo), qué cambió, archivos tocados, cifras verificadas y pruebas corridas (con su resultado real; si algo no se pudo probar, decirlo).
3. **Estado y pendientes** (secciones 2 y 9): marcar lo hecho, agregar lo nuevo.
4. Si cambió un contrato, un archivo o una decisión: actualizar la sección correspondiente de este archivo y la skill afectada en `.claude/skills/` (subir su `metadata.version`).
5. No borrar historial. No dejar fechas relativas («ayer», «la próxima semana»).

**Mecanismos que lo recuerdan:** `CLAUDE.md` importa este archivo en cada sesión de Claude Code; `AGENTS.md` y `GEMINI.md` lo piden a otras IA; el hook `.claude/hooks/recordar-contexto.sh` (evento Stop) bloquea el cierre una vez si hay archivos más nuevos que este.

---

## 1. Qué es SlotNova

Aplicación web para el **reto Gnosoft** de la **Hackathon Colombia 5.0 Cúcuta** (29 de octubre de 2026): arma el horario escolar sin cruces, explica lo que no cabe, lo reacomoda ante cambios y prepara los avisos de ausencias. Antes se llamaba **HorarIA** (por eso el objeto global es `window.HorarIA`; `window.SlotNova` es un alias).

**Principio: «la IA entiende, el motor garantiza».** Un motor de optimización (backtracking + recocido simulado) arma el horario; un validador independiente lo certifica; la IA (Claude o Gemini, opcional) solo traduce lo que el coordinador escribe o dice a reglas y acciones, y nunca escribe filas del horario.

**Equipo:** Santiago Sarmiento (UX e integración), Cielo (diseño), Colmenares (prompts y diseño).

---

## 2. Estado actual (31 de octubre de 2026)

**Verificado y funcionando** (recorrido `pruebas/correr-recorrido.ps1`: **34 de 34 pasos correctos**, sin errores de consola, sin desplazamiento horizontal a 390 px):
- Inicio de sesión de prototipo (validación, invitado, avatar, cerrar sesión).
- Carga del Excel `datos/Datos_prueba_Gnosoft.xlsx`, sugerencias de cambios con nombres reales, jornada 45/50/otra y descanso visible.
- Cifras oficiales en pantalla: **base 120/120, 0 cruces, calidad 97/100**; **cambio D02 martes: 2 afectadas, 4 movidas, 0 pendientes**; **estricto 96,7 % (116/120) con 4 pendientes** (semilla 1).
- Intercambio guiado (opciones en verde), Deshacer y Deshacer todo; eventos informativos y con hora reservada; renombrar docentes y materias sin mover el horario.
- PDF bien formado (tabla xref verificada), PNG válido, enlace compartido ida y vuelta, código QR (decodificado con OpenCV con el texto exacto), visor del QR en celular.
- Asistente en modo local (generar, entender una sugerencia, aplicar), configuración de IA (sin clave no se activa; Gemini propone su modelo), opciones (nocturno, letra grande, contraste).
- Conexión con Claude y Gemini comprobada con claves falsas: ambas rutas llegan al servicio y muestran «La clave no es válida».

**No verificado todavía** (ver pendientes): conversación real con clave de Claude o Gemini (tool calling de punta a punta), `node pruebas/prueba.js` y la prueba de humo con Playwright (este computador no tiene Node), `empaquetar.js`, dictado por voz con micrófono real, QR escaneado con un celular real sobre GitHub Pages.

---

## 3. Registro de cambios

### 2.0.0 · 31 de octubre de 2026 · Claude (Opus 5.5) con Santiago
- **IA integrada para GitHub Pages**: nuevo `js/ia.js` (Claude Messages API `anthropic-version: 2026-10-21` con `anthropic-dangerous-direct-browser-access`, modelo por defecto `claude-opus-5-5` con `fallbacks: "default"` y beta `server-side-fallback-2026-07-01`; Gemini `generateContent`). Interruptor «Usar IA», diálogo «Configurar IA» (Claude o Gemini, clave propia, «Probar conexión», «Recordar»). `reglas.interpretarConIA` ahora usa `H.ia.completar` (se quitó la opción OpenAI).
- **Asistente** (`js/asistente.js`): chat con 14 herramientas (`HERRAMIENTAS` en `app.js`): ver horario, generar, restricciones, cambio del archivo, renombrar, editar máximo de un docente, eventos, ausencia del día, jornada, mostrar, descargar, guardar. Modo local sin IA. Historial solo de agregar.
- **Voz**: dictado (Web Speech API, `es-CO`) en Cambios y en el asistente; lectura de respuestas en voz alta.
- **Eventos** personalizables (tipo, color, día, horas, cursos, nota, «Reservar la hora» → reglas `prohibir` con `eventoId`), visibles en el horario y en las descargas.
- **Descargas**: menú «Descargar» con Excel, PDF (vista o todos los cursos), PNG, JPEG y **código QR** (nuevo `js/qr.js` y `js/exportar.js`, sin librerías). **Visor** de solo lectura al abrir el enlace `#ver=` en el celular.
- **Editar nombres** de docentes, materias y salones (diálogo y asistente) sin mover el horario.
- **Inicio de sesión** de prototipo visual y menú de cuenta.
- **Móvil**: pestañas abajo, horario día por día, asistente a pantalla completa, FAB.
- **Visual**: degradado de marca, cabecera translúcida, botones con presión, indicador de pestaña deslizante, entradas suaves, celdas con elevación, opciones que laten, destello tras intercambiar, logo girando al generar y «Pensando…» con el logo en el chat. Todo se apaga con «Reducir animaciones» o la preferencia del sistema.
- **Sugerencias de Cambios** armadas con los nombres del Excel subido (validadas con el intérprete local).
- Arreglos: identificadores únicos para eventos y horarios guardados (antes podían chocar en el mismo milisegundo); estilos del campo de correo; el visor oculta los controles si el enlace está dañado.
- **Contexto y herramientas**: este `CONTEXTO.md`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`; skills del proyecto en `.claude/skills/` (2.0.0) y agente en `.claude/agents/`; hook Stop; recorrido de pruebas `pruebas/recorrido-navegador.js` + `pruebas/correr-recorrido.ps1`. `ESTADO.md` quedó como puntero a este archivo.
- Archivos: `index.html`, `css/estilos.css`, `js/app.js`, `js/reglas.js`, nuevos `js/ia.js`, `js/asistente.js`, `js/exportar.js`, `js/qr.js`, `pruebas/*`, `README.md`, `PITCH.md`, `.claude/*`.
- Pruebas: recorrido 34/34; QR verificado con OpenCV; rutas de IA con claves falsas.

### 1.2.0 · 29 de octubre de 2026 (tarde) · Claude con Santiago
- Logo nuevo (SVG en cabecera y favicon; originales en `img/`) y colores de marca `#47529f` / `#84cde4`.
- «Mis horarios» (guardar con nombre, abrir, borrar con doble toque) y «Opciones» (tema, letra, contraste, animaciones).
- Se quitó el botón de datos de ejemplo (solo se sube el Excel). Duración «Otra», descanso por defecto 20 min después de B3 y visible en el horario.
- Intercambio guiado en verde y «Deshacer todo»; «Ver por qué» lleva a los pendientes; detalles de la revisión a todo el ancho debajo del botón Generar.
- Creado `PITCH.md`.

### 1.1.0 · 29 de octubre de 2026 · Claude con Santiago
- Interfaz rehecha en 4 pestañas (Datos · Horario · Cambios · Ausencias) con textos cortos y orientación comercial; tarjetas de cifras; reporte oficial y verificación en un plegable; interruptor de modo estricto; aviso del cambio del archivo. Método, límites e integración pasaron al README.

### 1.0.0 · 29 de octubre de 2026 (mañana) · equipo
- Primera versión completa (HorarIA → SlotNova): motor, validador, diagnóstico, reglas en español con intérprete local, lector y escritor de Excel propios, interfaz de 7 pasos, editor de datos, novedad del día con avisos, pruebas en Node.

---

## 4. Cómo correr y probar

- **Usar:** abrir `index.html` con doble clic, o la página publicada. Entrar (o «Entrar como invitado») y subir `datos/Datos_prueba_Gnosoft.xlsx`.
- **Recorrido de la página (sin Node):** `powershell -ExecutionPolicy Bypass -File pruebas/correr-recorrido.ps1` → debe decir «RESULTADO: 34 de 34 pasos correctos» y «ERRORES: ninguno». Con `-Hasta <paso> -Captura ruta.png -Ancho 1280 -Alto 2000` toma una captura (pasos: inicio, datos, detalles, generado, intercambio, eventos, exportar, qr, asistente, opciones). Chrome sin interfaz no baja de ~500 px de ancho: para 390 px se carga la página de prueba dentro de un `iframe` de 390 px.
- **Motor y datos (con Node 18+):** `node pruebas/prueba.js`.
- **Prueba de humo con Playwright y empaquetado:** scripts en `.claude/skills/horaria-interfaz/scripts/` (`prueba-humo.js`, `empaquetar.js`).
- **Auditor de métricas:** `.claude/skills/horaria-motor/scripts/auditar.js` (Node).

## 5. Publicar en GitHub Pages

Subir la carpeta al repositorio (con `index.html` en la raíz) → Settings → Pages → Deploy from a branch → `main` / `/ (root)`. La dirección `https://<usuario>.github.io/<repositorio>/` es la que usa el QR. Desde `file://` el diálogo del QR pide esa dirección y la recuerda (`slotnova.urlPublica`). No subir claves de IA: cada usuario escribe la suya.

## 6. Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Página: inicio de sesión, carga animada, visor, cabecera, 4 pestañas, diálogos (Opciones, Mis horarios, IA, Evento, Nombres, QR), asistente |
| `css/estilos.css` | Tokens (claro/oscuro), componentes, capa visual 2.0 (animaciones), móvil, accesibilidad, impresión |
| `js/xlsx-lector.js`, `js/xlsx-escritor.js` | Excel sin librerías (lectura y escritura) y `descargar(bytes, nombre, mime)` |
| `js/datos.js`, `js/datos-prueba.js` | Modelo de datos, escenario de la hoja Cambio, tiempo (duración, entrada, descanso); datos de Gnosoft para las pruebas |
| `js/diagnostico.js`, `js/motor.js`, `js/validador.js` | Revisión previa, motor (generar/reprogramar), certificado y métricas oficiales |
| `js/reglas.js` | Reglas, intérprete local en español, `interpretarConIA` |
| `js/qr.js` | Generador de códigos QR |
| `js/ia.js` | Claude y Gemini con herramientas |
| `js/exportar.js` | Horario a canvas, PNG/JPEG, PDF, enlace compartido comprimido |
| `js/app.js` | Controlador de la interfaz y `HorarIA.app` (estado, herramientas para la IA, resumen) |
| `js/asistente.js` | Chat, modo local, voz |
| `pruebas/prueba.js` | Pruebas del motor (Node) |
| `pruebas/recorrido-navegador.js`, `pruebas/correr-recorrido.ps1` | Recorrido de la página en Chrome |
| `prompts/agente-ia.md` | Prompt del agente que convierte frases en reglas |
| `datos/Datos_prueba_Gnosoft.xlsx` | Datos oficiales del reto |
| `img/` | Logo original (completo e ícono) |
| `README.md`, `PITCH.md` | Uso, método, límites e integración; guía del pitch y la demo |
| `CONTEXTO.md`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `ESTADO.md` | Contexto y punteros para personas e IA (`ESTADO.md` solo redirige aquí) |
| `.claude/skills/`, `.claude/agents/`, `.claude/settings.json`, `.claude/hooks/` | Skills, agente auditor, hook del proyecto |

## 7. Arquitectura y contratos (resumen)

- Orden de carga: `xlsx-lector, datos, datos-prueba, diagnostico, motor, validador, reglas, xlsx-escritor, qr, ia, exportar, app, asistente` (scripts clásicos).
- Detalle de API, estado, formato del enlace QR y almacenamiento: `.claude/skills/horaria-contexto/references/arquitectura.md`.
- Contrato de la interfaz (`data-accion`, `data-metrica`, `data-vista`, `body[data-estado|data-modo]`): `.claude/skills/horaria-interfaz/references/contrato-ui.md`.
- `localStorage`: `slotnova.sesion`, `slotnova.horarios`, `slotnova.opciones`, `slotnova.ia` (solo con «Recordar»), `slotnova.urlPublica`, `slotnova.voz`.

## 8. Decisiones tomadas (no cambiarlas sin preguntar al equipo)

- JavaScript puro, scripts clásicos, sin librerías ni CDN; abre con doble clic y funciona sin internet salvo la IA.
- La IA nunca escribe el horario: pide acciones al motor; todo lo valida el validador. Lo que no cabe queda pendiente con motivo; nunca se entrega un horario con cruces.
- IA directa desde el navegador con la clave de cada usuario (Claude o Gemini), activable y desactivable; la clave solo se guarda si el usuario marca «Recordar».
- Sin botón de datos de ejemplo: se sube el Excel. El inicio de sesión es un prototipo visual.
- Descanso por defecto: 20 minutos después de B3 (solo cambia las horas mostradas).
- Avisos sin la causa de la ausencia; envío por enlace de WhatsApp.
- Publicación en GitHub Pages; el QR lleva el horario dentro del enlace (sin servidor).

## 9. Pendientes y próximos pasos (en orden)

1. Probar con **claves reales** de Claude y de Gemini: asistente con herramientas de punta a punta, «Revisar cambio» con IA y «Probar conexión». Si la API rechaza `fallbacks: "default"` o la beta `server-side-fallback-2026-07-01` (error 400), quitarlas en `js/ia.js`. Si `gemini-3.6-flash` no existe en la cuenta, cambiar el modelo por defecto en `H.ia.PROVEEDORES`.
2. En un equipo con Node: `node pruebas/prueba.js`, `prueba-humo.js` y `empaquetar.js` (genera `dist/` y el zip de entrega).
3. Publicar en GitHub Pages y escanear el QR con un celular real; probar el dictado con micrófono en Chrome o Edge.
4. Revisión final con el agente `auditor-horaria` antes de entregar.
5. Ideas: hoja de eventos en el Excel de resultados; guardar la conversación del asistente; inicio de sesión real integrado con Gnosoft; sincronizar «Mis horarios» entre equipos.

## 10. Skills, plugins y herramientas usadas

**Skills del proyecto** (`.claude/skills/`, versión 2.0.0; Claude Code las carga solo al abrir esta carpeta; cualquier IA puede leer sus `SKILL.md`):
| Skill | Para qué |
|---|---|
| `horaria-contexto` | Arranque de cada sesión, hechos clave, decisiones, referencias (reto oficial, datos y trampas, arquitectura) |
| `horaria-motor` | Motor, validador, métricas; auditor independiente `scripts/auditar.js` |
| `horaria-interfaz` | Página, diseño, móvil, contrato de la interfaz; `prueba-humo.js` y `empaquetar.js` |
| `horaria-ia-avisos` | IA (Claude/Gemini), asistente, voz, intérprete local, avisos; `evaluar-frases.js` |
| `horaria-entrega` | Entregables, README, demo y jurado; `generar-resultados.js` |

**Agente:** `auditor-horaria` (`.claude/agents/auditor-horaria.md`): revisión final independiente contra el reto oficial.

**Hook:** `.claude/settings.json` → Stop → `.claude/hooks/recordar-contexto.sh` (POSIX sh, sin Node ni jq). Si recién se agregó, abrir `/hooks` una vez o reiniciar Claude Code para que lo cargue.

**Plugin anterior:** `horaria-hackathon` 0.1.0 (sincronizado en la cuenta de Santiago). Las skills del proyecto son su versión actualizada: si aparecen ambas, usar las del proyecto.

**Skills de Claude Code usadas al construir 2.0.0:** `claude-api` (forma actual de la API de Claude: versión `2026-10-21`, modelos, respaldo de modelo, herramientas) y `update-config` (hook). Para Gemini se consultó la documentación de Google (los IDs de modelo cambian seguido; por eso «Probar conexión» lista los reales).

**Herramientas de verificación:** Chrome sin interfaz (recorrido y capturas), Python con OpenCV en un entorno temporal (lectura de los QR generados; opcional).

## 11. Datos clave del reto (no olvidar)

- 4 cursos (6A, 6B, 7A, 7B) × 30 clases = 120; 6 docentes; 16 salones; bloques B1–B6, lunes a viernes. El tiempo es el ID del bloque.
- **D4 Carlos Peña: 28 clases asignadas, máximo 24** → estricto 116/120 con 4 pendientes (Inglés de 6B); con la alternativa del Léeme (Inglés con D4 o D6) → 120/120 (el Inglés de 6B pasa a Andrés Castro, D6).
- La ficha escribe «D02» y el Excel «D2»: son el mismo docente (Luis Vega). Prueba de cambio: D02 sin martes → 2 afectadas, 4 movidas, 0 pendientes.
- Evaluación: efectividad 40 %, usabilidad 20 %, flexibilidad 20 %, innovación e IA 20 %.
