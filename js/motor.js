/* HorarIA · motor.js
 * Motor de horarios: genera y reprograma horarios sin cruces.
 *
 * Cómo funciona (para explicarlo en el pitch):
 *  1. Elige el docente de cada materia por curso. Usa el docente principal y,
 *     si alguno se pasa de su máximo, reasigna a otro docente habilitado
 *     moviendo el mínimo posible (en los datos de GNOSOFT: el Inglés de un curso pasa a D6).
 *  2. Llena la cuadrícula de cada curso con sus sesiones y la mejora con
 *     "recocido simulado": intercambia dos clases del mismo curso y se queda
 *     con el cambio si reduce los conflictos. Así cada curso siempre tiene
 *     exactamente sus sesiones; lo que se busca es que no haya cruces.
 *  3. Asigna salones (el aula propia del curso cuando es GENERAL).
 *
 * Reglas duras (deben quedar en 0): cruces de docente, docente no disponible,
 * más clases que salones de un tipo, reglas "prohibir" y "max_por_dia".
 * Reglas blandas (se minimizan): misma materia varias veces el mismo día,
 * huecos de docentes, reglas "evitar" y, al reprogramar, clases movidas.
 *
 * Modo de docentes: 'alternativas' (por defecto) usa cualquier docente habilitado;
 * 'estricto' solo el docente asignado en la Carga. Si algo no cabe, se recorta y
 * queda en resultado.pendientes con su motivo: nunca se entrega un horario con cruces.
 */
