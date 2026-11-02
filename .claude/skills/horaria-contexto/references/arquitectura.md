# Arquitectura y API (SlotNova 2.0)

Scripts clásicos, todo cuelga de `window.HorarIA` (alias `window.SlotNova`; en Node: `globalThis.HorarIA` tras `require`). Orden de carga en `index.html`:
`xlsx-lector, datos, datos-prueba, diagnostico, motor, validador, reglas, xlsx-escritor, qr, ia, exportar, app, asistente`.

| Archivo | Exporta | Notas |
|---|---|---|
| `js/xlsx-lector.js` | `leerXlsx(arrayBuffer)` → `{hoja: [[celdas]]}` | ZIP + XML propio, `DecompressionStream('deflate-raw')` |
| `js/datos.js` | `desdeLibro`, `aplicarEscenario`, `describirEscenario`, `configurarTiempo`, `H.datos.{normalizarId, clonar, aMinutos, aHora}` | `configurarTiempo` calcula horas con duración, entrada y descanso |
| `js/datos-prueba.js` | `DATOS_PRUEBA` | Generado desde el Excel; lo usan las pruebas (la página ya no tiene botón de ejemplo) |
| `js/diagnostico.js` | `diagnosticar(datos, reglas, {modoDocente})` | niveles ok/aviso/info/error |
| `js/motor.js` | `motor.generar(datos, {semilla, reglas, modoDocente})`, `motor.reprogramar(datos, anterior, opc)` | backtracking + recocido simulado |
| `js/validador.js` | `validar(...)` (certificado), `reporte(...)` (métricas de la guía) | independiente del motor |
| `js/reglas.js` | `reglas.interpretarLocal`, `reglas.interpretarConIA(texto, datos, cfg)`, `normalizarRegla`, `describir`, `buscarDocente`, `buscarAsignatura`, `promptSistema` | `interpretarConIA` usa `H.ia.completar` |
| `js/xlsx-escritor.js` | `escribirXlsx`, `libroHorario`, `descargar(bytes, nombre, tipoMime)` | |
| `js/qr.js` | `qr.generar(texto, 'L'|'M'|'Q'|'H')` → `{version, tamano, modulos}`, `qr.dibujar(canvas, qr, escala)` | QR propio, verificado con OpenCV |
| `js/ia.js` | `ia.conversar(cfg, sistema, historial, partes, herramientas, ejecutar, avisar)`, `ia.completar`, `ia.listarModelos`, `ia.PROVEEDORES` | Claude (`anthropic-version: 2026-10-21`, respaldo `fallbacks: "default"` en Opus/Sonnet 5.5) o Gemini (`generateContent`). Historial solo se agrega al final |
| `js/exportar.js` | `exportar.{modeloVista, lienzo, lienzoVarios, imagen, pdf, codificar, decodificar, compactarCeldas, COLORES}` | Horario a canvas, PDF con JPEG por página, enlace `#ver=` comprimido |
| `js/app.js` | `HorarIA.app = {estado, irA, ejecutar, herramientas, resumen, sugerencias, compartido, …}` | Controlador de la interfaz |
| `js/asistente.js` | `HorarIA.asistente.{abrir, cerrar, enviar}` | Chat con herramientas, modo local y voz (Web Speech API) |

## Estado de la interfaz (`HorarIA.app.estado`)
`{original, datos, ef, tiempo, escenario, modo, semilla, reglas[], base, actual, referencia, cert, rep, historial[], vista{tipo,id,dia}, ia{proveedor, modelo, clave, activa, recordar, estado}, eventos[], nombre, sesion, …}`
- **Eventos**: `{id, titulo, tipo: acto|reunion|evaluacion|salida|otro, color, dia, bloques[], cursos[] (vacío = todos), reservar, nota}`. Si `reservar`, se crean reglas `prohibir` por curso con `eventoId` (no se muestran en «Cambios activos»).
- **Herramientas de la IA** (`HERRAMIENTAS` en app.js): ver_horario, generar_horario, agregar_restriccion, quitar_restriccion, cambio_del_archivo, renombrar, editar_docente, agregar_evento, quitar_evento, ausencia_del_dia, configurar_jornada, mostrar, descargar, guardar_horario. `ejecutarHerramienta(nombre, args)` devuelve `{ok, …}` o `{ok:false, error}`.

## Horario compartido (enlace del QR, `#ver=` + `z` + base64url de deflate-raw)
`{v:1, titulo, dias[], bloques[[id,inicio,fin]], descanso:[despuesDe,inicio,fin,min]|null, asig[[nombre,colorIdx,sigla]], doc[nombres], sal[nombres], cursos[[id, celdas, movidas[]]], ev[[titulo,color,diaIdx,[bloqueIdx],[cursos]]]}`. `celdas` es texto de 3 caracteres por clase (materia, docente, salón en base 62; `---` libre; `_` sin dato).

## Almacenamiento del navegador (`localStorage`)
`slotnova.sesion`, `slotnova.horarios` (Mis horarios), `slotnova.opciones` (tema, letra, contraste, animaciones), `slotnova.ia` (solo si «Recordar»), `slotnova.urlPublica` (para el QR desde `file://`), `slotnova.voz`.

## Modelo de datos
`{dias[], bloques[{id,inicio,fin}], cursos[{id,nombre,estudiantes}], docentes[{id,nombre,max}], habilitados{asignatura:[ids]}, carga[{curso,asignatura,principal,sesiones,tipoSalon}], salones[{id,nombre,tipo,capacidad}], disponibilidad{doc:{dia:{bloque:0|1}}}, cambios[{docente,dia,bloque,disponible,motivo}], avisos[]}`
Fila del resultado: `{curso, dia, bloque, inicio, fin, asignatura|null, docente, docenteNombre, salon, salonNombre, tipoSalon, cambio}`. `asignatura: null` = bloque libre.

## Contrato de reglas (IA → app)
```json
{"reglas":[{"tipo":"bloquear_docente","docente":"D2","dias":["Martes"],"bloques":[]},
 {"tipo":"prohibir","asignatura":"Educación física","dias":[],"bloques":["B1"]},
 {"tipo":"evitar","asignatura":"Matemáticas","dias":[],"bloques":["B6"]},
 {"tipo":"max_por_dia","asignatura":"Matemáticas","max":1}],
 "respuesta":"frase corta","dudas":[]}
```
Listas vacías = todos. `prohibir`, `bloquear_docente`, `max_por_dia` son obligatorias; `evitar` es preferencia. Toda regla pasa por `normalizarRegla`.

## Límites técnicos
- Dentro de un artefacto de Claude las descargas y `window.print()` no funcionan (se avisa en pantalla).
- El QR necesita la dirección pública (GitHub Pages); desde `file://` se escribe en el diálogo del QR.
- Dictado por voz: Chrome, Edge y Safari (Web Speech API); Firefox no.
- Módulos ES (`import`) fallan con `file://`: no usarlos.
