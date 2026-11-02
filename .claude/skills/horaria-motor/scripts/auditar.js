#!/usr/bin/env node
/* Auditoría oficial de HorarIA con las fórmulas de la guía de Gnosoft.
 * Implementación INDEPENDIENTE del validador del proyecto: sirve para comprobar
 * que el motor, el reporte de la página y el Excel exportado dicen la verdad.
 *
 * Uso (desde cualquier carpeta):
 *   node auditar.js                         → busca horaria/ en la carpeta actual
 *   node auditar.js --proyecto ruta/horaria  → carpeta del proyecto
 *   node auditar.js --excel datos.xlsx       → datos desde el Excel (por defecto DATOS_PRUEBA)
 *   node auditar.js --estricto               → valida "docente asignado" estricto y pide modoDocente:'estricto' al motor
 *   node auditar.js --semilla 2              → semilla del motor
 *   node auditar.js --resultado horario.xlsx → audita un Excel exportado (hoja Horario) en vez de generar
 *   node auditar.js --resultado cambio.xlsx --escenario → lo audita con la hoja Cambio aplicada (D2 sin martes)
 *   node auditar.js --json                   → imprime todo en JSON
 * Salida corta pensada para gastar pocos tokens. Código de salida 1 si hay colisiones o infracciones.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };

function buscarProyecto() {
  const dado = opt('proyecto');
  const candidatos = dado ? [dado] : ['.', 'horaria', 'horaria-proyecto/horaria', '..'];
  for (const c of candidatos) if (fs.existsSync(path.join(c, 'js', 'motor.js'))) return path.resolve(c);
  console.error('No encontré la carpeta del proyecto (con js/motor.js). Usa --proyecto ruta/horaria');
  process.exit(2);
}
const PROY = buscarProyecto();
['xlsx-lector.js', 'datos.js', 'datos-prueba.js', 'motor.js', 'validador.js'].forEach((f) => {
  const p = path.join(PROY, 'js', f);
  if (fs.existsSync(p)) require(p);
});
const H = globalThis.HorarIA;
const normId = (x) => String(x == null ? '' : x).trim().toUpperCase().replace(/^([A-Z]+)0+(\d)/, '$1$2');

async function leerExcel(ruta) {
  const b = fs.readFileSync(ruta);
  return H.leerXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

// ---------------- Métricas oficiales ----------------
function auditar(datos, filas, estricto) {
  const req = {}; let requeridas = 0;
  datos.carga.forEach((c) => { req[c.curso + '|' + c.asignatura] = { n: c.sesiones, principal: normId(c.principal), tipo: c.tipoSalon }; requeridas += c.sesiones; });
  const cursos = {}; datos.cursos.forEach((c) => { cursos[c.id] = c; });
  const salones = {}; datos.salones.forEach((s) => { salones[normId(s.id)] = s; });
  const docentes = {}; datos.docentes.forEach((d) => { docentes[normId(d.id)] = d; });
  const dias = new Set(datos.dias), bloques = datos.bloques.map((b) => b.id);
  const hab = {}; Object.entries(datos.habilitados || {}).forEach(([a, l]) => { hab[a] = l.map(normId); });
  const disp = (d, dia, b) => { const x = datos.disponibilidad; const k = Object.keys(x).find((id) => normId(id) === d); return k && x[k][dia] && x[k][dia][b] === 0 ? 0 : 1; };

  const asign = filas.filter((f) => f.asignatura).map((f, i) => ({ i, curso: String(f.curso), asig: f.asignatura, doc: normId(f.docente), salon: normId(f.salon), dia: f.dia, bloque: f.bloque, inval: [] }));
  const inf = { bloqueInvalido: 0, sinCarga: 0, habilitacion: 0, docenteAsignado: 0, disponibilidad: 0, tipoSalon: 0, capacidad: 0, maximoSemanal: 0, intensidadExcedida: 0 };
  const detalleInf = [];
  const marcar = (a, tipo, txt) => { a.inval.push(tipo); inf[tipo]++; if (detalleInf.length < 12) detalleInf.push(tipo + ': ' + txt); };

  asign.forEach((a) => {
    const r = req[a.curso + '|' + a.asig];
    const lugar = a.curso + ' ' + a.asig + ' ' + a.dia + ' ' + a.bloque;
    if (!dias.has(a.dia) || !bloques.includes(a.bloque)) marcar(a, 'bloqueInvalido', lugar);
    if (!r) { marcar(a, 'sinCarga', lugar); return; }
    if (!(hab[a.asig] || []).includes(a.doc)) marcar(a, 'habilitacion', a.doc + ' no habilitado · ' + lugar);
    if (estricto && a.doc !== r.principal) marcar(a, 'docenteAsignado', a.doc + ' en vez de ' + r.principal + ' · ' + lugar);
    if (disp(a.doc, a.dia, a.bloque) === 0) marcar(a, 'disponibilidad', a.doc + ' no disponible · ' + lugar);
    const s = salones[a.salon];
    if (!s) marcar(a, 'tipoSalon', 'sin salón · ' + lugar);
    else {
      if (s.tipo !== r.tipo) marcar(a, 'tipoSalon', s.id + ' es ' + s.tipo + ', requiere ' + r.tipo + ' · ' + lugar);
      if (cursos[a.curso] && s.capacidad != null && s.capacidad < cursos[a.curso].estudiantes) marcar(a, 'capacidad', s.id + ' cap ' + s.capacidad + ' < ' + cursos[a.curso].estudiantes + ' · ' + lugar);
    }
  });

  // Colisiones por pares y categoría
  const col = { curso: 0, docente: 0, salon: 0 }; const detalleCol = [];
  ['curso', 'docente', 'salon'].forEach((cat) => {
    const g = {};
    asign.forEach((a) => { const k = (cat === 'curso' ? a.curso : cat === 'docente' ? a.doc : a.salon) + '|' + a.dia + '|' + a.bloque; (g[k] = g[k] || []).push(a); });
    Object.entries(g).forEach(([k, l]) => {
      if (l.length < 2 || k.startsWith('|')) return;
      col[cat] += (l.length * (l.length - 1)) / 2;
      l.forEach((a) => a.inval.push('colision_' + cat));
      if (detalleCol.length < 12) detalleCol.push(cat + ' ' + k.replace(/\|/g, ' ') + ' → ' + l.map((a) => a.curso + ' ' + a.asig).join(' / '));
    });
  });

  // Máximo semanal: el exceso de sesiones (por lo demás válidas) del docente queda inválido
  const orden = (a) => datos.dias.indexOf(a.dia) * 100 + bloques.indexOf(a.bloque);
  const porDoc = {};
  asign.filter((a) => !a.inval.length).sort((x, y) => orden(x) - orden(y)).forEach((a) => { (porDoc[a.doc] = porDoc[a.doc] || []).push(a); });
  Object.entries(porDoc).forEach(([d, l]) => {
    const max = docentes[d] ? docentes[d].max : Infinity;
    if (l.length > max) l.slice(max).forEach((a) => marcar(a, 'maximoSemanal', d + ' pasa de ' + max + ' · ' + a.curso + ' ' + a.asig));
  });

  // Intensidad: válidas por curso y asignatura, topadas en lo requerido (sobrantes no cuentan)
  const validasPor = {};
  asign.filter((a) => !a.inval.length).forEach((a) => { const k = a.curso + '|' + a.asig; (validasPor[k] = validasPor[k] || []).push(a); });
  let validas = 0; const pendientesDet = [];
  Object.entries(req).forEach(([k, r]) => {
    const v = (validasPor[k] || []).length;
    if (v > r.n) { inf.intensidadExcedida += v - r.n; if (detalleInf.length < 12) detalleInf.push('intensidadExcedida: ' + k.replace('|', ' ') + ' ' + v + ' > ' + r.n); }
    validas += Math.min(v, r.n);
    if (v < r.n) pendientesDet.push(k.replace('|', ' ') + ' faltan ' + (r.n - v));
  });

  // Preferencias
  let consecutivas = 0, mismoDia = 0, huecos = 0;
  const celda = {}; asign.forEach((a) => { celda[a.curso + '|' + a.dia + '|' + a.bloque] = a.asig; });
  datos.cursos.forEach((c) => datos.dias.forEach((dia) => {
    const cuenta = {};
    bloques.forEach((b, i) => {
      const x = celda[c.id + '|' + dia + '|' + b];
      if (!x) return;
      cuenta[x] = (cuenta[x] || 0) + 1;
      if (i > 0 && celda[c.id + '|' + dia + '|' + bloques[i - 1]] === x) consecutivas++;
    });
    Object.values(cuenta).forEach((n) => { if (n > 1) mismoDia += n - 1; });
  }));
  Object.keys(docentes).forEach((d) => datos.dias.forEach((dia) => {
    const idx = asign.filter((a) => a.doc === d && a.dia === dia).map((a) => bloques.indexOf(a.bloque)).filter((x) => x >= 0);
    const u = Array.from(new Set(idx)).sort((a, b) => a - b);
    if (u.length) huecos += u[u.length - 1] - u[0] + 1 - u.length;
  }));

  const totalInf = Object.values(inf).reduce((a, b) => a + b, 0);
  return {
    requeridas, asignadas: asign.length, validas, pendientes: requeridas - validas,
    cobertura: Math.round((validas / requeridas) * 1000) / 10,
    colisiones: Object.assign({ total: col.curso + col.docente + col.salon }, col), detalleColisiones: detalleCol,
    infracciones: Object.assign({ total: totalInf }, inf), detalleInfracciones: detalleInf, pendientesDetalle: pendientesDet,
    preferencias: { consecutivas, mismoDia, huecosDocentes: huecos },
  };
}

function cambio(base, nuevo, datosEsc) {
  const libre = (f) => { const x = datosEsc.disponibilidad; const k = Object.keys(x).find((id) => normId(id) === normId(f.docente)); return !(k && x[k][f.dia] && x[k][f.dia][f.bloque] === 0); };
  const afectadas = base.filter((f) => f.asignatura && !libre(f));
  const pos = (filas) => { const m = {}; filas.filter((f) => f.asignatura).forEach((f) => { const k = f.curso + '|' + f.asignatura; (m[k] = m[k] || []).push(f.dia + '|' + f.bloque); }); return m; };
  const pb = pos(base), pn = pos(nuevo);
  let movidas = 0;
  Object.entries(pn).forEach(([k, l]) => { const resto = (pb[k] || []).slice(); l.forEach((p) => { const i = resto.indexOf(p); if (i >= 0) resto.splice(i, 1); else movidas++; }); });
  return { afectadas: afectadas.length, movidas, listaAfectadas: afectadas.map((f) => f.curso + ' ' + f.asignatura + ' ' + f.dia + ' ' + f.bloque) };
}

function linea(t, m) {
  return t + 'requeridas ' + m.requeridas + ' · asignadas ' + m.asignadas + ' · válidas ' + m.validas + ' · pendientes ' + m.pendientes + ' · cobertura ' + m.cobertura + '%\n' +
    '        colisiones ' + m.colisiones.total + ' (curso ' + m.colisiones.curso + ', docente ' + m.colisiones.docente + ', salón ' + m.colisiones.salon + ') · infracciones ' + m.infracciones.total +
    '\n        preferencias: consecutivas ' + m.preferencias.consecutivas + ' · misma materia mismo día ' + m.preferencias.mismoDia + ' · huecos docentes ' + m.preferencias.huecosDocentes;
}
function detalles(m) {
  const out = [];
  Object.entries(m.infracciones).forEach(([k, v]) => { if (k !== 'total' && v) out.push('        ! ' + k + ': ' + v); });
  m.detalleColisiones.slice(0, 5).forEach((x) => out.push('        ✘ ' + x));
  m.detalleInfracciones.slice(0, 5).forEach((x) => out.push('        ✘ ' + x));
  if (m.pendientesDetalle.length) out.push('        pendientes: ' + m.pendientesDetalle.slice(0, 6).join('; '));
  return out.join('\n');
}

(async () => {
  const estricto = !!opt('estricto');
  const semilla = Number(opt('semilla', 1)) || 1;
  let datos = H.DATOS_PRUEBA;
  if (opt('excel')) datos = H.desdeLibro(await leerExcel(opt('excel')));
  const salida = { proyecto: PROY, modo: estricto ? 'estricto' : 'alternativas', semilla };

  if (opt('resultado')) {
    if (opt('escenario')) { datos = H.aplicarEscenario(datos); salida.modo += ' + hoja Cambio'; }
    const libro = await leerExcel(opt('resultado'));
    const hoja = libro.Horario || libro[Object.keys(libro)[0]];
    const enc = hoja[0].map((x) => String(x || '').toLowerCase());
    const c = (n) => enc.indexOf(n);
    const filas = hoja.slice(1).filter((r) => r && r.length).map((r) => ({
      curso: r[c('curso_id')], dia: r[c('dia')], bloque: r[c('bloque_id')],
      asignatura: r[c('asignatura')] && r[c('asignatura')] !== 'Libre' ? r[c('asignatura')] : null,
      docente: r[c('docente_id')], salon: r[c('salon_id')],
    }));
    salida.resultado = auditar(datos, filas, estricto);
    if (opt('json')) return console.log(JSON.stringify(salida, null, 1));
    console.log('HorarIA · Auditoría oficial de ' + opt('resultado') + ' · modo ' + salida.modo);
    console.log(linea('Excel:  ', salida.resultado)); const d = detalles(salida.resultado); if (d) console.log(d);
    process.exit(salida.resultado.colisiones.total || salida.resultado.infracciones.total ? 1 : 0);
  }

  const opciones = { semilla, modoDocente: estricto ? 'estricto' : 'alternativas' };
  const t0 = Date.now();
  const base = H.motor.generar(datos, opciones);
  const ms = Date.now() - t0;
  salida.base = auditar(datos, base.filas || [], estricto);
  salida.base.pendientesMotor = (base.pendientes || []).length;
  const esc = H.aplicarEscenario(datos);
  const nuevo = H.motor.reprogramar ? H.motor.reprogramar(esc, base, opciones) : H.motor.generar(esc, opciones);
  salida.cambio = Object.assign(auditar(esc, nuevo.filas || [], estricto), cambio(base.filas || [], nuevo.filas || [], esc));
  if (opt('json')) return console.log(JSON.stringify(salida, null, 1));

  console.log('HorarIA · Auditoría oficial (fórmulas de la guía) · modo ' + salida.modo + ' · semilla ' + semilla + ' · ' + ms + ' ms');
  if (estricto && !base.pendientes) console.log('  aviso: el motor no devuelve resultado.pendientes (modo estricto aún no implementado)');
  if (base.error) console.log('  motor: ' + base.error);
  console.log(linea('Base:   ', salida.base)); let d = detalles(salida.base); if (d) console.log(d);
  console.log('Cambio: afectadas ' + salida.cambio.afectadas + ' · movidas ' + salida.cambio.movidas + ' · ' + linea('', salida.cambio).trim());
  d = detalles(salida.cambio); if (d) console.log(d);
  const malo = salida.base.colisiones.total + salida.cambio.colisiones.total + salida.base.infracciones.total + salida.cambio.infracciones.total;
  console.log(malo ? 'RESULTADO: hay colisiones o infracciones (las sesiones afectadas deberían quedar como pendientes, no asignadas).' : 'RESULTADO: sin colisiones ni infracciones.');
  process.exit(malo ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
