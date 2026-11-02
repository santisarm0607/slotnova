#!/usr/bin/env node
/* Genera los archivos de resultados de la entrega con el código del proyecto:
 *   resultados/horario-base.xlsx, resultados/horario-estricto.xlsx, resultados/horario-cambio-D02.xlsx
 * Uso: node generar-resultados.js --proyecto horaria [--salida resultados] [--excel datos.xlsx] [--semilla 1]
 */
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };

const cand = opt('proyecto') ? [opt('proyecto')] : ['.', 'horaria', 'horaria-proyecto/horaria'];
const proy = cand.map((c) => path.resolve(c)).find((c) => fs.existsSync(path.join(c, 'js', 'motor.js')));
if (!proy) { console.error('No encontré js/motor.js. Usa --proyecto ruta/horaria'); process.exit(2); }
['xlsx-lector.js', 'xlsx-escritor.js', 'datos.js', 'datos-prueba.js', 'motor.js', 'validador.js'].forEach((f) => require(path.join(proy, 'js', f)));
const H = globalThis.HorarIA;
const salida = path.resolve(opt('salida', 'resultados'));
fs.mkdirSync(salida, { recursive: true });
const semilla = Number(opt('semilla', 1)) || 1;

(async () => {
  let datos = H.DATOS_PRUEBA;
  if (opt('excel')) { const b = fs.readFileSync(opt('excel')); datos = H.desdeLibro(await H.leerXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))); }
  const escribir = (nombre, d, r) => {
    const cert = H.validar(d, r.filas, []);
    fs.writeFileSync(path.join(salida, nombre), H.libroHorario(d, r, cert));
    const asignadas = r.filas.filter((f) => f.asignatura).length;
    console.log('  ' + nombre + ' · asignadas ' + asignadas + ' · pendientes motor ' + (r.pendientes ? r.pendientes.reduce((a, p) => a + (p.sesiones || 1), 0) : 'n/d') + ' · certificado ' + (cert.ok ? 'sin errores' : cert.totalErrores + ' errores'));
  };
  console.log('Resultados en ' + salida);
  const base = H.motor.generar(datos, { semilla, modoDocente: 'alternativas' });
  escribir('horario-base.xlsx', datos, base);
  const estricto = H.motor.generar(datos, { semilla, modoDocente: 'estricto' });
  if (!estricto.pendientes) console.log('  ! El motor aún no implementa modoDocente estricto: horario-estricto.xlsx no es válido todavía');
  escribir('horario-estricto.xlsx', datos, estricto);
  const esc = H.aplicarEscenario(datos);
  escribir('horario-cambio-D02.xlsx', esc, H.motor.reprogramar(esc, base, { semilla, modoDocente: 'alternativas' }));
  console.log('Auditar: auditar.js --resultado horario-base.xlsx · --resultado horario-estricto.xlsx --estricto · --resultado horario-cambio-D02.xlsx --escenario');
})().catch((e) => { console.error(e); process.exit(1); });
