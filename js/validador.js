/* HorarIA · validador.js
 * Validador INDEPENDIENTE: no confía en el motor. Revisa el horario final
 * fila por fila contra los datos originales y devuelve un certificado.
 * También calcula el puntaje de calidad pedagógica (0 a 100).
 *
 * Uso: const cert = HorarIA.validar(datos, filas, reglas);
 *      cert.ok  → true si todas las reglas duras se cumplen
 *      cert.verificaciones → [{ id, nombre, ok, errores: [...] }]
 *      cert.calidad → { puntaje, repetidas, mas2, huecos, detalle }
 *      cert.completo / cert.pendientes / cert.faltantes → sesiones que faltan (se informan aparte de las infracciones)
 *
 *      const rep = HorarIA.reporte(datos, filas, reglas, anterior, { modoDocente, pendientes });
 *      → requeridas, asignadas, válidas, pendientes, cobertura, colisiones por pares y categoría,
 *        infracciones, preferencias y, si hay horario anterior, la prueba de cambio.
 */
(function (root) {
  const H = (root.HorarIA = root.HorarIA || {});

  const norm = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const lista = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const enLugar = (r, dia, bloque) => {
    const dias = lista(r.dias), bloques = lista(r.bloques);
    return (!dias.length || dias.some((d) => norm(d) === norm(dia))) && (!bloques.length || bloques.some((b) => norm(b) === norm(bloque)));
  };
  const enClase = (r, f) => (!r.curso || norm(r.curso) === norm(f.curso)) && (!r.asignatura || norm(r.asignatura) === norm(f.asignatura)) && (!r.docente || norm(r.docente) === norm(f.docente));

  // opciones: { modoDocente: 'alternativas' | 'estricto' }. En estricto se exige el docente asignado en la Carga.
  function validar(datos, filas, reglas, opciones) {
    reglas = reglas || [];
    opciones = opciones || {};
    const v = [];
    const agregar = (id, nombre, errores) => v.push({ id, nombre, ok: errores.length === 0, errores });
    const clases = filas.filter((f) => f.asignatura);
    const docente = {}; datos.docentes.forEach((d) => { docente[d.id] = d; });
    const curso = {}; datos.cursos.forEach((c) => { curso[c.id] = c; });
    const salon = {}; datos.salones.forEach((s) => { salon[s.id] = s; });
    const diasValidos = new Set(datos.dias), bloquesValidos = new Set(datos.bloques.map((b) => b.id));
    const nombreDoc = (id) => (docente[id] ? docente[id].nombre + ' (' + id + ')' : id);

    // 1. Cada curso: un solo bloque a la vez (los bloques vacíos por sesiones pendientes se informan aparte)
    const e1 = [];
    const porCursoBloque = {};
    clases.forEach((f) => {
      if (!diasValidos.has(f.dia) || !bloquesValidos.has(f.bloque)) e1.push('Clase en un día o bloque que no existe: ' + f.dia + ' ' + f.bloque);
      const k = f.curso + '|' + f.dia + '|' + f.bloque;
      porCursoBloque[k] = (porCursoBloque[k] || 0) + 1;
    });
    Object.entries(porCursoBloque).forEach(([k, n]) => { if (n > 1) { const [c, d, b] = k.split('|'); e1.push(c + ' tiene ' + n + ' clases al mismo tiempo el ' + d + ' en ' + b + '.'); } });
    agregar('curso', 'Cada curso tiene una sola clase por bloque', e1);

    // 2. Intensidad: nunca más sesiones de las requeridas. Las que faltan son pendientes, no infracciones.
    const e2 = [];
    const cuenta = {};
    const faltantes = [];
    clases.forEach((f) => { const k = f.curso + '|' + f.asignatura; cuenta[k] = (cuenta[k] || 0) + 1; });
    datos.carga.forEach((x) => {
      const n = cuenta[x.curso + '|' + x.asignatura] || 0;
      if (n > x.sesiones) e2.push(x.curso + ' · ' + x.asignatura + ': tiene ' + n + ' sesiones y debe tener ' + x.sesiones + '.');
      if (n < x.sesiones) faltantes.push({ curso: x.curso, asignatura: x.asignatura, docente: x.principal, faltan: x.sesiones - n });
      delete cuenta[x.curso + '|' + x.asignatura];
    });
    Object.keys(cuenta).forEach((k) => e2.push('Clase que no está en la carga: ' + k.replace('|', ' · ')));
    agregar('intensidad', 'Ninguna asignatura supera su intensidad semanal', e2);

    // 3. Docente habilitado (en modo estricto, además, el docente asignado en la Carga)
    const e3 = [];
    const principal = {}; datos.carga.forEach((x) => { principal[x.curso + '|' + x.asignatura] = x.principal; });
    clases.forEach((f) => {
      const asignado = principal[f.curso + '|' + f.asignatura];
      if (!docente[f.docente]) e3.push(f.curso + ' · ' + f.asignatura + ': docente desconocido "' + f.docente + '".');
      else if (f.docente !== asignado && !(datos.habilitados[f.asignatura] || []).includes(f.docente)) e3.push(nombreDoc(f.docente) + ' no está habilitado para ' + f.asignatura + ' (' + f.curso + ').');
    });
    agregar('habilitado', 'Cada clase la da un docente habilitado para esa asignatura', unicos(e3));
    if (opciones.modoDocente === 'estricto') {
      const e3b = [];
      clases.forEach((f) => {
        const asignado = principal[f.curso + '|' + f.asignatura];
        if (asignado && f.docente !== asignado) e3b.push(f.curso + ' · ' + f.asignatura + ' la da ' + nombreDoc(f.docente) + ' y el docente asignado es ' + nombreDoc(asignado) + '.');
      });
      agregar('asignado', 'Cada clase la da el docente asignado en la Carga (modo estricto)', unicos(e3b));
    }

    // 4. Docente disponible (incluye escenario y reglas de bloqueo)
    const e4 = [];
    const bloqueos = reglas.filter((r) => r.tipo === 'bloquear_docente');
    clases.forEach((f) => {
      const dsp = datos.disponibilidad[f.docente] && datos.disponibilidad[f.docente][f.dia] ? datos.disponibilidad[f.docente][f.dia][f.bloque] : 1;
      const bloqueado = bloqueos.some((r) => norm(r.docente) === norm(f.docente) && enLugar(r, f.dia, f.bloque));
      if (dsp === 0 || bloqueado) e4.push(nombreDoc(f.docente) + ' no está disponible el ' + f.dia + ' en ' + f.bloque + ' (' + f.curso + ' · ' + f.asignatura + ').');
    });
    agregar('disponible', 'Cada docente está disponible en los bloques que tiene asignados', e4);

    // 5. Docente sin cruces
    const e5 = [];
    const porDocBloque = {};
    clases.forEach((f) => { const k = f.docente + '|' + f.dia + '|' + f.bloque; (porDocBloque[k] = porDocBloque[k] || []).push(f.curso); });
    Object.entries(porDocBloque).forEach(([k, cs]) => { if (cs.length > 1) { const [d, dia, b] = k.split('|'); e5.push(nombreDoc(d) + ' tiene ' + cs.length + ' clases a la vez el ' + dia + ' en ' + b + ' (' + cs.join(', ') + ').'); } });
    agregar('cruces_docente', 'Ningún docente tiene dos clases al mismo tiempo', e5);

    // 6. Máximo semanal
    const e6 = [];
    const cargaDoc = {};
    clases.forEach((f) => { cargaDoc[f.docente] = (cargaDoc[f.docente] || 0) + 1; });
    Object.entries(cargaDoc).forEach(([d, n]) => { if (docente[d] && docente[d].max != null && n > docente[d].max) e6.push(nombreDoc(d) + ' tiene ' + n + ' sesiones y su máximo es ' + docente[d].max + '.'); });
    agregar('maximo', 'Ningún docente supera su máximo de sesiones semanales', e6);

    // 7. Tipo de salón y capacidad
    const e7 = [];
    const tipoReq = {}; datos.carga.forEach((x) => { tipoReq[x.curso + '|' + x.asignatura] = x.tipoSalon; });
    clases.forEach((f) => {
      const s = salon[f.salon];
      const req = tipoReq[f.curso + '|' + f.asignatura];
      if (!s) { e7.push(f.curso + ' · ' + f.asignatura + ' (' + f.dia + ' ' + f.bloque + ') no tiene salón asignado.'); return; }
      if (req && s.tipo !== req) e7.push(f.curso + ' · ' + f.asignatura + ' necesita ' + req + ' y quedó en ' + s.nombre + ' (' + s.tipo + ').');
      if (curso[f.curso] && s.capacidad != null && s.capacidad < curso[f.curso].estudiantes) e7.push(s.nombre + ' (capacidad ' + s.capacidad + ') es pequeño para ' + f.curso + ' (' + curso[f.curso].estudiantes + ' estudiantes).');
    });
    agregar('salon', 'Cada clase está en un salón del tipo requerido y con capacidad suficiente', unicos(e7));

    // 8. Salón sin cruces
    const e8 = [];
    const porSalonBloque = {};
    clases.forEach((f) => { if (!f.salon) return; const k = f.salon + '|' + f.dia + '|' + f.bloque; (porSalonBloque[k] = porSalonBloque[k] || []).push(f.curso); });
    Object.entries(porSalonBloque).forEach(([k, cs]) => { if (cs.length > 1) { const [s, dia, b] = k.split('|'); e8.push((salon[s] ? salon[s].nombre : s) + ' tiene ' + cs.length + ' clases a la vez el ' + dia + ' en ' + b + ' (' + cs.join(', ') + ').'); } });
    agregar('cruces_salon', 'Ningún salón tiene dos clases al mismo tiempo', e8);

    // 9. Reglas del coordinador (prohibir y máximo por día)
    const duras = reglas.filter((r) => r.tipo === 'prohibir' || r.tipo === 'max_por_dia');
    if (duras.length) {
      const e9 = [];
      reglas.filter((r) => r.tipo === 'prohibir').forEach((r) => {
        clases.forEach((f) => { if (enClase(r, f) && enLugar(r, f.dia, f.bloque)) e9.push('Regla "' + (r.texto || 'prohibir') + '": ' + f.curso + ' · ' + f.asignatura + ' quedó el ' + f.dia + ' en ' + f.bloque + '.'); });
      });
      reglas.filter((r) => r.tipo === 'max_por_dia').forEach((r) => {
        const c = {};
        clases.forEach((f) => { if (enClase(r, f)) { const k = f.curso + '|' + f.dia + '|' + f.asignatura; c[k] = (c[k] || 0) + 1; } });
        Object.entries(c).forEach(([k, n]) => { if (n > r.max) { const [cu, dia, a] = k.split('|'); e9.push(cu + ' tiene ' + n + ' sesiones de ' + a + ' el ' + dia + ' (máximo ' + r.max + ').'); } });
      });
      agregar('reglas', 'Se cumplen las reglas obligatorias del coordinador', e9);
    }

    const ok = v.every((x) => x.ok);
    const pendientes = faltantes.reduce((a, x) => a + x.faltan, 0);
    return { ok, completo: pendientes === 0, pendientes, faltantes, verificaciones: v, totalErrores: v.reduce((a, x) => a + x.errores.length, 0), calidad: calidad(datos, filas, reglas) };
  }

  /** Puntaje pedagógico: 100 = materias bien repartidas y sin huecos para docentes */
  function calidad(datos, filas, reglas) {
    const clases = filas.filter((f) => f.asignatura);
    let repetidas = 0, mas2 = 0, huecos = 0, evitadas = 0;
    const detalle = [];
    // Misma materia varias veces el mismo día
    const c = {};
    clases.forEach((f) => { const k = f.curso + '|' + f.dia + '|' + f.asignatura; c[k] = (c[k] || 0) + 1; });
    Object.entries(c).forEach(([k, n]) => {
      if (n >= 2) { repetidas += n - 1; }
      if (n >= 3) { mas2 += n - 2; const [cu, dia, a] = k.split('|'); detalle.push(cu + ': ' + n + ' horas de ' + a + ' el ' + dia + '.'); }
    });
    // Huecos de docentes
    const bloques = datos.bloques.map((b) => b.id);
    datos.docentes.forEach((d) => {
      datos.dias.forEach((dia) => {
        const ocupados = new Set(clases.filter((f) => f.docente === d.id && f.dia === dia).map((f) => bloques.indexOf(f.bloque)));
        if (!ocupados.size) return;
        const arr = Array.from(ocupados).sort((a, b) => a - b);
        const h = arr[arr.length - 1] - arr[0] + 1 - arr.length;
        if (h > 0) huecos += h;
      });
    });
    // Preferencias "evitar"
    (reglas || []).filter((r) => r.tipo === 'evitar').forEach((r) => {
      clases.forEach((f) => { if (enClase(r, f) && enLugar(r, f.dia, f.bloque)) evitadas++; });
    });
    const totalClases = Math.max(1, clases.length);
    // Cada materia repetida en el día resta poco; más de 2 horas resta mucho
    const puntaje = Math.max(0, Math.round(100 - (repetidas * 60 + mas2 * 300 + huecos * 40 + evitadas * 80) / totalClases));
    return { puntaje, repetidas, mas2, huecos, evitadas, detalle };
  }

  // ------------------------------------------------------------------
  // Reporte oficial con las definiciones de la guía de participantes.
  // Se calcula SOLO desde las filas finales (no confía en el motor).
  // ------------------------------------------------------------------
  /**
   * reporte(datos, filas, reglas, anterior, opciones)
   *  anterior: resultado previo ({ filas }) para medir la prueba de cambio (opcional)
   *  opciones: { modoDocente: 'alternativas' | 'estricto', pendientes: resultado.pendientes del motor (para explicar motivos) }
   */
  function reporte(datos, filas, reglas, anterior, opciones) {
    reglas = reglas || [];
    opciones = opciones || {};
    const modo = opciones.modoDocente === 'estricto' ? 'estricto' : 'alternativas';
    const clases = filas.filter((f) => f.asignatura);
    const docente = {}; datos.docentes.forEach((d) => { docente[d.id] = d; });
    const curso = {}; datos.cursos.forEach((c) => { curso[c.id] = c; });
    const salon = {}; datos.salones.forEach((s) => { salon[s.id] = s; });
    const carga = {}; datos.carga.forEach((x) => { carga[x.curso + '|' + x.asignatura] = x; });
    const idxBloque = {}; datos.bloques.forEach((b, i) => { idxBloque[b.id] = i; });
    const nombreDoc = (id) => (docente[id] ? docente[id].nombre + ' (' + id + ')' : String(id));
    const txt = (f) => f.curso + ' · ' + f.asignatura + ' · ' + f.dia + ' ' + f.bloque;
    const requeridas = datos.carga.reduce((a, x) => a + x.sesiones, 0);
    const bloqueos = reglas.filter((r) => r.tipo === 'bloquear_docente');
    const prohibidas = reglas.filter((r) => r.tipo === 'prohibir');
    const maximos = reglas.filter((r) => r.tipo === 'max_por_dia');
    const disponible = (f) => {
      const dsp = datos.disponibilidad[f.docente] && datos.disponibilidad[f.docente][f.dia] ? datos.disponibilidad[f.docente][f.dia][f.bloque] : 1;
      return dsp !== 0 && !bloqueos.some((r) => norm(r.docente) === norm(f.docente) && enLugar(r, f.dia, f.bloque));
    };
    const prohibida = (f) => prohibidas.some((r) => enClase(r, f) && enLugar(r, f.dia, f.bloque));

    // 1. Infracciones de cada fila
    const inf = { disponibilidad: [], docenteNoAsignado: [], docenteNoHabilitado: [], salonTipoCapacidad: [], maxSemanalDocente: [], intensidadExcedida: [], reglasCoordinador: [] };
    const conInfraccion = new Set();
    clases.forEach((f, i) => {
      const x = carga[f.curso + '|' + f.asignatura];
      const marcar = (lista, texto) => { lista.push(texto); conInfraccion.add(i); };
      if (!x) marcar(inf.intensidadExcedida, txt(f) + ': la asignatura no está en la carga del curso.');
      const habilitado = docente[f.docente] && ((datos.habilitados[f.asignatura] || []).includes(f.docente) || (x && x.principal === f.docente));
      if (!habilitado) marcar(inf.docenteNoHabilitado, txt(f) + ': ' + nombreDoc(f.docente) + ' no está habilitado para la asignatura.');
      else if (modo === 'estricto' && x && x.principal && f.docente !== x.principal) marcar(inf.docenteNoAsignado, txt(f) + ': la da ' + nombreDoc(f.docente) + ' y el docente asignado es ' + nombreDoc(x.principal) + '.');
      if (!disponible(f)) marcar(inf.disponibilidad, txt(f) + ': ' + nombreDoc(f.docente) + ' no está disponible.');
      const s = salon[f.salon];
      if (!s) marcar(inf.salonTipoCapacidad, txt(f) + ': sin salón asignado.');
      else {
        if (x && s.tipo !== x.tipoSalon) marcar(inf.salonTipoCapacidad, txt(f) + ': necesita ' + x.tipoSalon + ' y quedó en ' + s.nombre + ' (' + s.tipo + ').');
        if (curso[f.curso] && s.capacidad != null && s.capacidad < curso[f.curso].estudiantes) marcar(inf.salonTipoCapacidad, txt(f) + ': ' + s.nombre + ' tiene capacidad ' + s.capacidad + ' y el curso tiene ' + curso[f.curso].estudiantes + ' estudiantes.');
      }
      if (prohibida(f)) marcar(inf.reglasCoordinador, txt(f) + ': lo prohíbe una regla del coordinador.');
    });
    // Infracciones que dependen del total
    const porDoc = {}, porGrupo = {}, porDia = {};
    clases.forEach((f) => {
      porDoc[f.docente] = (porDoc[f.docente] || 0) + 1;
      const k = f.curso + '|' + f.asignatura; porGrupo[k] = (porGrupo[k] || 0) + 1;
      const kd = f.curso + '|' + f.dia + '|' + f.asignatura; porDia[kd] = (porDia[kd] || 0) + 1;
    });
    Object.entries(porDoc).forEach(([d, n]) => { if (docente[d] && docente[d].max != null && n > docente[d].max) inf.maxSemanalDocente.push(nombreDoc(d) + ': ' + n + ' sesiones y su máximo es ' + docente[d].max + '.'); });
    Object.entries(porGrupo).forEach(([k, n]) => { const x = carga[k]; if (x && n > x.sesiones) inf.intensidadExcedida.push(k.replace('|', ' · ') + ': ' + n + ' sesiones y la intensidad es ' + x.sesiones + ' (' + (n - x.sesiones) + ' sobrantes).'); });
    maximos.forEach((r) => Object.entries(porDia).forEach(([k, n]) => {
      const [cu, dia, a] = k.split('|');
      if (enClase(r, { curso: cu, asignatura: a }) && n > r.max) inf.reglasCoordinador.push(cu + ' · ' + a + ' · ' + dia + ': ' + n + ' sesiones y el máximo diario es ' + r.max + '.');
    }));
    const totalInfracciones = Object.values(inf).reduce((a, l) => a + l.length, 0);

    // 2. Colisiones: cada PAR de asignaciones que comparte curso, docente o salón en el mismo día y bloque
    const colisiones = { total: 0, porCurso: [], porDocente: [], porSalon: [] };
    const pares = (campo, lista, nombre) => {
      const grupos = {};
      clases.forEach((f) => { if (f[campo]) (grupos[f[campo] + '|' + f.dia + '|' + f.bloque] = grupos[f[campo] + '|' + f.dia + '|' + f.bloque] || []).push(f); });
      Object.values(grupos).forEach((fs) => {
        for (let a = 0; a < fs.length; a++) for (let b = a + 1; b < fs.length; b++) lista.push({ dia: fs[a].dia, bloque: fs[a].bloque, recurso: nombre(fs[a][campo]), a: txt(fs[a]), b: txt(fs[b]) });
      });
    };
    pares('curso', colisiones.porCurso, (id) => id);
    pares('docente', colisiones.porDocente, nombreDoc);
    pares('salon', colisiones.porSalon, (id) => (salon[id] ? salon[id].nombre : id));
    colisiones.total = colisiones.porCurso.length + colisiones.porDocente.length + colisiones.porSalon.length;

    // 3. Sesiones válidas: cumplen todas las reglas; la segunda fila de un cruce, las duplicadas y las sobrantes no cuentan
    const ocupado = new Set(), validasPorGrupo = {}, validasPorDoc = {}, validasPorDia = {};
    let validas = 0, sobrantes = 0;
    clases.forEach((f, i) => {
      if (conInfraccion.has(i)) return;
      const x = carga[f.curso + '|' + f.asignatura];
      const claves = ['c|' + f.curso, 'd|' + f.docente, 's|' + f.salon].map((k) => k + '|' + f.dia + '|' + f.bloque);
      if (claves.some((k) => ocupado.has(k))) return;
      const kG = f.curso + '|' + f.asignatura, kD = kG + '|' + f.dia;
      if ((validasPorGrupo[kG] || 0) >= x.sesiones) { sobrantes++; return; }
      const d = docente[f.docente];
      if (d && d.max != null && (validasPorDoc[f.docente] || 0) >= d.max) return;
      if (maximos.some((r) => enClase(r, f) && (validasPorDia[kD] || 0) >= r.max)) return;
      claves.forEach((k) => ocupado.add(k));
      validasPorGrupo[kG] = (validasPorGrupo[kG] || 0) + 1;
      validasPorDoc[f.docente] = (validasPorDoc[f.docente] || 0) + 1;
      validasPorDia[kD] = (validasPorDia[kD] || 0) + 1;
      validas++;
    });

    // 4. Pendientes con su motivo (el del motor si lo hay)
    const delMotor = {}; (opciones.pendientes || []).forEach((p) => { delMotor[p.curso + '|' + p.asignatura] = p; });
    const detallePendientes = [];
    datos.carga.forEach((x) => {
      const k = x.curso + '|' + x.asignatura, faltantes = x.sesiones - (validasPorGrupo[k] || 0);
      if (faltantes <= 0) return;
      const m = delMotor[k];
      const conProblemas = clases.some((f, i) => conInfraccion.has(i) && f.curso === x.curso && f.asignatura === x.asignatura);
      detallePendientes.push({
        curso: x.curso, asignatura: x.asignatura, docente: x.principal, docenteNombre: docente[x.principal] ? docente[x.principal].nombre : x.principal, faltantes,
        motivo: m ? m.motivo : conProblemas ? 'Hay sesiones de esta asignatura que incumplen reglas obligatorias (ver infracciones).' : 'No se ubicó en el horario sin cruces.',
        sugerencia: m ? m.sugerencia : 'Generar de nuevo o revisar las reglas activas.',
      });
    });

    // 5. Preferencias (se informan aparte de las reglas obligatorias)
    const celda = {}; clases.forEach((f) => { celda[f.curso + '|' + f.dia + '|' + idxBloque[f.bloque]] = f; });
    const consecutivas = [];
    datos.cursos.forEach((c) => datos.dias.forEach((dia) => {
      for (let b = 0; b + 1 < datos.bloques.length; b++) {
        const x = celda[c.id + '|' + dia + '|' + b], y = celda[c.id + '|' + dia + '|' + (b + 1)];
        if (x && y && x.asignatura === y.asignatura) consecutivas.push({ curso: c.id, asignatura: x.asignatura, dia, bloques: x.bloque + '-' + y.bloque });
      }
    }));
    const mismoDia = [];
    Object.entries(porDia).forEach(([k, n]) => { if (n >= 2) { const [cu, dia, a] = k.split('|'); mismoDia.push({ curso: cu, dia, asignatura: a, sesiones: n }); } });
    let repartidas = 0;
    datos.carga.forEach((x) => {
      const dias = new Set(clases.filter((f) => f.curso === x.curso && f.asignatura === x.asignatura).map((f) => f.dia));
      if (dias.size >= Math.min(porGrupo[x.curso + '|' + x.asignatura] || 0, datos.dias.length)) repartidas++;
    });
    const huecos = { total: 0, porDocente: {}, detalle: [] };
    datos.docentes.forEach((d) => {
      huecos.porDocente[d.id] = 0;
      datos.dias.forEach((dia) => {
        const ocupados = clases.filter((f) => f.docente === d.id && f.dia === dia).map((f) => idxBloque[f.bloque]).sort((a, b) => a - b);
        if (ocupados.length < 2) return;
        const libres = [];
        for (let b = ocupados[0] + 1; b < ocupados[ocupados.length - 1]; b++) if (!ocupados.includes(b)) libres.push(datos.bloques[b].id);
        if (libres.length) {
          huecos.total += libres.length; huecos.porDocente[d.id] += libres.length;
          huecos.detalle.push({ docente: d.id, nombre: d.nombre, dia, huecos: libres.length, bloques: libres });
        }
      });
    });
    const evitadas = [];
    reglas.filter((r) => r.tipo === 'evitar').forEach((r) => clases.forEach((f) => { if (enClase(r, f) && enLugar(r, f.dia, f.bloque)) evitadas.push(txt(f)); }));
    const preferencias = {
      puntaje: calidad(datos, filas, reglas).puntaje,
      consecutivas: { total: consecutivas.length, detalle: consecutivas },
      mismoDia: { total: mismoDia.length, detalle: mismoDia },
      repartidas: { cumplen: repartidas, total: datos.carga.length },
      huecosDocentes: huecos,
      evitar: { total: evitadas.length, detalle: evitadas },
    };

    // 6. Prueba de cambio: afectadas, movidas y pendientes respecto al horario anterior
    let cambio = null;
    if (anterior && anterior.filas) {
      const antes = anterior.filas.filter((f) => f.asignatura);
      const posicion = (f) => ({ dia: f.dia, bloque: f.bloque, inicio: f.inicio, fin: f.fin });
      const lugar = (f) => f.dia + '|' + f.bloque;
      const orden = (f) => datos.dias.indexOf(f.dia) * 100 + (idxBloque[f.bloque] || 0);
      const afectadas = antes.filter((f) => !disponible(f) || prohibida(f))
        .map((f) => Object.assign({ curso: f.curso, asignatura: f.asignatura, docente: f.docente, docenteNombre: f.docenteNombre }, posicion(f)));
      const esAfectada = new Set(afectadas.map((f) => f.curso + '|' + f.asignatura + '|' + lugar(f)));
      const agrupar = (lista) => { const m = {}; lista.forEach((f) => { (m[f.curso + '|' + f.asignatura] = m[f.curso + '|' + f.asignatura] || []).push(f); }); return m; };
      const A = agrupar(antes), D = agrupar(clases);
      const movidas = [], pendientesCambio = [], reasignadas = [], recuperadas = [];
      new Set(Object.keys(A).concat(Object.keys(D))).forEach((k) => {
        const a = A[k] || [], d = D[k] || [];
        const enD = new Set(d.map(lugar)), enA = new Set(a.map(lugar));
        const salen = a.filter((f) => !enD.has(lugar(f))).sort((x, y) => orden(x) - orden(y));
        const entran = d.filter((f) => !enA.has(lugar(f))).sort((x, y) => orden(x) - orden(y));
        salen.forEach((f, i) => {
          const g = entran[i];
          if (g) movidas.push({ curso: f.curso, asignatura: f.asignatura, docente: g.docente, docenteNombre: g.docenteNombre, antes: posicion(f), ahora: posicion(g), afectada: esAfectada.has(k + '|' + lugar(f)) });
          else pendientesCambio.push(Object.assign({ curso: f.curso, asignatura: f.asignatura, docente: f.docente, docenteNombre: f.docenteNombre }, posicion(f)));
        });
        entran.slice(salen.length).forEach((g) => recuperadas.push(Object.assign({ curso: g.curso, asignatura: g.asignatura, docente: g.docente }, posicion(g))));
        d.forEach((g) => {
          const f = a.find((x) => lugar(x) === lugar(g));
          if (f && f.docente !== g.docente) reasignadas.push(Object.assign({ curso: g.curso, asignatura: g.asignatura, de: f.docente, a: g.docente }, posicion(g)));
        });
      });
      movidas.sort((x, y) => orden(x.antes) - orden(y.antes));
      cambio = {
        afectadas, movidas, pendientesCambio, reasignadas, recuperadas,
        resumen: { afectadas: afectadas.length, movidas: movidas.length, pendientes: pendientesCambio.length, reasignadas: reasignadas.length },
      };
    }

    return {
      modoDocente: modo,
      requeridas,
      asignadas: clases.length,
      validas,
      pendientes: requeridas - validas,
      sobrantes,
      cobertura: requeridas ? Number(((validas / requeridas) * 100).toFixed(1)) : 0,
      detallePendientes,
      colisiones,
      infracciones: Object.assign({ total: totalInfracciones }, inf),
      preferencias,
      cambio,
    };
  }

  function unicos(a) { return Array.from(new Set(a)); }

  H.validar = validar;
  H.calidad = calidad;
  H.reporte = reporte;
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
})(typeof window !== 'undefined' ? window : globalThis);
