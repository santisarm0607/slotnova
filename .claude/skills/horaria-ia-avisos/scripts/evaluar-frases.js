#!/usr/bin/env node
/* Evalúa el entendimiento de frases del coordinador (intérprete local y, opcionalmente, la IA).
 * Uso:
 *   node evaluar-frases.js --proyecto horaria [--frases ruta.json]
 *   node evaluar-frases.js --proyecto horaria --ia --proveedor anthropic|gemini --modelo M --clave K
 * Compara solo los campos presentes en "esperado". {"duda": true} = debe devolver dudas y ninguna regla.
 * Imprime aciertos y solo las fallas. Código 1 si hay fallas.
 */
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };

const cand = opt('proyecto') ? [opt('proyecto')] : ['.', 'horaria', 'horaria-proyecto/horaria'];
const proy = cand.map((c) => path.resolve(c)).find((c) => fs.existsSync(path.join(c, 'js', 'reglas.js')));
if (!proy) { console.error('No encontré js/reglas.js. Usa --proyecto ruta/horaria'); process.exit(2); }
['datos.js', 'datos-prueba.js', 'motor.js', 'reglas.js', 'ia.js'].forEach((f) => require(path.join(proy, 'js', f)));
const H = globalThis.HorarIA;
const datos = H.DATOS_PRUEBA;
const frases = JSON.parse(fs.readFileSync(opt('frases', path.join(__dirname, '..', 'references', 'frases-prueba.json')), 'utf8'));

const norm = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const igualLista = (a, b) => JSON.stringify((a || []).map(norm).sort()) === JSON.stringify((b || []).map(norm).sort());
function compara(res, esp) {
  if (esp.duda) return !res.reglas.length && res.dudas.length ? '' : 'se esperaba una duda, devolvió ' + (res.reglas.map((r) => r.tipo).join(',') || 'nada');
  if (res.reglas.length !== 1) return 'se esperaba 1 regla, devolvió ' + res.reglas.length + (res.dudas.length ? ' (dudas: ' + res.dudas[0] + ')' : '');
  const r = res.reglas[0];
  const errores = [];
  Object.entries(esp).forEach(([k, v]) => {
    const ok = Array.isArray(v) ? igualLista(r[k], v) : norm(r[k]) === norm(v);
    if (!ok) errores.push(k + ': ' + JSON.stringify(r[k]) + ' ≠ ' + JSON.stringify(v));
  });
  return errores.join('; ');
}

(async () => {
  const usarIA = !!opt('ia');
  const cfg = { proveedor: opt('proveedor', 'anthropic'), modelo: opt('modelo'), clave: opt('clave', process.env.HORARIA_CLAVE), url: opt('url') };
  let ok = 0; const fallas = [];
  for (const f of frases) {
    let res;
    try {
      res = usarIA ? await H.reglas.interpretarConIA(f.frase, datos, cfg) : H.reglas.interpretarLocal(f.frase, datos);
    } catch (e) { fallas.push('«' + f.frase + '» → error: ' + e.message.slice(0, 120)); continue; }
    const err = compara(res, f.esperado);
    if (err) fallas.push('«' + f.frase + '» → ' + err); else ok++;
  }
  console.log((usarIA ? 'IA (' + cfg.proveedor + ')' : 'Intérprete local') + ': ' + ok + '/' + frases.length + ' frases correctas');
  fallas.forEach((x) => console.log('  ✘ ' + x));
  process.exit(fallas.length ? 1 : 0);
})();
