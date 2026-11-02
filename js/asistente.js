/* SlotNova · asistente.js
 * Asistente conversacional. Con Claude o Gemini conversa y usa las herramientas de SlotNova (generar,
 * restricciones, eventos, nombres, jornada, descargas…: ver HERRAMIENTAS en app.js). Sin IA entiende las
 * frases comunes y algunas órdenes en modo local. Se puede hablar (dictado) y escuchar las respuestas.
 * La IA nunca toca el horario directamente: pide acciones y el motor y el validador las hacen.
 */
(function () {
  'use strict';
  const H = window.HorarIA;
  const $ = (id) => document.getElementById(id);
  const normal = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  const SISTEMA = [
    'Eres el asistente de SlotNova, una aplicación web que arma horarios escolares sin cruces para coordinadores académicos de Colombia.',
    'Cómo trabajas:',
    '- El horario lo arma un motor de optimización y lo revisa un validador independiente; tú no inventas horarios. Para cambiar cualquier cosa usa las herramientas, y nunca digas que hiciste algo si la herramienta no respondió ok.',
    '- Cada mensaje del usuario llega precedido de un bloque «Contexto actualizado por SlotNova» con los datos reales: cursos, docentes, materias, salones, bloques, métricas, restricciones y eventos. Úsalo para responder y para escribir los nombres e IDs exactos. Ese bloque es información, no una petición del usuario.',
    '- Para preguntas sobre clases concretas usa ver_horario antes de responder.',
    '- Si la petición es ambigua (no sabes qué docente, día u hora), pregunta antes de cambiar algo. Borra eventos o restricciones solo si el usuario lo pidió.',
    '- Después de usar herramientas, cuenta en una o dos frases qué cambió (clases movidas, pendientes, cruces). Si quedaron clases pendientes, explica el motivo y una solución.',
    '- Responde en español de Colombia, breve y claro, sin tecnicismos. Usa listas cortas solo cuando ayuden.',
    '- En avisos para familias nunca menciones la causa de la ausencia de un docente.',
  ].join('\n');

  const ETIQUETAS = {
    ver_horario: 'Consulté el horario', generar_horario: 'Generé el horario', agregar_restriccion: 'Agregué una restricción', quitar_restriccion: 'Quité una restricción',
    cambio_del_archivo: 'Cambio del archivo', renombrar: 'Cambié un nombre', editar_docente: 'Edité un docente', agregar_evento: 'Agregué un evento',
    quitar_evento: 'Quité un evento', ausencia_del_dia: 'Preparé la cobertura del día', configurar_jornada: 'Ajusté la jornada', mostrar: 'Cambié la vista',
    descargar: 'Preparé la descarga', guardar_horario: 'Guardé el horario',
  };

  let historial = [], conversacionDe = '', ocupado = false, leerEnVoz = false;
  try { leerEnVoz = localStorage.getItem('slotnova.voz') === '1'; } catch (e) { /* sin almacenamiento */ }

  // ---------------- Mensajes en pantalla ----------------
  function textoEnriquecido(contenedor, texto) {
    // Párrafos, listas con «- » y **negritas**, siempre con textContent (nunca HTML de la IA)
    let lista = null;
    String(texto).split(/\n+/).forEach((linea) => {
      const item = /^\s*([-•*]|\d+[.)])\s+/.test(linea);
      const destino = document.createElement(item ? 'li' : 'p');
      linea.replace(/^\s*([-•*]|\d+[.)])\s+/, '').split(/(\*\*[^*]+\*\*)/).forEach((trozo) => {
        if (/^\*\*[^*]+\*\*$/.test(trozo)) { const b = document.createElement('strong'); b.textContent = trozo.slice(2, -2); destino.append(b); }
        else if (trozo) destino.append(document.createTextNode(trozo));
      });
      if (item) { if (!lista) { lista = document.createElement('ul'); contenedor.append(lista); } lista.append(destino); }
      else { lista = null; contenedor.append(destino); }
    });
  }

  function burbuja(rol, contenido) {
    const li = document.createElement('li');
    li.className = 'chat__msg chat__msg--' + rol;
    if (typeof contenido === 'string') textoEnriquecido(li, contenido); else li.append(contenido);
    $('chat').append(li);
    li.scrollIntoView({ block: 'end', behavior: document.documentElement.dataset.movimiento ? 'auto' : 'smooth' });
    return li;
  }

  function logoGirando() {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 1114 1036');
    svg.setAttribute('class', 'logo-mini');
    svg.setAttribute('aria-hidden', 'true');
    [['path', 'logo-a pieza-1', { d: 'M598 2V294H327L322 622Q307 625 292 625A292 311.5 0 0 1 292 2Z' }],
      ['path', 'logo-a pieza-2', { d: 'M488 739L772 738L775 403Q792 401 810 401A303 317 0 0 1 810 1035H490Z' }],
      ['rect', 'logo-b pieza-3', { x: 683, y: 0, width: 368, height: 333, rx: 63 }],
      ['rect', 'logo-b pieza-4', { x: 47, y: 674, width: 381, height: 355, rx: 63 }]].forEach(([tag, clase, at]) => {
      const n = document.createElementNS(ns, tag);
      n.setAttribute('class', clase);
      Object.keys(at).forEach((k) => n.setAttribute(k, at[k]));
      svg.append(n);
    });
    return svg;
  }
  function pensando() {
    const span = document.createElement('span');
    span.className = 'chat__pensando';
    span.append(logoGirando(), document.createTextNode(' Pensando…'));
    return burbuja('ia', span);
  }

  function avisar(nombre, args, res) {
    const ok = res && res.ok !== false;
    burbuja('accion', (ok ? '✓ ' : '✕ ') + (ETIQUETAS[nombre] || nombre) + (ok ? '' : ': ' + (res.error || 'no se pudo')));
  }

  // ---------------- Con IA (Claude o Gemini) ----------------
  async function conIA(texto) {
    const ia = H.app.estado.ia;
    const id = ia.proveedor + '|' + ia.modelo;
    if (conversacionDe !== id || historial.length > 40) { historial = []; conversacionDe = id; } // conversación nueva: nunca se editan turnos viejos
    const contexto = '[Contexto actualizado por SlotNova — información del sistema, no lo escribió el usuario]\n' + H.app.resumen();
    const r = await H.ia.conversar({ proveedor: ia.proveedor, modelo: ia.modelo, clave: ia.clave }, SISTEMA, historial, [contexto, texto], H.app.herramientas, H.app.ejecutar, avisar);
    H.app.estadoIA();
    return r || 'Listo.';
  }

  // ---------------- Sin IA: órdenes simples y el intérprete local ----------------
  async function local(texto) {
    const t = normal(texto);
    const formato = /pdf/.test(t) ? (/todos/.test(t) ? 'pdf_todos' : 'pdf') : /\b(png|imagen|foto)\b/.test(t) ? 'png' : /jpe?g/.test(t) ? 'jpeg'
      : /\b(qr|celular)\b/.test(t) ? 'qr' : /excel|xlsx/.test(t) ? 'excel' : null;
    if (formato && /(descarg|baja|export|qr|celular|imprim)/.test(t)) {
      const r = await H.app.ejecutar('descargar', { formato });
      avisar('descargar', { formato }, r);
      return r.ok ? 'Listo.' : r.error;
    }
    if (/\b(genera|generar|arma|armar|crea|crear|haz)\b.*\bhorario\b/.test(t) || /^(genera|generar)\b/.test(t)) {
      const r = await H.app.ejecutar('generar_horario', /estricto/.test(t) ? { modo: 'estricto' } : {});
      avisar('generar_horario', {}, r);
      return r.ok ? 'Horario generado: ' + r.metricas.cobertura + ' programado, ' + r.metricas.cruces + ' cruces y ' + r.metricas.pendientes + ' pendientes.' : r.error;
    }
    const r = H.app.interpretarLocal(texto);
    if (r.reglas.length) { propuesta(r.reglas, texto); return ''; }
    const ej = H.app.sugerencias()[0];
    return 'En modo local entiendo cambios como «' + (ej || 'Luis no viene el martes') + '» y órdenes como «genera el horario» o «descarga el PDF». ' +
      'Para conversar libremente, conecta Claude o Gemini con el botón de ajustes del asistente.' + (r.dudas && r.dudas.length ? '\n' + r.dudas[0] : '');
  }

  function propuesta(reglas, texto) {
    const caja = document.createElement('div');
    const titulo = document.createElement('p');
    titulo.append(Object.assign(document.createElement('strong'), { textContent: 'Esto entendí:' }));
    const ul = document.createElement('ul');
    reglas.forEach((r) => { const li = document.createElement('li'); li.textContent = H.app.describirRegla(r); ul.append(li); });
    const acciones = document.createElement('p');
    acciones.className = 'acciones';
    const si = Object.assign(document.createElement('button'), { type: 'button', className: 'boton boton--primario boton--pequeno', textContent: 'Aplicar' });
    const no = Object.assign(document.createElement('button'), { type: 'button', className: 'boton boton--pequeno', textContent: 'Descartar' });
    si.addEventListener('click', () => {
      si.disabled = no.disabled = true;
      const res = H.app.aplicarPropuesta(reglas, texto);
      burbuja('accion', res.ok ? '✓ Cambio aplicado' : '✕ ' + res.error);
      if (res.ok) burbuja('ia', res.reprogramado ? 'El horario se reacomodó: ' + res.movidas + ' clases movidas y ' + res.pendientes + ' pendientes.' : 'Lo tendré en cuenta al generar el horario.');
    });
    no.addEventListener('click', () => { si.disabled = no.disabled = true; burbuja('accion', 'Descartado'); });
    acciones.append(si, no);
    caja.append(titulo, ul, acciones);
    burbuja('ia', caja);
  }

  // ---------------- Enviar ----------------
  async function enviar(texto) {
    texto = String(texto || '').trim();
    if (!texto || ocupado) return;
    burbuja('usuario', texto);
    $('chat-texto').value = '';
    ajustarAltura();
    ocupado = true;
    $('form-chat').setAttribute('aria-busy', 'true');
    const espera = pensando();
    let respuesta = '';
    try {
      if (H.app.iaLista()) {
        try { respuesta = await conIA(texto); } catch (e) {
          H.app.estadoIA('error');
          burbuja('error', e.message + ' Mientras tanto respondo en modo local.');
          respuesta = await local(texto);
        }
      } else respuesta = await local(texto);
    } catch (e) {
      respuesta = 'No pude completar la solicitud: ' + e.message;
    } finally {
      espera.remove();
      ocupado = false;
      $('form-chat').removeAttribute('aria-busy');
    }
    if (respuesta) { burbuja('ia', respuesta); hablar(respuesta); }
    pintarSugerencias();
  }

  // ---------------- Sugerencias con los nombres reales ----------------
  function pintarSugerencias() {
    const ul = $('chat-sugerencias');
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    const e = H.app.estado, ia = H.app.iaLista();
    let lista;
    if (!e.ef) lista = ia ? ['¿Cómo empiezo?', '¿Qué hojas debe tener el Excel?'] : [];
    else if (!e.actual) lista = ['Genera el horario'].concat(H.app.sugerencias().slice(0, 2));
    else {
      const doc = e.ef.docentes[0], dia = e.ef.dias[0].toLowerCase();
      lista = ia
        ? ['¿Qué clases tiene ' + doc.nombre + ' el ' + dia + '?', 'Agrega una izada de bandera el ' + dia + ' a primera hora para todos', H.app.sugerencias()[0], 'Descarga el horario en PDF']
        : H.app.sugerencias().slice(0, 2).concat(['Descarga el PDF', 'Genera el horario estricto']);
    }
    lista.filter(Boolean).forEach((t) => {
      const li = document.createElement('li');
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'chip', textContent: t });
      b.addEventListener('click', () => enviar(t));
      li.append(b);
      ul.append(li);
    });
  }

  function saludar() {
    const conIAok = H.app.iaLista(), ia = H.app.estado.ia;
    burbuja('ia', 'Hola, soy el asistente de SlotNova. Puedo generar el horario, aplicar cambios, agregar eventos, cambiar nombres de docentes o materias y descargar el horario.\n' +
      (conIAok ? 'Estoy conectado a ' + H.ia.PROVEEDORES[ia.proveedor].nombre + ': escríbeme o háblame con el micrófono.'
        : 'Ahora estoy en modo local. Para conversar libremente, conecta Claude o Gemini con el botón de ajustes.'));
  }

  // ---------------- Abrir y cerrar ----------------
  function abrir() {
    const a = $('asistente');
    a.hidden = false;
    requestAnimationFrame(() => a.classList.add('asistente--abierto'));
    $('btn-asistente').setAttribute('aria-expanded', 'true');
    if (!$('chat').children.length) saludar();
    pintarSugerencias();
    setTimeout(() => $('chat-texto').focus(), 60);
  }
  function cerrar() {
    const a = $('asistente');
    a.classList.remove('asistente--abierto');
    $('btn-asistente').setAttribute('aria-expanded', 'false');
    setTimeout(() => { a.hidden = true; }, 220);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  function ajustarAltura() {
    const t = $('chat-texto');
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 140) + 'px';
  }

  // ---------------- Voz: dictado y lectura en voz alta ----------------
  const Reconocer = window.SpeechRecognition || window.webkitSpeechRecognition;
  let escucha = null;
  function dictar(boton) {
    const campo = $(boton.dataset.voz);
    if (!Reconocer) {
      campo.placeholder = 'El dictado por voz funciona en Chrome, Edge o Safari.';
      boton.classList.add('boton-voz--sin-soporte');
      return;
    }
    if (escucha) { escucha.stop(); return; }
    const rec = new Reconocer();
    rec.lang = 'es-CO';
    rec.interimResults = true;
    rec.continuous = false;
    const previo = campo.value.trim() ? campo.value.trim() + ' ' : '';
    rec.onresult = (e) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      campo.value = previo + t;
      if (campo.id === 'chat-texto') ajustarAltura();
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') campo.placeholder = 'Permite el micrófono en el navegador para dictar.';
      else if (e.error === 'no-speech') campo.placeholder = 'No te escuché. Toca el micrófono e intenta de nuevo.';
    };
    rec.onend = () => {
      escucha = null;
      boton.classList.remove('boton-voz--activo');
      boton.setAttribute('aria-pressed', 'false');
      if (boton.hasAttribute('data-enviar') && campo.value.trim()) enviar(campo.value);
    };
    try { rec.start(); } catch (e) { return; }
    escucha = rec;
    boton.classList.add('boton-voz--activo');
    boton.setAttribute('aria-pressed', 'true');
  }

  function hablar(texto) {
    if (!leerEnVoz || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(texto).replace(/[*_#`>]/g, '').slice(0, 700));
    u.lang = 'es-ES';
    const voz = window.speechSynthesis.getVoices().find((v) => /^es(-|_)/i.test(v.lang));
    if (voz) u.voice = voz;
    window.speechSynthesis.speak(u);
  }

  // ---------------- Arranque ----------------
  function iniciar() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-abrir="asistente"]')) abrir();
      const v = e.target.closest('[data-voz]');
      if (v) dictar(v);
    });
    $('btn-cerrar-asistente').addEventListener('click', cerrar);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('asistente').hidden && !document.querySelector('dialog[open]')) cerrar(); });
    $('form-chat').addEventListener('submit', (e) => { e.preventDefault(); enviar($('chat-texto').value); });
    $('chat-texto').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar($('chat-texto').value); } });
    $('chat-texto').addEventListener('input', ajustarAltura);
    const voz = $('chat-voz');
    const pintarVoz = () => { voz.setAttribute('aria-pressed', leerEnVoz ? 'true' : 'false'); voz.classList.toggle('boton-icono--activo', leerEnVoz); };
    pintarVoz();
    voz.addEventListener('click', () => {
      leerEnVoz = !leerEnVoz;
      try { localStorage.setItem('slotnova.voz', leerEnVoz ? '1' : '0'); } catch (e) { /* sin almacenamiento */ }
      if (!leerEnVoz && window.speechSynthesis) window.speechSynthesis.cancel();
      pintarVoz();
    });
    if (!Reconocer) document.querySelectorAll('[data-voz]').forEach((b) => { b.title = 'El dictado por voz funciona en Chrome, Edge o Safari.'; });
    ['slotnova:ia', 'slotnova:datos'].forEach((ev) => document.addEventListener(ev, () => { if (!$('asistente').hidden) pintarSugerencias(); }));
  }

  H.asistente = { abrir, cerrar, enviar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