(function (root) {
  const H = (root.HorarIA = root.HorarIA || {});

  const PESOS = { duro: 1000, repetida: 4, triple: 30, hueco: 1, evitar: 10, cambio: 40 };

  // Generador aleatorio con semilla: el mismo número da el mismo horario (demo reproducible)
  function crearAleatorio(semilla) {
    let a = (semilla >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const norm = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const lista = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  function coincideLugar(r, dia, bloque) {
    const dias = lista(r.dias), bloques = lista(r.bloques);
    return (!dias.length || dias.some((d) => norm(d) === norm(dia))) &&
      (!bloques.length || bloques.some((b) => norm(b) === norm(bloque)));
  }
  function coincideClase(r, curso, asignatura, docente) {
    return (!r.curso || norm(r.curso) === norm(curso)) &&
      (!r.asignatura || norm(r.asignatura) === norm(asignatura)) &&
      (!r.docente || norm(r.docente) === norm(docente));
  }

  // ------------------------------------------------------------------
  // 1. Preparar el problema
  // ------------------------------------------------------------------
  function preparar(datos, reglas, opciones) {
    reglas = reglas || [];
    // 'alternativas': cualquier docente habilitado (Léeme: Inglés con D4 o D6) · 'estricto': solo el docente asignado en la Carga
    const modoDocente = opciones && opciones.modoDocente === 'estricto' ? 'estricto' : 'alternativas';
    const errores = [];
    const dias = datos.dias, bloques = datos.bloques;
    const nD = dias.length, nB = bloques.length, nS = nD * nB;
    const docIdx = {}; datos.docentes.forEach((d, i) => { docIdx[d.id] = i; });
    const cursoIdx = {}; datos.cursos.forEach((c, i) => { cursoIdx[c.id] = i; });
    const nT = datos.docentes.length, nC = datos.cursos.length;

    const tipos = [], tipoIdx = {};
    const agregarTipo = (k) => { if (tipoIdx[k] === undefined) { tipoIdx[k] = tipos.length; tipos.push(k); } };
    datos.salones.forEach((s) => agregarTipo(s.tipo));
    datos.carga.forEach((c) => agregarTipo(c.tipoSalon));
    const oferta = tipos.map((k) => datos.salones.filter((s) => s.tipo === k).length);

    // Disponibilidad efectiva por docente y bloque (incluye reglas "bloquear_docente")
    const disp = datos.docentes.map((d) => {
      const arr = new Uint8Array(nS);
      for (let di = 0; di < nD; di++) for (let bi = 0; bi < nB; bi++) {
        const v = datos.disponibilidad[d.id] && datos.disponibilidad[d.id][dias[di]] ? datos.disponibilidad[d.id][dias[di]][bloques[bi].id] : 1;
        arr[di * nB + bi] = v === 0 ? 0 : 1;
      }
      return arr;
    });
    reglas.filter((r) => r.tipo === 'bloquear_docente').forEach((r) => {
      const t = docIdx[r.docente];
      if (t === undefined) return;
      for (let s = 0; s < nS; s++) if (coincideLugar(r, dias[(s / nB) | 0], bloques[s % nB].id)) disp[t][s] = 0;
    });

    const grupos = datos.carga.map((c, g) => {
      const habilitados = (datos.habilitados[c.asignatura] || []).filter((id) => docIdx[id] !== undefined);
      let candidatos = habilitados;
      if (c.principal && candidatos.includes(c.principal)) candidatos = [c.principal].concat(candidatos.filter((x) => x !== c.principal));
      if (modoDocente === 'estricto' && c.principal && docIdx[c.principal] !== undefined) candidatos = [c.principal];
      if (cursoIdx[c.curso] === undefined) errores.push('La carga menciona el curso "' + c.curso + '", que no está en la hoja de cursos.');
      if (!candidatos.length) errores.push('Nadie está habilitado para dar ' + c.asignatura + ' en ' + c.curso + '.');
      if (tipoIdx[c.tipoSalon] === undefined || !oferta[tipoIdx[c.tipoSalon]]) errores.push('No hay salones de tipo ' + c.tipoSalon + ' para ' + c.asignatura + ' de ' + c.curso + '.');
      return { g, curso: c.curso, c: cursoIdx[c.curso], asignatura: c.asignatura, principal: c.principal, sesiones: c.sesiones, requeridas: c.sesiones, tipo: tipoIdx[c.tipoSalon], tipoSalon: c.tipoSalon, candidatos, habilitados };
    });

    // Sesiones por curso
    datos.cursos.forEach((cu, c) => {
      const total = grupos.filter((g) => g.c === c).reduce((a, g) => a + g.sesiones, 0);
      if (total > nS) errores.push('El curso ' + cu.id + ' tiene ' + total + ' sesiones pero la semana solo tiene ' + nS + ' bloques.');
    });

    return { datos, reglas, modoDocente, dias, bloques, nD, nB, nS, nT, nC, docIdx, cursoIdx, tipos, tipoIdx, oferta, disp, grupos, errores };
  }

  // ------------------------------------------------------------------
  // 2. Elegir docentes (mínimos cambios respecto al docente principal)
  // ------------------------------------------------------------------
  // permitirExceso: si no hay reparto que quepa, devuelve el que menos se pasa (el exceso se recorta después como pendiente)
  function asignarDocentes(p, previos, permitirExceso) {
    const doc = p.datos.docentes;
    const capacidad = doc.map((d, t) => {
      let libres = 0; for (let s = 0; s < p.nS; s++) libres += p.disp[t][s];
      return { max: Math.min(d.max == null ? Infinity : d.max, libres), maxSemana: d.max, libres };
    });
    const carga = new Array(p.nT).fill(0);
    const elegido = new Array(p.grupos.length).fill(-1);
    const flexibles = [];
    p.grupos.forEach((g) => {
      if (g.candidatos.length === 1) { const t = p.docIdx[g.candidatos[0]]; elegido[g.g] = t; carga[t] += g.sesiones; }
      else if (g.candidatos.length > 1) flexibles.push(g);
    });

    const previo = (g) => (previos ? previos[g.curso + '|' + g.asignatura] : undefined);
    let mejor = null, mejorCosto = Infinity, nodos = 0;
    const LIMITE = 400000;
    (function buscar(i, costo) {
      if (nodos++ > LIMITE || costo >= mejorCosto) return;
      if (i === flexibles.length) {
        let exceso = 0;
        for (let t = 0; t < p.nT; t++) if (carga[t] > capacidad[t].max) { if (!permitirExceso) return; exceso += carga[t] - capacidad[t].max; }
        let balance = 0;
        for (let t = 0; t < p.nT; t++) { const r = carga[t] / Math.max(1, capacidad[t].max); balance += r * r; }
        const total = costo + balance + exceso * 100000;
        if (total < mejorCosto) { mejorCosto = total; mejor = elegido.slice(); }
        return;
      }
      const g = flexibles[i];
      for (const id of g.candidatos) {
        const t = p.docIdx[id];
        if (!permitirExceso && carga[t] + g.sesiones > capacidad[t].max) continue;
        const prev = previo(g);
        const extra = (id !== g.principal ? 100 : 0) + (prev && prev !== id ? 1000 : 0);
        elegido[g.g] = t; carga[t] += g.sesiones;
        buscar(i + 1, costo + extra);
        carga[t] -= g.sesiones; elegido[g.g] = -1;
      }
    })(0, 0);

    const cargaPrincipal = new Array(p.nT).fill(0);
    p.grupos.forEach((g) => { const t = p.docIdx[g.principal]; if (t !== undefined) cargaPrincipal[t] += g.sesiones; });

    if (!mejor) {
      // Explicar por qué no se pudo
      const fijos = new Array(p.nT).fill(0);
      p.grupos.forEach((g) => { if (g.candidatos.length === 1) fijos[p.docIdx[g.candidatos[0]]] += g.sesiones; });
      const motivos = doc.map((d, t) => (fijos[t] > capacidad[t].max
        ? d.nombre + ' (' + d.id + ') tiene ' + fijos[t] + ' sesiones que nadie más puede dar, pero ' +
          (capacidad[t].libres < (d.max == null ? Infinity : d.max) ? 'solo tiene ' + capacidad[t].libres + ' bloques disponibles.' : 'su máximo es ' + d.max + ' sesiones.') +
          ' Sugerencia: habilitar a otro docente para alguna de sus materias o liberar parte de su disponibilidad.'
        : null)).filter(Boolean);
      return { ok: false, error: 'No hay forma de repartir las materias sin pasar el máximo de algún docente.', motivos, capacidad, cargaPrincipal };
    }

    const final = new Array(p.nT).fill(0);
    p.grupos.forEach((g) => { final[mejor[g.g]] += g.sesiones; });
    const decisiones = [];
    p.grupos.forEach((g) => {
      const t = mejor[g.g], id = doc[t].id;
      if (id !== g.principal) {
        const tp = p.docIdx[g.principal];
        const motivo = tp !== undefined && cargaPrincipal[tp] > capacidad[tp].max
          ? doc[tp].nombre + ' (' + g.principal + ') tendría ' + cargaPrincipal[tp] + ' sesiones y su capacidad es ' + capacidad[tp].max
          : 'para equilibrar la carga';
        decisiones.push({ curso: g.curso, asignatura: g.asignatura, de: g.principal, a: id, motivo });
      }
    });
    return { ok: true, docentePorGrupo: mejor, carga: final, cargaPrincipal, capacidad, decisiones };
  }

  // ------------------------------------------------------------------
  // 2b. Lo que no cabe queda pendiente: se recortan las sesiones que superan
  //     la capacidad de un docente, con el motivo y una sugerencia
  // ------------------------------------------------------------------
  function recortarExceso(p, asig) {
    const doc = p.datos.docentes;
    const pendientes = [];
    const nombre = (id) => { const t = p.docIdx[id]; return t !== undefined ? doc[t].nombre + ' (' + id + ')' : id; };
    for (let t = 0; t < p.nT; t++) {
      let exceso = asig.carga[t] - asig.capacidad[t].max;
      if (exceso <= 0) continue;
      const d = doc[t], cap = asig.capacidad[t];
      const porDisponibilidad = cap.libres < (d.max == null ? Infinity : d.max);
      const causa = nombre(d.id) + ' tendría ' + asig.carga[t] + ' sesiones y ' +
        (porDisponibilidad ? 'solo tiene ' + cap.libres + ' bloques disponibles.' : 'su máximo semanal es ' + d.max + '.');
      // Primero se recorta lo que tiene docente alternativo (se resuelve activando la alternativa); después, desde el último curso
      const suyos = p.grupos.filter((g) => asig.docentePorGrupo[g.g] === t && g.sesiones > 0)
        .sort((a, b) => ((b.habilitados.length > 1) - (a.habilitados.length > 1)) || (b.c - a.c) || (b.g - a.g));
      for (const g of suyos) {
        if (exceso <= 0) break;
        const q = Math.min(g.sesiones, exceso);
        g.sesiones -= q; exceso -= q; asig.carga[t] -= q;
        const otros = g.habilitados.filter((id) => id !== d.id);
        const estricto = p.modoDocente === 'estricto' && otros.length > 0;
        pendientes.push({
          curso: g.curso, asignatura: g.asignatura, docente: d.id, docenteNombre: d.nombre, sesiones: q, causa: 'capacidad',
          motivo: causa + (estricto ? ' En modo estricto solo puede dar la clase el docente asignado.' : ''),
          sugerencia: estricto
            ? 'Activar la alternativa permitida: ' + otros.map(nombre).join(' o ') + (otros.length > 1 ? ' también pueden' : ' también puede') + ' dar ' + g.asignatura + '.'
            : otros.length
              ? 'Las alternativas habilitadas (' + otros.map(nombre).join(', ') + ') tampoco tienen capacidad libre: liberar disponibilidad o subir el máximo semanal.'
              : 'Habilitar a otro docente para ' + g.asignatura + ', liberar disponibilidad de ' + d.nombre + ' o subir su máximo semanal.',
        });
      }
    }
    return pendientes;
  }

  // ------------------------------------------------------------------
  // 3. Búsqueda local (recocido simulado)
  // ------------------------------------------------------------------
  function resolver(p, docentePorGrupo, opciones) {
    const W = Object.assign({}, PESOS, opciones.pesos || {});
    const { nS, nB, nD, nT, nC } = p;
    const nG = p.grupos.length, nK = p.tipos.length;
    const azar = crearAleatorio(opciones.semilla || 1);

    const docG = new Int16Array(nG), tipoG = new Int16Array(nG), maxDia = new Int16Array(nG);
    const duroCelda = new Uint8Array(nG * nS), blandoCelda = new Int32Array(nG * nS);
    const reglasProhibir = p.reglas.filter((r) => r.tipo === 'prohibir');
    const reglasEvitar = p.reglas.filter((r) => r.tipo === 'evitar');
    const reglasMax = p.reglas.filter((r) => r.tipo === 'max_por_dia');
    p.grupos.forEach((g) => {
      const t = docentePorGrupo[g.g];
      const idDoc = p.datos.docentes[t].id;
      docG[g.g] = t; tipoG[g.g] = g.tipo;
      let m = 99;
      reglasMax.forEach((r) => { if (coincideClase(r, g.curso, g.asignatura, idDoc)) m = Math.min(m, Math.max(0, Number(r.max) || 0)); });
      maxDia[g.g] = m;
      const pr = reglasProhibir.filter((r) => coincideClase(r, g.curso, g.asignatura, idDoc));
      const ev = reglasEvitar.filter((r) => coincideClase(r, g.curso, g.asignatura, idDoc));
      for (let s = 0; s < nS; s++) {
        const dia = p.dias[(s / nB) | 0], bl = p.bloques[s % nB].id;
        let duro = p.disp[t][s] ? 0 : 1;
        if (pr.some((r) => coincideLugar(r, dia, bl))) duro = 1;
        duroCelda[g.g * nS + s] = duro;
        blandoCelda[g.g * nS + s] = ev.filter((r) => coincideLugar(r, dia, bl)).length * W.evitar;
      }
    });

    // Cuadrícula: grid[c*nS+s] = grupo (materia del curso) o -1 si es bloque libre
    const grid = new Int16Array(nC * nS).fill(-1);
    const previo = opciones.previo || null; // Int16Array como grid, o null
    function llenarAleatorio() {
      for (let c = 0; c < nC; c++) {
        const bolsa = [];
        p.grupos.forEach((g) => { if (g.c === c) for (let k = 0; k < g.sesiones; k++) bolsa.push(g.g); });
        while (bolsa.length < nS) bolsa.push(-1);
        for (let i = bolsa.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); const x = bolsa[i]; bolsa[i] = bolsa[j]; bolsa[j] = x; }
        for (let s = 0; s < nS; s++) grid[c * nS + s] = bolsa[s];
      }
    }
    function llenarDesdePrevio() {
      for (let c = 0; c < nC; c++) {
        const faltan = {};
        p.grupos.forEach((g) => { if (g.c === c) faltan[g.g] = g.sesiones; });
        const libres = [];
        for (let s = 0; s < nS; s++) {
          const g = previo[c * nS + s];
          if (g >= 0 && faltan[g] > 0) { grid[c * nS + s] = g; faltan[g]--; } else { grid[c * nS + s] = -1; libres.push(s); }
        }
        const resto = [];
        Object.keys(faltan).forEach((g) => { for (let k = 0; k < faltan[g]; k++) resto.push(Number(g)); });
        libres.forEach((s, i) => { grid[c * nS + s] = i < resto.length ? resto[i] : -1; });
      }
    }

    const cntT = new Int16Array(nS * nT), cntK = new Int16Array(nS * nK);
    function recontar() {
      cntT.fill(0); cntK.fill(0);
      for (let c = 0; c < nC; c++) for (let s = 0; s < nS; s++) {
        const g = grid[c * nS + s];
        if (g >= 0) { cntT[s * nT + docG[g]]++; cntK[s * nK + tipoG[g]]++; }
      }
    }

    // Costos locales (acumulan en aH = duro, aB = blando)
    let aH = 0, aB = 0;
    function uBloque(s) {
      let h = 0;
      for (let t = 0, b = s * nT; t < nT; t++) if (cntT[b + t] > 1) h += cntT[b + t] - 1;
      for (let k = 0, b = s * nK; k < nK; k++) { const x = cntK[b + k] - p.oferta[k]; if (x > 0) h += x; }
      aH += h;
    }
    function uCelda(c, s) {
      const g = grid[c * nS + s];
      if (previo && previo[c * nS + s] !== g) aB += W.cambio;
      if (g < 0) return;
      aH += duroCelda[g * nS + s]; aB += blandoCelda[g * nS + s];
    }
    const vistos = new Int16Array(16), cuentas = new Int16Array(16);
    function uCursoDia(c, d) {
      let n = 0;
      const base = c * nS + d * nB;
      for (let i = 0; i < nB; i++) {
        const g = grid[base + i];
        if (g < 0) continue;
        let j = 0; while (j < n && vistos[j] !== g) j++;
        if (j === n) { vistos[n] = g; cuentas[n] = 1; n++; } else cuentas[j]++;
      }
      for (let j = 0; j < n; j++) {
        const k = cuentas[j];
        if (k >= 2) aB += W.repetida * (k - 1);
        if (k >= 3) aB += W.triple * (k - 2);
        if (k > maxDia[vistos[j]]) aH += k - maxDia[vistos[j]];
      }
    }
    function uDocenteDia(t, d) {
      if (t < 0) return;
      let primero = -1, ultimo = -1, ocupados = 0;
      for (let b = 0; b < nB; b++) if (cntT[(d * nB + b) * nT + t] > 0) { if (primero < 0) primero = b; ultimo = b; ocupados++; }
      if (primero >= 0) aB += W.hueco * (ultimo - primero + 1 - ocupados);
    }
    function costoTotal() {
      aH = 0; aB = 0;
      for (let s = 0; s < nS; s++) uBloque(s);
      for (let c = 0; c < nC; c++) { for (let s = 0; s < nS; s++) uCelda(c, s); for (let d = 0; d < nD; d++) uCursoDia(c, d); }
      for (let t = 0; t < nT; t++) for (let d = 0; d < nD; d++) uDocenteDia(t, d);
      return [aH, aB];
    }
    function afectados(c, s1, s2, t1, t2) {
      aH = 0; aB = 0;
      const d1 = (s1 / nB) | 0, d2 = (s2 / nB) | 0;
      uBloque(s1); uBloque(s2);
      uCelda(c, s1); uCelda(c, s2);
      uCursoDia(c, d1); if (d2 !== d1) uCursoDia(c, d2);
      uDocenteDia(t1, d1); if (d2 !== d1) uDocenteDia(t1, d2);
      if (t2 !== t1) { uDocenteDia(t2, d1); if (d2 !== d1) uDocenteDia(t2, d2); }
    }
    function mover(c, s1, s2) {
      const i1 = c * nS + s1, i2 = c * nS + s2, g1 = grid[i1], g2 = grid[i2];
      if (g1 >= 0) { cntT[s1 * nT + docG[g1]]--; cntK[s1 * nK + tipoG[g1]]--; cntT[s2 * nT + docG[g1]]++; cntK[s2 * nK + tipoG[g1]]++; }
      if (g2 >= 0) { cntT[s2 * nT + docG[g2]]--; cntK[s2 * nK + tipoG[g2]]--; cntT[s1 * nT + docG[g2]]++; cntK[s1 * nK + tipoG[g2]]++; }
      grid[i1] = g2; grid[i2] = g1;
    }
    function celdaConflicto(c, s) {
      const g = grid[c * nS + s];
      if (g < 0) return false;
      return duroCelda[g * nS + s] === 1 || cntT[s * nT + docG[g]] > 1 || cntK[s * nK + tipoG[g]] > p.oferta[tipoG[g]];
    }

    const inicio = Date.now();
    const tiempoMax = opciones.tiempoMaxMs || 4000;
    const N = opciones.iteraciones || (previo ? 60000 : 150000);
    // Al reprogramar se parte del horario anterior con temperatura baja (pocos cambios)
    // y, si no alcanza, se va subiendo la temperatura. Solo al final se empieza de cero.
    const escalaPrevio = [5, 30, 120, 400];
    const T1 = 0.3;
    let mejor = null, mejorH = Infinity, mejorB = Infinity, iteraciones = 0, reinicios = 0;

    for (let intento = 0; intento < (opciones.reintentos || 12); intento++) {
      const desdePrevio = previo && intento < escalaPrevio.length;
      if (desdePrevio) llenarDesdePrevio(); else llenarAleatorio();
      if (intento > 0) reinicios++;
      const T0 = opciones.temperaturaInicial || (desdePrevio ? escalaPrevio[intento] : 400);
      recontar();
      let [h, b] = costoTotal();
      if (h < mejorH || (h === mejorH && b < mejorB)) { mejorH = h; mejorB = b; mejor = grid.slice(); }
      const factor = Math.pow(T1 / T0, 1 / N);
      let T = T0;
      for (let it = 0; it < N; it++, T *= factor) {
        iteraciones++;
        const c = Math.floor(azar() * nC);
        let s1 = Math.floor(azar() * nS);
        if (h > 0 && azar() < 0.6) {
          for (let k = 0; k < 10; k++) { const s = Math.floor(azar() * nS); if (celdaConflicto(c, s)) { s1 = s; break; } }
        }
        let s2 = Math.floor(azar() * (nS - 1)); if (s2 >= s1) s2++;
        const g1 = grid[c * nS + s1], g2 = grid[c * nS + s2];
        if (g1 === g2) continue;
        const t1 = g1 >= 0 ? docG[g1] : -1, t2 = g2 >= 0 ? docG[g2] : -1;
        afectados(c, s1, s2, t1, t2); const antesH = aH, antesB = aB;
        mover(c, s1, s2);
        afectados(c, s1, s2, t1, t2);
        const dH = aH - antesH, dB = aB - antesB;
        const delta = dH * W.duro + dB;
        if (delta <= 0 || azar() < Math.exp(-delta / T)) {
          h += dH; b += dB;
          if (h < mejorH || (h === mejorH && b < mejorB)) { mejorH = h; mejorB = b; mejor = grid.slice(); }
        } else {
          mover(c, s1, s2); // deshacer
        }
        if ((it & 4095) === 0 && Date.now() - inicio > tiempoMax) break;
      }
      if (mejorH === 0) break;
      if (Date.now() - inicio > tiempoMax) break;
    }

    grid.set(mejor); recontar();
    let [hf, bf] = costoTotal();

    // Nunca se entrega un horario con cruces: lo que siga en conflicto sale de la cuadrícula y queda pendiente
    const retiradas = [];
    if (hf > 0) {
      const quitar = (c, s, causa) => { retiradas.push({ c, s, g: grid[c * nS + s], causa }); grid[c * nS + s] = -1; };
      for (let c = 0; c < nC; c++) for (let s = 0; s < nS; s++) {
        const g = grid[c * nS + s];
        if (g >= 0 && duroCelda[g * nS + s]) quitar(c, s, 'disponibilidad');
      }
      for (let s = 0; s < nS; s++) {
        const docenteUsado = new Uint8Array(nT), salonesUsados = new Int16Array(nK);
        for (let c = 0; c < nC; c++) {
          const g = grid[c * nS + s];
          if (g < 0) continue;
          if (docenteUsado[docG[g]]) { quitar(c, s, 'cruce_docente'); continue; }
          if (salonesUsados[tipoG[g]] >= p.oferta[tipoG[g]]) { quitar(c, s, 'salon'); continue; }
          docenteUsado[docG[g]] = 1; salonesUsados[tipoG[g]]++;
        }
      }
      for (let c = 0; c < nC; c++) for (let d = 0; d < nD; d++) {
        const enDia = {};
        for (let b = 0; b < nB; b++) {
          const s = d * nB + b, g = grid[c * nS + s];
          if (g < 0) continue;
          enDia[g] = (enDia[g] || 0) + 1;
          if (enDia[g] > maxDia[g]) quitar(c, s, 'max_por_dia');
        }
      }
      recontar();
      [hf, bf] = costoTotal();
    }
    return { grid: grid.slice(), duro: hf, blando: bf, retiradas, iteraciones, reinicios, ms: Date.now() - inicio, docG };
  }

  // ------------------------------------------------------------------
  // 4. Salones (aula propia primero, luego la más ajustada en capacidad)
  // ------------------------------------------------------------------
  function asignarSalones(p, grid) {
    const { nS, nC } = p;
    const salones = p.datos.salones, cursos = p.datos.cursos;
    const preferencias = {}; // curso|tipo → [índices de salón en orden de preferencia]
    function preferidos(c, tipo) {
      const clave = c + '|' + tipo;
      if (preferencias[clave]) return preferencias[clave];
      const cu = cursos[c], id = norm(cu.id);
      const todosDelTipo = salones.map((s, i) => i).filter((i) => salones[i].tipo === tipo);
      const caben = todosDelTipo.filter((i) => salones[i].capacidad == null || salones[i].capacidad >= cu.estudiantes);
      // 1) el aula propia del curso (ej. "Aula 7A"); 2) "su" salón del tipo por turno; 3) el resto, del más pequeño al más grande
      const esPropio = (i) => { const n = norm(salones[i].nombre); return n === id || n.endsWith(' ' + id) || norm(salones[i].id) === id; };
      const turno = todosDelTipo[c % Math.max(1, todosDelTipo.length)];
      const orden = caben.slice().sort((a, b) =>
        (esPropio(b) - esPropio(a)) || ((b === turno) - (a === turno)) || ((salones[a].capacidad || 0) - (salones[b].capacidad || 0)) || (a - b));
      return (preferencias[clave] = orden);
    }
    const salonDe = new Int16Array(nC * nS).fill(-1);
    for (let s = 0; s < nS; s++) {
      const ocupado = new Int16Array(salones.length).fill(-1); // salón → curso
      const intentar = (c, visto) => {
        const g = grid[c * nS + s];
        for (const i of preferidos(c, p.grupos[g].tipoSalon)) {
          if (visto[i]) continue; visto[i] = 1;
          if (ocupado[i] < 0 || intentar(ocupado[i], visto)) { ocupado[i] = c; return true; }
        }
        return false;
      };
      for (let c = 0; c < nC; c++) {
        if (grid[c * nS + s] < 0) continue;
        intentar(c, new Uint8Array(salones.length));
      }
      ocupado.forEach((c, i) => { if (c >= 0) salonDe[c * nS + s] = i; });
    }
    return salonDe;
  }

  // ------------------------------------------------------------------
  // 5. Armar el resultado
  // ------------------------------------------------------------------
  function construirFilas(p, grid, docG, salonDe, previo) {
    const filas = [];
    for (let c = 0; c < p.nC; c++) for (let s = 0; s < p.nS; s++) {
      const g = grid[c * p.nS + s];
      const d = (s / p.nB) | 0, b = s % p.nB;
      const bl = p.bloques[b];
      const cambio = previo ? previo[c * p.nS + s] !== g : false;
      if (g < 0) {
        filas.push({ curso: p.datos.cursos[c].id, dia: p.dias[d], bloque: bl.id, inicio: bl.inicio, fin: bl.fin, asignatura: null, docente: null, salon: null, cambio });
        continue;
      }
      const gr = p.grupos[g], doc = p.datos.docentes[docG[g]], sal = salonDe[c * p.nS + s] >= 0 ? p.datos.salones[salonDe[c * p.nS + s]] : null;
      filas.push({
        curso: gr.curso, dia: p.dias[d], bloque: bl.id, inicio: bl.inicio, fin: bl.fin,
        asignatura: gr.asignatura, docente: doc.id, docenteNombre: doc.nombre,
        salon: sal ? sal.id : null, salonNombre: sal ? sal.nombre : null, tipoSalon: gr.tipoSalon, cambio,
      });
    }
    return filas;
  }

  function gridDesdeFilas(p, filas) {
    const grid = new Int16Array(p.nC * p.nS).fill(-1);
    const grupoDe = {};
    p.grupos.forEach((g) => { grupoDe[g.curso + '|' + g.asignatura] = g.g; });
    filas.forEach((f) => {
      const c = p.cursoIdx[f.curso], d = p.dias.indexOf(f.dia), b = p.bloques.findIndex((x) => x.id === f.bloque);
      if (c === undefined || d < 0 || b < 0 || !f.asignatura) return;
      const g = grupoDe[f.curso + '|' + f.asignatura];
      if (g !== undefined) grid[c * p.nS + d * p.nB + b] = g;
    });
    return grid;
  }

  /**
   * Genera un horario.
   * datos: modelo de datos (con el escenario ya aplicado si aplica)
   * opciones: { reglas: [], semilla: 1, tiempoMaxMs: 4000, anterior: resultado previo (para reprogramar) }
   */
  /**
   * Reparte docentes. Si no hay forma de que todo quepa, usa el reparto que menos se pasa
   * y recorta el exceso como sesiones pendientes (con motivo y sugerencia).
   */
  function asignarConPendientes(p, previos) {
    let asig = asignarDocentes(p, previos);
    let pendientes = [];
    if (!asig.ok) {
      const sinSolucion = asig;
      asig = asignarDocentes(p, previos, true);
      if (!asig.ok) return { asig: sinSolucion, pendientes };
      asig.sinSolucionCompleta = sinSolucion;
      pendientes = recortarExceso(p, asig);
    }
    return { asig, pendientes };
  }

  const MOTIVO_RETIRADA = {
    disponibilidad: 'No se encontró un bloque libre en el que el docente esté disponible y que permitan las reglas obligatorias.',
    cruce_docente: 'El docente ya tenía otra clase en los bloques libres del curso; no se encontró un lugar sin cruces.',
    salon: 'No había salón libre del tipo requerido en los bloques libres del curso.',
    max_por_dia: 'Superaba el máximo diario de una regla del coordinador y no cupo en otro día.',
    sin_salon: 'No hay salón libre del tipo requerido con capacidad suficiente para el curso en ese bloque.',
  };

  /**
   * Genera un horario.
   * datos: modelo de datos (con el escenario ya aplicado si aplica)
   * opciones: { reglas: [], semilla: 1, tiempoMaxMs: 4000, modoDocente: 'alternativas' | 'estricto', anterior: resultado previo (para reprogramar) }
   * Nunca devuelve cruces: lo que no se puede ubicar va a resultado.pendientes con su motivo.
   */
  function generar(datos, opciones) {
    opciones = opciones || {};
    const p = preparar(datos, opciones.reglas, opciones);
    if (p.errores.length) return { ok: false, error: 'Los datos tienen problemas que impiden generar el horario.', motivos: p.errores, filas: [], pendientes: [] };

    let previos = null, previoGrid = null;
    if (opciones.anterior && opciones.anterior.filas) {
      previos = {};
      opciones.anterior.filas.forEach((f) => { if (f.asignatura) previos[f.curso + '|' + f.asignatura] = f.docente; });
      previoGrid = gridDesdeFilas(p, opciones.anterior.filas);
    }
    const { asig, pendientes } = asignarConPendientes(p, previos);
    if (!asig.ok) return { ok: false, error: asig.error, motivos: asig.motivos, filas: [], pendientes: [], asignacion: asig };

    const r = resolver(p, asig.docentePorGrupo, { semilla: opciones.semilla, tiempoMaxMs: opciones.tiempoMaxMs, previo: previoGrid, pesos: opciones.pesos, iteraciones: opciones.iteraciones, temperaturaInicial: opciones.temperaturaInicial });
    const salonDe = asignarSalones(p, r.grid);
    for (let c = 0; c < p.nC; c++) for (let s = 0; s < p.nS; s++) {
      const i = c * p.nS + s;
      if (r.grid[i] >= 0 && salonDe[i] < 0) { r.retiradas.push({ c, s, g: r.grid[i], causa: 'sin_salon' }); r.grid[i] = -1; }
    }

    // Sesiones retiradas por conflicto, agrupadas por curso y asignatura
    const porGrupo = {};
    r.retiradas.forEach((x) => {
      const e = porGrupo[x.g] || (porGrupo[x.g] = { n: 0, causas: {}, bloques: [] });
      e.n++; e.causas[x.causa] = true;
      e.bloques.push(p.dias[(x.s / p.nB) | 0] + ' ' + p.bloques[x.s % p.nB].id);
    });
    Object.keys(porGrupo).forEach((k) => {
      const g = p.grupos[k], e = porGrupo[k], d = p.datos.docentes[asig.docentePorGrupo[g.g]];
      pendientes.push({
        curso: g.curso, asignatura: g.asignatura, docente: d.id, docenteNombre: d.nombre, sesiones: e.n, causa: 'conflicto',
        motivo: Object.keys(e.causas).map((c) => MOTIVO_RETIRADA[c]).join(' '),
        sugerencia: 'Quitar o suavizar alguna regla, liberar disponibilidad de ' + d.nombre + ' o probar «Otra opción».',
      });
      asig.carga[asig.docentePorGrupo[g.g]] -= e.n;
    });

    const filas = construirFilas(p, r.grid, r.docG, salonDe, previoGrid);
    const cambios = previoGrid ? filas.filter((f) => f.cambio).length : 0;
    const docentesCambiados = previos ? p.grupos.filter((g) => previos[g.curso + '|' + g.asignatura] && previos[g.curso + '|' + g.asignatura] !== p.datos.docentes[asig.docentePorGrupo[g.g]].id).length : 0;
    const totalPendientes = pendientes.reduce((a, x) => a + x.sesiones, 0);

    return {
      ok: r.duro === 0,
      completo: totalPendientes === 0,
      error: r.duro === 0 ? null : 'No se encontró un horario sin conflictos. Revisa el diagnóstico o quita alguna regla.',
      aviso: totalPendientes ? 'Horario parcial y sin cruces: ' + totalPendientes + (totalPendientes === 1 ? ' sesión queda pendiente' : ' sesiones quedan pendientes') + ' (ver el motivo de cada una).' : null,
      modoDocente: p.modoDocente,
      filas,
      pendientes,
      decisiones: asig.decisiones,
      carga: p.datos.docentes.map((d, t) => ({ id: d.id, nombre: d.nombre, principal: asig.cargaPrincipal[t], asignada: asig.carga[t], max: d.max, disponibles: asig.capacidad[t].libres })),
      estadisticas: { conflictos: r.duro, penalizacion: r.blando, iteraciones: r.iteraciones, reinicios: r.reinicios, ms: r.ms, cambios, docentesCambiados, pendientes: totalPendientes, semilla: opciones.semilla || 1 },
    };
  }

  /** Reprograma partiendo de un horario anterior y moviendo el mínimo de clases */
  function reprogramar(datos, anterior, opciones) {
    return generar(datos, Object.assign({}, opciones, { anterior }));
  }

  H.motor = { generar, reprogramar, preparar, asignarDocentes, asignarConPendientes, PESOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
})(typeof window !== 'undefined' ? window : globalThis);
