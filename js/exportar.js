/* SlotNova · exportar.js
 * Exporta el horario como imagen (PNG o JPEG), PDF y enlace compartido (para el código QR), sin librerías.
 * Todo parte de un «horario compartido»: un objeto compacto con días, bloques, materias, docentes,
 * salones, las celdas de cada curso y los eventos. app.js lo arma desde el estado; el visor del celular
 * lo recibe por el enlace (#ver=…).
 *
 * API: HorarIA.exportar = { modeloVista, lienzo, lienzoVarios, imagen, pdf, codificar, decodificar, COLORES }
 */
(function (global) {
  'use strict';
  const H = global.HorarIA = global.HorarIA || {};

  // Mismos colores que .mat-0 … .mat-9 en estilos.css: [color fuerte, fondo]
  const COLORES = [['#1d4ed8', '#e3ebff'], ['#b91c1c', '#fde6e6'], ['#047857', '#dcf3e9'], ['#92400e', '#faecd8'], ['#6d28d9', '#eee6fd'],
    ['#0e7490', '#daf1f6'], ['#be185d', '#fce4ef'], ['#4d7c0f', '#e8f3d6'], ['#374151', '#e6e9ee'], ['#c2410c', '#fde9dc']];
  const LOGO = ['M598 2V294H327L322 622Q307 625 292 625A292 311.5 0 0 1 292 2Z', 'M488 739L772 738L775 403Q792 401 810 401A303 317 0 0 1 810 1035H490Z'];

  // Celdas compactas para que el QR sea corto: 3 caracteres por clase (materia, docente, salón);
  // «---» = hora libre, «_» = sin docente o sin salón. Las clases movidas van aparte por posición.
  const ALFABETO = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function compactarCeldas(celdas) {
    if (celdas.some((k) => k && k.slice(0, 3).some((n) => n >= ALFABETO.length))) return null;
    const letra = (n) => (n < 0 ? '_' : ALFABETO[n]);
    return [celdas.map((k) => (k ? k.slice(0, 3).map(letra).join('') : '---')).join(''), celdas.map((k, i) => (k && k[3] ? i : -1)).filter((i) => i >= 0)];
  }

  // ---------------- Modelo de una vista (curso, docente o salón) ----------------
  function modeloVista(c, tipo, id) {
    const nb = c.bloques.length;
    const cursoIdx = (cid) => c.cursos.findIndex((x) => x[0] === cid);
    const celdaDe = (ci, di, bi) => {
      const cu = c.cursos[ci], p = di * nb + bi;
      if (!cu) return 0;
      if (typeof cu[1] !== 'string') return cu[1][p] || 0;
      const s = cu[1].substr(p * 3, 3);
      if (!s || s.charAt(0) === '-') return 0;
      const k = Array.from(s).map((ch) => (ch === '_' ? -1 : ALFABETO.indexOf(ch)));
      if ((cu[2] || []).includes(p)) k.push(1);
      return k;
    };
    const eventosDe = (di, bi, curso) => (c.ev || []).filter((e) => e[2] === di && e[3].includes(bi) && (!e[4].length || (curso && e[4].includes(curso))))
      .map((e) => ({ titulo: e[0], color: e[1] }));
    const armar = (k, curso) => {
      if (!k) return null;
      const a = c.asig[k[0]] || ['?', 8, '?'], col = COLORES[a[1] % COLORES.length];
      return { asig: a[0], sigla: a[2], color: col[0], fondo: col[1], docente: c.doc[k[1]] || '', salon: c.sal[k[2]] || '', curso, movida: !!k[3] };
    };
    const filas = c.bloques.map((b, bi) => c.dias.map((d, di) => {
      let cl = null, curso = null;
      if (tipo === 'curso') { curso = id; cl = armar(celdaDe(cursoIdx(id), di, bi), id); }
      else {
        const campo = tipo === 'docente' ? 1 : 2, buscado = Number(id);
        c.cursos.forEach((cu, ci) => { const k = celdaDe(ci, di, bi); if (k && k[campo] === buscado && !cl) { curso = cu[0]; cl = armar(k, cu[0]); } });
      }
      const ev = eventosDe(di, bi, curso || (tipo === 'curso' ? id : null));
      if (!cl) return { libre: true, eventos: ev };
      cl.l2 = tipo === 'docente' ? 'Curso ' + cl.curso : cl.docente;
      cl.l3 = tipo === 'salon' ? 'Curso ' + cl.curso : cl.salon;
      cl.eventos = ev;
      return cl;
    }));
    const titulo = tipo === 'curso' ? 'Curso ' + id : tipo === 'docente' ? (c.doc[Number(id)] || 'Docente') : (c.sal[Number(id)] || 'Salón');
    const usadas = new Set();
    filas.forEach((f) => f.forEach((x) => { if (!x.libre) usadas.add(x.asig); }));
    return {
      titulo, subtitulo: c.titulo || 'Horario semanal',
      dias: c.dias, bloques: c.bloques.map((b) => ({ id: b[0], inicio: b[1], fin: b[2] })),
      descanso: c.descanso ? { despues: c.descanso[0], inicio: c.descanso[1], fin: c.descanso[2], minutos: c.descanso[3] } : null,
      filas,
      leyenda: c.asig.filter((a) => usadas.has(a[0])).map((a) => ({ asig: a[0], sigla: a[2], color: COLORES[a[1] % COLORES.length][0] })),
    };
  }

  // ---------------- Dibujo en canvas ----------------
  const FUENTE = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  function recortar(ctx, texto, ancho) {
    texto = String(texto || '');
    if (ctx.measureText(texto).width <= ancho) return texto;
    while (texto.length > 1 && ctx.measureText(texto + '…').width > ancho) texto = texto.slice(0, -1);
    return texto + '…';
  }
  function partir(ctx, texto, ancho, maxLineas) {
    const palabras = String(texto || '').split(/\s+/), lineas = [];
    let actual = '';
    palabras.forEach((p) => {
      const prueba = actual ? actual + ' ' + p : p;
      if (ctx.measureText(prueba).width <= ancho || !actual) actual = prueba;
      else { lineas.push(actual); actual = p; }
    });
    if (actual) lineas.push(actual);
    if (lineas.length > maxLineas) { const resto = lineas.slice(maxLineas - 1).join(' '); lineas.length = maxLineas - 1; lineas.push(recortar(ctx, resto, ancho)); }
    return lineas.map((l) => recortar(ctx, l, ancho));
  }
  function rectRedondo(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function logo(ctx, x, y, alto) {
    const k = alto / 1036;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.fillStyle = '#47529f';
    LOGO.forEach((d) => ctx.fill(new Path2D(d)));
    ctx.fillStyle = '#84cde4';
    rectRedondo(ctx, 683, 0, 368, 333, 63); ctx.fill();
    rectRedondo(ctx, 47, 674, 381, 355, 63); ctx.fill();
    ctx.restore();
  }

  function lienzo(v, escala) {
    escala = escala || 2;
    const W = 1400, M = 36, COLH = 118, FILA = 92, FILA_D = 32, CAB = 38;
    const colW = (W - M * 2 - COLH) / v.dias.length;
    const medir = document.createElement('canvas').getContext('2d');
    medir.font = '600 13px ' + FUENTE;
    let filasLeyenda = 1, xl = 0;
    v.leyenda.forEach((l) => { const w = 44 + medir.measureText(l.asig).width + 18; if (xl + w > W - M * 2) { filasLeyenda++; xl = 0; } xl += w; });
    const yTabla = 132;
    const altoTabla = CAB + v.bloques.length * FILA + (v.descanso ? FILA_D : 0);
    const Hh = yTabla + altoTabla + 24 + filasLeyenda * 28 + 44;
    const cv = document.createElement('canvas');
    cv.width = W * escala; cv.height = Hh * escala;
    const ctx = cv.getContext('2d');
    ctx.scale(escala, escala);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, Hh);
    ctx.textBaseline = 'alphabetic';

    // Encabezado: logo, marca, título
    logo(ctx, M, 26, 44);
    ctx.fillStyle = '#47529f'; ctx.font = '900 22px "Arial Black", ' + FUENTE;
    ctx.fillText('SLOTNOVA', M + 58, 50);
    ctx.fillStyle = '#6b7280'; ctx.font = '600 10px ' + FUENTE;
    ctx.fillText('PLANIFICACIÓN INTELIGENTE', M + 59, 66);
    ctx.fillStyle = '#14213d'; ctx.font = '800 28px ' + FUENTE;
    ctx.fillText(recortar(ctx, v.titulo, W - M * 2), M, 108);
    ctx.fillStyle = '#4a5568'; ctx.font = '500 15px ' + FUENTE;
    ctx.textAlign = 'right';
    ctx.fillText(recortar(ctx, v.subtitulo, 520), W - M, 50);
    ctx.textAlign = 'left';

    // Cabecera de la tabla
    let y = yTabla;
    ctx.fillStyle = '#eef2f8'; rectRedondo(ctx, M, y, W - M * 2, CAB, 8); ctx.fill();
    ctx.fillStyle = '#14213d'; ctx.font = '700 14px ' + FUENTE;
    ctx.fillText('Hora', M + 12, y + 24);
    v.dias.forEach((d, i) => ctx.fillText(d, M + COLH + i * colW + 10, y + 24));
    y += CAB;

    v.bloques.forEach((b, bi) => {
      ctx.fillStyle = '#14213d'; ctx.font = '700 13px ' + FUENTE;
      ctx.fillText(b.inicio + '–' + b.fin, M + 10, y + 22);
      ctx.fillStyle = '#6b7280'; ctx.font = '500 11px ' + FUENTE;
      ctx.fillText(b.id, M + 10, y + 38);
      v.dias.forEach((d, di) => {
        const c = v.filas[bi][di], x = M + COLH + di * colW + 4, cy = y + 4, w = colW - 8, h = FILA - 8;
        if (c.libre) {
          ctx.fillStyle = '#f5f6f8'; rectRedondo(ctx, x, cy, w, h, 8); ctx.fill();
          ctx.fillStyle = '#9ca3af'; ctx.font = '500 13px ' + FUENTE; ctx.fillText('Libre', x + 12, cy + 22);
        } else {
          ctx.fillStyle = c.fondo; rectRedondo(ctx, x, cy, w, h, 8); ctx.fill();
          ctx.fillStyle = c.color; rectRedondo(ctx, x, cy, 5, h, 2); ctx.fill();
          ctx.font = '800 10px ' + FUENTE;
          const ws = ctx.measureText(c.sigla).width + 10;
          rectRedondo(ctx, x + 12, cy + 8, ws, 17, 4); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.fillText(c.sigla, x + 17, cy + 20.5);
          ctx.fillStyle = '#14213d'; ctx.font = '700 13px ' + FUENTE;
          const lineas = partir(ctx, c.asig, w - ws - 30, 2);
          lineas.forEach((l, i) => ctx.fillText(l, x + 18 + ws, cy + 21 + i * 15));
          ctx.fillStyle = '#374151'; ctx.font = '500 12px ' + FUENTE;
          const yb = cy + (lineas.length > 1 ? 52 : 42);
          ctx.fillText(recortar(ctx, c.l2, w - 24), x + 12, yb);
          ctx.fillText(recortar(ctx, c.l3, w - 24), x + 12, yb + 15);
          if (c.movida) {
            ctx.font = '800 10px ' + FUENTE; ctx.fillStyle = '#9a3412';
            const wm = ctx.measureText('↻ MOVIDA').width + 10;
            rectRedondo(ctx, x + w - wm - 6, cy + 8, wm, 16, 4); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.fillText('↻ MOVIDA', x + w - wm - 1, cy + 20);
          }
        }
        (c.eventos || []).slice(0, 1).forEach((e) => {
          ctx.font = '700 10px ' + FUENTE;
          const t = recortar(ctx, '★ ' + e.titulo, w - 24);
          const we = ctx.measureText(t).width + 12;
          ctx.fillStyle = e.color; rectRedondo(ctx, x + 10, cy + h - 21, we, 16, 8); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.fillText(t, x + 16, cy + h - 9.5);
        });
      });
      ctx.strokeStyle = '#e5e7eb'; ctx.beginPath(); ctx.moveTo(M, y + FILA); ctx.lineTo(W - M, y + FILA); ctx.stroke();
      y += FILA;
      if (v.descanso && v.descanso.despues === b.id) {
        ctx.fillStyle = '#fff3d6'; rectRedondo(ctx, M, y + 3, W - M * 2, FILA_D - 6, 6); ctx.fill();
        ctx.fillStyle = '#8a4b00'; ctx.font = '700 13px ' + FUENTE;
        ctx.fillText(v.descanso.inicio + '–' + v.descanso.fin, M + 10, y + 21);
        ctx.textAlign = 'center';
        ctx.fillText('Descanso · ' + v.descanso.minutos + ' min', M + COLH + (W - M * 2 - COLH) / 2, y + 21);
        ctx.textAlign = 'left';
        y += FILA_D;
      }
    });

    // Leyenda y pie
    y += 24; let x = M;
    v.leyenda.forEach((l) => {
      ctx.font = '600 13px ' + FUENTE;
      const w = 44 + ctx.measureText(l.asig).width + 18;
      if (x + w > W - M) { x = M; y += 28; }
      ctx.fillStyle = l.color; rectRedondo(ctx, x, y - 13, 38, 18, 4); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = '800 10px ' + FUENTE; ctx.textAlign = 'center';
      ctx.fillText(l.sigla, x + 19, y);
      ctx.textAlign = 'left'; ctx.fillStyle = '#14213d'; ctx.font = '600 13px ' + FUENTE;
      ctx.fillText(l.asig, x + 44, y);
      x += w;
    });
    ctx.fillStyle = '#6b7280'; ctx.font = '500 12px ' + FUENTE;
    ctx.fillText('Generado con SlotNova · ' + new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }), M, Hh - 18);
    return cv;
  }

  // Varias vistas una debajo de otra (para «Todos los cursos» en imagen)
  function lienzoVarios(vistas, escala) {
    const partes = vistas.map((v) => lienzo(v, escala));
    const cv = document.createElement('canvas');
    cv.width = Math.max.apply(null, partes.map((p) => p.width));
    cv.height = partes.reduce((a, p) => a + p.height, 0);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    let y = 0;
    partes.forEach((p) => { ctx.drawImage(p, 0, y); y += p.height; });
    return cv;
  }

  const aBlob = (cv, tipo, calidad) => new Promise((ok, mal) => cv.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo crear la imagen.'))), tipo, calidad));
  async function imagen(cv, formato) {
    const tipo = formato === 'jpeg' ? 'image/jpeg' : 'image/png';
    if (tipo === 'image/jpeg') {
      // JPEG no tiene transparencia: fondo blanco asegurado
      const fondo = document.createElement('canvas'); fondo.width = cv.width; fondo.height = cv.height;
      const c = fondo.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, fondo.width, fondo.height); c.drawImage(cv, 0, 0);
      cv = fondo;
    }
    return new Uint8Array(await (await aBlob(cv, tipo, 0.92)).arrayBuffer());
  }

  // ---------------- PDF con una imagen JPEG por página ----------------
  async function pdf(lienzos) {
    const enc = new TextEncoder();
    const partes = []; let largo = 0;
    const offsets = [];
    const agregar = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; partes.push(b); largo += b.length; };
    const objeto = (n, cuerpo) => { offsets[n] = largo; agregar(n + ' 0 obj\n'); [].concat(cuerpo).forEach(agregar); agregar('\nendobj\n'); };
    const n = lienzos.length;
    agregar('%PDF-1.4\n');
    agregar(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A])); // comentario binario: marca el archivo como binario
    objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
    objeto(2, '<< /Type /Pages /Kids [' + lienzos.map((_, i) => (3 + i * 3) + ' 0 R').join(' ') + '] /Count ' + n + ' >>');
    for (let i = 0; i < n; i++) {
      const cv = lienzos[i];
      const jpg = await imagen(cv, 'jpeg');
      const vertical = cv.height > cv.width;
      const PW = vertical ? 595 : 842, PH = vertical ? 842 : 595, mg = 24;
      const k = Math.min((PW - mg * 2) / cv.width, (PH - mg * 2) / cv.height);
      const w = cv.width * k, h = cv.height * k, x = (PW - w) / 2, y = PH - mg - h;
      const pag = 3 + i * 3, cont = pag + 1, img = pag + 2;
      const dibujo = 'q ' + w.toFixed(2) + ' 0 0 ' + h.toFixed(2) + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' cm /Im' + i + ' Do Q';
      objeto(pag, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im' + i + ' ' + img + ' 0 R >> >> /Contents ' + cont + ' 0 R >>');
      objeto(cont, ['<< /Length ' + dibujo.length + ' >>\nstream\n', dibujo, '\nendstream']);
      objeto(img, ['<< /Type /XObject /Subtype /Image /Width ' + cv.width + ' /Height ' + cv.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n', jpg, '\nendstream']);
    }
    const total = 3 + n * 3;
    const xref = largo;
    let tabla = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (let i = 1; i < total; i++) tabla += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    agregar(tabla + 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    const out = new Uint8Array(largo);
    let p = 0;
    partes.forEach((b) => { out.set(b, p); p += b.length; });
    return out;
  }

  // ---------------- Enlace compartido (texto corto para el QR) ----------------
  const aBase64url = (bytes) => { let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const deBase64url = (t) => { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
  async function transformar(bytes, flujo) {
    const r = new Response(new Blob([bytes]).stream().pipeThrough(flujo));
    return new Uint8Array(await r.arrayBuffer());
  }
  async function codificar(obj) {
    const json = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'function') {
      try { return 'z' + aBase64url(await transformar(json, new CompressionStream('deflate-raw'))); } catch (e) { /* sin compresión */ }
    }
    return 'j' + aBase64url(json);
  }
  async function decodificar(texto) {
    const tipo = texto.charAt(0), bytes = deBase64url(texto.slice(1));
    const plano = tipo === 'z' ? await transformar(bytes, new DecompressionStream('deflate-raw')) : bytes;
    const obj = JSON.parse(new TextDecoder().decode(plano));
    if (!obj || obj.v !== 1 || !Array.isArray(obj.cursos)) throw new Error('El enlace no contiene un horario válido.');
    return obj;
  }

  H.exportar = { COLORES, compactarCeldas, modeloVista, lienzo, lienzoVarios, imagen, pdf, codificar, decodificar };
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
})(typeof window !== 'undefined' ? window : globalThis);
