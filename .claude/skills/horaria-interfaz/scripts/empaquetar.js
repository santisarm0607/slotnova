#!/usr/bin/env node
/* Empaqueta HorarIA:
 *  - dist/HorarIA.html            un solo archivo con CSS y JS en línea (funciona sin internet, para USB o correo)
 *  - dist/horaria-artefacto.html  lo mismo sin <!doctype>/<html>/<head>/<body>, listo para publicarlo como artefacto de Claude
 *  - dist/horaria-entrega.zip     carpeta del proyecto (sin dist ni node_modules) + HorarIA.html
 * Uso: node empaquetar.js --proyecto horaria --salida dist [--sin-zip]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const proyecto = path.resolve(opt('proyecto', fs.existsSync('horaria/index.html') ? 'horaria' : '.'));
const salida = path.resolve(opt('salida', path.join(proyecto, 'dist')));
const indice = path.join(proyecto, 'index.html');
if (!fs.existsSync(indice)) { console.error('No existe ' + indice + '. Primero hay que crear la página.'); process.exit(2); }
fs.mkdirSync(salida, { recursive: true });

let html = fs.readFileSync(indice, 'utf8');
const avisos = [];
const local = (ruta) => !/^(https?:)?\/\//i.test(ruta) && !ruta.startsWith('data:');

// CSS en línea
html = html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, (tag) => {
  const m = tag.match(/href=["']([^"']+)["']/i);
  if (!m || !local(m[1])) { avisos.push('Hoja de estilo externa (no funcionará sin internet): ' + (m ? m[1] : tag)); return tag; }
  const p = path.join(proyecto, m[1].split('?')[0]);
  if (!fs.existsSync(p)) { avisos.push('No existe ' + m[1]); return tag; }
  return '<style>\n' + fs.readFileSync(p, 'utf8') + '\n</style>';
});
// JS en línea (en el mismo orden)
let scripts = 0;
html = html.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, a, src, b) => {
  if (!local(src)) { avisos.push('Script externo (no funcionará sin internet): ' + src); return tag; }
  const p = path.join(proyecto, src.split('?')[0]);
  if (!fs.existsSync(p)) { avisos.push('No existe ' + src); return tag; }
  if (/type=["']module["']/i.test(a + b)) avisos.push('Script de tipo module: ' + src + ' (no funciona con file://)');
  scripts++;
  const codigo = fs.readFileSync(p, 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  return '<script>\n/* ' + src + ' */\n' + codigo + '\n</script>';
});
// Imágenes locales a data URI
html = html.replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'])/gi, (t, a, src, b) => {
  if (!local(src)) return t;
  const p = path.join(proyecto, src);
  if (!fs.existsSync(p)) { avisos.push('No existe la imagen ' + src); return t; }
  const ext = path.extname(p).slice(1).toLowerCase().replace('jpg', 'jpeg').replace('svg', 'svg+xml');
  return a + 'data:image/' + ext + ';base64,' + fs.readFileSync(p).toString('base64') + b;
});

const completo = /<!doctype/i.test(html) ? html : '<!doctype html>\n' + html;
fs.writeFileSync(path.join(salida, 'HorarIA.html'), completo);

// Versión artefacto: título + estilos + contenido del body, sin envolturas
const cabeza = (html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i) || [, ''])[1]
  .replace(/<meta\b[^>]*(charset|viewport)[^>]*>\s*/gi, '');
const cuerpoM = html.match(/<body\b([^>]*)>([\s\S]*?)<\/body>/i);
let cuerpo = cuerpoM ? cuerpoM[2] : html.replace(/<!doctype[^>]*>|<\/?html[^>]*>|<head\b[\s\S]*?<\/head>/gi, '');
const atributosBody = cuerpoM ? cuerpoM[1].trim() : '';
if (atributosBody) avisos.push('Atributos de <body> que se pierden en el artefacto: ' + atributosBody + ' (ponerlos en un div contenedor)');
const titulo = (cabeza.match(/<title>[\s\S]*?<\/title>/i) || [''])[0];
// La meta de bordes solo se agrega si el CSS ya usa los márgenes laterales con safe-area (contrato de artefactos)
const conBordes = /safe-area-inset-left/.test(html) && /safe-area-inset-right/.test(html);
const artefacto = titulo + '\n' + (conBordes ? '<meta name="claude:viewport-fit-sides" content="cover">\n' : '') + cabeza.replace(titulo, '').trim() + '\n' + cuerpo.trim() + '\n';
if (!titulo) avisos.push('Falta <title> en index.html');
fs.writeFileSync(path.join(salida, 'horaria-artefacto.html'), artefacto);

// Zip de entrega
let zipOk = false;
if (!opt('sin-zip')) {
  const zip = path.join(salida, 'horaria-entrega.zip');
  try {
    if (fs.existsSync(zip)) fs.unlinkSync(zip);
    const rel = path.relative(path.dirname(proyecto), salida);
    execFileSync('zip', ['-qr', zip, path.basename(proyecto), '-x', '*/node_modules/*', '*.DS_Store', rel + '/*', path.basename(proyecto) + '/capturas/*'], { cwd: path.dirname(proyecto) });
    execFileSync('zip', ['-qj', zip, path.join(salida, 'HorarIA.html')]);
    zipOk = true;
  } catch (e) { avisos.push('No se pudo crear el zip (¿está instalado zip?): ' + e.message.split('\n')[0]); }
}

const kb = (f) => Math.round(fs.statSync(path.join(salida, f)).size / 1024) + ' KB';
console.log('Empaquetado: ' + scripts + ' scripts en línea');
console.log('  ' + path.join(salida, 'HorarIA.html') + ' (' + kb('HorarIA.html') + ')');
console.log('  ' + path.join(salida, 'horaria-artefacto.html') + ' (' + kb('horaria-artefacto.html') + ') → publicarlo como artefacto');
if (zipOk) console.log('  ' + path.join(salida, 'horaria-entrega.zip') + ' (' + kb('horaria-entrega.zip') + ')');
avisos.forEach((a) => console.log('  ! ' + a));
