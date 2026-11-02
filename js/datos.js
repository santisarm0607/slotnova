/* HorarIA · datos.js
 * Convierte las hojas del Excel de GNOSOFT en un modelo de datos limpio.
 * Acepta variaciones de mayúsculas, tildes y espacios en nombres de hojas y columnas.
 */
(function (root) {
  const H = (root.HorarIA = root.HorarIA || {});

  const DIAS_ORDEN = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  function normalizar(t) {
    return String(t == null ? '' : t)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim().replace(/\s+/g, '_');
  }
  function diaCanonico(t) {
    const n = normalizar(t);
    return DIAS_ORDEN.find((d) => normalizar(d) === n) || String(t).trim();
  }
  function texto(v) { return v == null ? '' : String(v).trim(); }
  /** "D02", "d02" o " D2 " → "D2": la ficha escribe D02 y el Excel D2; son el mismo docente */
  function normalizarId(v) {
    const t = texto(v);
    const m = /^([A-Za-z]+)0*(\d+)$/.exec(t);
    return m ? m[1].toUpperCase() + String(parseInt(m[2], 10)) : t;
  }
  function numero(v, porDefecto) {
    const n = Number(v);
    return Number.isFinite(n) ? n : porDefecto;
  }
  function hora(v) {
    if (typeof v === 'number') {
      const minutos = Math.round(v * 24 * 60);
      return String(Math.floor(minutos / 60)).padStart(2, '0') + ':' + String(minutos % 60).padStart(2, '0');
    }
    return texto(v);
  }

  function buscarHoja(libro, opciones) {
    const nombres = Object.keys(libro);
    for (const op of opciones) {
      const encontrado = nombres.find((n) => normalizar(n) === op);
      if (encontrado) return libro[encontrado];
    }
    for (const op of opciones) {
      const encontrado = nombres.find((n) => normalizar(n).includes(op));
      if (encontrado) return libro[encontrado];
    }
    return null;
  }

  function aObjetos(filas) {
    if (!filas || !filas.length) return [];
    const enc = (filas[0] || []).map(normalizar);
    const res = [];
    for (let i = 1; i < filas.length; i++) {
      const f = filas[i] || [];
      if (!f.some((v) => v !== null && v !== undefined && String(v).trim() !== '')) continue;
      const o = {};
      enc.forEach((k, j) => { if (k) o[k] = f[j]; });
      res.push(o);
    }
    return res;
  }
  function campo(o, ...claves) {
    for (const k of claves) if (o[k] !== undefined && o[k] !== null && String(o[k]).trim() !== '') return o[k];
    return undefined;
  }

  /** libro: { nombreHoja: [[celdas]] }  →  modelo de datos */
  function desdeLibro(libro) {
    const avisos = [];
    const falta = (n) => { throw new Error('Falta la hoja "' + n + '" en el Excel.'); };

    const hBloques = buscarHoja(libro, ['bloques']);
    const hCursos = buscarHoja(libro, ['cursos']) || falta('Cursos');
    const hDocentes = buscarHoja(libro, ['docentes']) || falta('Docentes');
    const hHab = buscarHoja(libro, ['asignaturas_docentes', 'habilitaciones', 'asignaturas']);
    const hCarga = buscarHoja(libro, ['carga', 'carga_academica']) || falta('Carga');
    const hSalones = buscarHoja(libro, ['salones', 'aulas']) || falta('Salones');
    const hDisp = buscarHoja(libro, ['disponibilidad']);
    const hCambio = buscarHoja(libro, ['cambio', 'cambios']);

    const cursos = aObjetos(hCursos).map((o) => ({
      id: texto(campo(o, 'curso_id', 'id', 'curso')),
      nombre: texto(campo(o, 'nombre', 'curso_id')),
      estudiantes: numero(campo(o, 'estudiantes', 'cantidad'), 0),
    })).filter((c) => c.id);

    const docentes = aObjetos(hDocentes).map((o) => ({
      id: normalizarId(campo(o, 'docente_id', 'id', 'docente')),
      nombre: texto(campo(o, 'nombre', 'docente_id')),
      max: numero(campo(o, 'max_sesiones_semana', 'max_sesiones', 'maximo'), Infinity),
    })).filter((d) => d.id);

    const carga = aObjetos(hCarga).map((o) => ({
      curso: texto(campo(o, 'curso_id', 'curso')),
      asignatura: texto(campo(o, 'asignatura', 'materia')),
      principal: normalizarId(campo(o, 'docente_principal_id', 'docente_id', 'docente')),
      sesiones: numero(campo(o, 'sesiones_semana', 'sesiones', 'intensidad'), 0),
      tipoSalon: texto(campo(o, 'tipo_salon_requerido', 'tipo_salon', 'salon')) || 'GENERAL',
    })).filter((c) => c.curso && c.asignatura && c.sesiones > 0);

    const salones = aObjetos(hSalones).map((o) => ({
      id: texto(campo(o, 'salon_id', 'id', 'salon')),
      nombre: texto(campo(o, 'nombre', 'salon_id')),
      tipo: texto(campo(o, 'tipo', 'tipo_salon')) || 'GENERAL',
      capacidad: numero(campo(o, 'capacidad'), Infinity),
    })).filter((s) => s.id);

    // Habilitaciones: asignatura → docentes que la pueden dar
    const habilitados = {};
    if (hHab) {
      aObjetos(hHab).forEach((o) => {
        const a = texto(campo(o, 'asignatura', 'materia'));
        const d = normalizarId(campo(o, 'docente_id', 'docente'));
        const ok = numero(campo(o, 'habilitado'), 1);
        if (a && d && ok === 1) (habilitados[a] = habilitados[a] || []).includes(d) || habilitados[a].push(d);
      });
    } else {
      avisos.push('No hay hoja de asignaturas por docente: se usará solo el docente principal.');
    }
    carga.forEach((c) => {
      if (!habilitados[c.asignatura]) habilitados[c.asignatura] = [];
      if (c.principal && !habilitados[c.asignatura].includes(c.principal) && !hHab) habilitados[c.asignatura].push(c.principal);
    });

    // Bloques
    let bloques = hBloques ? aObjetos(hBloques).map((o) => ({
      id: texto(campo(o, 'bloque_id', 'id', 'bloque')),
      inicio: hora(campo(o, 'inicio', 'hora_inicio')),
      fin: hora(campo(o, 'fin', 'hora_fin')),
    })).filter((b) => b.id) : [];

    // Disponibilidad
    const dispFilas = hDisp ? aObjetos(hDisp) : [];
    const diasVistos = new Set();
    const bloquesVistos = [];
    dispFilas.forEach((o) => {
      diasVistos.add(diaCanonico(campo(o, 'dia')));
      const b = texto(campo(o, 'bloque_id', 'bloque'));
      if (b && !bloquesVistos.includes(b)) bloquesVistos.push(b);
    });
    if (!bloques.length) {
      bloques = (bloquesVistos.length ? bloquesVistos : ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']).map((id) => ({ id, inicio: '', fin: '' }));
      avisos.push('No hay hoja de bloques: se usaron los bloques de la disponibilidad.');
    }
    let dias = DIAS_ORDEN.filter((d) => diasVistos.has(d));
    if (!dias.length) dias = DIAS_ORDEN.slice(0, 5);

    const disponibilidad = {};
    docentes.forEach((d) => {
      disponibilidad[d.id] = {};
      dias.forEach((dia) => {
        disponibilidad[d.id][dia] = {};
        bloques.forEach((b) => { disponibilidad[d.id][dia][b.id] = 1; });
      });
    });
    let sinDato = 0;
    if (dispFilas.length) {
      // Si hay hoja, lo que no aparezca se marca como no disponible solo si el docente sí aparece
      const docentesConFilas = new Set(dispFilas.map((o) => normalizarId(campo(o, 'docente_id', 'docente'))));
      const visto = {};
      dispFilas.forEach((o) => {
        const d = normalizarId(campo(o, 'docente_id', 'docente'));
        const dia = diaCanonico(campo(o, 'dia'));
        const b = texto(campo(o, 'bloque_id', 'bloque'));
        if (!disponibilidad[d] || !disponibilidad[d][dia] || disponibilidad[d][dia][b] === undefined) return;
        disponibilidad[d][dia][b] = numero(campo(o, 'disponible'), 1) === 1 ? 1 : 0;
        visto[d + '|' + dia + '|' + b] = true;
      });
      docentes.forEach((d) => {
        if (!docentesConFilas.has(d.id)) return;
        dias.forEach((dia) => bloques.forEach((b) => { if (!visto[d.id + '|' + dia + '|' + b.id]) sinDato++; }));
      });
      if (sinDato) avisos.push(sinDato + ' combinaciones docente-día-bloque sin dato de disponibilidad: se asumieron disponibles.');
    } else {
      avisos.push('No hay hoja de disponibilidad: se asumió que todos los docentes están disponibles siempre.');
    }

    const cambios = hCambio ? aObjetos(hCambio).map((o) => ({
      docente: normalizarId(campo(o, 'docente_id', 'docente')),
      dia: diaCanonico(campo(o, 'dia')),
      bloque: texto(campo(o, 'bloque_id', 'bloque')),
      disponible: numero(campo(o, 'disponible_nuevo', 'disponible'), 0) === 1 ? 1 : 0,
      motivo: texto(campo(o, 'motivo')),
    })).filter((c) => c.docente && c.dia && c.bloque) : [];

    return { dias, bloques, cursos, docentes, habilitados, carga, salones, disponibilidad, cambios, avisos };
  }

  /** Copia profunda simple (los datos son JSON puro) */
  function clonar(o) { return JSON.parse(JSON.stringify(o, (k, v) => (v === Infinity ? 1e9 : v))); }

  /** Devuelve una copia de los datos con los cambios de la hoja "Cambio" aplicados */
  function aplicarEscenario(datos, cambios) {
    const copia = clonar(datos);
    (cambios || datos.cambios || []).forEach((c) => {
      const d = normalizarId(c.docente), dia = diaCanonico(c.dia);
      if (copia.disponibilidad[d] && copia.disponibilidad[d][dia] && copia.disponibilidad[d][dia][c.bloque] !== undefined) {
        copia.disponibilidad[d][dia][c.bloque] = c.disponible;
      }
    });
    return copia;
  }

  // ---------- Duración de los bloques ----------
  function aMinutos(h) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(h || ''));
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : NaN;
  }
  function aHora(min) {
    return String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  }

  /**
   * Devuelve una copia de los datos con la hora de inicio y fin de cada bloque recalculada.
   * El ID del bloque (B1…B6) no cambia: es la unidad de tiempo del horario.
   * config: { duracionMinutos: 45 | 50, horaInicio: '07:00', descansoMinutos: 0, descansoDespuesDe: 'B3' }
   */
  function configurarTiempo(datos, config) {
    const c = Object.assign({ duracionMinutos: 50, horaInicio: '07:00', descansoMinutos: 0, descansoDespuesDe: null }, config);
    const duracion = Number(c.duracionMinutos) > 0 ? Number(c.duracionMinutos) : 50;
    const descanso = Math.max(0, Number(c.descansoMinutos) || 0);
    let t = aMinutos(c.horaInicio);
    if (!Number.isFinite(t)) t = 7 * 60;
    const copia = clonar(datos);
    copia.tiempo = { duracionMinutos: duracion, horaInicio: aHora(t), descansoMinutos: descanso, descansoDespuesDe: c.descansoDespuesDe || null };
    copia.bloques = copia.bloques.map((b) => {
      const inicio = aHora(t);
      t += duracion;
      const fin = aHora(t);
      if (descanso && b.id === c.descansoDespuesDe) t += descanso;
      return Object.assign({}, b, { inicio, fin });
    });
    return copia;
  }

  /** Describe el escenario de la hoja Cambio en una frase */
  function describirEscenario(datos) {
    const c = datos.cambios || [];
    if (!c.length) return '';
    const porDoc = {};
    c.forEach((x) => { (porDoc[x.docente] = porDoc[x.docente] || {})[x.dia] = (porDoc[x.docente][x.dia] || 0) + 1; });
    return Object.entries(porDoc).map(([d, dias]) => {
      const doc = datos.docentes.find((x) => x.id === d);
      const partes = Object.entries(dias).map(([dia, n]) => dia + (n >= datos.bloques.length ? ' (todo el día)' : ' (' + n + ' bloques)'));
      return (doc ? doc.nombre + ' (' + d + ')' : d) + ' no disponible: ' + partes.join(', ');
    }).join('; ');
  }

  H.normalizar = normalizar;
  H.diaCanonico = diaCanonico;
  H.DIAS_ORDEN = DIAS_ORDEN;
  H.desdeLibro = desdeLibro;
  H.clonar = clonar;
  H.aplicarEscenario = aplicarEscenario;
  H.describirEscenario = describirEscenario;
  H.normalizarId = normalizarId;
  H.configurarTiempo = configurarTiempo;
  H.datos = { desdeLibro, aplicarEscenario, describirEscenario, configurarTiempo, normalizarId, clonar, aMinutos, aHora };
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
})(typeof window !== 'undefined' ? window : globalThis);
