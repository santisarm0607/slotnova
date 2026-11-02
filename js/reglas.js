/* HorarIA · reglas.js
 * Reglas del coordinador: formato JSON, validación, descripción en español,
 * intérprete local (sin internet) y conexión opcional con un modelo de IA.
 *
 * Tipos de regla:
 *   bloquear_docente  { docente, dias:[], bloques:[] }            obligatoria
 *   prohibir          { curso?, asignatura?, docente?, dias:[], bloques:[] }  obligatoria
 *   evitar            { curso?, asignatura?, docente?, dias:[], bloques:[] }  preferencia
 *   max_por_dia       { curso?, asignatura?, max }                 obligatoria
 * Listas vacías = "todos".
 */
(function (root) {
  const H = (root.HorarIA = root.HorarIA || {});

  const norm = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const lista = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
  const TIPOS = ['bloquear_docente', 'prohibir', 'evitar', 'max_por_dia'];
  const NUMEROS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, cero: 0, ninguna: 0 };
  const ORDINALES = { primer: 1, primera: 1, primero: 1, segunda: 2, segundo: 2, tercera: 3, tercer: 3, tercero: 3, cuarta: 4, cuarto: 4, quinta: 5, quinto: 5, sexta: 6, sexto: 6 };

  // Palabras con las que la gente nombra cada asignatura
  const ALIAS_ASIGNATURA = {
    'matematicas': ['matematicas', 'matematica', 'mates', 'mate', 'algebra', 'geometria'],
    'lenguaje': ['lenguaje', 'espanol', 'castellano', 'lengua', 'lectura'],
    'ciencias naturales': ['ciencias naturales', 'naturales', 'biologia', 'laboratorio'],
    'ciencias sociales': ['ciencias sociales', 'sociales', 'historia', 'geografia'],
    'ingles': ['ingles', 'english'],
    'educacion fisica': ['educacion fisica', 'ed fisica', 'ed. fisica', 'fisica', 'deporte', 'deportes', 'gimnasia', 'cancha'],
    'tecnologia e informatica': ['tecnologia e informatica', 'tecnologia', 'informatica', 'sistemas', 'computacion'],
    'educacion artistica': ['educacion artistica', 'artistica', 'artes', 'arte', 'musica', 'dibujo'],
    'etica y valores': ['etica y valores', 'etica', 'valores'],
    'educacion religiosa': ['educacion religiosa', 'religiosa', 'religion'],
  };

  // ---------- Catálogo a partir de los datos ----------
  function catalogo(datos) {
    const asignaturas = Array.from(new Set(datos.carga.map((c) => c.asignatura)));
    return {
      asignaturas,
      cursos: datos.cursos.map((c) => c.id),
      docentes: datos.docentes.map((d) => ({ id: d.id, nombre: d.nombre })),
      dias: datos.dias.slice(),
      bloques: datos.bloques.map((b) => ({ id: b.id, inicio: b.inicio, fin: b.fin })),
    };
  }

  // "D02" y "D2" son el mismo docente (la ficha escribe D02 y el Excel D2)
  const idCanonico = (t) => { const m = /^([a-z]+)0*(\d+)$/i.exec(String(t).trim()); return m ? m[1].toLowerCase() + parseInt(m[2], 10) : norm(t); };

  function buscarDocente(valor, datos) {
    if (!valor) return null;
    const v = norm(valor).replace(/^(el|la|los|las)\s+/, '').replace(/^(profe|profesor|profesora|docente|maestro|maestra)\s+/, '');
    let d = datos.docentes.find((x) => idCanonico(x.id) === idCanonico(v) || norm(x.nombre) === v);
    if (d) return d.id;
    const coincide = datos.docentes.filter((x) => norm(x.nombre).split(' ').includes(v));
    return coincide.length === 1 ? coincide[0].id : null;
  }
  function buscarAsignatura(valor, datos) {
    if (!valor) return null;
    const v = norm(valor);
    const asignaturas = Array.from(new Set(datos.carga.map((c) => c.asignatura)));
    const exacta = asignaturas.find((a) => norm(a) === v);
    if (exacta) return exacta;
    for (const a of asignaturas) {
      const alias = ALIAS_ASIGNATURA[norm(a)] || [norm(a)];
      if (alias.includes(v)) return a;
    }
    return null;
  }
  function buscarCurso(valor, datos) {
    if (!valor) return null;
    const v = norm(valor).replace(/\s+/g, '').replace(/^sexto/, '6').replace(/^septimo/, '7').replace(/^octavo/, '8').replace(/^noveno/, '9');
    const c = datos.cursos.find((x) => norm(x.id).replace(/\s+/g, '') === v || norm(x.nombre).replace(/\s+/g, '') === v);
    return c ? c.id : null;
  }
  function buscarDia(valor, datos) {
    const v = norm(valor);
    return datos.dias.find((d) => norm(d) === v || norm(d).slice(0, 3) === v) || null;
  }
  function buscarBloque(valor, datos) {
    const v = norm(valor);
    const b = datos.bloques.find((x) => norm(x.id) === v || idCanonico(x.id) === idCanonico(v));
    if (b) return b.id;
    if (/^\d+$/.test(v)) { const i = parseInt(v, 10) - 1; return datos.bloques[i] ? datos.bloques[i].id : null; }
    if (ORDINALES[v]) { const i = ORDINALES[v] - 1; return datos.bloques[i] ? datos.bloques[i].id : null; }
    if (v === 'ultima' || v === 'ultimo') return datos.bloques[datos.bloques.length - 1].id;
    return null;
  }

  /** Revisa una regla (de la IA o del intérprete local) y la deja con IDs válidos */
  function normalizarRegla(r, datos) {
    if (!r || typeof r !== 'object') return { ok: false, error: 'La regla no tiene el formato esperado.' };
    const tipo = norm(r.tipo).replace(/\s+/g, '_');
    if (!TIPOS.includes(tipo)) return { ok: false, error: 'Tipo de regla desconocido: "' + r.tipo + '".' };
    const out = { tipo, texto: r.texto || '', origen: r.origen || 'ia' };
    const errores = [];
    if (r.docente) { out.docente = buscarDocente(r.docente, datos); if (!out.docente) errores.push('No existe el docente "' + r.docente + '".'); }
    if (r.asignatura) { out.asignatura = buscarAsignatura(r.asignatura, datos); if (!out.asignatura) errores.push('No existe la asignatura "' + r.asignatura + '".'); }
    if (r.curso) { out.curso = buscarCurso(r.curso, datos); if (!out.curso) errores.push('No existe el curso "' + r.curso + '".'); }
    if (tipo !== 'max_por_dia') {
      out.dias = lista(r.dias).map((d) => { const x = buscarDia(d, datos); if (!x) errores.push('Día desconocido: "' + d + '".'); return x; }).filter(Boolean);
      out.bloques = lista(r.bloques).map((b) => { const x = buscarBloque(b, datos); if (!x) errores.push('Bloque desconocido: "' + b + '".'); return x; }).filter(Boolean);
    }
    if (tipo === 'bloquear_docente' && !out.docente) errores.push('Falta decir qué docente no está disponible.');
    if (tipo === 'bloquear_docente' && !out.dias.length && !out.bloques.length) errores.push('Falta decir qué día o bloque no está disponible el docente.');
    if ((tipo === 'prohibir' || tipo === 'evitar') && !out.curso && !out.asignatura && !out.docente) errores.push('Falta decir qué clase se prohíbe o se evita.');
    if ((tipo === 'prohibir' || tipo === 'evitar') && !out.dias.length && !out.bloques.length) errores.push('Falta decir en qué día o bloque.');
    if (tipo === 'max_por_dia') {
      out.max = Number(r.max);
      if (!Number.isInteger(out.max) || out.max < 0) errores.push('El máximo por día debe ser un número entero.');
    }
    if (errores.length) return { ok: false, error: errores.join(' '), regla: out };
    return { ok: true, regla: out };
  }

  /** Describe una regla en español para mostrarla en pantalla */
  function describir(r, datos) {
    const doc = (id) => { const d = datos.docentes.find((x) => x.id === id); return d ? d.nombre + ' (' + id + ')' : id; };
    const lugar = () => {
      const dias = lista(r.dias), bloques = lista(r.bloques);
      const td = dias.length === 1 ? 'el ' + dias[0].toLowerCase() : 'los días ' + unir(dias.map((d) => d.toLowerCase()));
      const tb = 'en ' + unir(bloques);
      if (dias.length && bloques.length) return td + ' ' + tb;
      if (dias.length) return td + ' (todo el día)';
      if (bloques.length) return tb + ' (todos los días)';
      return 'toda la semana';
    };
    const quien = () => [r.asignatura || '', r.curso ? 'de ' + r.curso : '', r.docente ? 'con ' + doc(r.docente) : ''].filter(Boolean).join(' ') || 'clases';
    switch (r.tipo) {
      case 'bloquear_docente': return doc(r.docente) + ' no está disponible ' + lugar() + '.';
      case 'prohibir': return 'Nunca ' + quien() + ' ' + lugar() + '.';
      case 'evitar': return 'Mejor evitar ' + quien() + ' ' + lugar() + '.';
      case 'max_por_dia': return 'Máximo ' + r.max + (r.max === 1 ? ' sesión' : ' sesiones') + ' de ' + (r.asignatura || 'cada asignatura') + ' por día' + (r.curso ? ' en ' + r.curso : '') + '.';
      default: return JSON.stringify(r);
    }
  }
  function unir(a) { return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1]; }
  const ETIQUETA_TIPO = { bloquear_docente: 'Docente no disponible', prohibir: 'Obligatoria', evitar: 'Preferencia', max_por_dia: 'Límite diario' };

  // ------------------------------------------------------------------
  // Intérprete local: entiende frases comunes sin internet (plan B de la IA)
  // ------------------------------------------------------------------
  function interpretarLocal(texto, datos) {
    const reglas = [], dudas = [];
    const frases = String(texto || '').split(/[.;\n]+/).map((f) => f.trim()).filter(Boolean);
    frases.forEach((frase) => {
      const r = interpretarFrase(frase, datos);
      if (r.duda) dudas.push(r.duda);
      else {
        const n = normalizarRegla(Object.assign({ texto: frase, origen: 'local' }, r.regla), datos);
        if (n.ok) reglas.push(n.regla); else dudas.push('«' + frase + '»: ' + n.error);
      }
    });
    return { reglas, dudas };
  }

  function interpretarFrase(frase, datos) {
    // Los IDs con ceros a la izquierda (D02, B01) se escriben como en los datos (D2, B1)
    const t = (' ' + norm(frase).replace(/[¿?¡!,:()"]/g, ' ').replace(/\s+/g, ' ') + ' ').replace(/ ([a-z])0+(\d+)(?= )/g, ' $1$2');

    // Docente: por ID (D2), nombre completo, nombre o apellido
    let docente = null, largoDoc = 0;
    datos.docentes.forEach((d) => {
      const candidatos = [idCanonico(d.id), norm(d.nombre)].concat(norm(d.nombre).split(' ').filter((x) => x.length > 2));
      candidatos.forEach((c) => { if (t.includes(' ' + c + ' ') && c.length > largoDoc) { docente = d.id; largoDoc = c.length; } });
    });

    // Asignatura: el alias más largo que aparezca
    let asignatura = null, largoAsig = 0;
    Array.from(new Set(datos.carga.map((c) => c.asignatura))).forEach((a) => {
      (ALIAS_ASIGNATURA[norm(a)] || [norm(a)]).forEach((al) => {
        if (t.includes(' ' + al + ' ') && al.length > largoAsig) { asignatura = a; largoAsig = al.length; }
      });
    });

    // Curso
    let curso = null;
    const tc = t.replace(/ sexto /g, ' 6').replace(/ septimo /g, ' 7').replace(/ octavo /g, ' 8').replace(/ noveno /g, ' 9');
    datos.cursos.forEach((c) => {
      const id = norm(c.id).replace(/\s+/g, '');
      const re = new RegExp('[ ]' + id.replace(/(\d+)([a-z]+)/, '$1 ?$2') + '[ ]');
      if (re.test(tc)) curso = c.id;
    });

    // Días
    let dias = datos.dias.filter((d) => t.includes(' ' + norm(d) + ' ') || t.includes(' ' + norm(d) + 's '));
    if (/ (toda la semana|todos los dias|todo el tiempo) /.test(t)) dias = [];

    // Bloques
    const bloques = new Set();
    datos.bloques.forEach((b) => { if (t.includes(' ' + norm(b.id) + ' ')) bloques.add(b.id); });
    const reOrd = / (primer|primera|primero|segunda|segundo|tercera|tercer|tercero|cuarta|cuarto|quinta|quinto|sexta|sexto|ultima|ultimo) (hora|bloque|clase|periodo)/g;
    let m;
    while ((m = reOrd.exec(t))) { const b = buscarBloque(m[1], datos); if (b) bloques.add(b); }
    if (/ a primera hora | de primeras | a primera /.test(t)) bloques.add(datos.bloques[0].id);
    if (/ a ultima hora | de ultimas | a ultima /.test(t)) bloques.add(datos.bloques[datos.bloques.length - 1].id);
    const horaMin = (h) => { const p = String(h).split(':'); return parseInt(p[0], 10) * 60 + (parseInt(p[1] || '0', 10) || 0); };
    const conHora = datos.bloques.filter((b) => b.inicio);
    const reA = / a las (\d{1,2})(?::(\d{2}))? /g;
    while ((m = reA.exec(t))) {
      let h = parseInt(m[1], 10); if (h < 6) h += 12;
      const min = h * 60 + (parseInt(m[2] || '0', 10));
      const b = conHora.find((x) => horaMin(x.inicio) <= min && min < horaMin(x.fin || '23:59'));
      if (b) bloques.add(b.id);
    }
    const reAntes = / antes de las (\d{1,2})(?::(\d{2}))? /.exec(t);
    if (reAntes) { let h = parseInt(reAntes[1], 10); if (h < 6) h += 12; const lim = h * 60 + parseInt(reAntes[2] || '0', 10); conHora.forEach((b) => { if (horaMin(b.inicio) < lim) bloques.add(b.id); }); }
    const reDesp = / (despues de las|desde las) (\d{1,2})(?::(\d{2}))? /.exec(t);
    if (reDesp) { let h = parseInt(reDesp[2], 10); if (h < 6) h += 12; const lim = h * 60 + parseInt(reDesp[3] || '0', 10); conHora.forEach((b) => { if (horaMin(b.inicio) >= lim) bloques.add(b.id); }); }
    const bl = Array.from(bloques).sort((a, b) => datos.bloques.findIndex((x) => x.id === a) - datos.bloques.findIndex((x) => x.id === b));

    // 1) Máximo por día
    const mMax = / (maximo|max|no mas de|maximo de|hasta) (\d+|un|una|uno|dos|tres|cuatro|cinco|seis) (hora|horas|clase|clases|sesion|sesiones|bloque|bloques)\b/.exec(t);
    if (mMax && / (dia|diaria|diarias|diario|por dia|al dia) /.test(t)) {
      const max = /^\d+$/.test(mMax[2]) ? parseInt(mMax[2], 10) : NUMEROS[mMax[2]];
      return { regla: { tipo: 'max_por_dia', asignatura, curso, max } };
    }

    const ausencia = / (no puede|no podra|no viene|no vendra|no va a venir|no asiste|no asistira|no esta|no estara|no trabaja|falta|faltara|ausente|incapacitad[oa]|incapacidad|permiso|licencia|cita medica|calamidad|no disponible|enferm[oa]|capacitacion|reunion) /.test(t);
    const preferencia = / (evitar|evita|evitemos|preferible|preferiblemente|prefiero|mejor|ojala|en lo posible|si se puede|idealmente|de ser posible) /.test(t);
    const negacion = / (no|nunca|jamas|prohibido|prohibir|prohibe|sin) /.test(t);

    // 2) Docente ausente (sin asignatura: es el docente el que no está)
    if (docente && !asignatura && ausencia) {
      if (!dias.length && !bl.length) return { duda: '«' + frase + '»: ¿qué día o en qué bloque no puede ' + nombreDe(docente, datos) + '?' };
      return { regla: { tipo: 'bloquear_docente', docente, dias, bloques: bl } };
    }

    // 3) Prohibir o evitar una clase en ciertos días o bloques
    if ((asignatura || curso || docente) && (dias.length || bl.length) && (negacion || preferencia || ausencia)) {
      return { regla: { tipo: preferencia ? 'evitar' : 'prohibir', asignatura, curso, docente, dias, bloques: bl } };
    }

    if ((asignatura || docente || curso) && !dias.length && !bl.length) {
      return { duda: '«' + frase + '»: entendí ' + [asignatura, curso, docente && nombreDe(docente, datos)].filter(Boolean).join(', ') + ', pero no en qué día o bloque.' };
    }
    return { duda: '«' + frase + '»: no la entendí. Prueba con algo como «Luis no viene el martes» o «No quiero Educación física a primera hora».' };
  }
  function nombreDe(id, datos) { const d = datos.docentes.find((x) => x.id === id); return d ? d.nombre : id; }

  // ------------------------------------------------------------------
  // Agente de IA (opcional): convierte texto en reglas con un modelo de lenguaje
  // ------------------------------------------------------------------
  function promptSistema(datos) {
    const c = catalogo(datos);
    return [
      'Eres el agente de SlotNova, una aplicación que genera horarios escolares sin conflictos.',
      'Tu única tarea es convertir lo que escribe el coordinador académico en reglas JSON para el motor de horarios. Nunca armes ni modifiques el horario tú mismo.',
      '',
      'CATÁLOGO (usa exactamente estos valores):',
      'Docentes: ' + c.docentes.map((d) => d.id + ' = ' + d.nombre).join('; '),
      'Asignaturas: ' + c.asignaturas.join('; '),
      'Cursos: ' + c.cursos.join(', '),
      'Días: ' + c.dias.join(', '),
      'Bloques: ' + c.bloques.map((b) => b.id + (b.inicio ? ' (' + b.inicio + '-' + b.fin + ')' : '')).join(', '),
      '',
      'TIPOS DE REGLA:',
      '- bloquear_docente: el docente no está disponible. Campos: docente (ID), dias, bloques.',
      '- prohibir: una clase nunca puede quedar en esos días o bloques. Campos opcionales: curso, asignatura, docente; y dias, bloques.',
      '- evitar: preferencia, mejor que la clase no quede ahí. Mismos campos que prohibir.',
      '- max_por_dia: máximo de sesiones de una asignatura por día en cada curso. Campos: asignatura (opcional), curso (opcional), max (entero).',
      'Listas vacías significan "todos". "Primera hora" es el primer bloque y "última hora" el último.',
      'Un ID con ceros a la izquierda es el mismo del catálogo: D02 = D2, B01 = B1.',
      '',
      'RESPONDE SOLO con un objeto JSON, sin texto antes ni después, con esta forma:',
      '{"reglas":[...], "respuesta":"una frase corta en español confirmando lo que entendiste", "dudas":["pregunta si algo es ambiguo"]}',
      'Si algo es ambiguo o no está en el catálogo, no inventes: no generes esa regla y escribe la pregunta en "dudas".',
      '',
      'EJEMPLOS:',
      'Usuario: "Luis no viene el martes"',
      '{"reglas":[{"tipo":"bloquear_docente","docente":"D2","dias":["Martes"],"bloques":[]}],"respuesta":"Listo: Luis Vega no estará disponible el martes.","dudas":[]}',
      'Usuario: "no quiero educación física a primera hora y máximo una hora de matemáticas al día"',
      '{"reglas":[{"tipo":"prohibir","asignatura":"Educación física","dias":[],"bloques":["B1"]},{"tipo":"max_por_dia","asignatura":"Matemáticas","max":1}],"respuesta":"Educación física nunca en B1 y como máximo una hora diaria de Matemáticas.","dudas":[]}',
    ].join('\n');
  }

  function extraerJson(texto) {
    const s = String(texto || '');
    const ini = s.indexOf('{'), fin = s.lastIndexOf('}');
    if (ini >= 0 && fin > ini) { try { return JSON.parse(s.slice(ini, fin + 1)); } catch (e) { /* sigue */ } }
    const ai = s.indexOf('['), af = s.lastIndexOf(']');
    if (ai >= 0 && af > ai) { try { return { reglas: JSON.parse(s.slice(ai, af + 1)) }; } catch (e) { /* sigue */ } }
    throw new Error('La IA no devolvió un JSON válido.');
  }

  /**
   * config: { proveedor: 'openai' | 'anthropic', url, modelo, clave }
   *  - 'openai': cualquier API compatible con /v1/chat/completions (OpenAI, Groq, OpenRouter, Gemini compatible, etc.)
   *  - 'anthropic': API de Claude (Messages API)
   */
  async function interpretarConIA(texto, datos, config) {
    if (!config || !config.clave) throw new Error('Falta la clave de la API.');
    if (!H.ia) throw new Error('Falta cargar js/ia.js.');
    // Claude o Gemini (ver js/ia.js); la respuesta es JSON con { reglas, respuesta, dudas }
    const contenido = await H.ia.completar(config, promptSistema(datos), texto);
    const datosIA = extraerJson(contenido);
    const reglas = [], dudas = lista(datosIA.dudas).map(String);
    lista(datosIA.reglas).forEach((r) => {
      const n = normalizarRegla(Object.assign({ texto, origen: 'ia' }, r), datos);
      if (n.ok) reglas.push(n.regla); else dudas.push(n.error);
    });
    return { reglas, dudas, respuesta: datosIA.respuesta || '' };
  }

  H.reglas = { TIPOS, ETIQUETA_TIPO, catalogo, normalizarRegla, describir, interpretarLocal, promptSistema, extraerJson, interpretarConIA, buscarDocente, buscarAsignatura };
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
})(typeof window !== 'undefined' ? window : globalThis);
