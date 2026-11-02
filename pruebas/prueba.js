/* HorarIA · pruebas/prueba.js
 * Pruebas automáticas del motor, el validador, el reporte, el diagnóstico, las reglas y el Excel.
 * Ejecutar desde la carpeta del proyecto:   node pruebas/prueba.js
 * Opcional: node pruebas/prueba.js ruta/al/Datos_prueba_Gnosoft.xlsx
 */
const path = require('path');
const fs = require('fs');
const base = path.join(__dirname, '..', 'js');
['xlsx-lector.js', 'datos.js', 'datos-prueba.js', 'motor.js', 'validador.js', 'diagnostico.js', 'reglas.js', 'xlsx-escritor.js']
  .forEach((f) => require(path.join(base, f)));
const H = globalThis.HorarIA;

let fallas = 0;
function revisar(nombre, condicion, detalle) {
  console.log((condicion ? '  OK   ' : '  FALLA') + '  ' + nombre + (detalle ? '  →  ' + detalle : ''));
  if (!condicion) fallas++;
}

(async () => {
  let datos = H.DATOS_PRUEBA;
  const rutaExcel = process.argv[2];
  if (rutaExcel) {
    console.log('\n1. Lectura del Excel: ' + rutaExcel);
    const buf = fs.readFileSync(rutaExcel);
    const libro = await H.leerXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    datos = H.desdeLibro(libro);
    revisar('Hojas leídas', Object.keys(libro).length >= 8, Object.keys(libro).join(', '));
  } else {
    console.log('\n1. Datos de prueba embebidos (js/datos-prueba.js)');
  }
  revisar('4 cursos, 6 docentes, 16 salones', datos.cursos.length === 4 && datos.docentes.length === 6 && datos.salones.length === 16);
  revisar('40 filas de carga = 120 sesiones', datos.carga.length === 40 && datos.carga.reduce((a, c) => a + c.sesiones, 0) === 120);
  revisar('Inglés habilitado para D4 y D6', JSON.stringify(datos.habilitados['Inglés']) === '["D4","D6"]');
  revisar('D1 no disponible viernes B6', datos.disponibilidad.D1.Viernes.B6 === 0);
  revisar('Hoja Cambio: 6 filas de D2 martes', datos.cambios.length === 6 && datos.cambios.every((c) => c.docente === 'D2' && c.dia === 'Martes'));
  revisar('IDs: D02 = D2', H.normalizarId('D02') === 'D2' && H.normalizarId('d02') === 'D2' && H.normalizarId('D2') === 'D2' && H.normalizarId('6A') === '6A');

  console.log('\n1b. Duración de los bloques (el ID del bloque es la unidad de tiempo)');
  const d50 = H.configurarTiempo(datos, { duracionMinutos: 50, horaInicio: '07:00' });
  const d45 = H.configurarTiempo(datos, { duracionMinutos: 45, horaInicio: '06:30', descansoMinutos: 20, descansoDespuesDe: 'B3' });
  revisar('50 minutos desde 07:00', d50.bloques[0].inicio === '07:00' && d50.bloques[0].fin === '07:50' && d50.bloques[5].fin === '12:00', d50.bloques.map((b) => b.id + ' ' + b.inicio + '-' + b.fin).join(' · '));
  revisar('45 minutos desde 06:30 con descanso de 20 después de B3', d45.bloques[3].inicio === '09:05' && d45.bloques[5].fin === '11:20', d45.bloques.map((b) => b.id + ' ' + b.inicio + '-' + b.fin).join(' · '));
  revisar('Los IDs de bloque no cambian', d45.bloques.map((b) => b.id).join() === datos.bloques.map((b) => b.id).join());
  datos = d50;

  console.log('\n2. Diagnóstico');
  const dx = H.diagnosticar(datos, []);
  const sobrecarga = dx.items.find((i) => i.titulo.includes('D4') && i.nivel === 'aviso');
  revisar('Detecta sobrecarga de D4 (28 > 24) y propone solución', !!sobrecarga, sobrecarga && sobrecarga.detalle);
  const dxE = H.diagnosticar(datos, [], { modoDocente: 'estricto' });
  revisar('Modo estricto: proyecta 116 de 120', dxE.proyeccion && dxE.proyeccion.posibles === 116, dxE.items.filter((i) => i.titulo.startsWith('Cobertura')).map((i) => i.titulo).join(''));

  console.log('\n3. Horario base con alternativa del Léeme (5 semillas)');
  let primero = null;
  for (const semilla of [1, 2, 3, 4, 5]) {
    const t0 = Date.now();
    const r = H.motor.generar(datos, { semilla });
    const v = H.validar(datos, r.filas, []);
    const rep = H.reporte(datos, r.filas, [], null, { pendientes: r.pendientes });
    revisar('Semilla ' + semilla + ': 120/120, 0 colisiones, 0 infracciones', r.ok && v.ok && v.completo && rep.validas === 120 && rep.colisiones.total === 0 && rep.infracciones.total === 0,
      'calidad ' + v.calidad.puntaje + '/100, huecos ' + rep.preferencias.huecosDocentes.total + ', consecutivas ' + rep.preferencias.consecutivas.total + ', ' + (Date.now() - t0) + ' ms');
    if (semilla === 1) primero = r;
  }
  revisar('Decisión: un curso de Inglés pasa de D4 a D6', primero.decisiones.length === 1 && primero.decisiones[0].a === 'D6',
    primero.decisiones.map((d) => d.asignatura + ' ' + d.curso + ' ' + d.de + '→' + d.a).join(', '));
  revisar('Las horas de las filas salen de la configuración (50 min)', primero.filas.find((f) => f.bloque === 'B2').inicio === '07:50');

  console.log('\n3b. Modo estricto (solo el docente asignado)');
  const est = H.motor.generar(datos, { semilla: 1, modoDocente: 'estricto' });
  const vEst = H.validar(datos, est.filas, [], { modoDocente: 'estricto' });
  const rEst = H.reporte(datos, est.filas, [], null, { modoDocente: 'estricto', pendientes: est.pendientes });
  revisar('116/120 válidas, 4 pendientes, cobertura 96,7 %', rEst.validas === 116 && rEst.pendientes === 4 && rEst.cobertura === 96.7, 'válidas ' + rEst.validas + ', cobertura ' + rEst.cobertura);
  revisar('Pendientes: Inglés de D4 con motivo', rEst.detallePendientes.length === 1 && rEst.detallePendientes[0].asignatura === 'Inglés' && /máximo semanal es 24/.test(rEst.detallePendientes[0].motivo),
    rEst.detallePendientes.map((x) => x.curso + ' ' + x.asignatura + ' ×' + x.faltantes + ': ' + x.motivo).join(' '));
  revisar('Sin colisiones ni infracciones; certificado válido pero incompleto', rEst.colisiones.total === 0 && rEst.infracciones.total === 0 && vEst.ok && !vEst.completo && vEst.pendientes === 4);
  revisar('Nadie distinto de D4 da Inglés en estricto', !est.filas.some((f) => f.asignatura === 'Inglés' && f.docente !== 'D4'));

  console.log('\n4. Prueba de cambio: D02 no disponible el martes');
  const esc = H.aplicarEscenario(datos);
  const afectadas = primero.filas.filter((f) => f.docente === 'D2' && f.dia === 'Martes').length;
  const re = H.motor.reprogramar(esc, primero, { semilla: 1 });
  const ve = H.validar(esc, re.filas, []);
  const rc = H.reporte(esc, re.filas, [], primero, { pendientes: re.pendientes });
  revisar('Reprogramado sin errores', re.ok && ve.ok && ve.completo, 'afectadas ' + rc.cambio.resumen.afectadas + ', movidas ' + rc.cambio.resumen.movidas + ', pendientes ' + rc.pendientes + ', calidad ' + ve.calidad.puntaje);
  revisar('El reporte cuenta las afectadas de D2 el martes', rc.cambio.resumen.afectadas === afectadas && afectadas > 0);
  revisar('Movidas = clases que cambiaron de bloque', rc.cambio.resumen.movidas === re.filas.filter((f) => f.cambio && f.asignatura).length, rc.cambio.movidas.map((m) => m.curso + ' ' + m.asignatura + ' ' + m.antes.dia + ' ' + m.antes.bloque + '→' + m.ahora.dia + ' ' + m.ahora.bloque).join(' · '));
  revisar('D2 sin clases el martes y 0 pendientes', !re.filas.some((f) => f.docente === 'D2' && f.dia === 'Martes') && rc.pendientes === 0 && rc.cambio.resumen.pendientes === 0);
  const escD02 = H.aplicarEscenario(datos, [{ docente: 'D02', dia: 'martes', bloque: 'B1', disponible: 0 }]);
  revisar('La hoja Cambio acepta «D02» y «martes»', escD02.disponibilidad.D2.Martes.B1 === 0);

  console.log('\n5. Reglas del coordinador');
  const casos = [
    ['Educación física nunca en B1', [{ tipo: 'prohibir', asignatura: 'Educación física', dias: [], bloques: ['B1'] }]],
    ['Máximo 1 de Matemáticas por día', [{ tipo: 'max_por_dia', asignatura: 'Matemáticas', max: 1 }]],
  ];
  casos.forEach(([n, reglas]) => {
    const r = H.motor.generar(datos, { semilla: 1, reglas });
    const v = H.validar(datos, r.filas, reglas);
    revisar(n, r.ok && v.ok && v.completo, 'calidad ' + v.calidad.puntaje);
  });
  const imposible = [{ tipo: 'bloquear_docente', docente: 'D1', dias: ['Lunes'], bloques: [] }];
  const rImp = H.motor.generar(datos, { semilla: 1, reglas: imposible });
  const repImp = H.reporte(datos, rImp.filas, imposible, null, { pendientes: rImp.pendientes });
  revisar('D1 sin lunes (24 sesiones en 23 bloques): horario parcial sin cruces y 1 pendiente explicada',
    rImp.ok && repImp.colisiones.total === 0 && repImp.infracciones.total === 0 && repImp.pendientes === 1 && /23 bloques/.test(repImp.detallePendientes[0].motivo),
    repImp.detallePendientes.map((x) => x.curso + ' ' + x.asignatura + ': ' + x.motivo).join(' '));

  console.log('\n6. Intérprete local en español');
  [
    ['Luis no viene el martes', 'bloquear_docente'],
    ['Luis Vega (D02) no está disponible el martes', 'bloquear_docente'],
    ['No quiero Educación física a primera hora', 'prohibir'],
    ['Prohibir Educación física en el bloque B1', 'prohibir'],
    ['Mejor que matemáticas no quede a última hora', 'evitar'],
    ['Evitar Matemáticas en el último bloque B6', 'evitar'],
    ['Máximo una hora de matemáticas al día', 'max_por_dia'],
    ['Máximo 1 sesión de Matemáticas por día', 'max_por_dia'],
    ['Carlos tiene reunión el jueves a las 10', 'bloquear_docente'],
  ].forEach(([frase, tipo]) => {
    const r = H.reglas.interpretarLocal(frase, datos);
    revisar('«' + frase + '»', r.reglas.length === 1 && r.reglas[0].tipo === tipo, r.reglas.map((x) => H.reglas.describir(x, datos)).join(' ') || r.dudas.join(' '));
  });
  const d02 = H.reglas.interpretarLocal('D02 no viene el martes', datos);
  revisar('«D02» se entiende como D2', d02.reglas.length === 1 && d02.reglas[0].docente === 'D2');

  console.log('\n7. Reporte: colisiones por pares y sesiones duplicadas');
  const conCruce = primero.filas.map((f) => Object.assign({}, f));
  const a = conCruce.find((f) => f.curso === '7A' && f.asignatura === 'Matemáticas');
  conCruce.push(Object.assign({}, a)); // fila duplicada: mismo curso, docente y salón en el mismo bloque
  const rCruce = H.reporte(datos, conCruce, []);
  revisar('Una fila duplicada = 1 colisión de curso, 1 de docente y 1 de salón', rCruce.colisiones.porCurso.length === 1 && rCruce.colisiones.porDocente.length === 1 && rCruce.colisiones.porSalon.length === 1 && rCruce.colisiones.total === 3);
  revisar('La duplicada no aumenta la cobertura', rCruce.validas === 120 && rCruce.cobertura === 100 && rCruce.infracciones.intensidadExcedida.length === 1);

  console.log('\n8. Exportación a Excel');
  const cert = H.validar(datos, primero.filas, []);
  const rep1 = H.reporte(datos, primero.filas, [], null, { pendientes: primero.pendientes });
  const bytes = H.libroHorario(datos, primero, cert, rep1);
  const libro2 = await H.leerXlsx(bytes.buffer);
  revisar('El Excel exportado se vuelve a leer', libro2.Horario && libro2.Horario.length === 121, Object.keys(libro2).length + ' hojas: ' + Object.keys(libro2).join(', '));
  revisar('Incluye reporte, pendientes, carga usada y validación', !!(libro2.Reporte && libro2.Pendientes && libro2['Carga usada'] && libro2['Validación']));

  console.log('\n' + (fallas ? fallas + ' prueba(s) fallaron.' : 'Todas las pruebas pasaron.'));
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
