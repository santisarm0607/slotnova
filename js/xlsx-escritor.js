/* HorarIA · xlsx-escritor.js
 * Crea archivos .xlsx sin librerías externas (funciona sin internet).
 *
 * Uso:
 *   const bytes = HorarIA.escribirXlsx([
 *     { nombre: 'Horario', filas: [['curso', 'dia'], ['6A', 'Lunes']], anchos: [10, 12] },
 *   ]);
 *   HorarIA.descargar(bytes, 'horario.xlsx');
 *
 * Estilos de celda: la primera fila sale en negrilla con fondo. Las celdas
 * con saltos de línea ("\n") se muestran con ajuste de texto.
 */
(function (root) {
  const H = (root.HorarIA = root.HorarIA || {});

  // ---------- CRC32 (requerido por el formato ZIP) ----------
  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // ---------- ZIP sin compresión ----------
  function crearZip(archivos) {
    const cod = new TextEncoder();
    const partes = [], centrales = [];
    let offset = 0;
    const fechaDos = ((2026 - 1980) << 9) | (10 << 5) | 29;
    archivos.forEach(({ nombre, contenido }) => {
      const nombreB = cod.encode(nombre);
      const datos = typeof contenido === 'string' ? cod.encode(contenido) : contenido;
      const crc = crc32(datos);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, fechaDos, true);
      local.setUint32(14, crc, true); local.setUint32(18, datos.length, true); local.setUint32(22, datos.length, true);
      local.setUint16(26, nombreB.length, true); local.setUint16(28, 0, true);
      partes.push(new Uint8Array(local.buffer), nombreB, datos);
      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true);
      central.setUint16(8, 0x0800, true); central.setUint16(10, 0, true); central.setUint16(12, 0, true); central.setUint16(14, fechaDos, true);
      central.setUint32(16, crc, true); central.setUint32(20, datos.length, true); central.setUint32(24, datos.length, true);
      central.setUint16(28, nombreB.length, true); central.setUint32(42, offset, true);
      centrales.push(new Uint8Array(central.buffer), nombreB);
      offset += 30 + nombreB.length + datos.length;
    });
    const tamCentral = centrales.reduce((a, p) => a + p.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true);
    const todo = partes.concat(centrales, [new Uint8Array(fin.buffer)]);
    const total = todo.reduce((a, p) => a + p.length, 0);
    const salida = new Uint8Array(total);
    let pos = 0; todo.forEach((p) => { salida.set(p, pos); pos += p.length; });
    return salida;
  }

  // ---------- XML de la hoja ----------
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  function columna(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function nombreHoja(n, usados) {
    let base = String(n || 'Hoja').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Hoja';
    let nombre = base, k = 2;
    while (usados.has(nombre.toLowerCase())) { const suf = ' (' + k++ + ')'; nombre = base.slice(0, 31 - suf.length) + suf; }
    usados.add(nombre.toLowerCase());
    return nombre;
  }
  function hojaXml(hoja) {
    const filas = hoja.filas || [];
    const cols = (hoja.anchos || []).map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('');
    const congelar = hoja.congelarEncabezado !== false && filas.length > 1
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    const filasXml = filas.map((fila, r) => {
      const alto = (fila || []).reduce((m, v) => Math.max(m, typeof v === 'string' ? v.split('\n').length : 1), 1);
      const celdas = (fila || []).map((v, c) => {
        if (v === null || v === undefined || v === '') return '';
        const ref = columna(c) + (r + 1);
        const estilo = r === 0 && hoja.encabezado !== false ? ' s="1"' : (typeof v === 'string' && v.includes('\n') ? ' s="2"' : '');
        if (typeof v === 'number' && Number.isFinite(v)) return '<c r="' + ref + '"' + estilo + '><v>' + v + '</v></c>';
        if (typeof v === 'boolean') return '<c r="' + ref + '"' + estilo + ' t="b"><v>' + (v ? 1 : 0) + '</v></c>';
        return '<c r="' + ref + '"' + estilo + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
      }).join('');
      const ht = alto > 1 ? ' ht="' + (alto * 15) + '" customHeight="1"' : '';
      return '<row r="' + (r + 1) + '"' + ht + '>' + celdas + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      congelar + (cols ? '<cols>' + cols + '</cols>' : '') + '<sheetData>' + filasXml + '</sheetData></worksheet>';
  }

  const ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function escribirXlsx(hojas) {
    const usados = new Set();
    const nombres = hojas.map((h) => nombreHoja(h.nombre, usados));
    const archivos = [];
    archivos.push({ nombre: '[Content_Types].xml', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      hojas.map((h, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
      '</Types>' });
    archivos.push({ nombre: '_rels/.rels', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
    archivos.push({ nombre: 'xl/workbook.xml', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      nombres.map((n, i) => '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' });
    archivos.push({ nombre: 'xl/_rels/workbook.xml.rels', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      hojas.map((h, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (hojas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' });
    archivos.push({ nombre: 'xl/styles.xml', contenido: ESTILOS });
    hojas.forEach((h, i) => archivos.push({ nombre: 'xl/worksheets/sheet' + (i + 1) + '.xml', contenido: hojaXml(h) }));
    return crearZip(archivos);
  }

  /** Arma el libro de exportación a partir del resultado (rep: HorarIA.reporte, opcional) */
  function libroHorario(datos, resultado, certificado, rep) {
    const filas = resultado.filas;
    const hojas = [];
    hojas.push({
      nombre: 'Horario',
      filas: [['curso_id', 'dia', 'bloque_id', 'inicio', 'fin', 'asignatura', 'docente_id', 'docente', 'salon_id', 'salon', 'tipo_salon', 'cambio']]
        .concat(filas.map((f) => [f.curso, f.dia, f.bloque, f.inicio, f.fin, f.asignatura || 'Libre', f.docente || '', f.docenteNombre || '', f.salon || '', f.salonNombre || '', f.tipoSalon || '', f.cambio ? 'sí' : ''])),
      anchos: [9, 11, 10, 8, 8, 26, 11, 18, 9, 16, 18, 8],
    });
    const cuadricula = (titulo, filtro, celda) => {
      const tabla = [[titulo].concat(datos.dias)];
      datos.bloques.forEach((b) => {
        const fila = [b.id + (b.inicio ? ' ' + b.inicio + '-' + b.fin : '')];
        datos.dias.forEach((dia) => {
          const f = filas.filter((x) => x.dia === dia && x.bloque === b.id && x.asignatura && filtro(x));
          fila.push(f.map(celda).join('\n—\n'));
        });
        tabla.push(fila);
      });
      return tabla;
    };
    datos.cursos.forEach((c) => hojas.push({ nombre: 'Curso ' + c.id, filas: cuadricula(c.id, (x) => x.curso === c.id, (x) => x.asignatura + '\n' + x.docenteNombre + '\n' + (x.salonNombre || '')), anchos: [16, 24, 24, 24, 24, 24, 24] }));
    datos.docentes.forEach((d) => hojas.push({ nombre: d.id + ' ' + d.nombre, filas: cuadricula(d.nombre, (x) => x.docente === d.id, (x) => x.curso + ' · ' + x.asignatura + '\n' + (x.salonNombre || '')), anchos: [16, 24, 24, 24, 24, 24, 24] }));
    if (rep) {
      const inf = rep.infracciones, pref = rep.preferencias;
      const filasRep = [['métrica', 'valor', 'cómo se calcula'],
        ['Modo de docentes', rep.modoDocente === 'estricto' ? 'Estricto (solo docente asignado)' : 'Con alternativa habilitada (Léeme)', ''],
        ['Sesiones requeridas', rep.requeridas, 'Suma de sesiones_semana de la hoja Carga'],
        ['Sesiones asignadas', rep.asignadas, 'Filas con asignatura'],
        ['Sesiones válidas', rep.validas, 'Cumplen todas las reglas obligatorias; no cuentan duplicadas ni sobrantes'],
        ['Sesiones pendientes', rep.pendientes, 'Requeridas − válidas'],
        ['Cobertura (%)', rep.cobertura, 'Válidas ÷ requeridas × 100'],
        [],
        ['Colisiones (pares) · total', rep.colisiones.total, 'Pares que comparten curso, docente o salón en el mismo día y bloque'],
        ['Colisiones de curso', rep.colisiones.porCurso.length, ''],
        ['Colisiones de docente', rep.colisiones.porDocente.length, ''],
        ['Colisiones de salón', rep.colisiones.porSalon.length, ''],
        [],
        ['Infracciones · total', inf.total, 'Se informan aparte de las pendientes'],
        ['Disponibilidad docente', inf.disponibilidad.length, inf.disponibilidad.slice(0, 10).join('\n')],
        ['Docente no asignado', inf.docenteNoAsignado.length, inf.docenteNoAsignado.slice(0, 10).join('\n')],
        ['Docente no habilitado', inf.docenteNoHabilitado.length, inf.docenteNoHabilitado.slice(0, 10).join('\n')],
        ['Tipo o capacidad de salón', inf.salonTipoCapacidad.length, inf.salonTipoCapacidad.slice(0, 10).join('\n')],
        ['Máximo semanal del docente', inf.maxSemanalDocente.length, inf.maxSemanalDocente.slice(0, 10).join('\n')],
        ['Intensidad excedida', inf.intensidadExcedida.length, inf.intensidadExcedida.slice(0, 10).join('\n')],
        ['Reglas del coordinador', inf.reglasCoordinador.length, inf.reglasCoordinador.slice(0, 10).join('\n')],
        [],
        ['Preferencias · puntaje de calidad (0-100)', pref.puntaje, ''],
        ['Sesiones consecutivas de la misma asignatura', pref.consecutivas.total, pref.consecutivas.detalle.slice(0, 15).map((x) => x.curso + ' · ' + x.asignatura + ' · ' + x.dia + ' ' + x.bloques).join('\n')],
        ['Asignatura repetida el mismo día', pref.mismoDia.total, ''],
        ['Asignaturas repartidas en días distintos', pref.repartidas.cumplen + ' de ' + pref.repartidas.total, ''],
        ['Huecos docentes', pref.huecosDocentes.total, pref.huecosDocentes.detalle.map((x) => x.nombre + ' · ' + x.dia + ': ' + x.bloques.join(', ')).join('\n')],
      ];
      if (rep.cambio) {
        filasRep.push([], ['Prueba de cambio · sesiones afectadas', rep.cambio.resumen.afectadas, rep.cambio.afectadas.map((x) => x.curso + ' · ' + x.asignatura + ' · ' + x.dia + ' ' + x.bloque).join('\n')],
          ['Prueba de cambio · sesiones movidas', rep.cambio.resumen.movidas, rep.cambio.movidas.map((x) => x.curso + ' · ' + x.asignatura + ': ' + x.antes.dia + ' ' + x.antes.bloque + ' → ' + x.ahora.dia + ' ' + x.ahora.bloque).join('\n')],
          ['Prueba de cambio · pendientes nuevas', rep.cambio.resumen.pendientes, '']);
      }
      hojas.push({ nombre: 'Reporte', filas: filasRep, anchos: [44, 22, 90] });
      hojas.push({
        nombre: 'Pendientes',
        filas: [['curso_id', 'asignatura', 'docente_titular', 'sesiones_faltantes', 'motivo', 'sugerencia']]
          .concat(rep.detallePendientes.map((x) => [x.curso, x.asignatura, x.docente + ' ' + (x.docenteNombre || ''), x.faltantes, x.motivo, x.sugerencia]))
          .concat(rep.detallePendientes.length ? [] : [['Sin sesiones pendientes', '', '', 0, '', '']]),
        anchos: [9, 24, 20, 10, 70, 60],
      });
    }
    // Carga usada: docente asignado en la Carga y docente que quedó en el horario
    const docenteFinal = {};
    filas.forEach((f) => { if (f.asignatura) docenteFinal[f.curso + '|' + f.asignatura] = f.docente; });
    hojas.push({
      nombre: 'Carga usada',
      filas: [['curso_id', 'asignatura', 'docente_principal_id', 'docente_en_horario', 'sesiones_semana', 'tipo_salon_requerido']]
        .concat(datos.carga.map((x) => [x.curso, x.asignatura, x.principal, docenteFinal[x.curso + '|' + x.asignatura] || 'pendiente', x.sesiones, x.tipoSalon])),
      anchos: [9, 24, 12, 14, 10, 20],
    });
    if (certificado) {
      hojas.push({
        nombre: 'Validación',
        filas: [['verificación', 'resultado', 'detalle']]
          .concat(certificado.verificaciones.map((v) => [v.nombre, v.ok ? 'Cumple' : 'No cumple', v.errores.slice(0, 20).join('\n')]))
          .concat([[], ['Sesiones pendientes (se informan aparte)', certificado.pendientes || 0, (certificado.faltantes || []).map((x) => x.curso + ' · ' + x.asignatura + ': faltan ' + x.faltan).join('\n')]])
          .concat([['Puntaje de calidad pedagógica', certificado.calidad.puntaje, 'Materias repetidas en el día: ' + certificado.calidad.repetidas + ' · Huecos de docentes: ' + certificado.calidad.huecos]]),
        anchos: [64, 12, 80],
      });
    }
    return escribirXlsx(hojas);
  }

  /** Descarga bytes como archivo (solo funciona fuera de vistas restringidas) */
  function descargar(bytes, nombre, tipo) {
    const blob = new Blob([bytes], { type: tipo || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  H.escribirXlsx = escribirXlsx;
  H.libroHorario = libroHorario;
  H.descargar = descargar;
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
})(typeof window !== 'undefined' ? window : globalThis);
