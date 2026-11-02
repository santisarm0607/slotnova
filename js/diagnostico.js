/* HorarIA · diagnostico.js
 * Semáforo ANTES de generar: revisa si los datos permiten un horario,
 * detecta docentes sobrecargados y explica la solución propuesta.
 *
 * Uso: const dx = HorarIA.diagnosticar(datos, reglas, { modoDocente: 'alternativas' | 'estricto' });
 *      dx.nivel → 'ok' | 'aviso' | 'error'
 *      dx.items → [{ nivel: 'ok' | 'info' | 'aviso' | 'error', titulo, detalle }]
 *      dx.carga → [{ id, nombre, principal, asignada, max, disponibles, habilitadas }]
 *      dx.proyeccion → { requeridas, posibles, pendientes: [...], modo }
 */
(function (root) {
  const H = (root.HorarIA = root.HorarIA || {});

  function diagnosticar(datos, reglas, opciones) {
    reglas = reglas || [];
    const modo = opciones && opciones.modoDocente === 'estricto' ? 'estricto' : 'alternativas';
    const items = [];
    const add = (nivel, titulo, detalle) => items.push({ nivel, titulo, detalle: detalle || '' });

    const totalSesiones = datos.carga.reduce((a, c) => a + c.sesiones, 0);
    const bloquesSemana = datos.dias.length * datos.bloques.length;
    add('ok', 'Datos cargados',
      datos.cursos.length + ' cursos · ' + totalSesiones + ' sesiones · ' + datos.docentes.length + ' docentes · ' + datos.salones.length + ' salones · ' + bloquesSemana + ' bloques por semana.');
    (datos.avisos || []).forEach((a) => add('aviso', 'Aviso de los datos', a));

    const p = H.motor.preparar(datos, reglas, { modoDocente: modo });
    if (p.errores.length) {
      p.errores.forEach((e) => add('error', 'Problema en los datos', e));
      return cerrar(items, []);
    }

    // Cursos: sesiones vs bloques
    datos.cursos.forEach((c) => {
      const n = datos.carga.filter((x) => x.curso === c.id).reduce((a, x) => a + x.sesiones, 0);
      if (n < bloquesSemana) add('aviso', 'Curso ' + c.id + ' con bloques libres', 'Tiene ' + n + ' sesiones para ' + bloquesSemana + ' bloques: quedarán ' + (bloquesSemana - n) + ' bloques libres.');
    });

    // Salones: capacidad por curso y tipo
    let salonesOk = true;
    datos.cursos.forEach((c) => {
      const tipos = Array.from(new Set(datos.carga.filter((x) => x.curso === c.id).map((x) => x.tipoSalon)));
      tipos.forEach((t) => {
        const caben = datos.salones.filter((s) => s.tipo === t && (s.capacidad == null || s.capacidad >= c.estudiantes));
        if (!caben.length) { salonesOk = false; add('error', 'Sin salón para ' + c.id, 'Ningún salón de tipo ' + t + ' tiene capacidad para ' + c.estudiantes + ' estudiantes. Agrega un salón o corrige la capacidad.'); }
      });
    });
    if (salonesOk) {
      const porTipo = {};
      datos.salones.forEach((s) => { porTipo[s.tipo] = (porTipo[s.tipo] || 0) + 1; });
      add('ok', 'Salones suficientes', Object.entries(porTipo).map(([t, n]) => n + ' ' + t).join(' · ') + '. Cada curso cabe en al menos un salón de cada tipo que necesita.');
    }

    // Disponibilidad reducida
    datos.docentes.forEach((d, t) => {
      const libres = p.disp[t].reduce((a, x) => a + x, 0);
      if (libres < bloquesSemana) {
        const faltan = [];
        p.dias.forEach((dia, di) => {
          const bl = p.bloques.filter((b, bi) => !p.disp[t][di * p.nB + bi]).map((b) => b.id);
          if (bl.length === p.nB) faltan.push(dia + ' (todo el día)');
          else if (bl.length) faltan.push(dia + ' ' + bl.join(', '));
        });
        add('info', d.nombre + ' (' + d.id + ') tiene restricciones', 'No disponible: ' + faltan.join('; ') + '.');
      }
    });

    // Reparto de docentes (lo que no quepa queda pendiente, con su motivo)
    const habilitadas = (id) => Object.keys(datos.habilitados).filter((a) => datos.habilitados[a].includes(id));
    const { asig, pendientes } = H.motor.asignarConPendientes(p);
    if (!asig.ok) {
      add('error', 'Imposible repartir la carga', asig.error);
      (asig.motivos || []).forEach((m) => add('error', 'Causa', m));
      const carga = datos.docentes.map((d, t) => ({ id: d.id, nombre: d.nombre, principal: asig.cargaPrincipal[t], asignada: null, max: d.max, disponibles: asig.capacidad[t].libres, habilitadas: habilitadas(d.id) }));
      return cerrar(items, carga);
    }
    const carga = datos.docentes.map((d, t) => ({ id: d.id, nombre: d.nombre, principal: asig.cargaPrincipal[t], asignada: asig.carga[t], max: d.max, disponibles: asig.capacidad[t].libres, habilitadas: habilitadas(d.id) }));
    const totalPendientes = pendientes.reduce((a, x) => a + x.sesiones, 0);

    // ¿La otra modalidad lo resuelve? (modo estricto → alternativa del Léeme)
    let alternativaResuelve = false;
    if (totalPendientes && modo === 'estricto') alternativaResuelve = H.motor.asignarDocentes(H.motor.preparar(datos, reglas, { modoDocente: 'alternativas' })).ok;

    const nombreA = (id) => { const d = datos.docentes.find((x) => x.id === id); return d ? d.nombre + ' (' + id + ')' : id; };
    carga.forEach((c) => {
      const lim = Math.min(c.max, c.disponibles);
      const sol = asig.decisiones.filter((x) => x.de === c.id);
      const pend = pendientes.filter((x) => x.docente === c.id);
      if (c.principal > lim) {
        let detalle = 'Con su carga asignada tendría ' + c.principal + ' sesiones y su límite es ' + lim + '. ';
        if (sol.length) detalle += 'Solución: ' + sol.map((x) => x.asignatura + ' de ' + x.curso + ' pasa a ' + nombreA(x.a)).join('; ') + '. ';
        if (pend.length) detalle += (modo === 'estricto' ? 'En modo estricto quedan pendientes: ' : 'Quedan pendientes: ') + pend.map((x) => x.sesiones + ' de ' + x.asignatura + ' de ' + x.curso).join('; ') + '. ';
        if (modo === 'alternativas' && sol.length) detalle += 'En modo estricto quedarían ' + (c.principal - lim) + ' sesiones pendientes.';
        if (modo === 'estricto' && alternativaResuelve && pend.length) detalle += pend[0].sugerencia;
        const grave = pend.length && !(modo === 'estricto' && alternativaResuelve);
        add(grave ? 'error' : 'aviso', c.nombre + ' (' + c.id + ') ' + (grave ? 'no alcanza a cubrir su carga' : 'quedaría sobrecargado'), detalle.trim());
      } else if (c.asignada === lim) {
        add('info', c.nombre + ' (' + c.id + ') queda al 100 %', c.asignada + ' de ' + lim + ' sesiones posibles. No tiene margen para cambios.');
      }
    });

    if (totalPendientes) {
      const posibles = totalSesiones - totalPendientes;
      const cobertura = ((posibles / totalSesiones) * 100).toFixed(1).replace('.', ',');
      add(alternativaResuelve ? 'aviso' : 'error', 'Cobertura máxima: ' + posibles + ' de ' + totalSesiones + ' (' + cobertura + ' %)',
        totalPendientes + (totalPendientes === 1 ? ' sesión quedará pendiente' : ' sesiones quedarán pendientes') + ' con su motivo. ' +
        (alternativaResuelve ? 'Con el modo «Con alternativa del Léeme» se cubren las ' + totalSesiones + '.' : 'El horario se genera igual, sin cruces, y cada pendiente se explica en el reporte.'));
    } else if (!items.some((i) => i.nivel === 'error')) {
      add('ok', 'Listo para generar', 'La carga cabe en la capacidad y disponibilidad de los docentes: se pueden cubrir las ' + totalSesiones + ' sesiones.');
    }
    return cerrar(items, carga, asig.decisiones, { requeridas: totalSesiones, posibles: totalSesiones - totalPendientes, pendientes, modo });
  }

  function cerrar(items, carga, decisiones, proyeccion) {
    const nivel = items.some((i) => i.nivel === 'error') ? 'error' : items.some((i) => i.nivel === 'aviso') ? 'aviso' : 'ok';
    return { nivel, items, carga, decisiones: decisiones || [], proyeccion: proyeccion || null };
  }

  H.diagnosticar = diagnosticar;
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
})(typeof window !== 'undefined' ? window : globalThis);
