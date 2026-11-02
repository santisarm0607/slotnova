/* SlotNova · app.js
 * Controlador de la interfaz. Usa los módulos de window.HorarIA (datos, motor, validador, reglas, Excel).
 * Principio: la IA entiende, el motor garantiza. La IA solo propone reglas; el motor arma el horario
 * y el validador independiente lo certifica.
 * Todo el texto que viene de los datos se inserta con textContent (nunca innerHTML).
 */
(function () {
  'use strict';
  const H = window.HorarIA;
  window.SlotNova = window.HorarIA;

  // ------------------------------------------------------------------
  // Utilidades de DOM y formato
  // ------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  function el(tag, props) {
    const n = document.createElement(tag);
    if (props) Object.keys(props).forEach((k) => {
      const v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, String(v));
    });
    const hijos = Array.prototype.slice.call(arguments, 2).flat(Infinity);
    hijos.forEach((h) => { if (h !== null && h !== undefined && h !== false) n.append(h instanceof Node ? h : document.createTextNode(String(h))); });
    return n;
  }
  const vaciar = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
  const decimal = (x) => String(x).replace('.', ',');
  const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios || uno + 's');
  const oculto = (texto) => el('span', { class: 'visually-hidden' }, texto);
  const ICONO = { ok: '✔', aviso: '!', info: 'i', error: '✘' };
  const NIVEL = { ok: 'Bien', aviso: 'Atención', info: 'Dato', error: 'Problema' };
  const enMarco = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

  function mensaje(id, contenido, tipo) {
    const n = vaciar($(id));
    n.className = 'mensaje' + (tipo ? ' mensaje--' + tipo : '') + (n.classList.contains('validez') ? ' validez' : '');
    if (!contenido) return;
    if (tipo) n.append(el('span', { 'aria-hidden': 'true' }, ICONO[tipo] + ' '));
    n.append.apply(n, [].concat(contenido).map((c) => (c instanceof Node ? c : document.createTextNode(String(c)))));
  }

  // Horas: "07:50" → "7:50 a. m."; rangos como "10:00 a 11:00 a. m."
  function hora12(h) {
    const p = String(h || '00:00').split(':').map(Number);
    const per = p[0] < 12 ? 'a. m.' : p[0] === 12 && p[1] === 0 ? 'm.' : 'p. m.';
    return { t: ((p[0] % 12) || 12) + ':' + String(p[1] || 0).padStart(2, '0'), per };
  }
  function rangoHora(i, f) {
    const a = hora12(i), b = hora12(f);
    return a.per === b.per && a.per !== 'm.' ? a.t + ' a ' + b.t + ' ' + b.per : a.t + ' ' + a.per + ' a ' + b.t + ' ' + b.per;
  }
  const horaSola = (h) => { const a = hora12(h); return a.t + ' ' + a.per; };
  const tiempo = (h) => el('time', { datetime: h }, h);

  // ------------------------------------------------------------------
  // Estado
  // ------------------------------------------------------------------
  const estado = {
    original: null,      // datos tal como se cargaron (sin configurar horas)
    fuente: '',
    tiempo: { duracionMinutos: 50, horaInicio: '07:00', descansoMinutos: 20, descansoDespuesDe: 'B3' },
    datos: null,         // datos con las horas configuradas
    ef: null,            // datos efectivos (con la hoja Cambio si está aplicada)
    escenario: false,
    modo: 'alternativas',
    semilla: 1,
    reglas: [],
    dx: null,
    base: null,          // { resultado, reglas, modo }
    actual: null,        // resultado en pantalla
    referencia: null,    // resultado anterior (para medir movidas)
    descCambio: '',
    cert: null,
    rep: null,
    historial: [],       // intercambios manuales para deshacer
    seleccion: null,
    vista: { tipo: 'curso', id: null },
    propuesta: null,
    ia: { proveedor: 'anthropic', modelo: 'claude-opus-5-5', clave: '', activa: false, recordar: false, estado: 'local' },
    eventos: [],         // actos, reuniones, evaluaciones… que se pintan en el horario
    nombre: '',          // nombre del horario guardado que está abierto
    sesion: null,        // { nombre, correo } del inicio de sesión (prototipo)
    borrador: null,
    borradorSucio: false,
    novedadDia: null,
    avisos: [],
    exportado: false,
  };

  // ------------------------------------------------------------------
  // Asignaturas: color fijo y sigla en todas las vistas
  // ------------------------------------------------------------------
  let ordenAsig = [], siglas = {};
  const VACIAS = new Set(['e', 'y', 'de', 'del', 'la', 'las', 'los', 'el', 'en']);
  function prepararAsignaturas(d) {
    ordenAsig = Array.from(new Set(d.carga.map((c) => c.asignatura).concat(Object.keys(d.habilitados))));
    siglas = {};
    const usadas = {};
    ordenAsig.forEach((a) => {
      const palabras = a.split(/\s+/).filter((p) => p && !VACIAS.has(p.toLowerCase()));
      let s = (palabras.length > 1 ? palabras.map((p) => p[0]).join('') : (palabras[0] || a).slice(0, 3)).toUpperCase();
      let k = s, i = 2;
      while (usadas[k]) k = s + i++;
      usadas[k] = true;
      siglas[a] = k;
    });
  }
  const claseMateria = (a) => 'mat-' + (Math.max(0, ordenAsig.indexOf(a)) % 10);
  const sigla = (a) => siglas[a] || String(a).slice(0, 3).toUpperCase();
  const soloNombre = (id) => { const d = estado.ef && estado.ef.docentes.find((x) => x.id === id); return d ? d.nombre : id; };
  const idxBloque = (b) => estado.ef.bloques.findIndex((x) => x.id === b);

  function docenteDisponible(id, dia, bloque) {
    const d = estado.ef.disponibilidad[id];
    if (d && d[dia] && d[dia][bloque] === 0) return false;
    return !estado.reglas.some((r) => r.tipo === 'bloquear_docente' && r.docente === id &&
      (!r.dias || !r.dias.length || r.dias.includes(dia)) && (!r.bloques || !r.bloques.length || r.bloques.includes(bloque)));
  }

  // ------------------------------------------------------------------
  // 1. Cargar datos y configurar el tiempo
  // ------------------------------------------------------------------
  function cargarDatos(datos, fuente, conservarReglas) {
    estado.original = H.clonar(datos);
    estado.fuente = fuente;
    reiniciarResultados();
    estado.datos = H.configurarTiempo(estado.original, estado.tiempo);
    refrescarEf();
    estado.reglas = conservarReglas
      ? estado.reglas.map((r) => { const n = H.reglas.normalizarRegla(r, estado.ef); if (n.ok && r.eventoId) n.regla.eventoId = r.eventoId; return n; }).filter((n) => n.ok).map((n) => n.regla)
      : [];
    if (!conservarReglas) { estado.eventos = []; estado.nombre = ''; }
    prepararAsignaturas(estado.datos);
    prepararBorrador();
    renderBloques();
    const total = estado.datos.carga.reduce((a, c) => a + c.sesiones, 0);
    const resumen = plural(estado.datos.cursos.length, 'curso') + ' · ' + plural(total, 'clase') + ' a la semana · ' + plural(estado.datos.docentes.length, 'docente') + ' · ' + plural(estado.datos.salones.length, 'salón', 'salones');
    const avisos = estado.datos.avisos || [];
    mensaje('estado-carga', [el('strong', null, fuente.charAt(0).toUpperCase() + fuente.slice(1) + ' listos: '), resumen + '.', avisos.length ? ' Revisa: ' + avisos.join(' ') : ''], avisos.length ? 'aviso' : 'ok');
    diagnosticar();
    renderReglas();
    renderPropuesta();
    renderFormDia();
    renderSugerencias();
    renderTodoResultado();
  }

  function reiniciarResultados() {
    Object.assign(estado, { base: null, actual: null, referencia: null, cert: null, rep: null, escenario: false, historial: [], seleccion: null, propuesta: null, novedadDia: null, avisos: [], descCambio: '', exportado: false });
    ['estado-generar', 'estado-cambio', 'estado-intercambio', 'estado-dia', 'estado-exportar', 'estado-novedad'].forEach((id) => mensaje(id, ''));
  }

  function refrescarEf() {
    estado.ef = estado.escenario ? H.aplicarEscenario(estado.datos) : estado.datos;
  }

  // Descanso configurado justo después del bloque i (null si no hay): va del fin de ese bloque al inicio del siguiente.
  function descansoTras(bloques, i) {
    const t = estado.tiempo;
    if (!t.descansoMinutos || !bloques[i + 1] || bloques[i].id !== t.descansoDespuesDe) return null;
    return { inicio: bloques[i].fin, fin: bloques[i + 1].inicio, minutos: t.descansoMinutos };
  }

  function leerTiempo() {
    const dur = document.querySelector('input[name="duracion"]:checked');
    const otra = !!dur && dur.value === 'otra';
    $('campo-dur-otra').hidden = !otra;
    const personal = Math.min(120, Math.max(20, parseInt($('dur-otra-min').value, 10) || 50));
    estado.tiempo = {
      duracionMinutos: otra ? personal : dur ? Number(dur.value) : 50,
      horaInicio: $('hora-inicio').value || '07:00',
      descansoMinutos: Math.max(0, parseInt($('descanso-min').value, 10) || 0),
      descansoDespuesDe: $('descanso-despues').value || null,
    };
  }

  function aplicarTiempo() {
    leerTiempo();
    if (!estado.original) { renderBloques(); return; }
    estado.datos = H.configurarTiempo(estado.original, estado.tiempo);
    refrescarEf();
    const horas = {};
    estado.datos.bloques.forEach((b) => { horas[b.id] = b; });
    const retemporizar = (r) => { if (r && r.filas) r.filas.forEach((f) => { const b = horas[f.bloque]; if (b) { f.inicio = b.inicio; f.fin = b.fin; } }); };
    [estado.actual, estado.referencia, estado.base && estado.base.resultado].concat(estado.historial).forEach(retemporizar);
    renderBloques();
    renderFormDia();
    if (estado.actual) { evaluar(); renderTodoResultado(); }
    if (estado.novedadDia) proponerCobertura();
  }

  function renderBloques() {
    const ul = vaciar($('lista-bloques'));
    const fuente = estado.datos || H.configurarTiempo(H.DATOS_PRUEBA, estado.tiempo);
    fuente.bloques.forEach((b, i) => {
      ul.append(el('li', null, el('strong', null, b.id), ' ', tiempo(b.inicio), '–', tiempo(b.fin)));
      const desc = descansoTras(fuente.bloques, i);
      if (desc) ul.append(el('li', { class: 'lista-bloques__descanso' }, el('strong', null, 'Descanso'), ' ', tiempo(desc.inicio), '–', tiempo(desc.fin)));
    });
    const sel = $('descanso-despues'), valor = sel.value;
    vaciar(sel);
    fuente.bloques.slice(0, -1).forEach((b) => sel.append(el('option', { value: b.id, selected: b.id === valor }, b.id)));
    if (!sel.value && sel.options.length) sel.value = sel.options[Math.min(2, sel.options.length - 1)].value;
  }

  async function leerArchivo(archivo) {
    if (!archivo) return;
    if (!/\.xlsx$/i.test(archivo.name)) {
      mensaje('estado-carga', 'El archivo «' + archivo.name + '» no es .xlsx. Guárdalo como libro de Excel (.xlsx) o usa los datos de prueba.', 'error');
      return;
    }
    mensaje('estado-carga', 'Leyendo «' + archivo.name + '»…', 'info');
    try {
      const libro = await H.leerXlsx(await archivo.arrayBuffer());
      const datos = H.desdeLibro(libro);
      if (!datos.cursos.length || !datos.docentes.length || !datos.carga.length) throw new Error('No encontré filas en las hojas Cursos, Docentes o Carga.');
      cargarDatos(datos, 'datos de «' + archivo.name + '»');
    } catch (e) {
      mensaje('estado-carga', 'No se pudo leer «' + archivo.name + '»: ' + e.message + ' Revisa que tenga las hojas Cursos, Docentes, Carga y Salones (como en la plantilla), o prueba con los datos de ejemplo.', 'error');
    }
  }

  // ------------------------------------------------------------------
  // 1b. Editor manual de datos
  // ------------------------------------------------------------------
  function prepararBorrador() {
    estado.borrador = estado.original ? H.clonar(estado.original) : null;
    estado.borradorSucio = false;
    renderEditor();
  }

  function marcarSucio(rehacer) {
    estado.borradorSucio = true;
    if (rehacer) renderEditor(); else revisarBorrador();
  }

  function campo(id, etiqueta, control) {
    control.id = id;
    return [el('label', { for: id, class: 'visually-hidden' }, etiqueta), control];
  }
  function entrada(tipo, valor, alCambiar, extra) {
    return el('input', Object.assign({ type: tipo, value: valor == null ? '' : String(valor), onchange: (e) => alCambiar(e.target.value) }, extra || {}));
  }
  function selector(valor, opciones, alCambiar) {
    const s = el('select', { onchange: (e) => alCambiar(e.target.value) });
    opciones.forEach((o) => s.append(el('option', { value: o.valor, selected: o.valor === valor }, o.texto)));
    if (!opciones.some((o) => o.valor === valor)) s.prepend(el('option', { value: valor || '', selected: true }, valor ? valor + ' (no existe)' : 'Elige…'));
    return s;
  }

  function tablaEdicion(contenedor, columnas, filas, nombreFila, quitar) {
    const tabla = el('table', { class: 'tabla-edicion' },
      el('thead', null, el('tr', null, columnas.map((c) => el('th', { scope: 'col', class: c.clase }, c.titulo)), el('th', { scope: 'col', class: 'col-accion' }, oculto('Acciones')))),
      el('tbody', null, filas.map((f, i) => el('tr', null,
        columnas.map((c) => el('td', null, c.control(f, i))),
        el('td', null, el('button', { type: 'button', class: 'boton boton--pequeno boton--peligro', 'aria-label': 'Quitar ' + nombreFila(f), onclick: () => quitar(i) }, 'Quitar'))))));
    vaciar($(contenedor)).append(tabla);
  }

  function renombrarCurso(viejo, nuevo) {
    const b = estado.borrador;
    b.carga.forEach((x) => { if (x.curso === viejo) x.curso = nuevo; });
  }
  function renombrarDocente(viejo, nuevo) {
    const b = estado.borrador;
    b.carga.forEach((x) => { if (x.principal === viejo) x.principal = nuevo; });
    Object.keys(b.habilitados).forEach((a) => { b.habilitados[a] = b.habilitados[a].map((d) => (d === viejo ? nuevo : d)); });
    if (b.disponibilidad[viejo]) { b.disponibilidad[nuevo] = b.disponibilidad[viejo]; delete b.disponibilidad[viejo]; }
    (b.cambios || []).forEach((c) => { if (c.docente === viejo) c.docente = nuevo; });
  }
  function asignaturasBorrador() {
    const b = estado.borrador;
    return Array.from(new Set(b.carga.map((c) => c.asignatura).filter(Boolean).concat(Object.keys(b.habilitados))));
  }
  function tiposSalon() {
    const b = estado.borrador;
    return Array.from(new Set(['GENERAL', 'LAB_CIENCIAS', 'CANCHA', 'SALA_INFORMATICA'].concat(b.salones.map((s) => s.tipo), b.carga.map((c) => c.tipoSalon)).filter(Boolean)));
  }
  function disponibilidadCompleta(id) {
    const b = estado.borrador, d = {};
    b.dias.forEach((dia) => { d[dia] = {}; b.bloques.forEach((bl) => { d[dia][bl.id] = 1; }); });
    b.disponibilidad[id] = d;
  }

  function renderEditor() {
    const hay = !!estado.borrador;
    $('editor-vacio').hidden = hay;
    ['ed-cursos', 'ed-docentes', 'ed-habilitados', 'ed-carga', 'ed-salones', 'ed-disponibilidad'].forEach((id) => { $(id).hidden = !hay; });
    $('ed-aplicar').disabled = !hay || !estado.borradorSucio;
    $('ed-descartar').disabled = !hay || !estado.borradorSucio;
    if (!hay) { vaciar($('ed-errores')); return; }
    const activo = document.activeElement && document.activeElement.id;
    const b = estado.borrador;

    tablaEdicion('ed-cursos-tabla', [
      { titulo: 'ID del curso', control: (c, i) => campo('ed-curso-' + i + '-id', 'ID del curso ' + (i + 1), entrada('text', c.id, (v) => { const n = v.trim(); renombrarCurso(c.id, n); c.id = n; c.nombre = n; marcarSucio(true); }, { spellcheck: 'false' })) },
      { titulo: 'Estudiantes', clase: 'col-num', control: (c, i) => campo('ed-curso-' + i + '-est', 'Estudiantes de ' + c.id, entrada('number', c.estudiantes, (v) => { c.estudiantes = Number(v); marcarSucio(); }, { min: '1', step: '1' })) },
    ], b.cursos, (c) => 'el curso ' + c.id, (i) => { const id = b.cursos[i].id; b.cursos.splice(i, 1); b.carga = b.carga.filter((x) => x.curso !== id); marcarSucio(true); });

    tablaEdicion('ed-docentes-tabla', [
      { titulo: 'ID', clase: 'col-num', control: (d, i) => campo('ed-doc-' + i + '-id', 'ID del docente ' + (i + 1), entrada('text', d.id, (v) => { const n = H.normalizarId(v); renombrarDocente(d.id, n); d.id = n; marcarSucio(true); }, { spellcheck: 'false' })) },
      { titulo: 'Nombre', control: (d, i) => campo('ed-doc-' + i + '-nombre', 'Nombre de ' + d.id, entrada('text', d.nombre, (v) => { d.nombre = v.trim(); marcarSucio(true); })) },
      { titulo: 'Máximo semanal', clase: 'col-num', control: (d, i) => campo('ed-doc-' + i + '-max', 'Máximo de sesiones semanales de ' + d.nombre, entrada('number', d.max >= 1e9 ? '' : d.max, (v) => { d.max = v === '' ? 1e9 : Number(v); marcarSucio(); }, { min: '1', step: '1' })) },
    ], b.docentes, (d) => 'al docente ' + d.nombre, (i) => {
      const id = b.docentes[i].id;
      b.docentes.splice(i, 1);
      Object.keys(b.habilitados).forEach((a) => { b.habilitados[a] = b.habilitados[a].filter((x) => x !== id); });
      delete b.disponibilidad[id];
      b.carga.forEach((x) => { if (x.principal === id) x.principal = ''; });
      marcarSucio(true);
    });

    // Matriz docentes × asignaturas
    const asignaturas = asignaturasBorrador();
    const matriz = el('table', { class: 'tabla-edicion matriz' },
      el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Docente'), asignaturas.map((a) => el('th', { scope: 'col' }, el('abbr', { title: a }, sigla(a)))))),
      el('tbody', null, b.docentes.map((d, i) => el('tr', null, el('th', { scope: 'row' }, d.nombre + ' (' + d.id + ')'),
        asignaturas.map((a, j) => {
          const id = 'ed-hab-' + i + '-' + j;
          return el('td', null, el('label', { for: id, class: 'visually-hidden' }, d.nombre + ' puede dar ' + a),
            el('input', { type: 'checkbox', id, checked: (b.habilitados[a] || []).includes(d.id), onchange: (e) => {
              const lista = b.habilitados[a] = b.habilitados[a] || [];
              if (e.target.checked) { if (!lista.includes(d.id)) lista.push(d.id); } else b.habilitados[a] = lista.filter((x) => x !== d.id);
              marcarSucio();
            } }));
        })))));
    vaciar($('ed-habilitados-tabla')).append(matriz);

    const opCursos = b.cursos.map((c) => ({ valor: c.id, texto: c.id }));
    const opDocentes = b.docentes.map((d) => ({ valor: d.id, texto: d.nombre + ' (' + d.id + ')' }));
    const opTipos = tiposSalon().map((t) => ({ valor: t, texto: t }));
    tablaEdicion('ed-carga-tabla', [
      { titulo: 'Curso', control: (x, i) => campo('ed-carga-' + i + '-curso', 'Curso de la fila ' + (i + 1), selector(x.curso, opCursos, (v) => { x.curso = v; marcarSucio(); })) },
      { titulo: 'Asignatura', control: (x, i) => campo('ed-carga-' + i + '-asig', 'Asignatura de la fila ' + (i + 1), entrada('text', x.asignatura, (v) => { x.asignatura = v.trim(); marcarSucio(true); }, { list: 'ed-lista-asignaturas' })) },
      { titulo: 'Docente principal', control: (x, i) => campo('ed-carga-' + i + '-doc', 'Docente principal de ' + x.curso + ' ' + x.asignatura, selector(x.principal, opDocentes, (v) => { x.principal = v; marcarSucio(); })) },
      { titulo: 'Sesiones / semana', clase: 'col-num', control: (x, i) => campo('ed-carga-' + i + '-ses', 'Sesiones por semana de ' + x.curso + ' ' + x.asignatura, entrada('number', x.sesiones, (v) => { x.sesiones = Number(v); marcarSucio(); }, { min: '1', step: '1' })) },
      { titulo: 'Tipo de salón', control: (x, i) => campo('ed-carga-' + i + '-tipo', 'Tipo de salón de ' + x.curso + ' ' + x.asignatura, selector(x.tipoSalon, opTipos, (v) => { x.tipoSalon = v; marcarSucio(); })) },
    ], b.carga, (x) => x.asignatura + ' de ' + x.curso, (i) => { b.carga.splice(i, 1); marcarSucio(true); });
    const lista = el('datalist', { id: 'ed-lista-asignaturas' }, asignaturas.map((a) => el('option', { value: a })));
    $('ed-carga-tabla').append(lista);

    tablaEdicion('ed-salones-tabla', [
      { titulo: 'ID', clase: 'col-num', control: (s, i) => campo('ed-salon-' + i + '-id', 'ID del salón ' + (i + 1), entrada('text', s.id, (v) => { s.id = v.trim(); marcarSucio(); }, { spellcheck: 'false' })) },
      { titulo: 'Nombre', control: (s, i) => campo('ed-salon-' + i + '-nombre', 'Nombre del salón ' + s.id, entrada('text', s.nombre, (v) => { s.nombre = v.trim(); marcarSucio(); })) },
      { titulo: 'Tipo', control: (s, i) => campo('ed-salon-' + i + '-tipo', 'Tipo del salón ' + s.id, selector(s.tipo, opTipos, (v) => { s.tipo = v; marcarSucio(); })) },
      { titulo: 'Capacidad', clase: 'col-num', control: (s, i) => campo('ed-salon-' + i + '-cap', 'Capacidad del salón ' + s.id, entrada('number', s.capacidad >= 1e9 ? '' : s.capacidad, (v) => { s.capacidad = v === '' ? 1e9 : Number(v); marcarSucio(); }, { min: '1', step: '1' })) },
    ], b.salones, (s) => 'el salón ' + s.nombre, (i) => { b.salones.splice(i, 1); marcarSucio(true); });

    // Duplicar curso y disponibilidad
    const dup = $('ed-duplicar-origen'), dupValor = dup.value;
    vaciar(dup).append(el('option', { value: '' }, 'Curso a duplicar'));
    b.cursos.forEach((c) => dup.append(el('option', { value: c.id, selected: c.id === dupValor }, c.id)));
    const selDoc = $('ed-disp-docente'), docValor = selDoc.value || (b.docentes[0] && b.docentes[0].id) || '';
    vaciar(selDoc);
    b.docentes.forEach((d) => selDoc.append(el('option', { value: d.id, selected: d.id === docValor }, d.nombre + ' (' + d.id + ')')));
    renderDisponibilidadEditor();

    revisarBorrador();
    if (activo && $(activo)) $(activo).focus();
  }

  function renderDisponibilidadEditor() {
    const b = estado.borrador, cont = vaciar($('ed-disp-tabla'));
    const id = $('ed-disp-docente').value;
    const d = b.docentes.find((x) => x.id === id);
    if (!d) return;
    if (!b.disponibilidad[id]) disponibilidadCompleta(id);
    const disp = b.disponibilidad[id];
    cont.append(el('table', { class: 'tabla-edicion matriz' },
      el('caption', null, 'Disponibilidad de ' + d.nombre + ' (' + d.id + ')'),
      el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Bloque'), b.dias.map((dia) => el('th', { scope: 'col' }, dia)))),
      el('tbody', null, b.bloques.map((bl) => el('tr', null, el('th', { scope: 'row' }, bl.id),
        b.dias.map((dia) => {
          const cid = 'ed-disp-' + dia + '-' + bl.id;
          if (!disp[dia]) disp[dia] = {};
          return el('td', null, el('label', { for: cid, class: 'visually-hidden' }, d.nombre + ' disponible el ' + dia + ' en ' + bl.id),
            el('input', { type: 'checkbox', id: cid, checked: disp[dia][bl.id] !== 0, onchange: (e) => { disp[dia][bl.id] = e.target.checked ? 1 : 0; marcarSucio(); } }));
        }))))));
  }

  function revisarBorrador() {
    const b = estado.borrador, errores = [];
    if (!b) return errores;
    const repetidos = (lista, que) => {
      const vistos = {};
      lista.forEach((x) => { if (!x.id) errores.push('Hay ' + que + ' sin ID.'); else if (vistos[x.id]) errores.push('El ID «' + x.id + '» está repetido en ' + que + '.'); vistos[x.id] = true; });
    };
    repetidos(b.cursos, 'cursos'); repetidos(b.docentes, 'docentes'); repetidos(b.salones, 'salones');
    b.cursos.forEach((c) => { if (!(Number.isInteger(c.estudiantes) && c.estudiantes > 0)) errores.push('El curso ' + c.id + ' debe tener un número entero de estudiantes mayor que 0.'); });
    b.docentes.forEach((d) => { if (!(d.max > 0)) errores.push('El máximo semanal de ' + d.nombre + ' debe ser mayor que 0.'); });
    b.salones.forEach((s) => { if (!(s.capacidad > 0)) errores.push('La capacidad del salón ' + s.id + ' debe ser mayor que 0.'); });
    const cursos = new Set(b.cursos.map((c) => c.id)), docentes = new Set(b.docentes.map((d) => d.id)), vistos = {};
    const bloquesSemana = b.dias.length * b.bloques.length, porCurso = {};
    b.carga.forEach((x, i) => {
      const fila = 'Fila ' + (i + 1) + ' de la carga (' + (x.curso || '¿curso?') + ' · ' + (x.asignatura || '¿asignatura?') + ')';
      if (!cursos.has(x.curso)) errores.push(fila + ': el curso no existe.');
      if (!x.asignatura) errores.push(fila + ': falta la asignatura.');
      if (!(Number.isInteger(x.sesiones) && x.sesiones >= 1)) errores.push(fila + ': las sesiones deben ser un entero desde 1.');
      if (!docentes.has(x.principal)) errores.push(fila + ': elige un docente principal que exista.');
      else if (x.asignatura && !(b.habilitados[x.asignatura] || []).includes(x.principal)) errores.push(fila + ': ' + x.principal + ' no tiene marcada la asignatura en «Materias que puede dar cada docente».');
      const k = x.curso + '|' + x.asignatura;
      if (vistos[k]) errores.push(fila + ': la asignatura está dos veces para el mismo curso.');
      vistos[k] = true;
      porCurso[x.curso] = (porCurso[x.curso] || 0) + (x.sesiones || 0);
      if (!b.salones.some((s) => s.tipo === x.tipoSalon)) errores.push(fila + ': no hay salones de tipo ' + x.tipoSalon + '.');
    });
    Object.keys(porCurso).forEach((c) => { if (porCurso[c] > bloquesSemana) errores.push('El curso ' + c + ' tiene ' + porCurso[c] + ' sesiones y la semana solo tiene ' + bloquesSemana + ' bloques.'); });
    Array.from(new Set(b.carga.map((x) => x.asignatura).filter(Boolean))).forEach((a) => {
      if (!(b.habilitados[a] || []).some((d) => docentes.has(d))) errores.push('Nadie puede dar ' + a + ': márcala al menos a un docente.');
    });
    const ul = vaciar($('ed-errores'));
    if (estado.borradorSucio) {
      if (errores.length) errores.slice(0, 12).forEach((e) => ul.append(itemEstado('error', e)));
      else ul.append(itemEstado('ok', 'Sin errores: puedes aplicar los cambios.'));
    }
    $('ed-aplicar').disabled = !estado.borradorSucio;
    $('ed-descartar').disabled = !estado.borradorSucio;
    return errores;
  }

  function itemEstado(nivel, texto, titulo) {
    return el('li', { class: 'estado--' + nivel },
      el('span', { class: 'semaforo__icono', 'aria-hidden': 'true' }, ICONO[nivel]),
      el('span', null, el('span', { class: 'semaforo__nivel' }, titulo || NIVEL[nivel]), el('span', { class: 'semaforo__detalle' }, texto)));
  }

  function agregarFila(tipo) {
    const b = estado.borrador;
    if (!b) return;
    const libre = (prefijo, lista) => { let n = lista.length + 1; while (lista.some((x) => x.id === prefijo + n)) n++; return prefijo + n; };
    if (tipo === 'curso') b.cursos.push({ id: libre('C', b.cursos), nombre: '', estudiantes: 30 });
    if (tipo === 'docente') { const id = libre('D', b.docentes); b.docentes.push({ id, nombre: 'Nuevo docente', max: 24 }); disponibilidadCompleta(id); }
    if (tipo === 'carga') {
      const a = asignaturasBorrador()[0] || '';
      b.carga.push({ curso: b.cursos[0] ? b.cursos[0].id : '', asignatura: a, principal: (b.habilitados[a] || [])[0] || '', sesiones: 1, tipoSalon: 'GENERAL' });
    }
    if (tipo === 'salon') b.salones.push({ id: libre('S', b.salones), nombre: 'Nuevo salón', tipo: 'GENERAL', capacidad: 30 });
    marcarSucio(true);
  }

  function duplicarCurso() {
    const b = estado.borrador, origen = $('ed-duplicar-origen').value;
    const c = b && b.cursos.find((x) => x.id === origen);
    if (!c) { $('ed-duplicar-origen').focus(); return; }
    let nuevo = origen + '-2';
    const m = /^(\d+)([A-Z])$/.exec(origen);
    if (m) { let letra = m[2].charCodeAt(0); do { letra++; } while (b.cursos.some((x) => x.id === m[1] + String.fromCharCode(letra)) && letra < 90); nuevo = m[1] + String.fromCharCode(letra); }
    while (b.cursos.some((x) => x.id === nuevo)) nuevo += "'";
    b.cursos.push({ id: nuevo, nombre: nuevo, estudiantes: c.estudiantes });
    b.carga.filter((x) => x.curso === origen).forEach((x) => b.carga.push(Object.assign({}, x, { curso: nuevo })));
    marcarSucio(true);
    mensaje('estado-carga', 'Se creó el curso ' + nuevo + ' con la carga de ' + origen + '. Revisa sus datos y aplica los cambios.', 'info');
  }

  function aplicarBorrador() {
    const errores = revisarBorrador();
    if (errores.length) { mensaje('estado-carga', 'Hay ' + plural(errores.length, 'error', 'errores') + ' en los datos editados. Corrígelos en la lista de abajo del editor.', 'error'); $('ed-errores').scrollIntoView({ block: 'center' }); return; }
    const b = H.clonar(estado.borrador);
    const docentes = new Set(b.docentes.map((d) => d.id));
    Object.keys(b.habilitados).forEach((a) => { b.habilitados[a] = b.habilitados[a].filter((d) => docentes.has(d)); });
    b.docentes.forEach((d) => { if (!b.disponibilidad[d.id]) { b.disponibilidad[d.id] = {}; } b.dias.forEach((dia) => { b.disponibilidad[d.id][dia] = b.disponibilidad[d.id][dia] || {}; b.bloques.forEach((bl) => { if (b.disponibilidad[d.id][dia][bl.id] === undefined) b.disponibilidad[d.id][dia][bl.id] = 1; }); }); });
    b.avisos = [];
    const fuente = /editados/.test(estado.fuente) ? estado.fuente : estado.fuente + ', editados a mano';
    cargarDatos(b, fuente, true);
    mensaje('estado-carga', 'Cambios guardados. Pulsa «Generar horario» para verlos en el horario.', 'ok');
  }

  // ------------------------------------------------------------------
  // 2. Diagnóstico
  // ------------------------------------------------------------------
  let nBarra = 0;
  function barra(texto, valor, max) {
    const id = 'barra-' + (++nBarra);
    const excede = valor > max;
    return el('p', { class: 'barra' + (excede ? ' barra--excede' : '') },
      el('label', { for: id }, el('span', null, texto), el('span', excede ? { class: 'texto-alerta' } : null, (excede ? '✘ ' : '') + valor + ' de ' + max + ' máx.' + (excede ? ' (sobran ' + (valor - max) + ')' : ''))),
      el('progress', { id, max: String(max), value: String(Math.min(valor, max)) }, valor + ' de ' + max));
  }

  function diagnosticar() {
    if (!estado.ef) return;
    const dx = estado.dx = H.diagnosticar(estado.ef, estado.reglas, { modoDocente: estado.modo });
    const resumen = {
      ok: 'Todo listo para generar el horario completo.',
      aviso: 'Se puede generar. Hay puntos a tener en cuenta:',
      error: 'No todo cabe. El horario saldrá sin cruces y te diremos qué quedó pendiente:',
    }[dx.nivel];
    mensaje('diag-resumen', resumen, dx.nivel);
    const item = (i) => el('li', { class: 'estado--' + i.nivel },
      el('span', { class: 'semaforo__icono', 'aria-hidden': 'true' }, ICONO[i.nivel]),
      el('span', null, oculto(NIVEL[i.nivel] + ': '), el('span', { class: 'semaforo__titulo' }, i.titulo)),
      el('span', { class: 'semaforo__detalle' }, i.detalle));
    const orden = { error: 0, aviso: 1, info: 2, ok: 3 };
    const items = dx.items.slice().sort((a, b) => orden[a.nivel] - orden[b.nivel]);
    const importantes = items.filter((i) => i.nivel === 'error' || i.nivel === 'aviso');
    vaciar($('lista-diagnostico')).append.apply($('lista-diagnostico'), importantes.map(item));
    vaciar($('lista-diagnostico-mas')).append.apply($('lista-diagnostico-mas'), items.filter((i) => importantes.indexOf(i) < 0).map(item));

    const cargas = vaciar($('lista-carga'));
    dx.carga.forEach((c) => {
      const max = c.max >= 1e9 ? c.disponibles : c.max;
      const li = el('li', null, el('h4', null, c.nombre),
        el('p', { class: 'ayuda' }, (c.habilitadas || []).join(', ') || 'Sin materias'),
        barra('Clases asignadas', c.principal, max));
      if (c.asignada != null && c.asignada !== c.principal) li.append(barra(estado.modo === 'estricto' ? 'Solo con su docente asignado' : 'Con la solución propuesta', c.asignada, max));
      cargas.append(li);
    });
  }

  // ------------------------------------------------------------------
  // 3. Generar
  // ------------------------------------------------------------------
  // Capa con el logo girando mientras el motor o la IA trabajan (mínimo 400 ms para que no parpadee)
  let cargaDesde = 0, cargaTimer = null;
  function mostrarCarga(texto) {
    clearTimeout(cargaTimer);
    $('cargando-texto').textContent = texto || 'Trabajando…';
    $('cargando').hidden = false;
    cargaDesde = Date.now();
  }
  function ocultarCarga() {
    clearTimeout(cargaTimer);
    cargaTimer = setTimeout(() => { $('cargando').hidden = true; }, Math.max(0, 400 - (Date.now() - cargaDesde)));
  }

  // Devuelve una promesa que se cumple cuando el horario quedó generado (la usa el asistente)
  function generar(otraOpcion) {
    if (!estado.datos) return Promise.resolve(false);
    if (otraOpcion) estado.semilla += 1;
    const idMsg = vistaActual === 'horario' ? 'estado-generar' : 'estado-generar-datos';
    const botones = [$('btn-generar'), $('btn-otra')];
    botones.forEach((b) => { b.disabled = true; });
    $('btn-generar').setAttribute('aria-busy', 'true');
    mensaje(idMsg, '');
    mostrarCarga(otraOpcion ? 'Buscando otra versión…' : 'Armando el horario…');
    return new Promise((cumplir) => setTimeout(() => {
      let ok = false;
      try {
        estado.escenario = false;
        refrescarEf();
        const res = H.motor.generar(estado.ef, { semilla: estado.semilla, reglas: estado.reglas, modoDocente: estado.modo });
        if (!res.filas.length) {
          mensaje(idMsg, [res.error || 'No se pudo generar.', ' ', (res.motivos || []).join(' ')], 'error');
          document.body.dataset.estado = 'error';
          return;
        }
        estado.base = { resultado: res, reglas: H.clonar(estado.reglas), modo: estado.modo };
        estado.actual = res;
        estado.referencia = null;
        estado.descCambio = '';
        estado.historial = [];
        estado.seleccion = null;
        estado.novedadDia = null;
        estado.avisos = [];
        evaluar();
        diagnosticar();
        renderTodoResultado();
        renderFormDia();
        ['estado-generar-datos', 'estado-cambio', 'estado-intercambio'].forEach((id) => mensaje(id, ''));
        mensaje('estado-generar', otraOpcion ? 'Versión ' + estado.semilla + ' lista. Calidad ' + estado.rep.preferencias.puntaje + '/100.' : '', 'info');
        if (!otraOpcion) irA('horario');
        ok = true;
      } catch (e) {
        mensaje(idMsg, 'Error inesperado al generar: ' + e.message + '. Recarga la página y vuelve a cargar los datos.', 'error');
        document.body.dataset.estado = 'error';
      } finally {
        $('btn-generar').disabled = false;
        $('btn-generar').removeAttribute('aria-busy');
        $('btn-otra').disabled = !estado.actual;
        ocultarCarga();
        cumplir(ok);
      }
    }, 60));
  }

  function modoActual() { return (estado.actual && estado.actual.modoDocente) || estado.modo; }

  function evaluar() {
    const modo = modoActual();
    estado.cert = H.validar(estado.ef, estado.actual.filas, estado.reglas, { modoDocente: modo });
    estado.rep = H.reporte(estado.ef, estado.actual.filas, estado.reglas, estado.referencia, { modoDocente: modo, pendientes: estado.actual.pendientes });
  }

  function renderBitacora() {
    const ul = vaciar($('lista-decisiones'));
    const r = estado.actual, rep = estado.rep, cert = estado.cert;
    if (!r) return;
    const sesiones = (curso, asig) => { const x = estado.ef.carga.find((c) => c.curso === curso && c.asignatura === asig); return x ? x.sesiones : 0; };
    ul.append(el('li', null, modoActual() === 'estricto'
      ? 'Cada clase la da solo su docente asignado.'
      : 'Si un docente supera su máximo de clases, otro docente habilitado en la materia puede darlas.'));
    (r.decisiones || []).forEach((x) => ul.append(el('li', null,
      x.asignatura + ' de ' + x.curso + ' (' + plural(sesiones(x.curso, x.asignatura), 'clase') + ') la da ' + soloNombre(x.a) + ', porque ' + x.motivo + '.')));
    (r.pendientes || []).forEach((p) => ul.append(el('li', null,
      plural(p.sesiones, 'clase') + ' de ' + p.asignatura + ' de ' + p.curso + ' quedan pendientes. ' + p.motivo)));
    if (estado.descCambio) ul.append(el('li', null, 'Último cambio: ' + estado.descCambio + '. ' + plural(rep.cambio ? rep.cambio.resumen.movidas : 0, 'clase movida', 'clases movidas') + '.'));
    if (r.manual) ul.append(el('li', null, 'Incluye intercambios hechos a mano, revisados antes de aceptarse.'));
    ul.append(el('li', null, 'Una verificación independiente revisó cada clase: ' + (cert.ok ? 'todo en orden.' : plural(cert.totalErrores, 'error', 'errores') + '.')));
  }

  // ------------------------------------------------------------------
  // 4. Revisar: vistas, ajuste manual, reporte y certificado
  // ------------------------------------------------------------------
  function renderTodoResultado() {
    actualizarVisibilidad();
    if (!estado.actual) return;
    renderBitacora();
    renderValidez();
    renderOpcionesVista();
    renderLeyenda();
    renderHorario();
    renderReporte();
    renderCertificado();
    renderCambio();
    $('btn-deshacer').disabled = !estado.historial.length;
    $('btn-deshacer-todo').disabled = !estado.historial.length;
    $('version-horario').textContent = 'Versión ' + estado.semilla;
    $('modo-estricto').checked = modoActual() === 'estricto';
    renderEventos();
  }

  function renderValidez() {
    const cert = estado.cert, rep = estado.rep;
    const extra = estado.escenario ? ' Incluye el cambio del archivo.' : '';
    if (cert.ok && cert.completo) mensaje('estado-validez', 'Horario completo y sin cruces.' + extra, 'ok');
    else if (cert.ok) mensaje('estado-validez', ['Horario sin cruces, con ' + plural(rep.pendientes, 'clase pendiente', 'clases pendientes') + '. ', botonPendientes('Ver por qué y cómo resolverlo →'), extra], 'aviso');
    else mensaje('estado-validez', 'El horario tiene ' + plural(cert.totalErrores, 'error', 'errores') + ': revisa la verificación en el reporte completo.' + extra, 'error');
  }

  const botonPendientes = (texto) => el('button', { type: 'button', class: 'enlace', onclick: irAPendientes }, texto);
  function irAPendientes() {
    const s = $('sec-pendientes');
    s.scrollIntoView({ behavior: document.documentElement.dataset.movimiento ? 'auto' : 'smooth', block: 'start' });
    s.focus({ preventScroll: true });
  }

  function renderOpcionesVista() {
    const tipo = estado.vista.tipo;
    $('campo-vista-id').hidden = tipo === 'todos';
    const sel = $('vista-id'), d = estado.ef;
    const opciones = tipo === 'docente' ? d.docentes.map((x) => ({ v: x.id, t: x.nombre }))
      : tipo === 'salon' ? d.salones.map((x) => ({ v: x.id, t: x.nombre }))
        : d.cursos.map((x) => ({ v: x.id, t: 'Curso ' + x.id }));
    const previo = opciones.some((o) => o.v === estado.vista.id) ? estado.vista.id : opciones.length ? opciones[0].v : null;
    vaciar(sel);
    opciones.forEach((o) => sel.append(el('option', { value: o.v, selected: o.v === previo }, o.t)));
    estado.vista.id = previo;
    $('vista-id').previousElementSibling.textContent = tipo === 'docente' ? 'Docente' : tipo === 'salon' ? 'Salón' : 'Curso';
  }

  function renderLeyenda() {
    const ul = vaciar($('leyenda'));
    ordenAsig.forEach((a) => ul.append(el('li', { class: claseMateria(a) }, el('span', { class: 'sigla' }, sigla(a)), a)));
  }

  // En el celular el horario se ve día por día (lista vertical) en vez de la tabla de 5 columnas
  const esMovil = window.matchMedia ? window.matchMedia('(max-width: 40rem)') : { matches: false };
  function renderHorario() {
    const cont = vaciar($('cuadricula'));
    const { tipo, id } = estado.vista;
    if (tipo === 'todos') estado.ef.cursos.forEach((c) => cont.append(envolverTabla(tablaHorario('curso', c.id, false), 'Horario de ' + c.id)));
    else if (id && esMovil.matches) cont.append(vistaDia(tipo, id, tipo === 'curso'));
    else if (id) cont.append(envolverTabla(tablaHorario(tipo, id, tipo === 'curso'), 'Horario'));
    $('ayuda-intercambio').hidden = tipo !== 'curso';
  }
  const envolverTabla = (tabla, etiqueta) => el('div', { class: 'tabla-scroll', role: 'region', tabindex: '0', 'aria-label': etiqueta + ' (desplazable)' }, tabla);

  function diaPorDefecto() {
    const dias = estado.ef.dias;
    if (dias.includes(estado.vista.dia)) return estado.vista.dia;
    const hoy = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][new Date().getDay()];
    return dias.find((x) => x.toLowerCase() === hoy) || dias[0];
  }

  function vistaDia(tipo, id, interactivo) {
    const d = estado.ef, v = datosVista(tipo, id), dia = estado.vista.dia = diaPorDefecto();
    const chips = el('div', { class: 'dias', role: 'group', 'aria-label': 'Día' }, d.dias.map((x) => el('button', {
      type: 'button', class: 'dias__boton', 'aria-pressed': x === dia ? 'true' : 'false',
      onclick: () => { estado.vista.dia = x; renderHorario(); },
    }, x.slice(0, 3))));
    const lista = el('ol', { class: 'dia-lista' });
    d.bloques.forEach((bl, i) => {
      lista.append(el('li', null, el('span', { class: 'dia-lista__hora' }, tiempo(bl.inicio), el('span', { class: 'bloque-id' }, bl.id)),
        contenidoCelda(tipo, id, dia, bl, v.celda[dia + '|' + bl.id], interactivo, v.huecos)));
      const desc = descansoTras(d.bloques, i);
      if (desc) lista.append(el('li', { class: 'dia-lista__descanso' }, tiempo(desc.inicio) , '–', tiempo(desc.fin), ' · Descanso ' + desc.minutos + ' min'));
    });
    return el('section', { class: 'vista-dia', 'aria-label': v.titulo + ', ' + dia },
      el('p', { class: 'vista-dia__titulo' }, el('strong', null, v.titulo), el('span', { class: 'caption__detalle' }, v.detalle)), chips, lista);
  }

  function datosVista(tipo, id) {
    const d = estado.ef, rep = estado.rep;
    const campoVista = tipo === 'curso' ? 'curso' : tipo === 'docente' ? 'docente' : 'salon';
    const clases = estado.actual.filas.filter((f) => f.asignatura && f[campoVista] === id);
    const celda = {};
    clases.forEach((f) => { celda[f.dia + '|' + f.bloque] = f; });

    let titulo, detalle;
    if (tipo === 'curso') {
      const c = d.cursos.find((x) => x.id === id);
      const pend = rep.detallePendientes.filter((p) => p.curso === id);
      titulo = 'Curso ' + id;
      detalle = plural(clases.length, 'clase') + ' · ' + (c ? c.estudiantes + ' estudiantes' : '') + (pend.length ? ' · Pendientes: ' + pend.map((p) => p.asignatura + ' (' + p.faltantes + ')').join(', ') : '');
    } else if (tipo === 'docente') {
      const doc = d.docentes.find((x) => x.id === id);
      titulo = soloNombre(id);
      detalle = plural(clases.length, 'clase') + (doc && doc.max < 1e9 ? ' de ' + doc.max + ' máximo' : '') + ' · ' + plural(rep.preferencias.huecosDocentes.porDocente[id] || 0, 'hueco', 'huecos');
    } else {
      const s = d.salones.find((x) => x.id === id);
      titulo = s ? s.nombre : 'Salón ' + id;
      detalle = (s ? s.tipo + ' · capacidad ' + (s.capacidad >= 1e9 ? 'sin límite' : s.capacidad) + ' · ' : '') + plural(clases.length, 'clase');
    }

    // Huecos del docente por día
    const huecos = {};
    if (tipo === 'docente') d.dias.forEach((dia) => {
      const oc = clases.filter((f) => f.dia === dia).map((f) => idxBloque(f.bloque)).sort((a, b) => a - b);
      if (oc.length > 1) for (let b = oc[0] + 1; b < oc[oc.length - 1]; b++) if (!oc.includes(b)) huecos[dia + '|' + d.bloques[b].id] = true;
    });
    return { titulo, detalle, celda, huecos };
  }

  function tablaHorario(tipo, id, interactivo) {
    const d = estado.ef;
    const { titulo, detalle, celda, huecos } = datosVista(tipo, id);
    const filasTabla = [];
    d.bloques.forEach((bl, i) => {
      filasTabla.push(el('tr', null,
        el('th', { scope: 'row' }, tiempo(bl.inicio), '–', tiempo(bl.fin), el('span', { class: 'bloque-id' }, bl.id)),
        d.dias.map((dia) => el('td', null, contenidoCelda(tipo, id, dia, bl, celda[dia + '|' + bl.id], interactivo, huecos)))));
      const desc = descansoTras(d.bloques, i);
      if (desc) filasTabla.push(el('tr', { class: 'fila-descanso' },
        el('th', { scope: 'row' }, tiempo(desc.inicio), '–', tiempo(desc.fin)),
        el('td', { colspan: String(d.dias.length) }, 'Descanso · ' + desc.minutos + ' min')));
    });
    return el('table', { class: 'horario' },
      el('caption', null, titulo, el('span', { class: 'caption__detalle' }, detalle)),
      el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Hora'), d.dias.map((dia) => el('th', { scope: 'col' }, dia)))),
      el('tbody', null, filasTabla));
  }

  function contenidoCelda(tipo, id, dia, bl, f, interactivo, huecos) {
    const lugar = oculto(dia + ' ' + bl.id + ': ');
    const sel = interactivo && estado.seleccion && estado.seleccion.curso === id ? estado.seleccion : null;
    const seleccionada = !!sel && sel.dia === dia && sel.bloque === bl.id;
    const opcion = !!sel && !seleccionada && sel.opciones.has(dia + '|' + bl.id);
    let clases = 'celda' + (opcion ? ' celda--opcion' : sel && !seleccionada ? ' celda--atenuada' : ''), partes;
    if (f) {
      clases += ' ' + claseMateria(f.asignatura) + (f.cambio ? ' celda--movida' : '');
      partes = [lugar,
        el('span', { class: 'celda__linea' }, el('span', { class: 'sigla', 'aria-hidden': 'true' }, sigla(f.asignatura)), ' ', el('span', { class: 'celda__asig' }, f.asignatura)),
        tipo !== 'docente' ? el('span', { class: 'celda__linea' }, f.docenteNombre) : null,
        tipo !== 'curso' ? el('span', { class: 'celda__linea' }, 'Curso ' + f.curso) : null,
        tipo !== 'salon' ? el('span', { class: 'celda__linea' }, f.salonNombre || 'Sin salón') : null,
        f.cambio ? el('span', { class: 'marca-celda marca-celda--movida' }, '↻ Movida') : null];
    } else if (tipo === 'docente' && !docenteDisponible(id, dia, bl.id)) {
      clases += ' celda--nodisp';
      partes = [lugar, el('span', { class: 'marca-celda' }, '✕ No disponible')];
    } else if (tipo === 'docente' && huecos[dia + '|' + bl.id]) {
      clases += ' celda--hueco';
      partes = [lugar, el('span', { class: 'celda__asig' }, '◌ Hueco'), el('span', { class: 'celda__linea' }, 'Hora libre entre clases')];
    } else {
      clases += ' celda--libre';
      partes = [lugar, el('span', null, 'Libre')];
    }
    // Eventos de esa hora: del curso de la celda, o de todos los cursos
    const evs = eventosEn(dia, bl.id, tipo === 'curso' ? id : f ? f.curso : null);
    if (evs.length && !f && evs.some((e) => e.reservar)) { clases = clases.replace('celda--libre', 'celda--evento'); partes = [lugar]; }
    evs.slice(0, 2).forEach((e) => partes.push(el('span', { class: 'evento-tag', style: '--ev:' + e.color, title: e.nota || e.titulo }, '★ ' + e.titulo)));
    if (estado.recientes && estado.recientes.has(dia + '|' + bl.id) && f) clases += ' celda--reciente';
    if (!interactivo) return el('span', { class: clases }, partes);
    if (opcion) partes.push(el('span', { class: 'marca-celda marca-celda--opcion' }, '⇄ Intercambiar'));
    return el('button', { type: 'button', class: clases, 'aria-pressed': seleccionada ? 'true' : 'false', dataset: { dia, bloque: bl.id }, onclick: () => tocarCelda(id, dia, bl.id) }, partes);
  }

  function describirCelda(curso, dia, bloque) {
    const f = estado.actual.filas.find((x) => x.curso === curso && x.dia === dia && x.bloque === bloque);
    return dia + ' ' + bloque + ' (' + (f && f.asignatura ? f.asignatura : 'libre') + ')';
  }

  function enfocarCelda(dia, bloque) {
    const b = document.querySelector('#cuadricula button[data-dia="' + dia + '"][data-bloque="' + bloque + '"]');
    if (b) b.focus();
  }

  function tocarCelda(curso, dia, bloque) {
    const sel = estado.seleccion;
    if (!sel) {
      const opciones = opcionesIntercambio({ curso, dia, bloque });
      estado.seleccion = { curso, dia, bloque, opciones };
      mensaje('estado-intercambio', 'Elegiste ' + describirCelda(curso, dia, bloque) + '. ' + (opciones.size
        ? 'Puedes cambiarla por ' + plural(opciones.size, 'opción', 'opciones') + ' marcadas en verde. Toca la misma clase para cancelar.'
        : 'No hay ninguna clase de ' + curso + ' con la que se pueda intercambiar sin romper una regla. Tócala otra vez para cancelar.'), opciones.size ? 'info' : 'aviso');
      renderHorario(); enfocarCelda(dia, bloque);
      return;
    }
    if (sel.dia === dia && sel.bloque === bloque) {
      estado.seleccion = null;
      mensaje('estado-intercambio', 'Selección cancelada.', 'info');
      renderHorario(); enfocarCelda(dia, bloque);
      return;
    }
    intercambiar(sel, { curso, dia, bloque });
    enfocarCelda(dia, bloque);
  }

  function reubicarSalon(f, filas) {
    const d = estado.ef;
    const ocupado = (sid) => filas.some((x) => x !== f && x.asignatura && x.salon === sid && x.dia === f.dia && x.bloque === f.bloque);
    if (f.salon && !ocupado(f.salon)) return;
    const req = (d.carga.find((x) => x.curso === f.curso && x.asignatura === f.asignatura) || {}).tipoSalon || f.tipoSalon;
    const cu = d.cursos.find((x) => x.id === f.curso) || { estudiantes: 0 };
    const s = d.salones.find((x) => x.tipo === req && (x.capacidad == null || x.capacidad >= cu.estudiantes) && !ocupado(x.id));
    if (s) { f.salon = s.id; f.salonNombre = s.nombre; }
  }

  // Arma (sin aplicarlo) el horario con dos clases del mismo curso intercambiadas y lo pasa por el validador.
  function probarIntercambio(a, b) {
    const filas = estado.actual.filas.map((f) => Object.assign({}, f));
    const fa = filas.find((f) => f.curso === a.curso && f.dia === a.dia && f.bloque === a.bloque);
    const fb = filas.find((f) => f.curso === b.curso && f.dia === b.dia && f.bloque === b.bloque);
    if (!fa || !fb) return null;
    ['asignatura', 'docente', 'docenteNombre', 'salon', 'salonNombre', 'tipoSalon'].forEach((k) => { const t = fa[k]; fa[k] = fb[k]; fb[k] = t; });
    [fa, fb].forEach((f) => { if (f.asignatura) { reubicarSalon(f, filas); f.cambio = true; } });
    return { filas, cert: H.validar(estado.ef, filas, estado.reglas, { modoDocente: modoActual() }) };
  }

  // Celdas del mismo curso con las que el intercambio pasa el validador (claves «día|bloque»).
  function opcionesIntercambio(a) {
    const filas = estado.actual.filas, origen = filas.find((f) => f.curso === a.curso && f.dia === a.dia && f.bloque === a.bloque);
    const ok = new Set();
    if (!origen) return ok;
    filas.forEach((f) => {
      if (f.curso !== a.curso || f === origen) return;
      if (f.asignatura === origen.asignatura && f.docente === origen.docente) return; // misma clase: no cambia nada
      const p = probarIntercambio(a, f);
      if (p && p.cert.ok) ok.add(f.dia + '|' + f.bloque);
    });
    return ok;
  }

  function intercambiar(a, b) {
    estado.seleccion = null;
    const p = probarIntercambio(a, b);
    if (!p) { renderHorario(); return; }
    const desc = describirCelda(a.curso, a.dia, a.bloque) + ' ↔ ' + describirCelda(b.curso, b.dia, b.bloque);
    const filas = p.filas, cert = p.cert;
    if (!cert.ok) {
      const errores = cert.verificaciones.filter((v) => !v.ok).reduce((acc, v) => acc.concat(v.errores), []);
      mensaje('estado-intercambio', ['No se puede intercambiar ' + desc + ': ', errores.slice(0, 3).join(' '), errores.length > 3 ? ' (y ' + (errores.length - 3) + ' más).' : ''], 'error');
      renderHorario();
      return;
    }
    estado.historial.push(estado.actual);
    estado.actual = Object.assign({}, estado.actual, { filas, manual: true });
    estado.recientes = new Set([a.dia + '|' + a.bloque, b.dia + '|' + b.bloque]); // destello en las dos celdas
    setTimeout(() => { estado.recientes = null; }, 1500);
    evaluar();
    renderTodoResultado();
    mensaje('estado-intercambio', 'Listo: ' + desc + '. El horario sigue sin cruces.', 'ok');
  }

  function deshacer() {
    if (!estado.historial.length) return;
    estado.actual = estado.historial.pop();
    estado.seleccion = null;
    evaluar();
    renderTodoResultado();
    mensaje('estado-intercambio', 'Se deshizo el último intercambio.', 'info');
  }

  function deshacerTodo() {
    if (!estado.historial.length) return;
    const n = estado.historial.length;
    estado.actual = estado.historial[0];
    estado.historial = [];
    estado.seleccion = null;
    evaluar();
    renderTodoResultado();
    mensaje('estado-intercambio', 'Se deshicieron ' + plural(n, 'intercambio') + ': el horario volvió a como estaba antes de moverlo a mano.', 'info');
  }

  function conteo(texto, n, buenoSiCero) {
    const nivel = n === 0 ? (buenoSiCero === false ? 'info' : 'ok') : 'error';
    return el('li', null, el('span', null, texto), el('span', { class: 'conteos__n' }, el('span', { 'aria-hidden': 'true' }, ICONO[nivel] + ' '), String(n)));
  }

  function detalleLista(titulo, lineas) {
    if (!lineas.length) return null;
    return el('details', null, el('summary', null, titulo), el('ul', { class: 'detalle-lista' }, lineas.slice(0, 60).map((t) => el('li', null, t))));
  }

  function renderReporte() {
    const rep = estado.rep;
    const num = (clave, valor) => el('span', { dataset: { metrica: clave } }, String(valor));
    const kpi = (etiqueta, valor, detalle, nivel) => el('li', { class: 'kpi' + (nivel ? ' estado--' + nivel : '') },
      el('span', { class: 'kpi__etiqueta' }, nivel ? el('span', { 'aria-hidden': 'true' }, ICONO[nivel] + ' ') : null, etiqueta),
      el('span', { class: 'kpi__valor' }, valor),
      el('span', { class: 'kpi__detalle' }, detalle));
    vaciar($('metricas')).append(
      kpi('Clases programadas', num('cobertura', decimal(rep.cobertura) + ' %'), [num('validas', rep.validas), ' de ', num('requeridas', rep.requeridas), ' clases'], rep.cobertura >= 100 ? 'ok' : 'aviso'),
      kpi('Cruces', num('colisiones', rep.colisiones.total), plural(rep.infracciones.total, 'regla incumplida', 'reglas incumplidas'), rep.colisiones.total || rep.infracciones.total ? 'error' : 'ok'),
      kpi('Pendientes', num('pendientes', rep.pendientes), rep.pendientes ? botonPendientes('Ver el motivo') : 'Todo quedó programado', rep.pendientes ? 'aviso' : 'ok'),
      kpi('Calidad', num('calidad', rep.preferencias.puntaje + '/100'), 'Menos huecos y materias repartidas'));

    const linea = (t, v) => el('li', null, el('span', null, t), el('span', { class: 'conteos__n' }, v));
    vaciar($('metricas-detalle')).append(
      linea('Clases requeridas', String(rep.requeridas)),
      linea('Clases asignadas', num('asignadas', rep.asignadas)),
      linea('Clases válidas', String(rep.validas)),
      linea('Clases pendientes', String(rep.pendientes)),
      linea('Cobertura (válidas ÷ requeridas)', decimal(rep.cobertura) + ' %'),
      linea('Reglas incumplidas', num('infracciones', rep.infracciones.total)));

    const col = vaciar($('colisiones'));
    col.append(conteo('Mismo curso a la misma hora', rep.colisiones.porCurso.length), conteo('Mismo docente a la misma hora', rep.colisiones.porDocente.length), conteo('Mismo salón a la misma hora', rep.colisiones.porSalon.length));
    const detCol = detalleLista('Ver los cruces', [].concat(
      rep.colisiones.porCurso.map((x) => 'Curso ' + x.recurso + ' · ' + x.dia + ' ' + x.bloque + ': ' + x.a + ' / ' + x.b),
      rep.colisiones.porDocente.map((x) => x.recurso + ' · ' + x.dia + ' ' + x.bloque + ': ' + x.a + ' / ' + x.b),
      rep.colisiones.porSalon.map((x) => x.recurso + ' · ' + x.dia + ' ' + x.bloque + ': ' + x.a + ' / ' + x.b)));
    if (detCol) col.append(el('li', null, detCol));

    const inf = rep.infracciones, ul = vaciar($('infracciones'));
    [['Horas en que el docente no puede', inf.disponibilidad], ['Docente distinto al asignado', inf.docenteNoAsignado], ['Docente sin esa materia habilitada', inf.docenteNoHabilitado],
      ['Salón del tipo o tamaño equivocado', inf.salonTipoCapacidad], ['Máximo de clases del docente', inf.maxSemanalDocente], ['Más clases de las pedidas', inf.intensidadExcedida],
      ['Tus cambios', inf.reglasCoordinador]].forEach(([t, l]) => ul.append(conteo(t, l.length)));
    const detInf = detalleLista('Ver las reglas incumplidas', Object.keys(inf).filter((k) => k !== 'total').reduce((a, k) => a.concat(inf[k]), []));
    if (detInf) ul.append(el('li', null, detInf));

    const pend = vaciar($('pendientes'));
    $('sec-pendientes').hidden = !rep.detallePendientes.length;
    if (rep.detallePendientes.length) {
      pend.append(el('table', null,
        el('caption', { class: 'visually-hidden' }, 'Clases pendientes con motivo y solución'),
        el('thead', null, el('tr', null, ['Curso', 'Materia', 'Docente', 'Faltan', 'Motivo y solución'].map((t) => el('th', { scope: 'col' }, t)))),
        el('tbody', null, rep.detallePendientes.map((p) => el('tr', null,
          el('th', { scope: 'row' }, p.curso), el('td', null, p.asignatura), el('td', null, p.docenteNombre || p.docente), el('td', null, String(p.faltantes)),
          el('td', null, p.motivo, el('br'), el('strong', null, 'Solución: '), p.sugerencia))))));
    }

    const pref = rep.preferencias, ulp = vaciar($('preferencias'));
    ulp.append(linea('Calidad general', pref.puntaje + '/100'),
      linea('Materias repartidas en días distintos', pref.repartidas.cumplen + ' de ' + pref.repartidas.total),
      linea('Misma materia repetida el mismo día', String(pref.mismoDia.total)),
      linea('Clases seguidas de la misma materia', num('consecutivas', pref.consecutivas.total)),
      linea('Huecos de docentes (horas libres entre clases)', num('huecos', pref.huecosDocentes.total)));
    if (estado.reglas.some((r) => r.tipo === 'evitar')) ulp.append(linea('Preferencias tuyas no cumplidas', String(pref.evitar.total)));
    const hu = vaciar($('lista-huecos'));
    if (!pref.huecosDocentes.detalle.length) hu.append(el('li', null, 'Ningún docente tiene huecos.'));
    pref.huecosDocentes.detalle.forEach((x) => hu.append(el('li', null, x.nombre + ' · ' + x.dia + ': ' + x.bloques.join(', '))));
    const co = vaciar($('lista-consecutivas'));
    if (!pref.consecutivas.detalle.length) co.append(el('li', null, 'No hay clases seguidas de la misma materia.'));
    pref.consecutivas.detalle.forEach((x) => co.append(el('li', null, x.curso + ' · ' + x.asignatura + ' · ' + x.dia + ' ' + x.bloques)));
  }

  function renderCertificado() {
    const cert = estado.cert, ul = vaciar($('certificado'));
    cert.verificaciones.forEach((v) => ul.append(el('li', { class: 'estado--' + (v.ok ? 'ok' : 'error') },
      el('span', { class: 'semaforo__icono', 'aria-hidden': 'true' }, v.ok ? '✔' : '✘'),
      el('span', null, oculto(v.ok ? 'Cumple: ' : 'No cumple: '), el('span', { class: 'semaforo__titulo' }, v.nombre)),
      el('span', { class: 'semaforo__detalle' }, v.ok ? 'Sin errores.' : plural(v.errores.length, 'error', 'errores') + ': ' + v.errores.slice(0, 4).join(' ') + (v.errores.length > 4 ? ' …' : '')))));
    ul.append(el('li', { class: 'estado--' + (cert.completo ? 'ok' : 'aviso') },
      el('span', { class: 'semaforo__icono', 'aria-hidden': 'true' }, cert.completo ? '✔' : '!'),
      el('span', null, oculto(cert.completo ? 'Completo: ' : 'Parcial: '), el('span', { class: 'semaforo__titulo' }, 'Clases pendientes')),
      el('span', { class: 'semaforo__detalle' }, cert.completo ? 'Ninguna.' : cert.faltantes.map((x) => x.curso + ' · ' + x.asignatura + ': faltan ' + x.faltan).join('; ') + '.')));
  }

  // ------------------------------------------------------------------
  // 5. Prueba de cambio y novedades con IA
  // ------------------------------------------------------------------
  function textoEscenario() {
    const c = estado.datos.cambios || [];
    if (!c.length) return null;
    const doc = c[0].docente, dias = Array.from(new Set(c.filter((x) => x.docente === doc).map((x) => x.dia.toLowerCase())));
    return { doc, corto: soloNombre(doc) + ' no estará disponible el ' + dias.join(' y '), motivo: c[0].motivo };
  }

  function renderCambio() {
    const esc = textoEscenario();
    const btn = $('btn-cambio');
    $('sec-cambio').hidden = !esc;
    if (esc) {
      $('desc-escenario').textContent = esc.corto.charAt(0).toUpperCase() + esc.corto.slice(1) + (esc.motivo ? ' (' + esc.motivo + ')' : '') + '. Al aplicarlo, SlotNova mueve solo las clases necesarias.';
      btn.textContent = estado.escenario ? '✔ Cambio aplicado' : 'Aplicar cambio';
      btn.disabled = !estado.actual || estado.escenario;
    }
    const base = estado.base;
    $('btn-restaurar').disabled = !base || (estado.actual === base.resultado && !estado.escenario);
    renderPanelCambio();
  }

  function renderPanelCambio() {
    const rep = estado.rep, c = rep && rep.cambio;
    $('panel-cambio').hidden = !c;
    if (!c) { vaciar($('resumen-cambio')); return; }
    $('t-antes-despues').textContent = 'Qué cambió' + (estado.descCambio ? ': ' + estado.descCambio : '');
    const met = vaciar($('resumen-cambio'));
    const m = (etq, clave, v, nivel) => met.append(el('li', { class: 'kpi' + (nivel ? ' estado--' + nivel : '') },
      el('span', { class: 'kpi__etiqueta' }, nivel ? el('span', { 'aria-hidden': 'true' }, ICONO[nivel] + ' ') : null, etq),
      el('span', { class: 'kpi__valor' }, clave ? el('span', { dataset: { metrica: clave } }, String(v)) : String(v))));
    m('Clases afectadas', 'afectadas', c.resumen.afectadas);
    m('Clases movidas', 'movidas', c.resumen.movidas);
    m('Pendientes', null, rep.pendientes, rep.pendientes ? 'aviso' : 'ok');
    m('Cruces', null, rep.colisiones.total, rep.colisiones.total ? 'error' : 'ok');
    const af = vaciar($('lista-afectadas'));
    if (!c.afectadas.length) af.append(el('li', null, 'Ninguna clase quedó en una hora no disponible.'));
    c.afectadas.forEach((x) => af.append(el('li', null, x.curso + ' · ' + x.asignatura + ' · ' + x.dia + ' ' + x.inicio + '–' + x.fin + ' · ' + (x.docenteNombre || x.docente))));
    const cont = vaciar($('tabla-movidas'));
    if (!c.movidas.length && !c.reasignadas.length) { cont.append(el('p', null, 'No se movió ninguna clase.')); return; }
    cont.append(el('table', { class: 'antes-despues' },
      el('caption', { class: 'visually-hidden' }, 'Clases movidas: antes y ahora'),
      el('thead', null, el('tr', null, ['Curso', 'Materia', 'Docente', 'Antes', 'Ahora'].map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', null,
        c.movidas.map((x) => el('tr', null, el('th', { scope: 'row' }, x.curso), el('td', null, x.asignatura), el('td', null, x.docenteNombre || x.docente),
          el('td', null, x.antes.dia + ' ' + x.antes.inicio), el('td', null, '→ ' + x.ahora.dia + ' ' + x.ahora.inicio))),
        c.reasignadas.map((x) => el('tr', null, el('th', { scope: 'row' }, x.curso), el('td', null, x.asignatura), el('td', null, soloNombre(x.de) + ' → ' + soloNombre(x.a)),
          el('td', null, x.dia + ' ' + x.bloque), el('td', null, 'misma hora, otro docente'))))));
  }

  function reprogramarCon(desc) {
    const anterior = estado.actual;
    const res = H.motor.reprogramar(estado.ef, anterior, { semilla: estado.semilla, reglas: estado.reglas, modoDocente: modoActual() });
    if (!res.filas.length) return { ok: false, error: [res.error, (res.motivos || []).join(' ')].join(' ') };
    estado.referencia = anterior;
    estado.actual = res;
    estado.historial = [];
    estado.seleccion = null;
    estado.descCambio = desc;
    evaluar();
    renderTodoResultado();
    return { ok: true, ms: res.estadisticas.ms };
  }

  function aplicarHojaCambio() {
    if (!estado.actual || estado.escenario) return;
    const esc = textoEscenario();
    estado.escenario = true;
    refrescarEf();
    const r = reprogramarCon(esc ? esc.corto : 'cambio del archivo');
    if (!r.ok) {
      estado.escenario = false; refrescarEf();
      mensaje('estado-cambio', 'No se pudo aplicar el cambio: ' + r.error, 'error');
      return;
    }
    diagnosticar();
    const c = estado.rep.cambio;
    mensaje('estado-cambio', ['Cambio aplicado: ', el('strong', null, plural(c.resumen.afectadas, 'clase afectada', 'clases afectadas') + ', ' + plural(c.resumen.movidas, 'movida') + ', ' + plural(estado.rep.pendientes, 'pendiente')),
      estado.cert.ok ? '. Sigue sin cruces.' : '. Revisa la verificación en el reporte completo.'], estado.cert.ok && !estado.rep.pendientes ? 'ok' : 'aviso');
  }

  function restaurarBase() {
    if (!estado.base) return;
    estado.escenario = false;
    refrescarEf();
    estado.reglas = H.clonar(estado.base.reglas);
    estado.actual = estado.base.resultado;
    estado.referencia = null;
    estado.descCambio = '';
    estado.historial = [];
    estado.seleccion = null;
    evaluar();
    diagnosticar();
    renderReglas();
    renderTodoResultado();
    mensaje('estado-cambio', 'Volviste al horario original, sin los cambios agregados después.', 'info');
    // Los eventos con hora reservada siguen vigentes: si el original no los tenía, se reprograma con ellos
    const deEventos = reglasDeEventos(), clave = (r) => JSON.stringify([r.curso, r.dias, r.bloques, r.eventoId]);
    const enBase = new Set(estado.reglas.filter((r) => r.eventoId).map(clave));
    if (deEventos.length !== enBase.size || deEventos.some((r) => !enBase.has(clave(r)))) {
      estado.reglas = estado.reglas.filter((r) => !r.eventoId).concat(deEventos);
      aplicarReglas('Eventos con hora reservada.');
    }
  }

  // ------------------------------------------------------------------
  // IA: Claude o Gemini con la clave de cada usuario; se puede activar y desactivar
  // ------------------------------------------------------------------
  const CLAVE_IA = 'slotnova.ia';
  function iaLista() { return !!(estado.ia.activa && estado.ia.clave && navigator.onLine); }
  function estadoIA(forzado) {
    if (forzado) estado.ia.estado = forzado;
    else estado.ia.estado = iaLista() ? 'ia' : !estado.ia.clave ? 'local' : !estado.ia.activa ? 'apagada' : 'sin-red';
    const prov = (H.ia && H.ia.PROVEEDORES[estado.ia.proveedor]) || { nombre: 'IA' };
    const texto = {
      ia: 'IA conectada · ' + prov.nombre, error: 'La IA no respondió: modo local',
      apagada: 'IA apagada · modo local', 'sin-red': 'Sin internet: modo local', local: 'Modo local (sin IA)',
    }[estado.ia.estado];
    ['estado-ia', 'asistente-estado'].forEach((id) => {
      const n = vaciar($(id));
      n.className = 'estado-ia estado-ia--' + (estado.ia.estado === 'ia' ? 'ia' : estado.ia.estado === 'error' ? 'error' : 'local');
      n.append(el('span', { 'aria-hidden': 'true' }, estado.ia.estado === 'error' ? '!' : '●'), ' ' + texto);
    });
    $('ia-activa').checked = !!(estado.ia.activa && estado.ia.clave);
    document.dispatchEvent(new CustomEvent('slotnova:ia'));
  }

  function guardarConfigIA() {
    try {
      if (estado.ia.recordar && estado.ia.clave) escribirAlmacen(CLAVE_IA, { proveedor: estado.ia.proveedor, modelo: estado.ia.modelo, clave: estado.ia.clave, activa: estado.ia.activa });
      else localStorage.removeItem(CLAVE_IA);
    } catch (e) { /* sin almacenamiento: dura esta visita */ }
  }

  function pintarConfigIA() {
    const r = document.querySelector('input[name="ia-proveedor"][value="' + estado.ia.proveedor + '"]');
    if (r) r.checked = true;
    $('ia-clave').value = estado.ia.clave;
    $('ia-modelo').value = estado.ia.modelo;
    $('ia-recordar').checked = estado.ia.recordar;
    pintarProveedorIA();
    mensaje('estado-config-ia', '');
  }
  function proveedorElegido() { const r = document.querySelector('input[name="ia-proveedor"]:checked'); return r ? r.value : 'anthropic'; }
  function pintarProveedorIA(modelos) {
    const p = H.ia.PROVEEDORES[proveedorElegido()];
    const dl = vaciar($('ia-modelos'));
    (modelos || p.modelos).forEach((m) => dl.append(el('option', { value: m })));
    $('ia-ayuda-clave').textContent = proveedorElegido() === 'gemini' ? 'Créala gratis en aistudio.google.com → Get API key.' : 'Créala en console.anthropic.com → API keys.';
    const actual = $('ia-modelo').value.trim();
    const otro = H.ia.PROVEEDORES[proveedorElegido() === 'gemini' ? 'anthropic' : 'gemini'];
    if (!actual || otro.modelos.includes(actual) || (proveedorElegido() === 'gemini') !== /gemini/i.test(actual)) $('ia-modelo').value = p.modelo;
  }
  const leerConfigIA = () => ({ proveedor: proveedorElegido(), clave: $('ia-clave').value.trim(), modelo: $('ia-modelo').value.trim() || H.ia.PROVEEDORES[proveedorElegido()].modelo });

  async function probarIA() {
    const cfg = leerConfigIA();
    if (!cfg.clave) { mensaje('estado-config-ia', 'Pega primero la clave de la API.', 'aviso'); $('ia-clave').focus(); return; }
    mensaje('estado-config-ia', 'Probando la conexión…', 'info');
    try {
      const modelos = await H.ia.listarModelos(cfg);
      pintarProveedorIA(modelos.length ? modelos : null);
      const existe = !modelos.length || modelos.includes(cfg.modelo);
      mensaje('estado-config-ia', 'Conexión correcta: la cuenta tiene ' + plural(modelos.length, 'modelo disponible', 'modelos disponibles') + '.' +
        (existe ? '' : ' El modelo «' + cfg.modelo + '» no está en la lista: elige uno de la lista del campo Modelo.'), existe ? 'ok' : 'aviso');
    } catch (e) {
      mensaje('estado-config-ia', e.message, 'error');
    }
  }

  async function interpretar() {
    const texto = $('texto-novedad').value.trim();
    if (!texto) { mensaje('estado-novedad', 'Escribe el cambio o toca uno de los ejemplos.', 'aviso'); $('texto-novedad').focus(); return; }
    if (!estado.ef) { mensaje('estado-novedad', 'Primero carga tus datos en la pestaña Datos.', 'aviso'); return; }
    const btn = $('btn-interpretar');
    btn.disabled = true;
    let r, origen = 'local', nota = '';
    try {
      if (iaLista()) {
        mensaje('estado-novedad', 'Consultando a la IA…', 'info');
        try {
          r = await H.reglas.interpretarConIA(texto, estado.ef, estado.ia);
          origen = 'ia';
          estadoIA('ia');
        } catch (e) {
          nota = 'La IA no respondió (' + String(e.message).slice(0, 140) + '), así que lo revisé en modo local. ';
          estadoIA('error');
        }
      }
      if (!r) r = H.reglas.interpretarLocal(texto, estado.ef);
      estado.propuesta = { reglas: r.reglas, dudas: r.dudas || [], respuesta: r.respuesta || '', origen, texto };
      renderPropuesta();
      const quien = origen === 'ia' && r.respuesta ? 'IA: «' + r.respuesta + '». ' : '';
      if (r.reglas.length) mensaje('estado-novedad', quien + nota + 'Revisa lo que entendí y aplícalo.', 'info');
      else mensaje('estado-novedad', quien + nota + 'No logré entenderlo. Prueba con otras palabras o con uno de los ejemplos.', 'aviso');
    } finally {
      btn.disabled = false;
    }
  }

  const TIPO_REGLA = { bloquear_docente: 'Docente no disponible', prohibir: 'Obligatorio', evitar: 'Preferencia', max_por_dia: 'Límite diario' };
  function etiquetaTipo(r) {
    return el('span', { class: 'etiqueta-tipo' }, TIPO_REGLA[r.tipo] || r.tipo);
  }

  function renderPropuesta() {
    const p = estado.propuesta;
    $('propuesta').hidden = !p;
    if (!p) return;
    const ul = vaciar($('lista-propuesta'));
    p.reglas.forEach((r) => ul.append(el('li', null, el('span', null, etiquetaTipo(r), H.reglas.describir(r, estado.ef)))));
    const du = vaciar($('lista-dudas'));
    p.dudas.forEach((d) => du.append(itemEstado('aviso', d, 'Duda')));
    $('btn-confirmar').disabled = !p.reglas.length;
  }

  function confirmarPropuesta() {
    const p = estado.propuesta;
    if (!p || !p.reglas.length) return;
    estado.reglas = estado.reglas.concat(p.reglas);
    estado.propuesta = null;
    renderPropuesta();
    aplicarReglas('Cambio agregado: ' + p.reglas.map((r) => H.reglas.describir(r, estado.ef)).join(' '));
    $('texto-novedad').value = '';
  }

  function quitarRegla(i) {
    const r = estado.reglas[i];
    estado.reglas.splice(i, 1);
    aplicarReglas('Cambio quitado: ' + H.reglas.describir(r, estado.ef));
  }

  // Reprograma con las reglas actuales y devuelve el resultado (también lo usa el asistente)
  function aplicarReglas(desc) {
    renderReglas();
    diagnosticar();
    if (!estado.actual) {
      mensaje('estado-novedad', desc + ' Se tendrá en cuenta al generar el horario.', 'ok');
      renderEventos();
      return { ok: true, reprogramado: false };
    }
    const r = reprogramarCon(desc.replace(/\.$/, ''));
    if (!r.ok) { mensaje('estado-novedad', 'No se pudo reacomodar el horario: ' + r.error, 'error'); return { ok: false, error: r.error }; }
    const rep = estado.rep;
    mensaje('estado-novedad', [desc + ' ', el('strong', null, 'Horario actualizado: ' + plural(rep.cambio.resumen.movidas, 'clase movida', 'clases movidas') + ', ' + plural(rep.pendientes, 'pendiente') + '.'),
      estado.cert.ok ? ' Sigue sin cruces. ' : ' Revisa la verificación en el reporte completo. ', el('a', { href: '#horario' }, 'Ver horario')], estado.cert.ok && !rep.pendientes ? 'ok' : 'aviso');
    return { ok: true, reprogramado: true, movidas: rep.cambio.resumen.movidas, pendientes: rep.pendientes, sinCruces: estado.cert.ok };
  }

  function renderReglas() {
    const ul = vaciar($('reglas-activas'));
    // Las reglas que crean los eventos se manejan desde el evento, no desde esta lista
    $('reglas-vacio').hidden = estado.reglas.some((r) => !r.eventoId);
    estado.reglas.forEach((r, i) => {
      if (r.eventoId) return;
      const texto = H.reglas.describir(r, estado.ef || estado.datos);
      ul.append(el('li', null, el('span', null, etiquetaTipo(r), texto),
        el('button', { type: 'button', class: 'boton boton--pequeno boton--peligro', 'aria-label': 'Quitar el cambio: ' + texto, onclick: () => quitarRegla(i) }, 'Quitar')));
    });
  }

  // ------------------------------------------------------------------
  // 6. Novedad del día y avisos
  // ------------------------------------------------------------------
  function renderFormDia() {
    if (!estado.ef) return;
    const d = estado.ef;
    const selDoc = $('dia-docente'), selDia = $('dia-dia');
    const vDoc = selDoc.value, vDia = selDia.value;
    vaciar(selDoc); d.docentes.forEach((x) => selDoc.append(el('option', { value: x.id, selected: x.id === vDoc }, x.nombre)));
    vaciar(selDia); d.dias.forEach((x) => selDia.append(el('option', { value: x, selected: x === vDia }, x)));
    $('btn-dia-cambio').hidden = !((estado.datos && estado.datos.cambios) || []).length;
    const fs = $('dia-bloques');
    const marcados = new Set(Array.from(fs.querySelectorAll('input:checked')).map((i) => i.value));
    const habia = fs.querySelectorAll('input').length > 0;
    Array.from(fs.querySelectorAll('.opcion')).forEach((n) => n.remove());
    d.bloques.forEach((b) => {
      const id = 'dia-b-' + b.id;
      fs.append(el('p', { class: 'opcion' }, el('input', { type: 'checkbox', id, name: 'dia-bloque', value: b.id, checked: !habia || marcados.has(b.id) }),
        el('label', { for: id }, b.inicio + '–' + b.fin)));
    });
  }

  function proponerCobertura() {
    if (!estado.actual) return;
    const d = estado.ef, docId = $('dia-docente').value, dia = $('dia-dia').value;
    const bloques = Array.from(document.querySelectorAll('#dia-bloques input:checked')).map((i) => i.value);
    if (!bloques.length) { mensaje('estado-dia', 'Marca al menos una hora.', 'aviso'); return; }
    const filas = estado.actual.filas.filter((f) => f.asignatura);
    const afectadas = filas.filter((f) => f.docente === docId && f.dia === dia && bloques.includes(f.bloque)).sort((a, b) => idxBloque(a.bloque) - idxBloque(b.bloque));
    $('sec-cobertura').hidden = !afectadas.length;
    $('sec-avisos').hidden = !afectadas.length;
    if (!afectadas.length) {
      estado.novedadDia = null; estado.avisos = [];
      mensaje('estado-dia', soloNombre(docId) + ' no tiene clases el ' + dia.toLowerCase() + ' en esas horas: no hay nada que cubrir.' +
        (estado.escenario ? ' Ya aplicaste el cambio del archivo, así que esas clases se movieron. Para probar la ausencia sobre el horario original, usa «Volver al horario original» en la pestaña Horario.' : ''), 'info');
      return;
    }
    const cargaSemana = {};
    filas.forEach((f) => { cargaSemana[f.docente] = (cargaSemana[f.docente] || 0) + 1; });
    estado.novedadDia = {
      docente: docId, dia, bloques,
      clases: afectadas.map((f) => {
        const ocupados = new Set(filas.filter((x) => x.dia === f.dia && x.bloque === f.bloque).map((x) => x.docente));
        const libres = d.docentes.filter((x) => x.id !== docId && !ocupados.has(x.id) && docenteDisponible(x.id, f.dia, f.bloque));
        const opciones = [];
        libres.filter((x) => (d.habilitados[f.asignatura] || []).includes(x.id) && (cargaSemana[x.id] || 0) < x.max)
          .forEach((x) => opciones.push({ tipo: 'suplente', docente: x }));
        libres.forEach((x) => opciones.push({ tipo: 'acompanamiento', docente: x }));
        const delCurso = filas.filter((x) => x.curso === f.curso && x.dia === f.dia);
        const esDelAusente = (x) => x.docente === docId && bloques.includes(x.bloque);
        const finJornada = delCurso.filter((x) => idxBloque(x.bloque) > idxBloque(f.bloque)).every(esDelAusente);
        const inicioJornada = delCurso.filter((x) => idxBloque(x.bloque) < idxBloque(f.bloque)).length === 0;
        if (finJornada) opciones.push({ tipo: 'salida' });
        else if (inicioJornada) opciones.push({ tipo: 'entrada' });
        opciones.push({ tipo: 'cancelada' });
        return { fila: f, opciones, eleccion: 0 };
      }),
    };
    renderCobertura();
    generarAvisos();
    const sup = estado.novedadDia.clases.filter((c) => c.opciones[0].tipo === 'suplente').length;
    mensaje('estado-dia', plural(afectadas.length, 'clase') + ' por cubrir de ' + soloNombre(docId) + ' el ' + dia.toLowerCase() + '. ' +
      (sup ? (sup === 1 ? '1 ya tiene' : sup + ' ya tienen') + ' suplente de la misma materia.' :'Nadie de la misma materia está libre a esas horas, así que te proponemos la mejor alternativa.') +
      ' Revisa y envía los avisos.', 'info');
  }

  function textoOpcion(o, f) {
    if (o.tipo === 'suplente') return 'Suplente: ' + o.docente.nombre + ' dicta ' + f.asignatura;
    if (o.tipo === 'acompanamiento') return 'Acompañamiento: ' + o.docente.nombre + ' (trabajo autónomo)';
    if (o.tipo === 'salida') return 'Cancelar con salida anticipada a las ' + horaSola(f.inicio);
    if (o.tipo === 'entrada') return 'Cancelar con entrada tarde a las ' + horaSola(f.fin);
    return 'Cancelar la clase';
  }

  function renderCobertura() {
    const ul = vaciar($('lista-cobertura'));
    estado.novedadDia.clases.forEach((c, i) => {
      const f = c.fila, id = 'cob-' + i;
      const sel = el('select', { id, onchange: (e) => { c.eleccion = Number(e.target.value); generarAvisos(); } });
      c.opciones.forEach((o, j) => sel.append(el('option', { value: String(j), selected: j === c.eleccion }, (j === 0 ? '★ ' : '') + textoOpcion(o, f))));
      ul.append(el('li', { class: claseMateria(f.asignatura) },
        el('p', { class: 'campo' }, el('label', { for: id }, el('span', { class: 'sigla', 'aria-hidden': 'true' }, sigla(f.asignatura)), ' ' + f.curso + ' · ' + f.asignatura + ' · ' + rangoHora(f.inicio, f.fin) + (f.salonNombre ? ' · ' + f.salonNombre : '')), sel)));
    });
  }

  function generarAvisos() {
    const nd = estado.novedadDia;
    if (!nd) return;
    const diaTxt = nd.dia.toLowerCase(), avisos = [], salidas = {}, resumen = [];
    const salon = (f) => (f.salonNombre ? f.salonNombre + ' (' + f.salon + ')' : 'su salón');
    nd.clases.forEach((c) => {
      const f = c.fila, o = c.opciones[c.eleccion], rango = rangoHora(f.inicio, f.fin);
      resumen.push(f.curso + ' ' + f.asignatura + ' ' + f.bloque + ' → ' + textoOpcion(o, f));
      if (o.tipo === 'suplente') {
        avisos.push({ titulo: 'Suplente · padres de ' + f.curso, texto: 'Estimados padres de familia de ' + f.curso + ': hoy ' + diaTxt + ', la clase de ' + f.asignatura + ' de ' + rango + ' la dictará ' + o.docente.nombre + ' por una novedad docente. La jornada sigue normal.' });
        avisos.push({ titulo: 'Docente suplente · ' + o.docente.nombre, texto: o.docente.nombre + ': hoy ' + diaTxt + ' usted cubre la clase de ' + f.asignatura + ' de ' + f.curso + ', de ' + rango + ', en ' + salon(f) + '.' });
      } else if (o.tipo === 'acompanamiento') {
        avisos.push({ titulo: 'Acompañamiento · padres de ' + f.curso, texto: 'Estimados padres de familia de ' + f.curso + ': hoy ' + diaTxt + ', la clase de ' + f.asignatura + ' de ' + rango + ' no se dictará por una novedad docente. Los estudiantes tendrán hora de trabajo autónomo con el acompañamiento de ' + o.docente.nombre + '.' });
        avisos.push({ titulo: 'Docente acompañante · ' + o.docente.nombre, texto: o.docente.nombre + ': hoy ' + diaTxt + ' usted acompaña a ' + f.curso + ' en una hora de trabajo autónomo de ' + rango + ', en ' + salon(f) + ', en lugar de la clase de ' + f.asignatura + '.' });
      } else if (o.tipo === 'salida') {
        (salidas[f.curso] = salidas[f.curso] || []).push(f);
      } else if (o.tipo === 'entrada') {
        avisos.push({ titulo: 'Entrada tarde · padres de ' + f.curso, texto: 'Estimados padres de familia de ' + f.curso + ': hoy ' + diaTxt + ', la primera clase (' + rango + ') se cancela por una novedad docente. Los estudiantes pueden llegar a las ' + horaSola(f.fin) + '.' });
      } else {
        avisos.push({ titulo: 'Clase cancelada · padres de ' + f.curso, texto: 'Estimados padres de familia de ' + f.curso + ': hoy ' + diaTxt + ', la clase de ' + f.asignatura + ' de ' + rango + ' se cancela por una novedad docente. Coordinación organiza la actividad del grupo en ese bloque.' });
      }
    });
    Object.keys(salidas).forEach((curso) => {
      const fs = salidas[curso].sort((a, b) => idxBloque(a.bloque) - idxBloque(b.bloque));
      const ini = fs[0].inicio, fin = fs[fs.length - 1].fin, varias = fs.length > 1;
      avisos.push({ titulo: 'Salida anticipada · padres de ' + curso, texto: 'Estimados padres de familia de ' + curso + ': hoy ' + diaTxt + ', ' + (varias ? 'las últimas ' + fs.length + ' clases' : 'la última clase') + ' (' + rangoHora(ini, fin) + ') ' + (varias ? 'se cancelan' : 'se cancela') + ' por una novedad docente. Los estudiantes saldrán a las ' + horaSola(ini) + '. Por favor tomen sus previsiones para recogerlos.' });
    });
    avisos.push({ titulo: 'Resumen · coordinación', texto: 'Novedad docente de ' + soloNombre(nd.docente) + ' el ' + diaTxt + '. ' + resumen.join('; ') + '.' });
    const previos = {};
    estado.avisos.forEach((a) => { previos[a.titulo] = a; });
    estado.avisos = avisos.map((a) => Object.assign(a, { enviado: !!(previos[a.titulo] && previos[a.titulo].enviado && previos[a.titulo].texto === a.texto) }));
    renderAvisos();
  }

  function enlaceWhatsApp(texto) { return 'https://wa.me/?text=' + encodeURIComponent(texto); }

  function renderBandeja() {
    const env = estado.avisos.filter((a) => a.enviado).length;
    $('bandeja').textContent = plural(estado.avisos.length, 'aviso') + ' · ' + plural(env, 'enviado') + ' · ' + plural(estado.avisos.length - env, 'por enviar') + '. Cada uno se abre en WhatsApp ya escrito.';
  }

  function renderAvisos() {
    const ul = vaciar($('lista-avisos'));
    estado.avisos.forEach((a, i) => {
      const idTxt = 'aviso-' + i;
      const wa = el('a', { class: 'boton boton--pequeno', href: enlaceWhatsApp(a.texto), target: '_blank', rel: 'noopener noreferrer' }, 'Abrir en WhatsApp', oculto(' (se abre en otra pestaña)'));
      const estadoTxt = el('span', { class: 'aviso__estado' }, a.enviado ? '✔ Enviado' : '○ Por enviar');
      const art = el('article', { class: 'aviso' + (a.enviado ? ' aviso--enviado' : ''), 'aria-labelledby': idTxt + '-t' });
      const area = el('textarea', { id: idTxt, rows: '5', oninput: (e) => { a.texto = e.target.value; wa.setAttribute('href', enlaceWhatsApp(a.texto)); } });
      area.value = a.texto;
      const marcar = el('button', { type: 'button', class: 'boton boton--pequeno', 'aria-pressed': a.enviado ? 'true' : 'false', onclick: () => {
        a.enviado = !a.enviado;
        marcar.setAttribute('aria-pressed', a.enviado ? 'true' : 'false');
        estadoTxt.textContent = a.enviado ? '✔ Enviado' : '○ Por enviar';
        art.classList.toggle('aviso--enviado', a.enviado);
        renderBandeja();
      } }, 'Marcar como enviado');
      art.append(el('h3', { id: idTxt + '-t' }, a.titulo, ' ', estadoTxt),
        el('p', { class: 'campo' }, el('label', { for: idTxt, class: 'visually-hidden' }, 'Mensaje (puedes editarlo)'), area),
        el('p', { class: 'acciones' }, wa, el('button', { type: 'button', class: 'boton boton--pequeno', onclick: () => copiar(area) }, 'Copiar'), marcar));
      ul.append(el('li', null, art));
    });
    renderBandeja();
  }

  async function copiar(area) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(area.value);
      else { area.select(); document.execCommand('copy'); }
      mensaje('estado-dia', 'Mensaje copiado. Pégalo en el canal del curso.', 'ok');
    } catch (e) {
      area.select();
      mensaje('estado-dia', 'No pude copiar automáticamente: el texto quedó seleccionado, cópialo con Ctrl+C.', 'aviso');
    }
  }

  function usarHojaCambioDia() {
    const c = (estado.datos && estado.datos.cambios) || [];
    if (!c.length) { mensaje('estado-dia', 'Tu archivo no trae un cambio.', 'aviso'); return; }
    $('dia-docente').value = c[0].docente;
    $('dia-dia').value = c[0].dia;
    const bl = new Set(c.filter((x) => x.docente === c[0].docente && x.dia === c[0].dia).map((x) => x.bloque));
    document.querySelectorAll('#dia-bloques input').forEach((i) => { i.checked = bl.has(i.value); });
    proponerCobertura();
  }

  // ------------------------------------------------------------------
  // 7. Exportar
  // ------------------------------------------------------------------
  function descargarSeguro(bytes, nombre, idMsg, tipo) {
    idMsg = idMsg || 'estado-exportar';
    try {
      H.descargar(bytes, nombre, tipo);
      mensaje(idMsg, 'Descarga iniciada: ' + nombre + '.' + (enMarco ? ' Si no empieza, la descarga funciona al abrir index.html en tu computador.' : ''), 'ok');
      estado.exportado = true;
    } catch (e) {
      mensaje(idMsg, 'No se pudo descargar (' + e.message + '). La descarga funciona al abrir index.html en tu computador con Chrome, Edge o Firefox.', 'error');
    }
  }

  function libroEntrada(d) {
    const v = (x) => (x >= 1e9 ? '' : x);
    const hojas = [
      { nombre: 'Leeme', filas: [['Concepto', 'Descripción'], ['Formato', 'Mismo formato y encabezados del archivo Datos_prueba_Gnosoft.xlsx.'], ['Generado por', 'SlotNova'], ['Unidad', 'Cada bloque se identifica por bloque_id; inicio y fin son informativos.']], anchos: [16, 90] },
      { nombre: 'Bloques', filas: [['bloque_id', 'inicio', 'fin']].concat(d ? d.bloques.map((b) => [b.id, b.inicio, b.fin]) : []), anchos: [10, 8, 8] },
      { nombre: 'Cursos', filas: [['curso_id', 'nombre', 'estudiantes']].concat(d ? d.cursos.map((c) => [c.id, c.nombre || c.id, c.estudiantes]) : []), anchos: [10, 12, 12] },
      { nombre: 'Docentes', filas: [['docente_id', 'nombre', 'max_sesiones_semana']].concat(d ? d.docentes.map((x) => [x.id, x.nombre, v(x.max)]) : []), anchos: [11, 20, 20] },
      { nombre: 'Asignaturas docentes', filas: [['asignatura', 'docente_id', 'habilitado']].concat(d ? Object.keys(d.habilitados).reduce((a, asig) => a.concat(d.habilitados[asig].map((id) => [asig, id, 1])), []) : []), anchos: [26, 11, 10] },
      { nombre: 'Carga', filas: [['curso_id', 'asignatura', 'docente_principal_id', 'sesiones_semana', 'tipo_salon_requerido']].concat(d ? d.carga.map((x) => [x.curso, x.asignatura, x.principal, x.sesiones, x.tipoSalon]) : []), anchos: [10, 26, 20, 16, 22] },
      { nombre: 'Salones', filas: [['salon_id', 'nombre', 'tipo', 'capacidad']].concat(d ? d.salones.map((s) => [s.id, s.nombre, s.tipo, v(s.capacidad)]) : []), anchos: [10, 18, 20, 10] },
      { nombre: 'Disponibilidad', filas: [['docente_id', 'dia', 'bloque_id', 'disponible']].concat(d ? d.docentes.reduce((a, x) => a.concat(d.dias.reduce((b, dia) => b.concat(d.bloques.map((bl) => [x.id, dia, bl.id, (d.disponibilidad[x.id] && d.disponibilidad[x.id][dia] && d.disponibilidad[x.id][dia][bl.id] === 0) ? 0 : 1])), [])), []) : []), anchos: [11, 11, 10, 10] },
      { nombre: 'Cambio', filas: [['docente_id', 'dia', 'bloque_id', 'disponible_nuevo', 'motivo']].concat(d ? (d.cambios || []).map((c) => [c.docente, c.dia, c.bloque, c.disponible, c.motivo]) : []), anchos: [11, 11, 10, 16, 30] },
    ];
    return H.escribirXlsx(hojas);
  }

  // ------------------------------------------------------------------
  // Eventos: actos, reuniones, evaluaciones y salidas pintados en el horario
  // ------------------------------------------------------------------
  const TIPOS_EVENTO = {
    acto: { nombre: 'Acto cívico', color: '#b45309' }, reunion: { nombre: 'Reunión', color: '#0e7490' },
    evaluacion: { nombre: 'Evaluación', color: '#be185d' }, salida: { nombre: 'Salida pedagógica', color: '#15803d' },
    otro: { nombre: 'Otro', color: '#6d28d9' },
  };
  // Identificador único aunque se creen dos cosas en el mismo milisegundo
  let contadorId = 0;
  const nuevoId = (prefijo) => prefijo + Date.now().toString(36) + (++contadorId).toString(36) + Math.random().toString(36).slice(2, 5);
  const normal = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  function eventosEn(dia, bloque, curso) {
    return estado.eventos.filter((e) => e.dia === dia && e.bloques.includes(bloque) && (!e.cursos.length || (curso && e.cursos.includes(curso))));
  }
  // Un evento con la hora reservada se vuelve una regla «prohibir» por curso: el motor deja esa hora libre
  function reglasDeEventos() {
    const out = [];
    if (!estado.ef) return out;
    estado.eventos.filter((e) => e.reservar).forEach((e) => {
      (e.cursos.length ? e.cursos : estado.ef.cursos.map((c) => c.id)).forEach((curso) => {
        const n = H.reglas.normalizarRegla({ tipo: 'prohibir', curso, dias: [e.dia], bloques: e.bloques, origen: 'evento', texto: e.titulo }, estado.ef);
        if (n.ok) { n.regla.eventoId = e.id; out.push(n.regla); }
      });
    });
    return out;
  }
  const lugarEvento = (e) => e.dia + ' · ' + e.bloques.map((b) => { const x = estado.ef.bloques.find((y) => y.id === b); return x ? x.inicio + '–' + x.fin : b; }).join(', ') +
    ' · ' + (e.cursos.length ? e.cursos.join(', ') : 'todos los cursos');

  function guardarEvento(datosEv) {
    if (!estado.ef) return { ok: false, error: 'Primero sube el Excel.' };
    const ev = Object.assign({ id: nuevoId('ev'), tipo: 'otro', cursos: [], reservar: false, nota: '' }, datosEv);
    ev.titulo = String(ev.titulo || '').trim();
    ev.color = ev.color || (TIPOS_EVENTO[ev.tipo] || TIPOS_EVENTO.otro).color;
    if (!ev.titulo) return { ok: false, error: 'Falta el nombre del evento.' };
    if (!estado.ef.dias.includes(ev.dia)) return { ok: false, error: 'El día «' + ev.dia + '» no está en la jornada.' };
    ev.bloques = (ev.bloques || []).filter((b) => estado.ef.bloques.some((x) => x.id === b));
    if (!ev.bloques.length) return { ok: false, error: 'Marca al menos una hora del evento.' };
    ev.cursos = (ev.cursos || []).filter((c) => estado.ef.cursos.some((x) => x.id === c));
    const i = estado.eventos.findIndex((e) => e.id === ev.id);
    const antes = i >= 0 ? estado.eventos[i] : null;
    if (i >= 0) estado.eventos[i] = ev; else estado.eventos.push(ev);
    const base = { ok: true, evento: ev.titulo, lugar: lugarEvento(ev) };
    if (ev.reservar || (antes && antes.reservar)) {
      estado.reglas = estado.reglas.filter((r) => !r.eventoId).concat(reglasDeEventos());
      return Object.assign(base, aplicarReglas('Evento «' + ev.titulo + '»' + (ev.reservar ? ' con la hora reservada.' : '.')));
    }
    renderTodoResultado();
    renderEventos();
    return Object.assign(base, { reprogramado: false });
  }

  function borrarEvento(id) {
    const ev = estado.eventos.find((e) => e.id === id);
    if (!ev) return { ok: false, error: 'No encontré ese evento.' };
    estado.eventos = estado.eventos.filter((e) => e.id !== id);
    if (ev.reservar) {
      estado.reglas = estado.reglas.filter((r) => r.eventoId !== id);
      return Object.assign({ ok: true, evento: ev.titulo }, aplicarReglas('Se quitó el evento «' + ev.titulo + '».'));
    }
    renderTodoResultado();
    renderEventos();
    return { ok: true, evento: ev.titulo, reprogramado: false };
  }

  function avisoEvento(r, verbo) {
    if (!r.ok) { mensaje('estado-generar', r.error, 'error'); return; }
    mensaje('estado-generar', 'Evento «' + r.evento + '» ' + verbo + '.' + (r.reprogramado
      ? ' El horario se reacomodó: ' + plural(r.movidas, 'clase movida', 'clases movidas') + ', ' + plural(r.pendientes, 'pendiente') + '.' : ''), 'ok');
  }

  function renderEventos() {
    const ul = vaciar($('lista-eventos'));
    $('eventos-vacio').hidden = estado.eventos.length > 0;
    if (!estado.ef) return;
    estado.eventos.forEach((e) => ul.append(el('li', { style: '--ev:' + e.color },
      el('span', { class: 'eventos__punto', 'aria-hidden': 'true' }),
      el('span', { class: 'eventos__info' }, el('strong', null, e.titulo),
        el('span', { class: 'ayuda' }, (TIPOS_EVENTO[e.tipo] || TIPOS_EVENTO.otro).nombre + ' · ' + lugarEvento(e) + (e.reservar ? ' · hora reservada' : '') + (e.nota ? ' · ' + e.nota : ''))),
      el('span', { class: 'eventos__acciones' },
        el('button', { type: 'button', class: 'boton boton--pequeno', 'aria-label': 'Editar «' + e.titulo + '»', onclick: () => abrirEvento(e.id) }, 'Editar'),
        el('button', { type: 'button', class: 'boton boton--pequeno boton--peligro', 'aria-label': 'Eliminar «' + e.titulo + '»', onclick: () => avisoEvento(borrarEvento(e.id), 'eliminado') }, 'Eliminar')))));
  }

  let eventoEditando = null;
  function abrirEvento(id) {
    if (!estado.ef) return;
    const e = id ? estado.eventos.find((x) => x.id === id) : null;
    eventoEditando = e ? e.id : null;
    const b = e || { titulo: '', tipo: 'acto', dia: diaPorDefecto(), bloques: [estado.ef.bloques[0].id], cursos: [], reservar: false, nota: '' };
    $('t-evento').textContent = e ? 'Editar evento' : 'Nuevo evento';
    $('ev-titulo').value = b.titulo;
    $('ev-tipo').value = b.tipo;
    $('ev-color').value = b.color || TIPOS_EVENTO[b.tipo].color;
    const sd = vaciar($('ev-dia'));
    estado.ef.dias.forEach((d) => sd.append(el('option', { value: d, selected: d === b.dia }, d)));
    const casillas = (fs, items) => {
      Array.from($(fs).querySelectorAll('.opcion')).forEach((n) => n.remove());
      items.forEach(([valor, texto, marcado]) => $(fs).append(el('p', { class: 'opcion' },
        el('input', { type: 'checkbox', id: fs + '-' + (valor || 'todos'), value: valor, checked: marcado }), el('label', { for: fs + '-' + (valor || 'todos') }, texto))));
    };
    casillas('ev-bloques', estado.ef.bloques.map((x) => [x.id, x.inicio + '–' + x.fin, b.bloques.includes(x.id)]));
    casillas('ev-cursos', [['', 'Todos', !b.cursos.length]].concat(estado.ef.cursos.map((c) => [c.id, c.id, b.cursos.includes(c.id)])));
    $('ev-nota').value = b.nota || '';
    $('ev-reservar').checked = !!b.reservar;
    $('btn-borrar-evento').hidden = !e;
    mensaje('estado-evento', '');
    abrirDialogo('dlg-evento');
    $('ev-titulo').focus();
  }

  // ------------------------------------------------------------------
  // Descargas: PDF, PNG, JPEG y código QR (dibujo en js/exportar.js)
  // ------------------------------------------------------------------
  const archivoSeguro = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'horario';

  function compartidoDesdeEstado() {
    const d = estado.ef, mapa = {}, ai = {}, pi = {}, si = {};
    ordenAsig.forEach((a, i) => { ai[a] = i; });
    d.docentes.forEach((x, i) => { pi[x.id] = i; });
    d.salones.forEach((x, i) => { si[x.id] = i; });
    estado.actual.filas.forEach((f) => { if (f.asignatura) mapa[f.curso + '|' + f.dia + '|' + f.bloque] = f; });
    const iDesc = d.bloques.findIndex((b, i) => descansoTras(d.bloques, i));
    const desc = iDesc >= 0 ? descansoTras(d.bloques, iDesc) : null;
    const num = (x) => (x == null ? -1 : x);
    return {
      v: 1, titulo: estado.nombre || 'Horario semanal',
      dias: d.dias, bloques: d.bloques.map((b) => [b.id, b.inicio, b.fin]),
      descanso: desc ? [d.bloques[iDesc].id, desc.inicio, desc.fin, desc.minutos] : null,
      asig: ordenAsig.map((a, i) => [a, i % 10, sigla(a)]),
      doc: d.docentes.map((x) => x.nombre), sal: d.salones.map((x) => x.nombre),
      cursos: d.cursos.map((c) => {
        const celdas = [].concat.apply([], d.dias.map((dia) => d.bloques.map((b) => {
          const f = mapa[c.id + '|' + dia + '|' + b.id];
          if (!f) return 0;
          const k = [num(ai[f.asignatura]), num(pi[f.docente]), num(si[f.salon])];
          if (f.cambio) k.push(1);
          return k;
        })));
        return [c.id].concat(H.exportar.compactarCeldas(celdas) || [celdas]);
      }),
      ev: estado.eventos.map((e) => [e.titulo, e.color, d.dias.indexOf(e.dia), e.bloques.map(idxBloque), e.cursos]),
    };
  }

  function vistasParaDescargar(todos) {
    const c = compartidoDesdeEstado(), { tipo, id } = estado.vista;
    if (todos || tipo === 'todos') return { vistas: estado.ef.cursos.map((x) => H.exportar.modeloVista(c, 'curso', x.id)), nombre: 'todos-los-cursos' };
    const clave = tipo === 'docente' ? estado.ef.docentes.findIndex((x) => x.id === id) : tipo === 'salon' ? estado.ef.salones.findIndex((x) => x.id === id) : id;
    const v = H.exportar.modeloVista(c, tipo, String(clave));
    return { vistas: [v], nombre: archivoSeguro(v.titulo) };
  }

  async function descargarVista(formato, todos) {
    if (!estado.actual) return { ok: false, error: 'Primero genera el horario.' };
    $('menu-descargar').open = false;
    mostrarCarga(formato === 'pdf' ? 'Preparando el PDF…' : 'Preparando la imagen…');
    try {
      const { vistas, nombre } = vistasParaDescargar(todos);
      let bytes, tipo, ext;
      if (formato === 'pdf') {
        bytes = await H.exportar.pdf(vistas.map((v) => H.exportar.lienzo(v, 1.6)));
        tipo = 'application/pdf'; ext = 'pdf';
      } else {
        const cv = vistas.length > 1 ? H.exportar.lienzoVarios(vistas, 1.5) : H.exportar.lienzo(vistas[0], 2);
        bytes = await H.exportar.imagen(cv, formato);
        tipo = formato === 'jpeg' ? 'image/jpeg' : 'image/png'; ext = formato === 'jpeg' ? 'jpg' : 'png';
      }
      const archivo = 'SlotNova_' + nombre + '.' + ext;
      descargarSeguro(bytes, archivo, 'estado-exportar', tipo);
      return { ok: true, archivo };
    } catch (e) {
      mensaje('estado-exportar', 'No se pudo preparar la descarga: ' + e.message, 'error');
      return { ok: false, error: e.message };
    } finally {
      ocultarCarga();
    }
  }

  function descargarExcel() {
    if (!estado.actual) return { ok: false, error: 'Primero genera el horario.' };
    $('menu-descargar').open = false;
    descargarSeguro(H.libroHorario(estado.ef, estado.actual, estado.cert, estado.rep), 'SlotNova_Horario.xlsx');
    return { ok: true, archivo: 'SlotNova_Horario.xlsx' };
  }

  // El QR lleva el horario dentro del enlace (#ver=…): no hace falta servidor, solo la página publicada
  const CLAVE_URL = 'slotnova.urlPublica';
  const esWeb = () => /^https?:$/.test(location.protocol);
  let enlaceQR = '';
  function urlPublica() {
    if (esWeb()) return location.origin + location.pathname;
    const v = $('qr-url').value.trim();
    return /^https?:\/\/\S+$/.test(v) ? v.replace(/#.*$/, '') : '';
  }
  async function abrirQR() {
    if (!estado.actual) return { ok: false, error: 'Primero genera el horario.' };
    $('menu-descargar').open = false;
    $('campo-qr-url').hidden = esWeb();
    if (!$('qr-url').value) $('qr-url').value = leerAlmacen(CLAVE_URL, '');
    abrirDialogo('dlg-qr');
    return pintarQR();
  }
  async function pintarQR() {
    const cont = vaciar($('qr-lienzo'));
    enlaceQR = '';
    const base = urlPublica();
    if (!base) {
      mensaje('estado-qr', 'Escribe abajo la dirección donde publicaste SlotNova (por ejemplo, GitHub Pages) y se crea el código.', 'aviso');
      return { ok: false, error: 'Falta la dirección pública de la página.' };
    }
    try {
      enlaceQR = base + '#ver=' + await H.exportar.codificar(compartidoDesdeEstado());
      const qr = H.qr.generar(enlaceQR, enlaceQR.length < 900 ? 'M' : 'L');
      const cv = H.qr.dibujar(document.createElement('canvas'), qr, Math.max(3, Math.floor(480 / (qr.tamano + 8))));
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', 'Código QR para abrir el horario en el celular');
      cont.append(cv);
      mensaje('estado-qr', 'Listo: el enlace trae todos los cursos, docentes y salones.', 'ok');
      return { ok: true, enlace: enlaceQR };
    } catch (e) {
      mensaje('estado-qr', 'No se pudo crear el código (' + e.message + '). Descarga el PDF y compártelo.', 'error');
      return { ok: false, error: e.message };
    }
  }

  // Visor: alguien abrió el enlace del QR; se muestra el horario de solo lectura y se puede descargar
  async function iniciarVisor(codigo) {
    document.body.dataset.modo = 'visor';
    $('visor').hidden = false;
    let c;
    try { c = await H.exportar.decodificar(codigo); } catch (e) {
      mensaje('visor-estado', 'Este enlace está incompleto o dañado. Pide que te compartan el código QR de nuevo.', 'error');
      ['form-visor', 'visor-png', 'visor-pdf'].forEach((id) => { $(id).hidden = true; });
      return;
    }
    $('t-visor').textContent = c.titulo || 'Horario compartido';
    const sel = vaciar($('visor-vista'));
    const grupo = (nombre, items) => { const g = el('optgroup', { label: nombre }); items.forEach(([v, t]) => g.append(el('option', { value: v }, t))); sel.append(g); };
    grupo('Cursos', c.cursos.map((x) => ['curso|' + x[0], 'Curso ' + x[0]]));
    grupo('Docentes', c.doc.map((n, i) => ['docente|' + i, n]));
    grupo('Salones', c.sal.map((n, i) => ['salon|' + i, n]));
    let lienzo = null;
    const elegido = () => sel.options[sel.selectedIndex].text;
    const pintar = () => {
      const [tipo, id] = sel.value.split('|');
      lienzo = H.exportar.lienzo(H.exportar.modeloVista(c, tipo, id), 1.5);
      vaciar($('visor-imagen')).append(el('img', { src: lienzo.toDataURL('image/png'), alt: 'Horario de ' + elegido() }));
    };
    sel.addEventListener('change', pintar);
    pintar();
    $('visor-png').addEventListener('click', async () => H.descargar(await H.exportar.imagen(lienzo, 'png'), 'SlotNova_' + archivoSeguro(elegido()) + '.png', 'image/png'));
    $('visor-pdf').addEventListener('click', async () => H.descargar(await H.exportar.pdf([lienzo]), 'SlotNova_' + archivoSeguro(elegido()) + '.pdf', 'application/pdf'));
  }

  // ------------------------------------------------------------------
  // Editar nombres sin mover el horario (docentes, materias y salones)
  // ------------------------------------------------------------------
  function renombrar(tipo, clave, nuevo) {
    nuevo = String(nuevo || '').trim().replace(/\s+/g, ' ');
    if (!estado.original) return { ok: false, error: 'Primero sube el Excel.' };
    if (!nuevo) return { ok: false, error: 'El nombre no puede quedar vacío.' };
    const o = estado.original;
    const resultados = Array.from(new Set([estado.base && estado.base.resultado, estado.actual, estado.referencia].concat(estado.historial).filter(Boolean)));
    const cadaFila = (fn) => resultados.forEach((r) => ['filas', 'pendientes', 'decisiones'].forEach((k) => (r[k] || []).forEach(fn)));
    let antes;
    if (tipo === 'docente') {
      const d = o.docentes.find((x) => x.id === clave);
      if (!d) return { ok: false, error: 'No existe ese docente.' };
      antes = d.nombre; d.nombre = nuevo;
      cadaFila((f) => { if (f.docente === clave) f.docenteNombre = nuevo; });
    } else if (tipo === 'materia') {
      if (!o.carga.some((c) => c.asignatura === clave)) return { ok: false, error: 'No existe la materia «' + clave + '».' };
      if (nuevo !== clave && o.carga.some((c) => c.asignatura === nuevo)) return { ok: false, error: 'Ya hay una materia llamada «' + nuevo + '».' };
      antes = clave;
      o.carga.forEach((c) => { if (c.asignatura === clave) c.asignatura = nuevo; });
      if (o.habilitados[clave]) { o.habilitados[nuevo] = o.habilitados[clave]; delete o.habilitados[clave]; }
      [estado.reglas].concat(estado.base ? [estado.base.reglas] : []).forEach((l) => l.forEach((r) => { if (r.asignatura === clave) r.asignatura = nuevo; }));
      cadaFila((f) => { if (f.asignatura === clave) f.asignatura = nuevo; });
    } else if (tipo === 'salon') {
      const s = o.salones.find((x) => x.id === clave);
      if (!s) return { ok: false, error: 'No existe ese salón.' };
      antes = s.nombre; s.nombre = nuevo;
      cadaFila((f) => { if (f.salon === clave) f.salonNombre = nuevo; });
    } else return { ok: false, error: 'Solo se pueden renombrar docentes, materias o salones.' };
    estado.datos = H.configurarTiempo(o, estado.tiempo);
    refrescarEf();
    prepararAsignaturas(estado.datos);
    prepararBorrador();
    diagnosticar();
    renderReglas();
    renderSugerencias();
    if (estado.actual) { evaluar(); renderTodoResultado(); }
    renderFormDia();
    return { ok: true, antes, ahora: nuevo };
  }

  function renderNombres() {
    const d = estado.ef;
    const lista = (ul, tipo, items) => {
      vaciar($(ul));
      items.forEach(([clave, valor, ayuda]) => {
        const id = 'nom-' + tipo + '-' + archivoSeguro(clave);
        const input = el('input', { type: 'text', id, autocomplete: 'off', spellcheck: 'false' });
        input.value = valor;
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
        input.addEventListener('change', () => {
          const r = renombrar(tipo, clave, input.value);
          if (!r.ok) { mensaje('estado-nombres', r.error, 'error'); input.value = valor; return; }
          mensaje('estado-nombres', '«' + r.antes + '» ahora es «' + r.ahora + '».', 'ok');
          renderNombres();
        });
        $(ul).append(el('li', null, el('label', { for: id, class: 'visually-hidden' }, 'Nombre de ' + valor), input, el('span', { class: 'ayuda' }, ayuda)));
      });
    };
    lista('n-docentes', 'docente', d.docentes.map((x) => [x.id, x.nombre, x.id + (x.max < 1e9 ? ' · máx. ' + x.max + ' clases' : '')]));
    lista('n-materias', 'materia', ordenAsig.filter((a) => d.carga.some((c) => c.asignatura === a)).map((a) => [a, a, sigla(a)]));
    lista('n-salones', 'salon', d.salones.map((x) => [x.id, x.nombre, x.id + ' · ' + x.tipo]));
  }

  // ------------------------------------------------------------------
  // Sugerencias de cambios armadas con los nombres del Excel subido
  // ------------------------------------------------------------------
  function sugerenciasCambio() {
    const d = estado.ef;
    if (!d || !d.carga.length) return [];
    const docs = d.docentes.filter((x) => d.carga.some((c) => c.principal === x.id));
    const lista = docs.length ? docs : d.docentes;
    const dia = (i) => d.dias[Math.min(i, d.dias.length - 1)].toLowerCase();
    const especial = d.carga.find((c) => c.tipoSalon && c.tipoSalon !== 'GENERAL') || d.carga[0];
    const repartible = d.carga.slice().sort((a, b) => b.sesiones - a.sesiones).find((c) => c.sesiones > 1 && c.sesiones <= d.dias.length) || d.carga[0];
    const otra = d.carga.find((c) => c.asignatura !== especial.asignatura && c.asignatura !== repartible.asignatura) || d.carga[0];
    const b = d.bloques[Math.min(3, d.bloques.length - 1)];
    const [hh, mm] = b.inicio.split(':').map(Number);
    const hora = mm ? hh + 1 : hh;
    const dentro = hora * 60 < H.datos.aMinutos(b.fin) && hora * 60 >= H.datos.aMinutos(b.inicio);
    const candidatas = [
      lista[0] && lista[0].nombre + ' no está disponible el ' + dia(1),
      lista[1] && dentro && lista[1].nombre.split(/\s+/)[0] + ' tiene reunión el ' + dia(3) + ' a las ' + hora,
      'No quiero ' + especial.asignatura + ' a primera hora',
      'Máximo 1 clase de ' + repartible.asignatura + ' al día',
      'Evitar ' + otra.asignatura + ' en la última hora',
    ].filter(Boolean);
    return Array.from(new Set(candidatas)).filter((t) => H.reglas.interpretarLocal(t, d).reglas.length > 0).slice(0, 4);
  }
  function renderSugerencias() {
    const ul = vaciar($('sugerencias-cambio'));
    sugerenciasCambio().forEach((t) => ul.append(el('li', null, el('button', { type: 'button', class: 'chip', dataset: { ejemplo: t } }, t))));
    document.dispatchEvent(new CustomEvent('slotnova:datos'));
  }

  // ------------------------------------------------------------------
  // Inicio de sesión (prototipo visual: no hay servidor y la contraseña no se guarda)
  // ------------------------------------------------------------------
  const CLAVE_SESION = 'slotnova.sesion';
  let modoAcceso = 'entrar';
  const bloquearApp = (si) => ['.cabecera', 'main', '.pie', '#btn-asistente', '#asistente'].forEach((s) => { const n = document.querySelector(s); if (n) n.inert = si; });
  function mostrarAcceso() {
    $('acceso').hidden = false;
    $('acceso').classList.remove('acceso--saliendo');
    bloquearApp(true);
    pintarCuenta();
    setTimeout(() => $('acceso-correo').focus(), 60);
  }
  function entrar(sesion) {
    estado.sesion = sesion;
    try { escribirAlmacen(CLAVE_SESION, sesion); } catch (e) { /* la sesión dura esta visita */ }
    $('acceso').classList.add('acceso--saliendo');
    setTimeout(() => { $('acceso').hidden = true; }, 380);
    bloquearApp(false);
    pintarCuenta();
  }
  function pintarCuenta() {
    const s = estado.sesion;
    $('menu-cuenta').hidden = !s;
    $('btn-asistente').hidden = !s;
    if (!s) return;
    $('avatar-iniciales').textContent = s.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
    $('cuenta-nombre').textContent = s.nombre;
    $('cuenta-correo').textContent = s.correo || 'Sesión de invitado';
  }
  function cambiarModoAcceso() {
    modoAcceso = modoAcceso === 'entrar' ? 'crear' : 'entrar';
    const crear = modoAcceso === 'crear';
    $('t-acceso').textContent = crear ? 'Crea tu cuenta' : 'Inicia sesión';
    $('acceso-sub').textContent = crear ? 'Empieza a planear los horarios de tu colegio.' : 'Entra para planear los horarios de tu colegio.';
    $('campo-acceso-nombre').hidden = !crear;
    $('btn-acceso').textContent = crear ? 'Crear cuenta' : 'Entrar';
    $('btn-acceso-modo').textContent = crear ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Crea una';
    $('acceso-clave').setAttribute('autocomplete', crear ? 'new-password' : 'current-password');
    mensaje('acceso-error', '');
  }

  // ------------------------------------------------------------------
  // Herramientas para el asistente de IA (js/asistente.js las usa con Claude o Gemini)
  // ------------------------------------------------------------------
  function resumenParaIA() {
    const d = estado.ef;
    if (!d) return 'Estado de SlotNova: todavía no hay datos. El usuario debe subir su Excel en la pestaña Datos.';
    const l = ['Estado actual de SlotNova:'];
    l.push('- Cursos: ' + d.cursos.map((c) => c.id + ' (' + c.estudiantes + ' estudiantes)').join(', '));
    l.push('- Docentes: ' + d.docentes.map((x) => x.id + ' ' + x.nombre + (x.max < 1e9 ? ' (máx. ' + x.max + ' clases)' : '')).join('; '));
    l.push('- Materias: ' + ordenAsig.join(', '));
    l.push('- Salones: ' + d.salones.map((s) => s.id + ' ' + s.nombre + ' [' + s.tipo + ']').join('; '));
    l.push('- Días: ' + d.dias.join(', ') + '. Bloques: ' + d.bloques.map((b) => b.id + ' ' + b.inicio + '–' + b.fin).join(', ') +
      (estado.tiempo.descansoMinutos ? '. Descanso de ' + estado.tiempo.descansoMinutos + ' min después de ' + estado.tiempo.descansoDespuesDe : '') + '.');
    if (estado.actual) {
      const r = estado.rep;
      l.push('- Horario: versión ' + estado.semilla + ', modo ' + (modoActual() === 'estricto' ? 'estricto' : 'flexible') + '. ' + r.validas + ' de ' + r.requeridas +
        ' clases (' + decimal(r.cobertura) + ' %), ' + r.colisiones.total + ' cruces, ' + r.pendientes + ' pendientes, calidad ' + r.preferencias.puntaje + '/100.' +
        (estado.escenario ? ' El cambio del archivo está aplicado.' : ''));
      r.detallePendientes.forEach((p) => l.push('  · Pendiente: ' + p.faltantes + ' de ' + p.asignatura + ' de ' + p.curso + '. ' + p.motivo));
    } else l.push('- Horario: todavía no se ha generado.');
    const reglas = estado.reglas.filter((r) => !r.eventoId);
    l.push('- Restricciones activas: ' + (reglas.length ? reglas.map((r, i) => (i + 1) + ') ' + H.reglas.describir(r, d)).join(' ') : 'ninguna'));
    l.push('- Eventos: ' + (estado.eventos.length ? estado.eventos.map((e) => e.titulo + ' (' + lugarEvento(e) + (e.reservar ? ', hora reservada' : '') + ')').join('; ') : 'ninguno'));
    if ((d.cambios || []).length) l.push('- El Excel trae un cambio: ' + textoEscenario().corto + (estado.escenario ? ' (aplicado).' : ' (sin aplicar).'));
    l.push('- Pestaña abierta: ' + vistaActual + '. Vista del horario: ' + estado.vista.tipo + (estado.vista.id ? ' ' + estado.vista.id : '') + '.');
    return l.join('\n');
  }

  const OBJ = (props, req) => ({ type: 'object', properties: props, required: req || [] });
  const TXT = (d) => ({ type: 'string', description: d });
  const LISTA = (d) => ({ type: 'array', items: { type: 'string' }, description: d });
  const HERRAMIENTAS = [
    { nombre: 'ver_horario', descripcion: 'Devuelve las clases de un curso, un docente o un salón (día, hora, materia, docente y salón). Úsala antes de responder preguntas sobre el horario.',
      esquema: OBJ({ tipo: { type: 'string', enum: ['curso', 'docente', 'salon'] }, nombre: TXT('ID o nombre: 6A, D2, Luis Vega, Aula 6A…') }, ['tipo', 'nombre']) },
    { nombre: 'generar_horario', descripcion: 'Genera el horario completo. modo flexible: si un docente supera su máximo, otro habilitado da la clase; modo estricto: solo el docente asignado. otra_version=true prueba otra versión.',
      esquema: OBJ({ modo: { type: 'string', enum: ['flexible', 'estricto'] }, otra_version: { type: 'boolean' } }) },
    { nombre: 'agregar_restriccion', descripcion: 'Agrega una regla y el motor reacomoda el horario moviendo lo mínimo. tipo: bloquear_docente (docente no disponible), prohibir (una clase nunca en esos días o bloques), evitar (preferencia), max_por_dia (máximo de clases de una materia por día).',
      esquema: OBJ({ tipo: { type: 'string', enum: ['bloquear_docente', 'prohibir', 'evitar', 'max_por_dia'] }, docente: TXT('ID o nombre del docente'), curso: TXT('ID del curso'),
        asignatura: TXT('Materia'), dias: LISTA('Días, por ejemplo ["Martes"]. Vacío = todos'), bloques: LISTA('Bloques, por ejemplo ["B1","B2"]. Vacío = todo el día'),
        max: { type: 'integer', description: 'Solo para max_por_dia' } }, ['tipo']) },
    { nombre: 'quitar_restriccion', descripcion: 'Quita una restricción activa por su número en la lista del estado.', esquema: OBJ({ numero: { type: 'integer' } }, ['numero']) },
    { nombre: 'cambio_del_archivo', descripcion: 'Aplica el cambio que trae el Excel (hoja Cambio) o vuelve al horario original.', esquema: OBJ({ accion: { type: 'string', enum: ['aplicar', 'volver_al_original'] } }, ['accion']) },
    { nombre: 'renombrar', descripcion: 'Cambia el nombre de un docente, una materia o un salón sin mover el horario.',
      esquema: OBJ({ tipo: { type: 'string', enum: ['docente', 'materia', 'salon'] }, actual: TXT('Nombre o ID actual'), nuevo: TXT('Nombre nuevo') }, ['tipo', 'actual', 'nuevo']) },
    { nombre: 'editar_docente', descripcion: 'Cambia el máximo de clases por semana de un docente y vuelve a generar el horario.', esquema: OBJ({ docente: TXT('ID o nombre'), max_semana: { type: 'integer' } }, ['docente', 'max_semana']) },
    { nombre: 'agregar_evento', descripcion: 'Agrega un evento al horario (acto cívico, reunión, evaluación, salida…). reservar=true deja esa hora sin clase y el motor reacomoda.',
      esquema: OBJ({ titulo: TXT('Nombre del evento'), tipo: { type: 'string', enum: ['acto', 'reunion', 'evaluacion', 'salida', 'otro'] }, dia: TXT('Día, por ejemplo Lunes'),
        bloques: LISTA('Bloques, por ejemplo ["B1"]. Vacío = todo el día'), cursos: LISTA('IDs de cursos. Vacío = todos'), reservar: { type: 'boolean' }, nota: TXT('Detalle opcional') }, ['titulo', 'dia']) },
    { nombre: 'quitar_evento', descripcion: 'Elimina un evento por su nombre.', esquema: OBJ({ titulo: TXT('Nombre del evento') }, ['titulo']) },
    { nombre: 'ausencia_del_dia', descripcion: 'Un docente falta hoy: propone quién cubre cada clase y prepara los avisos para WhatsApp (pestaña Ausencias).',
      esquema: OBJ({ docente: TXT('ID o nombre'), dia: TXT('Día'), bloques: LISTA('Bloques afectados. Vacío = todo el día') }, ['docente', 'dia']) },
    { nombre: 'configurar_jornada', descripcion: 'Cambia la duración de las clases, la hora de entrada o el descanso. Las horas se recalculan; el horario no se mueve.',
      esquema: OBJ({ duracion_min: { type: 'integer' }, hora_inicio: TXT('HH:MM'), descanso_min: { type: 'integer' }, descanso_despues_de: TXT('Bloque, por ejemplo B3') }) },
    { nombre: 'mostrar', descripcion: 'Lleva al usuario a una pestaña o a una vista del horario.',
      esquema: OBJ({ pestana: { type: 'string', enum: ['datos', 'horario', 'cambios', 'ausencias'] }, vista: { type: 'string', enum: ['curso', 'docente', 'salon', 'todos'] }, nombre: TXT('Curso, docente o salón') }) },
    { nombre: 'descargar', descripcion: 'Descarga el horario: excel, pdf (lo que se ve), pdf_todos (todos los cursos), png, jpeg o qr (código para el celular).',
      esquema: OBJ({ formato: { type: 'string', enum: ['excel', 'pdf', 'pdf_todos', 'png', 'jpeg', 'qr'] } }, ['formato']) },
    { nombre: 'guardar_horario', descripcion: 'Guarda el horario actual en «Mis horarios» con un nombre.', esquema: OBJ({ nombre: TXT('Nombre') }, ['nombre']) },
  ];

  const metricas = () => (estado.rep ? { cobertura: decimal(estado.rep.cobertura) + ' %', cruces: estado.rep.colisiones.total, pendientes: estado.rep.pendientes, calidad: estado.rep.preferencias.puntaje } : null);

  async function ejecutarHerramienta(nombre, a) {
    const d = estado.ef;
    const falta = (horario) => (!d ? { ok: false, error: 'Todavía no hay datos: el usuario debe subir su Excel en la pestaña Datos.' }
      : horario && !estado.actual ? { ok: false, error: 'Todavía no hay horario: genéralo primero con generar_horario.' } : null);
    const docente = (v) => H.reglas.buscarDocente(v, d);
    const salon = (v) => { const s = d.salones.find((x) => normal(x.id) === normal(v) || normal(x.nombre) === normal(v)); return s ? s.id : null; };
    const curso = (v) => { const c = d.cursos.find((x) => normal(x.id) === normal(v).replace(/^curso\s*/, '') || normal(x.nombre) === normal(v)); return c ? c.id : null; };
    const dia = (v) => d.dias.find((x) => normal(x) === normal(v) || normal(x).slice(0, 3) === normal(v).slice(0, 3)) || null;
    const bloques = (l) => (l || []).map((b) => { const x = d.bloques.find((y) => normal(y.id) === normal(b)); return x ? x.id : null; }).filter(Boolean);
    let e;
    switch (nombre) {
      case 'ver_horario': {
        if ((e = falta(true))) return e;
        const id = a.tipo === 'docente' ? docente(a.nombre) : a.tipo === 'salon' ? salon(a.nombre) : curso(a.nombre);
        if (!id) return { ok: false, error: 'No encontré «' + a.nombre + '». Revisa los nombres en el estado.' };
        const campo = a.tipo === 'docente' ? 'docente' : a.tipo === 'salon' ? 'salon' : 'curso';
        const clases = estado.actual.filas.filter((f) => f.asignatura && f[campo] === id)
          .sort((x, y) => d.dias.indexOf(x.dia) - d.dias.indexOf(y.dia) || idxBloque(x.bloque) - idxBloque(y.bloque))
          .map((f) => f.dia + ' ' + f.bloque + ' ' + f.inicio + '–' + f.fin + ': ' + f.asignatura + ' · ' + f.docenteNombre + ' · curso ' + f.curso + ' · ' + (f.salonNombre || 'sin salón') + (f.cambio ? ' (movida)' : ''));
        return { ok: true, id, total: clases.length, clases };
      }
      case 'generar_horario': {
        if ((e = falta(false))) return e;
        if (a.modo) estado.modo = a.modo === 'estricto' ? 'estricto' : 'alternativas';
        const ok = await generar(!!a.otra_version);
        return ok ? { ok: true, version: estado.semilla, modo: a.modo || (estado.modo === 'estricto' ? 'estricto' : 'flexible'), metricas: metricas() } : { ok: false, error: 'No se pudo generar el horario.' };
      }
      case 'agregar_restriccion': {
        if ((e = falta(false))) return e;
        const n = H.reglas.normalizarRegla(Object.assign({ origen: 'ia', texto: 'asistente' }, a), d);
        if (!n.ok) return { ok: false, error: n.error };
        estado.reglas.push(n.regla);
        const desc = H.reglas.describir(n.regla, d);
        return Object.assign({ descripcion: desc }, aplicarReglas('Cambio agregado: ' + desc), { metricas: metricas() });
      }
      case 'quitar_restriccion': {
        const visibles = estado.reglas.map((r, i) => [r, i]).filter(([r]) => !r.eventoId);
        const x = visibles[(a.numero || 0) - 1];
        if (!x) return { ok: false, error: 'No hay una restricción número ' + a.numero + '.' };
        const desc = H.reglas.describir(x[0], d);
        quitarRegla(x[1]);
        return { ok: true, quitada: desc, metricas: metricas() };
      }
      case 'cambio_del_archivo': {
        if ((e = falta(true))) return e;
        if (a.accion === 'volver_al_original') { restaurarBase(); return { ok: true, metricas: metricas() }; }
        if (!(d.cambios || []).length) return { ok: false, error: 'El Excel no trae una hoja Cambio.' };
        if (!estado.escenario) aplicarHojaCambio();
        irA('horario');
        const c = estado.rep.cambio;
        return { ok: true, cambio: textoEscenario().corto, afectadas: c ? c.resumen.afectadas : 0, movidas: c ? c.resumen.movidas : 0, metricas: metricas() };
      }
      case 'renombrar': {
        if ((e = falta(false))) return e;
        const clave = a.tipo === 'docente' ? docente(a.actual) : a.tipo === 'salon' ? salon(a.actual) : H.reglas.buscarAsignatura(a.actual, d);
        if (!clave) return { ok: false, error: 'No encontré «' + a.actual + '».' };
        return renombrar(a.tipo, clave, a.nuevo);
      }
      case 'editar_docente': {
        if ((e = falta(false))) return e;
        const id = docente(a.docente), o = id && estado.original.docentes.find((x) => x.id === id);
        if (!o) return { ok: false, error: 'No encontré a «' + a.docente + '».' };
        if (!Number.isInteger(a.max_semana) || a.max_semana < 1) return { ok: false, error: 'El máximo debe ser un número entero mayor que 0.' };
        o.max = a.max_semana;
        const habia = !!estado.actual, eventos = estado.eventos;
        cargarDatos(estado.original, estado.fuente, true);
        estado.eventos = eventos;
        if (habia) await generar(false);
        return { ok: true, docente: o.nombre, max: o.max, metricas: metricas() };
      }
      case 'agregar_evento': {
        if ((e = falta(false))) return e;
        const di = dia(a.dia);
        if (!di) return { ok: false, error: 'No reconozco el día «' + a.dia + '».' };
        const bl = bloques(a.bloques);
        return guardarEvento({ titulo: a.titulo, tipo: TIPOS_EVENTO[a.tipo] ? a.tipo : 'otro', dia: di, bloques: bl.length ? bl : d.bloques.map((b) => b.id),
          cursos: (a.cursos || []).map(curso).filter(Boolean), reservar: !!a.reservar, nota: a.nota || '' });
      }
      case 'quitar_evento': {
        const ev = estado.eventos.find((x) => normal(x.titulo) === normal(a.titulo)) || estado.eventos.find((x) => normal(x.titulo).includes(normal(a.titulo)));
        return ev ? borrarEvento(ev.id) : { ok: false, error: 'No hay un evento llamado «' + a.titulo + '».' };
      }
      case 'ausencia_del_dia': {
        if ((e = falta(true))) return e;
        const id = docente(a.docente), di = dia(a.dia);
        if (!id || !di) return { ok: false, error: !id ? 'No encontré a «' + a.docente + '».' : 'No reconozco el día «' + a.dia + '».' };
        renderFormDia();
        $('dia-docente').value = id;
        $('dia-dia').value = di;
        const bl = bloques(a.bloques);
        document.querySelectorAll('#dia-bloques input').forEach((i) => { i.checked = !bl.length || bl.includes(i.value); });
        proponerCobertura();
        irA('ausencias');
        const nd = estado.novedadDia;
        return { ok: true, resumen: $('estado-dia').textContent, clases: nd ? nd.clases.map((c) => c.fila.curso + ' ' + c.fila.asignatura + ' ' + c.fila.bloque + ' → ' + textoOpcion(c.opciones[c.eleccion], c.fila)) : [], avisos: estado.avisos.length };
      }
      case 'configurar_jornada': {
        const t = Object.assign({}, estado.tiempo);
        if (a.duracion_min) t.duracionMinutos = Math.min(120, Math.max(20, a.duracion_min));
        if (a.hora_inicio && /^\d{1,2}:\d{2}$/.test(a.hora_inicio)) t.horaInicio = a.hora_inicio.padStart(5, '0');
        if (a.descanso_min != null) t.descansoMinutos = Math.max(0, a.descanso_min);
        if (a.descanso_despues_de) t.descansoDespuesDe = String(a.descanso_despues_de).toUpperCase();
        escribirTiempo(t);
        aplicarTiempo();
        return { ok: true, bloques: (estado.datos || H.configurarTiempo(H.DATOS_PRUEBA, estado.tiempo)).bloques.map((b) => b.id + ' ' + b.inicio + '–' + b.fin) };
      }
      case 'mostrar': {
        if (a.vista) {
          if ((e = falta(true))) return e;
          estado.vista.tipo = a.vista;
          const r = $('vista-' + a.vista); if (r) r.checked = true;
          if (a.nombre && a.vista !== 'todos') { const id = a.vista === 'docente' ? docente(a.nombre) : a.vista === 'salon' ? salon(a.nombre) : curso(a.nombre); if (id) estado.vista.id = id; }
          renderOpcionesVista(); renderHorario();
          irA('horario');
        } else if (a.pestana) irA(a.pestana);
        return { ok: true, pestana: vistaActual, vista: estado.vista.tipo + (estado.vista.id ? ' ' + estado.vista.id : '') };
      }
      case 'descargar': {
        if ((e = falta(true))) return e;
        if (a.formato === 'excel') return descargarExcel();
        if (a.formato === 'qr') { irA('horario'); return abrirQR(); }
        return descargarVista(a.formato === 'pdf_todos' ? 'pdf' : a.formato, a.formato === 'pdf_todos');
      }
      case 'guardar_horario':
        if ((e = falta(true))) return e;
        return guardarHorario(a.nombre);
      default:
        return { ok: false, error: 'Herramienta desconocida: ' + nombre };
    }
  }

  // ------------------------------------------------------------------
  // Almacenamiento local y diálogos
  // ------------------------------------------------------------------
  function leerAlmacen(clave, defecto) {
    try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : defecto; } catch (e) { return defecto; }
  }
  // Puede lanzar error (navegador sin almacenamiento o sin espacio): quien llama decide qué decir.
  function escribirAlmacen(clave, valor) {
    localStorage.setItem(clave, JSON.stringify(valor, (k, v) => (v === Infinity ? 1e9 : v)));
  }

  function abrirDialogo(id) {
    const d = $(id);
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
  }
  function cerrarDialogo(d) {
    if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
  }

  // ------------------------------------------------------------------
  // Opciones de accesibilidad: tema, tamaño de letra, contraste y animaciones
  // ------------------------------------------------------------------
  const CLAVE_OPCIONES = 'slotnova.opciones';
  const OPCIONES_BASE = { tema: 'auto', letra: 'normal', contraste: false, movimiento: false };
  let opciones = Object.assign({}, OPCIONES_BASE, leerAlmacen(CLAVE_OPCIONES, {}));

  function aplicarOpciones() {
    const r = document.documentElement;
    if (opciones.tema === 'light' || opciones.tema === 'dark') r.dataset.theme = opciones.tema; else delete r.dataset.theme;
    if (opciones.letra !== 'normal') r.dataset.letra = opciones.letra; else delete r.dataset.letra;
    if (opciones.contraste) r.dataset.contraste = 'alto'; else delete r.dataset.contraste;
    if (opciones.movimiento) r.dataset.movimiento = 'reducido'; else delete r.dataset.movimiento;
    try { escribirAlmacen(CLAVE_OPCIONES, opciones); } catch (e) { /* sin almacenamiento: duran solo esta visita */ }
  }

  function pintarOpciones() {
    const marcar = (nombre, valor) => { const r = document.querySelector('input[name="' + nombre + '"][value="' + valor + '"]'); if (r) r.checked = true; };
    marcar('op-tema', opciones.tema);
    marcar('op-letra', opciones.letra);
    $('op-contraste').checked = opciones.contraste;
    $('op-movimiento').checked = opciones.movimiento;
  }

  function leerOpciones() {
    const valor = (nombre) => { const r = document.querySelector('input[name="' + nombre + '"]:checked'); return r ? r.value : ''; };
    opciones = { tema: valor('op-tema') || 'auto', letra: valor('op-letra') || 'normal', contraste: $('op-contraste').checked, movimiento: $('op-movimiento').checked };
    aplicarOpciones();
  }

  // ------------------------------------------------------------------
  // Mis horarios: guardar con nombre, abrir y borrar (en este navegador)
  // ------------------------------------------------------------------
  const CLAVE_GUARDADOS = 'slotnova.horarios';
  const leerGuardados = () => { const l = leerAlmacen(CLAVE_GUARDADOS, []); return Array.isArray(l) ? l : []; };
  const nombreSugerido = () => 'Horario del ' + new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

  function guardarHorario(nombre) {
    if (!estado.actual) return { ok: false, error: 'Todavía no hay horario para guardar.' };
    nombre = String(nombre || '').trim() || nombreSugerido();
    const lista = leerGuardados();
    const actualEsBase = !!estado.base && estado.actual === estado.base.resultado;
    const registro = {
      id: nuevoId('h'), nombre, fecha: new Date().toISOString(),
      resumen: plural(estado.ef.cursos.length, 'curso') + ' · ' + decimal(estado.rep.cobertura) + ' % programado' + (estado.rep.pendientes ? ' · ' + plural(estado.rep.pendientes, 'pendiente') : ''),
      original: estado.original, tiempo: estado.tiempo, modo: modoActual(), semilla: estado.semilla, reglas: estado.reglas,
      escenario: estado.escenario, base: estado.base, actual: actualEsBase ? null : estado.actual, actualEsBase,
      referencia: estado.referencia, descCambio: estado.descCambio, eventos: estado.eventos,
    };
    const previo = lista.findIndex((g) => g.nombre.toLowerCase() === nombre.toLowerCase());
    if (previo >= 0) lista[previo] = Object.assign(registro, { id: lista[previo].id });
    else lista.unshift(registro);
    try {
      escribirAlmacen(CLAVE_GUARDADOS, lista);
    } catch (e) {
      mensaje('estado-guardados', /quota/i.test(e.name + e.message)
        ? 'No queda espacio para guardar. Borra un horario que ya no uses y vuelve a intentarlo.'
        : 'Este navegador no permite guardar horarios (puede estar en modo privado). Descarga el Excel para conservarlo.', 'error');
      return { ok: false, error: 'No se pudo guardar en este navegador.' };
    }
    estado.nombre = nombre;
    $('nombre-horario').value = '';
    renderGuardados();
    mensaje('estado-guardados', (previo >= 0 ? 'Se actualizó «' : 'Guardado: «') + nombre + '».', 'ok');
    return { ok: true, nombre, actualizado: previo >= 0 };
  }

  function abrirGuardado(id) {
    const g = leerGuardados().find((x) => x.id === id);
    if (!g) return;
    escribirTiempo(g.tiempo);
    leerTiempo();
    estado.modo = g.modo || 'alternativas';
    estado.semilla = g.semilla || 1;
    cargarDatos(g.original, 'datos del horario «' + g.nombre + '»');
    estado.reglas = g.reglas || [];
    estado.escenario = !!g.escenario;
    refrescarEf();
    estado.base = g.base;
    estado.actual = g.actualEsBase && g.base ? g.base.resultado : g.actual;
    estado.referencia = g.referencia || null;
    estado.descCambio = g.descCambio || '';
    estado.eventos = g.eventos || [];
    estado.nombre = g.nombre;
    evaluar();
    diagnosticar();
    renderReglas();
    renderTodoResultado();
    renderFormDia();
    cerrarDialogo($('dlg-horarios'));
    irA('horario');
    mensaje('estado-generar', 'Abriste «' + g.nombre + '».', 'info');
  }

  function borrarGuardado(id) {
    const lista = leerGuardados(), g = lista.find((x) => x.id === id);
    try { escribirAlmacen(CLAVE_GUARDADOS, lista.filter((x) => x.id !== id)); } catch (e) {
      mensaje('estado-guardados', 'No se pudo borrar: este navegador no permite cambiar lo guardado.', 'error');
      return;
    }
    renderGuardados();
    mensaje('estado-guardados', 'Se borró «' + (g ? g.nombre : '') + '».', 'info');
  }

  function renderGuardados() {
    const lista = leerGuardados(), ul = vaciar($('lista-guardados'));
    $('guardados-vacio').hidden = lista.length > 0;
    $('atajo-guardados').hidden = !lista.length;
    $('form-guardar').hidden = !estado.actual;
    $('guardar-vacio').hidden = !!estado.actual;
    lista.forEach((g) => {
      const borrar = el('button', { type: 'button', class: 'boton boton--pequeno boton--peligro', 'aria-label': 'Borrar «' + g.nombre + '»' }, 'Borrar');
      // Borrar pide un segundo toque (sin ventanas emergentes) y vuelve a la normalidad si no se confirma.
      borrar.addEventListener('click', () => {
        if (borrar.dataset.confirmar) { borrarGuardado(g.id); return; }
        borrar.dataset.confirmar = '1';
        borrar.textContent = '¿Seguro? Toca otra vez';
        borrar.classList.add('boton--peligro-lleno');
        setTimeout(() => { if (borrar.isConnected) { delete borrar.dataset.confirmar; borrar.textContent = 'Borrar'; borrar.classList.remove('boton--peligro-lleno'); } }, 4000);
      });
      ul.append(el('li', null,
        el('span', { class: 'guardados__info' },
          el('strong', null, g.nombre),
          el('span', { class: 'ayuda' }, new Date(g.fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) + ' · ' + (g.resumen || ''))),
        el('span', { class: 'guardados__acciones' },
          el('button', { type: 'button', class: 'boton boton--pequeno boton--primario', 'aria-label': 'Abrir «' + g.nombre + '»', onclick: () => abrirGuardado(g.id) }, 'Abrir'),
          borrar)));
    });
  }

  function escribirTiempo(t) {
    if (!t) return;
    const radio = document.querySelector('input[name="duracion"][value="' + t.duracionMinutos + '"]');
    if (radio) radio.checked = true;
    else { $('dur-otra').checked = true; $('dur-otra-min').value = t.duracionMinutos; }
    $('hora-inicio').value = t.horaInicio || '07:00';
    $('descanso-min').value = t.descansoMinutos || 0;
    if (t.descansoDespuesDe) $('descanso-despues').value = t.descansoDespuesDe;
  }

  // ------------------------------------------------------------------
  // Navegación, visibilidad y pasos
  // ------------------------------------------------------------------
  function actualizarVisibilidad() {
    const hayDatos = !!estado.datos, hayHorario = !!estado.actual;
    document.querySelectorAll('[data-vacio="datos"]').forEach((n) => { n.hidden = hayDatos; });
    document.querySelectorAll('[data-vacio="horario"]').forEach((n) => { n.hidden = hayHorario; });
    ['sec-datos-listos', 'sec-novedad'].forEach((id) => { $(id).hidden = !hayDatos; });
    ['sec-horario', 'herramientas-horario', 'version-horario', 'form-dia'].forEach((id) => { $(id).hidden = !hayHorario; });
    if (!hayHorario) { $('sec-cobertura').hidden = true; $('sec-avisos').hidden = true; mensaje('estado-validez', ''); }
    else { $('sec-cobertura').hidden = !estado.novedadDia; $('sec-avisos').hidden = !estado.novedadDia; }
    $('btn-excel').disabled = !hayHorario;
    $('btn-imprimir').disabled = !hayHorario;
    $('btn-imprimir').hidden = enMarco;
    $('btn-entrada').disabled = !hayDatos;
    $('btn-otra').disabled = !hayHorario;
    $('btn-generar').textContent = hayHorario ? 'Generar de nuevo' : 'Generar horario';
    document.body.dataset.estado = !hayDatos ? 'sin-datos' : !hayHorario ? 'con-datos' : estado.escenario ? 'cambio-aplicado' : 'generado';
  }

  // Pestañas: cada sección vive en un panel y la dirección (#datos, #horario…) recuerda dónde estás.
  const VISTAS = ['datos', 'horario', 'cambios', 'ausencias'];
  let vistaActual = 'datos';
  function irA(vista, desdeDireccion) {
    if (VISTAS.indexOf(vista) < 0) vista = 'datos';
    vistaActual = vista;
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== vista; });
    document.querySelectorAll('[data-ir]').forEach((a) => { if (a.dataset.ir === vista) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (!desdeDireccion && location.hash !== '#' + vista) location.hash = vista;
    window.scrollTo(0, 0);
  }

  function iniciarNavegacion() {
    // Los enlaces #datos, #horario… se resuelven aquí (no por el navegador) para que funcionen
    // aunque la página se empaquete con <base href>; atrás/adelante llegan por hashchange.
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a || VISTAS.indexOf(a.getAttribute('href').slice(1)) < 0) return;
      e.preventDefault();
      irA(a.getAttribute('href').slice(1));
    });
    window.addEventListener('hashchange', () => {
      const vista = location.hash.slice(1);
      if (VISTAS.indexOf(vista) >= 0 && vista !== vistaActual) irA(vista, true);
    });
    irA(location.hash.slice(1), true);
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------
  function iniciar() {
    $('input-excel').addEventListener('change', (e) => leerArchivo(e.target.files[0]));
    const zona = $('zona-archivo');
    ['dragenter', 'dragover'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.add('zona-archivo--activa'); }));
    ['dragleave', 'drop'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.remove('zona-archivo--activa'); }));
    zona.addEventListener('drop', (e) => leerArchivo(e.dataTransfer.files[0]));

    $('form-tiempo').addEventListener('change', aplicarTiempo);
    $('form-tiempo').addEventListener('submit', (e) => { e.preventDefault(); aplicarTiempo(); });

    $('editor').addEventListener('click', (e) => { const t = e.target.closest('[data-agregar]'); if (t) agregarFila(t.dataset.agregar); });
    $('ed-duplicar').addEventListener('click', duplicarCurso);
    $('ed-disp-docente').addEventListener('change', renderDisponibilidadEditor);
    $('ed-aplicar').addEventListener('click', aplicarBorrador);
    $('ed-descartar').addEventListener('click', () => { prepararBorrador(); mensaje('estado-carga', 'Se descartaron los cambios.', 'info'); });

    $('btn-ver-detalles').addEventListener('click', () => {
      $('diag-mas').open = true;
      $('diag-mas').scrollIntoView({ behavior: document.documentElement.dataset.movimiento ? 'auto' : 'smooth', block: 'start' });
    });
    $('btn-generar').addEventListener('click', () => generar(false));
    $('btn-otra').addEventListener('click', () => generar(true));
    $('modo-estricto').addEventListener('change', (e) => {
      estado.modo = e.target.checked ? 'estricto' : 'alternativas';
      diagnosticar();
      if (estado.actual) generar(false);
    });

    $('form-vista').addEventListener('submit', (e) => e.preventDefault());
    document.querySelectorAll('input[name="vista-tipo"]').forEach((r) => r.addEventListener('change', () => {
      estado.vista.tipo = r.value; estado.seleccion = null; renderOpcionesVista(); renderHorario();
    }));
    $('vista-id').addEventListener('change', (e) => { estado.vista.id = e.target.value; estado.seleccion = null; renderHorario(); });
    $('btn-deshacer').addEventListener('click', deshacer);
    $('btn-deshacer-todo').addEventListener('click', deshacerTodo);

    $('btn-cambio').addEventListener('click', aplicarHojaCambio);
    $('btn-restaurar').addEventListener('click', restaurarBase);
    $('form-novedad').addEventListener('submit', (e) => { e.preventDefault(); interpretar(); });
    $('sugerencias-cambio').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ejemplo]');
      if (b) { $('texto-novedad').value = b.dataset.ejemplo; $('texto-novedad').focus(); }
    });
    $('btn-confirmar').addEventListener('click', confirmarPropuesta);
    $('btn-descartar').addEventListener('click', () => { estado.propuesta = null; renderPropuesta(); mensaje('estado-novedad', 'Propuesta descartada.', 'info'); });

    // IA: configuración, prueba de conexión y el interruptor para activarla o apagarla
    document.querySelectorAll('input[name="ia-proveedor"]').forEach((r) => r.addEventListener('change', () => pintarProveedorIA()));
    $('btn-probar-ia').addEventListener('click', probarIA);
    $('form-ia').addEventListener('submit', (e) => {
      e.preventDefault();
      const cfg = leerConfigIA();
      if (!cfg.clave) { mensaje('estado-config-ia', 'Pega la clave de la API para activar la IA.', 'aviso'); $('ia-clave').focus(); return; }
      Object.assign(estado.ia, cfg, { activa: true, recordar: $('ia-recordar').checked });
      guardarConfigIA();
      estadoIA();
      cerrarDialogo($('dlg-ia'));
      mensaje('estado-novedad', 'IA activada: ' + H.ia.PROVEEDORES[cfg.proveedor].nombre + ' (' + cfg.modelo + ').' + (navigator.onLine ? '' : ' No hay internet: mientras tanto se usa el modo local.'), 'ok');
    });
    $('btn-olvidar-clave').addEventListener('click', () => {
      Object.assign(estado.ia, { clave: '', activa: false, recordar: false });
      $('ia-clave').value = '';
      $('ia-recordar').checked = false;
      guardarConfigIA();
      estadoIA();
      mensaje('estado-config-ia', 'Clave borrada de este navegador. SlotNova sigue funcionando en modo local.', 'info');
    });
    $('ia-activa').addEventListener('change', (e) => {
      if (e.target.checked && !estado.ia.clave) { e.target.checked = false; pintarConfigIA(); abrirDialogo('dlg-ia'); return; }
      estado.ia.activa = e.target.checked;
      guardarConfigIA();
      estadoIA();
    });
    window.addEventListener('online', () => estadoIA());
    window.addEventListener('offline', () => estadoIA());

    $('form-dia').addEventListener('submit', (e) => { e.preventDefault(); proponerCobertura(); });
    $('btn-dia-cambio').addEventListener('click', usarHojaCambioDia);

    // Descargas y código QR
    $('btn-excel').addEventListener('click', descargarExcel);
    $('btn-pdf').addEventListener('click', () => descargarVista('pdf'));
    $('btn-pdf-todos').addEventListener('click', () => descargarVista('pdf', true));
    $('btn-png').addEventListener('click', () => descargarVista('png'));
    $('btn-jpeg').addEventListener('click', () => descargarVista('jpeg'));
    $('btn-qr').addEventListener('click', abrirQR);
    $('qr-url').addEventListener('change', () => { try { escribirAlmacen(CLAVE_URL, $('qr-url').value.trim()); } catch (e) { /* sin almacenamiento */ } pintarQR(); });
    $('btn-qr-copiar').addEventListener('click', async () => {
      if (!enlaceQR) return;
      try { await navigator.clipboard.writeText(enlaceQR); mensaje('estado-qr', 'Enlace copiado.', 'ok'); } catch (e) { mensaje('estado-qr', 'No pude copiar automáticamente. Enlace: ' + enlaceQR, 'aviso'); }
    });
    $('btn-qr-png').addEventListener('click', async () => {
      const cv = $('qr-lienzo').querySelector('canvas');
      if (cv) descargarSeguro(await H.exportar.imagen(cv, 'png'), 'SlotNova_QR.png', 'estado-qr', 'image/png');
    });
    // Cierra los menús desplegables al tocar fuera de ellos
    document.addEventListener('click', (e) => document.querySelectorAll('details.menu[open]').forEach((m) => { if (!m.contains(e.target)) m.open = false; }));
    $('btn-imprimir').addEventListener('click', () => window.print());
    $('btn-entrada').addEventListener('click', () => { if (estado.datos) descargarSeguro(libroEntrada(estado.datos), 'SlotNova_Datos.xlsx', 'estado-carga'); });
    $('btn-plantilla').addEventListener('click', () => descargarSeguro(libroEntrada(null), 'SlotNova_Plantilla.xlsx', 'estado-carga'));

    // Eventos
    document.addEventListener('click', (e) => { if (e.target.closest('[data-accion="nuevo-evento"]')) abrirEvento(); });
    $('ev-tipo').addEventListener('change', () => { $('ev-color').value = TIPOS_EVENTO[$('ev-tipo').value].color; });
    $('ev-cursos').addEventListener('change', (e) => {
      const todos = $('ev-cursos-todos');
      if (e.target === todos && todos.checked) $('ev-cursos').querySelectorAll('input:not(#ev-cursos-todos)').forEach((i) => { i.checked = false; });
      else if (e.target !== todos) todos.checked = !$('ev-cursos').querySelector('input:not(#ev-cursos-todos):checked');
    });
    $('form-evento').addEventListener('submit', (e) => {
      e.preventDefault();
      const marcados = (fs) => Array.from($(fs).querySelectorAll('input:checked')).map((i) => i.value).filter(Boolean);
      const datosEv = { titulo: $('ev-titulo').value, tipo: $('ev-tipo').value, color: $('ev-color').value, dia: $('ev-dia').value,
        bloques: marcados('ev-bloques'), cursos: $('ev-cursos-todos').checked ? [] : marcados('ev-cursos'), nota: $('ev-nota').value.trim(), reservar: $('ev-reservar').checked };
      if (eventoEditando) datosEv.id = eventoEditando;
      const r = guardarEvento(datosEv);
      if (!r.ok) { mensaje('estado-evento', r.error, 'error'); return; }
      cerrarDialogo($('dlg-evento'));
      avisoEvento(r, eventoEditando ? 'actualizado' : 'agregado');
    });
    $('btn-borrar-evento').addEventListener('click', () => { if (!eventoEditando) return; const r = borrarEvento(eventoEditando); cerrarDialogo($('dlg-evento')); avisoEvento(r, 'eliminado'); });

    // Nombres
    $('btn-editar-nombres').addEventListener('click', () => { if (!estado.ef) return; mensaje('estado-nombres', ''); renderNombres(); abrirDialogo('dlg-nombres'); });

    // Vista por días en el celular: se vuelve a dibujar al girar o cambiar el tamaño
    if (esMovil.addEventListener) esMovil.addEventListener('change', () => { if (estado.actual) renderHorario(); });

    // Inicio de sesión
    $('form-acceso').addEventListener('submit', (e) => {
      e.preventDefault();
      const correo = $('acceso-correo').value.trim(), clave = $('acceso-clave').value, nombre = $('acceso-nombre').value.trim();
      const error = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? 'Escribe un correo válido, por ejemplo coordinacion@colegio.edu.co.'
        : clave.length < 6 ? 'La contraseña debe tener al menos 6 caracteres.'
          : modoAcceso === 'crear' && !nombre ? 'Escribe tu nombre para crear la cuenta.' : '';
      if (error) { mensaje('acceso-error', error, 'error'); return; }
      mensaje('acceso-error', '');
      $('acceso-clave').value = '';
      const deCorreo = correo.split('@')[0].split(/[._-]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
      entrar({ nombre: nombre || deCorreo, correo });
    });
    $('btn-acceso-modo').addEventListener('click', cambiarModoAcceso);
    document.querySelector('[data-accion="entrar-invitado"]').addEventListener('click', () => entrar({ nombre: 'Invitado', correo: '' }));
    $('btn-salir').addEventListener('click', () => {
      estado.sesion = null;
      try { localStorage.removeItem(CLAVE_SESION); } catch (e) { /* nada guardado */ }
      $('menu-cuenta').open = false;
      mostrarAcceso();
    });

    // Diálogos: Opciones, Mis horarios e IA (el asistente lo abre js/asistente.js)
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-abrir]');
      if (!b) return;
      if (b.dataset.abrir === 'opciones') { pintarOpciones(); abrirDialogo('dlg-opciones'); return; }
      if (b.dataset.abrir === 'ia') { pintarConfigIA(); abrirDialogo('dlg-ia'); return; }
      if (b.dataset.abrir !== 'horarios') return;
      mensaje('estado-guardados', '');
      renderGuardados();
      abrirDialogo('dlg-horarios');
      if (estado.actual) {
        const campo = $('nombre-horario');
        if (!campo.value) campo.value = estado.nombre || nombreSugerido();
        campo.focus(); campo.select();
      }
    });
    document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) cerrarDialogo(d); }));
    document.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => cerrarDialogo(b.closest('dialog'))));
    $('form-opciones').addEventListener('change', leerOpciones);
    $('op-restablecer').addEventListener('click', () => { opciones = Object.assign({}, OPCIONES_BASE); aplicarOpciones(); pintarOpciones(); });
    $('form-guardar').addEventListener('submit', (e) => { e.preventDefault(); guardarHorario($('nombre-horario').value); });

    // IA recordada en este navegador (solo si el usuario marcó «Recordar»)
    const iaGuardada = leerAlmacen(CLAVE_IA, null);
    if (iaGuardada && iaGuardada.clave) Object.assign(estado.ia, iaGuardada, { recordar: true, activa: iaGuardada.activa !== false });

    leerTiempo();
    renderBloques();
    renderGuardados();
    estadoIA();
    iniciarNavegacion();
    actualizarVisibilidad();

    // Enlace de un QR: se abre el visor de solo lectura, sin inicio de sesión
    if (/^#ver=/.test(location.hash)) { iniciarVisor(location.hash.slice(5)); return; }
    estado.sesion = leerAlmacen(CLAVE_SESION, null);
    if (estado.sesion && estado.sesion.nombre) pintarCuenta(); else { estado.sesion = null; mostrarAcceso(); }
  }

  // API para el asistente (js/asistente.js) y para las pruebas
  H.app = {
    estado, irA, iaLista, estadoIA, mostrarCarga, ocultarCarga, abrirDialogo, cerrarDialogo,
    sugerencias: sugerenciasCambio, resumen: resumenParaIA, herramientas: HERRAMIENTAS, ejecutar: ejecutarHerramienta, compartido: compartidoDesdeEstado,
    interpretarLocal: (texto) => (estado.ef ? H.reglas.interpretarLocal(texto, estado.ef) : { reglas: [], dudas: ['Primero sube tu Excel en la pestaña Datos.'] }),
    describirRegla: (r) => H.reglas.describir(r, estado.ef),
    aplicarPropuesta(reglas, texto) {
      estado.reglas = estado.reglas.concat(reglas);
      return aplicarReglas('Cambio agregado: ' + (texto || reglas.map((r) => H.reglas.describir(r, estado.ef)).join(' ')));
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
