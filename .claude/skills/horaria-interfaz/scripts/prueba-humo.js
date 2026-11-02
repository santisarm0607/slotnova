#!/usr/bin/env node
/* Prueba de humo de la página de HorarIA con Playwright (Chromium).
 * Recorre la demo usando el contrato de la interfaz (data-accion, data-metrica, body[data-estado]):
 *   datos de prueba → generar → leer métricas → aplicar cambio → leer afectadas/movidas → modo estricto
 * y toma capturas en computador (1280×900) y celular (390×844).
 * Uso: node prueba-humo.js --pagina horaria/index.html [--salida capturas] [--sin-estricto]
 * Salida corta. Código 1 si hay errores de consola o falla un paso.
 */
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };

let playwright;
try { playwright = require('playwright'); } catch (e) {
  try { playwright = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); } catch (e2) {
    console.log('Playwright no está disponible. Verificar a mano: abrir el HTML, pulsar «Usar datos de prueba», «Generar» y «Aplicar cambio».');
    process.exit(3);
  }
}

const pagina = path.resolve(opt('pagina', 'horaria/index.html'));
const salida = path.resolve(opt('salida', 'capturas'));
if (!fs.existsSync(pagina)) { console.error('No existe ' + pagina); process.exit(2); }
fs.mkdirSync(salida, { recursive: true });

(async () => {
  const navegador = await playwright.chromium.launch();
  const errores = [];
  const pasos = [];
  let fallo = false;
  const paso = (ok, txt) => { pasos.push((ok ? '  ✔ ' : '  ✘ ') + txt); if (!ok) fallo = true; };

  async function abrir(ancho, alto) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, acceptDownloads: true });
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 160)); });
    p.on('pageerror', (e) => errores.push(String(e.message || e).slice(0, 160)));
    await p.goto('file://' + pagina);
    await p.waitForTimeout(300);
    return { ctx, p };
  }
  const metricas = (p) => p.evaluate(() => {
    const o = {};
    document.querySelectorAll('[data-metrica]').forEach((e) => { if (e.offsetParent !== null || !o[e.dataset.metrica]) o[e.dataset.metrica] = e.textContent.trim(); });
    return o;
  });
  const estado = (p) => p.evaluate(() => document.body.dataset.estado || '(sin data-estado)');
  async function clic(p, accion, esperado) {
    const el = p.locator('[data-accion="' + accion + '"]').first();
    if (!(await el.count())) { paso(false, 'No existe [data-accion="' + accion + '"]'); return false; }
    await el.click();
    if (esperado) {
      try { await p.waitForFunction((e) => document.body.dataset.estado === e, esperado, { timeout: 8000 }); }
      catch (e) { paso(false, accion + ': el estado quedó en «' + (await estado(p)) + '», se esperaba «' + esperado + '»'); return false; }
    }
    return true;
  }

  // Entra como invitado (inicio de sesión de prototipo) y sube el Excel: la página ya no trae datos de ejemplo
  const excel = path.join(path.dirname(pagina), 'datos', 'Datos_prueba_Gnosoft.xlsx');
  async function entrarYSubir(p) {
    const invitado = p.locator('[data-accion="entrar-invitado"]');
    if (await invitado.isVisible()) { await invitado.click(); await p.waitForTimeout(450); }
    await p.locator('[data-accion="subir-excel"]').setInputFiles(excel);
    try { await p.waitForFunction(() => document.body.dataset.estado === 'con-datos', null, { timeout: 8000 }); return true; }
    catch (e) { paso(false, 'No se cargó el Excel: ' + excel); return false; }
  }

  // Computador: recorrido completo
  const { ctx, p } = await abrir(1280, 900);
  paso(true, 'Página abierta · estado inicial «' + (await estado(p)) + '»');
  if (await entrarYSubir(p)) paso(true, 'Sesión de invitado y Excel de Gnosoft cargado');
  await p.screenshot({ path: path.join(salida, '1-datos.png'), fullPage: false });
  if (await clic(p, 'generar', 'generado')) {
    const m = await metricas(p);
    paso(/100/.test(m.cobertura || '') && (m.colisiones || '0').startsWith('0'), 'Generado · cobertura ' + (m.cobertura || '?') + ' · válidas ' + (m.validas || '?') + '/' + (m.requeridas || '?') + ' · colisiones ' + (m.colisiones || '?') + ' · pendientes ' + (m.pendientes || '?'));
  }
  await p.screenshot({ path: path.join(salida, '2-generado.png'), fullPage: true });
  if (await clic(p, 'aplicar-cambio', 'cambio-aplicado')) {
    const m = await metricas(p);
    paso((m.colisiones || '0').startsWith('0'), 'Cambio D02 martes · afectadas ' + (m.afectadas || '?') + ' · movidas ' + (m.movidas || '?') + ' · pendientes ' + (m.pendientes || '?') + ' · cobertura ' + (m.cobertura || '?'));
  }
  await p.screenshot({ path: path.join(salida, '3-cambio.png'), fullPage: true });
  if (!opt('sin-estricto') && (await p.locator('[data-accion="modo-docente"]').count())) {
    await p.locator('[data-accion="modo-docente"]').first().click();
    await p.waitForTimeout(1500);
    const m = await metricas(p);
    paso(/96[.,]7/.test(m.cobertura || '') && String(m.pendientes || '').startsWith('4'), 'Modo estricto · cobertura ' + (m.cobertura || '?') + ' · pendientes ' + (m.pendientes || '?') + ' (esperado 96,7 % y 4)');
    await p.screenshot({ path: path.join(salida, '4-estricto.png'), fullPage: true });
  }
  await ctx.close();

  // Celular: desbordamiento horizontal
  const cel = await abrir(390, 844);
  await entrarYSubir(cel.p);
  await clic(cel.p, 'generar', 'generado');
  const desborde = await cel.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  paso(desborde <= 1, 'Celular 390 px · desbordamiento horizontal ' + desborde + ' px');
  await cel.p.screenshot({ path: path.join(salida, '5-celular.png'), fullPage: true });
  await cel.ctx.close();
  await navegador.close();

  console.log('Prueba de humo · ' + path.basename(pagina));
  pasos.forEach((x) => console.log(x));
  const unicos = Array.from(new Set(errores));
  console.log(unicos.length ? '  ✘ Errores de consola (' + unicos.length + '): ' + unicos.slice(0, 4).join(' | ') : '  ✔ Sin errores de consola');
  console.log('  Capturas en ' + salida + ' (1-datos, 2-generado, 3-cambio, 4-estricto, 5-celular)');
  process.exit(fallo || unicos.length ? 1 : 0);
})().catch((e) => { console.error('Fallo de la prueba: ' + e.message); process.exit(1); });
