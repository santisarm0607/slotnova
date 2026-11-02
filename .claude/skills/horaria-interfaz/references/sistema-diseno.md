# Sistema de diseño base (usar solo si el equipo no definió otro)

Identidad: tablero escolar ordenado. Azul pizarra como tinta y amarillo tiza como acento. Tema claro (se lee mejor en proyector), fondo explícito.

```css
:root {
  /* Distribución: encabezado fijo con pasos; columna lateral (datos y diagnóstico) + área principal (reporte y horario). En < 900 px, una columna. */
  --tinta: #1B2F4B;        /* títulos, botón principal */
  --texto: #26303D;
  --suave: #5B6676;        /* textos secundarios */
  --linea: #D7DDE6;
  --fondo: #F2F5F9;        /* fondo de la página */
  --papel: #FFFFFF;        /* tarjetas y tablas */
  --tiza: #E5A823;         /* acento: lo que nos diferencia, foco */
  --tiza-suave: #FBF1DA;
  --ok: #2E7D4F;  --ok-suave: #E3F2E8;
  --aviso: #B7791F; --aviso-suave: #FCF0DC;
  --info: #2F6FA8; --info-suave: #E3EEF8;
  --error: #B83A3A; --error-suave: #F8E3E3;
  --fuente: "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, "Cascadia Mono", Consolas, monospace;
  --radio: 8px;
}
body {
  background: var(--fondo); color: var(--texto); font: 15px/1.5 var(--fuente); margin: 0;
  padding-block: 16px;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
}
```
El margen lateral con `max(…)` hace que la página también se vea bien como artefacto en el celular. Con esas dos líneas, `empaquetar.js` agrega solo la meta que lo declara.

## Color fijo por materia (fondo / texto, contraste AA)
| Materia | Fondo | Texto |
|---|---|---|
| Matemáticas | #DCE8FA | #163B6E |
| Lenguaje | #FBE3D6 | #7A3413 |
| Ciencias naturales | #DDF2E3 | #1E5C34 |
| Ciencias sociales | #F3E6C8 | #6A4A0B |
| Inglés | #E8E0F8 | #45297A |
| Educación física | #D8F0F2 | #11535A |
| Tecnología e informática | #E2E6EC | #2B3645 |
| Educación artística | #FADDE8 | #7A1F45 |
| Ética y valores | #EEF2D2 | #4E5A12 |
| Educación religiosa | #F1E4DA | #5B3A22 |
Para materias no listadas, asignar en orden una de estas 10 parejas por hash del nombre.

## Escala y componentes
- Tipos: 28/20/16/15/13 px. Cifras con `font-variant-numeric: tabular-nums`. Cobertura en 40 px, peso 700.
- Botón principal: fondo `--tinta`, texto blanco, 44 px de alto. Secundario: borde `--linea`. Foco: anillo de 3 px `--tiza`.
- Estados: chip con ícono + texto + fondo suave (`--ok-suave`, etc.). Nunca solo color.
- Tabla del horario: cabecera `--tinta` con texto blanco; celdas de 112 px mínimo; contenedor con `overflow-x: auto`.
- Tarjetas solo para reporte y diagnóstico; el resto, secciones con título y línea `--linea`.
- Impresión (`@media print`): ocultar todo salvo el título y la tabla visible; tabla a ancho completo.
- Movimiento: transiciones de 150 ms en botones; respetar `prefers-reduced-motion`.
