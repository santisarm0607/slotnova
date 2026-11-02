/* SlotNova · recorrido-navegador.js
 * Recorrido automático de la página en Chrome sin interfaz (no necesita Node ni Playwright).
 * Lo inyecta pruebas/correr-recorrido.ps1 en una copia de index.html; escribe el resultado en
 * <pre id="resultado-prueba"> y lo avisa al marco padre (para medir el ancho de 390 px).
 * Parámetro ?hasta=inicio|datos|detalles|generado|intercambio|eventos|exportar|qr|asistente|opciones|todo
 */
window.__errores = [];
window.addEventListener('error', (e) => window.__errores.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__errores.push('Promesa: ' + String(e.reason && e.reason.message || e.reason)));
const _consolaError = console.error;
console.error = function () { window.__errores.push(Array.from(arguments).join(' ')); _consolaError.apply(console, arguments); };
(function () {
  const hasta = (new URLSearchParams(location.search)).get('hasta') || 'todo';
  const q = (s) => document.querySelector(s);
  const qa = (s) => document.querySelectorAll(s);
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const hastaEstado = async (e) => { for (let i = 0; i < 300 && document.body.dataset.estado !== e; i++) await esperar(50); return document.body.dataset.estado; };
  const met = () => { const o = {}; qa('[data-metrica]').forEach((e) => { if (e.offsetParent !== null || !o[e.dataset.metrica]) o[e.dataset.metrica] = e.textContent.trim(); }); return o; };
  const resumenMet = () => { const m = met(); return m.cobertura + ' · ' + m.validas + '/' + m.requeridas + ' · cruces ' + m.colisiones + ' · pendientes ' + m.pendientes; };
  const txt = (s) => (q(s) ? q(s).textContent.replace(/\s+/g, ' ').trim().slice(0, 220) : '(no existe ' + s + ')');
  const radio = (s) => { q(s).checked = true; q(s).dispatchEvent(new Event('change', { bubbles: true })); };
  const log = [];
  const ok = (cond, texto) => log.push((cond ? '  ✔ ' : '  ✘ ') + texto);
  const fin = () => {
    try { parent.postMessage('DESBORDE ' + (document.documentElement.scrollWidth - document.documentElement.clientWidth) + ' · ' + hasta, '*'); } catch (e) { /* sin marco */ }
    const pre = document.createElement('pre');
    pre.id = 'resultado-prueba';
    pre.hidden = hasta !== 'todo';
    pre.textContent = log.join('\n') + '\nERRORES: ' + (window.__errores.length ? window.__errores.join(' | ') : 'ninguno') + '\nDESBORDE: ' + (document.documentElement.scrollWidth - window.innerWidth);
    document.body.append(pre);
  };
  function subirExcel() {
    return new Promise((cumplir, fallar) => {
      const x = new XMLHttpRequest();
      x.open('GET', 'datos/Datos_prueba_Gnosoft.xlsx');
      x.responseType = 'arraybuffer';
      x.onload = () => {
        const dt = new DataTransfer();
        dt.items.add(new File([x.response], 'Datos_prueba_Gnosoft.xlsx'));
        q('#zona-archivo').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
        cumplir();
      };
      x.onerror = () => fallar(new Error('No pude leer datos/Datos_prueba_Gnosoft.xlsx'));
      x.send();
    });
  }
  function revisarPdf(bytes) {
    // Cada objeto debe estar en el desplazamiento que dice la tabla xref
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    const xref = Number(/startxref\n(\d+)/.exec(s)[1]);
    const filas = s.slice(xref).split('\n').slice(2).filter((l) => / n $/.test(l));
    return s.startsWith('%PDF-1.4') && s.trimEnd().endsWith('%%EOF') && filas.every((l, i) => s.substr(Number(l.slice(0, 10)), 12).startsWith((i + 1) + ' 0 obj'));
  }

  window.addEventListener('load', async () => {
    try {
      try { ['slotnova.horarios', 'slotnova.opciones', 'slotnova.sesion', 'slotnova.ia'].forEach((k) => localStorage.removeItem(k)); } catch (e) { /* sin almacenamiento */ }
      await esperar(250);
      // 1. Inicio de sesión (si quedó una sesión de una corrida anterior, se cierra primero)
      if (q('#acceso').hidden) q('#btn-salir').click();
      ok(!q('#acceso').hidden, 'Inicio de sesión visible sin sesión');
      if (hasta === 'inicio') return fin();
      q('#acceso-correo').value = 'mal'; q('#form-acceso').dispatchEvent(new Event('submit', { cancelable: true }));
      ok(/correo válido/.test(txt('#acceso-error')), 'Valida el correo: ' + txt('#acceso-error'));
      q('[data-accion="entrar-invitado"]').click();
      await esperar(450);
      ok(q('#acceso').hidden && txt('#avatar-iniciales') === 'I', 'Entrar como invitado · avatar ' + txt('#avatar-iniciales'));

      // 2. Datos
      await subirExcel();
      ok((await hastaEstado('con-datos')) === 'con-datos', 'Excel cargado: ' + txt('#estado-carga'));
      const sug = Array.from(qa('#sugerencias-cambio .chip')).map((b) => b.textContent);
      ok(sug.length >= 3, 'Sugerencias con nombres del Excel (' + sug.length + '): ' + sug.join(' | '));
      ok(/Descanso/.test(txt('#lista-bloques')), 'Descanso en la jornada: ' + txt('#lista-bloques .lista-bloques__descanso'));
      radio('#dur-otra'); q('#dur-otra-min').value = '55'; q('#dur-otra-min').dispatchEvent(new Event('change', { bubbles: true }));
      ok(!q('#campo-dur-otra').hidden && /07:55/.test(txt('#lista-bloques li')), 'Duración personalizada 55 min: ' + txt('#lista-bloques li'));
      radio('#dur-50');
      if (hasta === 'datos') return fin();
      if (hasta === 'detalles') { q('#diag-mas').open = true; return fin(); }

      // 3. Generar, cambio del archivo y modo estricto
      q('[data-accion="generar"]').click();
      await hastaEstado('generado');
      await esperar(500);
      let m = met();
      ok(m.cobertura === '100 %' && m.colisiones === '0', 'Horario base: ' + resumenMet());
      ok(qa('#cuadricula .fila-descanso').length === 1, 'Fila de descanso en el horario');
      ok(q('#cargando').hidden, 'La capa de carga se oculta al terminar');
      if (hasta === 'generado') return fin();
      q('[data-accion="aplicar-cambio"]').click();
      await hastaEstado('cambio-aplicado');
      m = met();
      ok(m.afectadas === '2' && m.movidas === '4' && m.pendientes === '0', 'Cambio D02 martes: afectadas ' + m.afectadas + ' · movidas ' + m.movidas + ' · pendientes ' + m.pendientes);
      let r = await H().ejecutar('generar_horario', { modo: 'estricto' });
      await esperar(500);
      m = met();
      ok(m.cobertura === '96,7 %' && m.pendientes === '4', 'Modo estricto: ' + resumenMet());
      r = await H().ejecutar('generar_horario', { modo: 'flexible' });
      await esperar(500);
      ok(met().cobertura === '100 %', 'Modo flexible otra vez: ' + resumenMet());

      // 4. Intercambio guiado
      qa('#cuadricula button.celda')[0].click();
      const opciones = qa('#cuadricula .celda--opcion').length;
      ok(opciones > 0, 'Intercambio: ' + opciones + ' opciones en verde');
      q('#cuadricula .celda--opcion').click();
      ok(/sigue sin cruces/.test(txt('#estado-intercambio')) && !q('#btn-deshacer-todo').disabled, 'Intercambio aplicado: ' + txt('#estado-intercambio'));
      q('#btn-deshacer-todo').click();
      if (hasta === 'intercambio') { qa('#cuadricula button.celda')[0].click(); return fin(); }

      // 5. Eventos
      q('[data-accion="nuevo-evento"]').click();
      q('#ev-titulo').value = 'Izada de bandera';
      q('#form-evento').dispatchEvent(new Event('submit', { cancelable: true }));
      ok(qa('#lista-eventos li').length === 1 && qa('#cuadricula .evento-tag').length >= 1, 'Evento informativo en la lista y en el horario');
      r = await H().ejecutar('agregar_evento', { titulo: 'Reunión de área', tipo: 'reunion', dia: 'Viernes', bloques: ['B6'], cursos: ['6A'], reservar: true });
      ok(r.ok && r.reprogramado, 'Evento con hora reservada (asistente): ' + (r.ok ? 'movidas ' + r.movidas + ', pendientes ' + r.pendientes : r.error));
      ok(qa('#lista-eventos li').length === 2, 'Los dos eventos conviven (identificadores únicos)');
      const libreViernes =!H().estado.actual.filas.some((f) => f.curso === '6A' && f.dia === 'Viernes' && f.bloque === 'B6' && f.asignatura);
      ok(libreViernes, '6A queda sin clase el viernes B6');
      r = await H().ejecutar('quitar_evento', { titulo: 'Reunión de área' });
      ok(r.ok && met().cobertura === '100 %', 'Quitar evento reservado: ' + resumenMet());
      if (hasta === 'eventos') return fin();

      // 6. Nombres
      q('#btn-editar-nombres').click();
      const campo = q('#nom-docente-D2');
      campo.value = 'Luis Fernando Vega';
      campo.dispatchEvent(new Event('change', { bubbles: true }));
      ok(/Luis Fernando Vega/.test(txt('#estado-nombres')) && H().estado.actual.filas.some((f) => f.docenteNombre === 'Luis Fernando Vega'), 'Renombrar docente en el diálogo: ' + txt('#estado-nombres'));
      q('#dlg-nombres [data-cerrar]').click();
      r = await H().ejecutar('renombrar', { tipo: 'materia', actual: 'Inglés', nuevo: 'Inglés bilingüe' });
      ok(r.ok && met().cobertura === '100 %' && /Inglés bilingüe/.test(txt('#leyenda')), 'Renombrar materia (asistente) sin mover el horario');

      // 7. Descargas: PDF válido, PNG, enlace compartido y QR
      const c = H().compartido();
      const v = HorarIA.exportar.modeloVista(c, 'curso', '6A');
      const pdf = await HorarIA.exportar.pdf([HorarIA.exportar.lienzo(v, 1)]);
      ok(revisarPdf(pdf), 'PDF bien formado (' + Math.round(pdf.length / 1024) + ' KB)');
      const png = await HorarIA.exportar.imagen(HorarIA.exportar.lienzo(v, 1), 'png');
      ok(png[0] === 0x89 && png[1] === 0x50, 'PNG válido (' + Math.round(png.length / 1024) + ' KB)');
      const codigo = await HorarIA.exportar.codificar(c);
      const vuelta = await HorarIA.exportar.decodificar(codigo);
      ok(vuelta.cursos.length === c.cursos.length && JSON.stringify(vuelta) === JSON.stringify(c), 'Enlace compartido ida y vuelta (' + codigo.length + ' caracteres)');
      if (hasta === 'exportar') {
        const img = document.createElement('img'); img.src = HorarIA.exportar.lienzo(v, 1).toDataURL(); img.id = 'muestra'; img.style.cssText = 'position:fixed;inset:0;z-index:999;width:100%;background:#fff';
        document.body.append(img); return fin();
      }
      q('#qr-url').value = 'https://ejemplo.github.io/slotnova/';
      r = await H().ejecutar('descargar', { formato: 'qr' });
      ok(r.ok && q('#qr-lienzo canvas'), 'Código QR creado (' + (r.enlace || '').length + ' caracteres)');
      window.__enlaceQR = r.enlace;
      const pre = document.createElement('pre'); pre.id = 'enlace-qr'; pre.textContent = r.enlace || ''; document.body.append(pre);
      if (hasta === 'qr') return fin();
      q('#dlg-qr [data-cerrar]').click();

      // 8. Asistente en modo local
      q('[data-abrir="asistente"]').click();
      await esperar(300);
      ok(!q('#asistente').hidden && qa('#chat .chat__msg').length >= 1, 'Asistente abierto con saludo');
      await HorarIA.asistente.enviar('Genera el horario');
      await esperar(900);
      ok(/Generé el horario/.test(q('#chat').textContent), 'Asistente local: «Genera el horario»');
      await HorarIA.asistente.enviar(H().sugerencias()[0]);
      const aplicar = Array.from(qa('#chat button')).find((b) => b.textContent === 'Aplicar');
      ok(!!aplicar, 'Asistente local entiende una sugerencia y muestra «Aplicar»');
      if (aplicar) { aplicar.click(); await esperar(200); }
      ok(/Cambio aplicado/.test(q('#chat').textContent), 'Cambio aplicado desde el chat');
      if (hasta === 'asistente') return fin();
      q('#btn-cerrar-asistente').click();

      // 9. IA: sin clave no se activa; Gemini cambia el modelo
      q('#ia-activa').click();
      ok(q('#dlg-ia').open && !q('#ia-activa').checked, 'Activar IA sin clave abre la configuración');
      radio('#ia-gemini');
      ok(/gemini/.test(q('#ia-modelo').value), 'Gemini propone su modelo: ' + q('#ia-modelo').value);
      q('#btn-probar-ia').click();
      ok(/Pega primero/.test(txt('#estado-config-ia')), 'Probar sin clave avisa');
      q('#dlg-ia [data-cerrar]').click();

      // 10. Opciones
      q('[data-abrir="opciones"]').click();
      radio('#op-tema-oscuro'); radio('#op-letra-grande');
      ok(document.documentElement.dataset.theme === 'dark' && document.documentElement.dataset.letra === 'grande', 'Modo nocturno y letra grande');
      if (hasta === 'opciones') { q('#dlg-opciones').close(); q('a[data-ir="horario"]').click(); return fin(); }
      q('#op-restablecer').click();
      fin();
    } catch (e) { log.push('  ✘ FALLO: ' + e.message + ' ' + String(e.stack || '').split('\n')[1]); fin(); }
  });
  function H() { return window.HorarIA.app; }
})();
