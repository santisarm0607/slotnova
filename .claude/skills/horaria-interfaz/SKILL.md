---
name: horaria-interfaz
description: "Esta skill debe usarse cuando se construye, cambia o revisa la página web de SlotNova (index.html, js/app.js, js/asistente.js, js/exportar.js, css/estilos.css): pestañas, vistas por curso, docente o salón, vista móvil por días, eventos, descargas (Excel, PDF, PNG, JPEG, QR), inicio de sesión, opciones de accesibilidad, animaciones, diseño, colores o impresión, o cuando se pide \"la interfaz\", \"que se vea mejor\", \"la versión móvil\", \"el artefacto para probar\" o \"probar la página\". Incluye el contrato de la interfaz, el sistema de diseño y scripts para probar y empaquetar.\n"
metadata:
  version: "2.0.0"
---

# SlotNova · Interfaz

Usabilidad vale 20 % y la demo dura 3 a 4 minutos: el coordinador debe entender cada pantalla sin explicación. Prioridad: **claridad y cero errores** antes que efectos. Las animaciones son discretas y se apagan con «Reducir animaciones» o con la preferencia del sistema.

## Reglas técnicas (no negociables)

- HTML, CSS y JS puro, scripts clásicos en el orden de `horaria-contexto/references/arquitectura.md`. Sin `import`, sin frameworks, sin CDN: abre con doble clic y **sin internet** (salvo la IA). Fuentes del sistema.
- `app.js` orquesta y pinta; no duplicar lógica del motor ni del validador. Dibujo de exportaciones en `exportar.js`; chat y voz en `asistente.js`.
- Respetar el **contrato** (`references/contrato-ui.md`): `data-accion`, `data-metrica`, `data-vista`, `body[data-estado]`, `body[data-modo]` y la API `HorarIA.app`.
- Colores: tokens de `css/estilos.css` (marca índigo `#47529f` y celeste `#84cde4`, modo claro y oscuro). Contraste AA, estados con ícono + texto.
- Todo error visible dice qué pasó y cómo arreglarlo. Nada de `alert()`, `confirm()` ni `prompt()` (borrar pide un segundo toque).
- Texto de datos o de la IA siempre con `textContent` (nunca `innerHTML`).
- Celular (≤ 40 rem): pestañas abajo, horario día por día, asistente a pantalla completa. Sin desplazamiento horizontal a 390 px. No poner `backdrop-filter` ni `transform` en un ancestro de algo `position: fixed`.

## Verificar sin gastar tokens

1. **Recorrido en Chrome (sin Node)**, desde la raíz del proyecto:
   ```powershell
   powershell -ExecutionPolicy Bypass -File pruebas/correr-recorrido.ps1
   powershell -ExecutionPolicy Bypass -File pruebas/correr-recorrido.ps1 -Hasta generado -Captura C:\temp\h.png -Ancho 1280 -Alto 2000
   ```
   34 verificaciones (sesión, Excel, generar, cambio D02, estricto, intercambio, eventos, nombres, PDF/PNG, enlace y QR, asistente local, IA, opciones). `-Hasta` corta en un punto para tomar la captura. Para 390 px, cargar la página de prueba dentro de un `iframe` de 390 px (Chrome sin interfaz no baja de unos 500 px de ancho).
2. **Prueba de humo con Playwright** (si hay Node): `node <ruta-skill>/scripts/prueba-humo.js --pagina index.html --salida capturas` (entra como invitado y sube el Excel).
3. **Empaquetar**: `node <ruta-skill>/scripts/empaquetar.js --proyecto . --salida dist` → `dist/HorarIA.html` (un archivo, sin internet), `dist/horaria-artefacto.html` y el zip.

## Criterios de calidad antes de dar algo por terminado

- El recorrido termina en «N de N pasos correctos» y «ERRORES: ninguno».
- Cifras en pantalla: 120/120 base, cambio D02 2/4/0, estricto 96,7 % con 4 pendientes.
- Se entiende en un proyector: textos de 14 px o más, contraste AA, estados con ícono + texto.
- `CONTEXTO.md` actualizado (versión y registro de cambios).
