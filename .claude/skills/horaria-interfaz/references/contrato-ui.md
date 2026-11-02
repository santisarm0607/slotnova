# Contrato de la interfaz de SlotNova 2.0

## Estado global
`window.HorarIA.app.estado` (ver `horaria-contexto/references/arquitectura.md`).
`document.body.dataset.estado`: `sin-datos` → `con-datos` → `generado` → `cambio-aplicado` (o `error`).
`document.body.dataset.modo = "visor"` cuando se abre un enlace `#ver=` del QR (solo lectura, sin inicio de sesión).
Pestañas por dirección: `#datos`, `#horario`, `#cambios`, `#ausencias` (función `irA`).

## Acciones (atributo `data-accion`)
| data-accion | Elemento | Hace |
|---|---|---|
| `entrar-invitado` | botón del inicio de sesión | entra sin cuenta (prototipo) |
| `subir-excel` | `<input type="file">` + zona de arrastre | `leerXlsx` → `desdeLibro` → diagnóstico |
| `duracion-bloque` | grupo 45 / 50 / Otra | recalcula horas |
| `generar` | botón principal (pestaña Datos) | `motor.generar` + reporte; pasa a Horario |
| `otra-opcion` | botón | otra semilla |
| `modo-docente` | interruptor | marcado = estricto; regenera |
| `aplicar-cambio` / `quitar-cambio` | botones del aviso del archivo | hoja Cambio / volver al original |
| `nuevo-evento`, `guardar-evento` | botones | diálogo de evento |
| `editar-nombres` | enlace | diálogo de nombres |
| `exportar-excel`, `exportar-pdf`, `exportar-png`, `exportar-jpeg`, `exportar-qr` | menú «Descargar» | descargas y código QR |
| `imprimir` | botón | `window.print()` (oculto dentro de un marco) |
| `guardar-horario` | diálogo Mis horarios | guarda en el navegador |
| `novedad-texto` / `novedad-enviar` | caja de Cambios + botón | IA o intérprete local → «Esto entendí» |
| `ia-activa` | interruptor | activa o apaga la IA (sin clave abre la configuración) |
| `data-abrir="horarios|opciones|ia|asistente"` | botones | abren diálogos o el asistente |
| `data-voz="<id del campo>"` | botón de micrófono | dictado (con `data-enviar` envía al terminar) |

## Métricas visibles (atributo `data-metrica`, texto = número)
`requeridas`, `asignadas`, `validas`, `pendientes`, `cobertura` (con %), `colisiones`, `infracciones`, `consecutivas`, `huecos`, `calidad`, `afectadas`, `movidas`.

## Vistas
Radios `data-vista="curso|docente|salon"` (+ «Todos»), selector `data-selector`. En computador: tabla con días en columnas y bloques en filas (hora + ID), fila de descanso. En celular: botones de día y lista. Celdas: materia (color fijo), docente, salón; «↻ Movida»; «✕ No disponible» y huecos en la vista docente; etiquetas de evento «★». Intercambio: al tocar una celda se calculan con el validador las opciones válidas (`celda--opcion`, en verde) y el resto se atenúa.

## Accesibilidad
Botones con verbo. Foco visible. `aria-live` en mensajes. Diálogos nativos `<dialog>`. Opciones: tema automático/claro/nocturno, letra normal/grande/muy grande, alto contraste, reducir animaciones (`html[data-theme|data-letra|data-contraste|data-movimiento]`).
