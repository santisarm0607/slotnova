/* SlotNova · qr.js
 * Generador de códigos QR sin librerías: modo byte (UTF-8), corrección L/M/Q/H y máscara elegida por
 * penalización, según la norma ISO/IEC 18004. La estructura sigue el algoritmo de referencia de
 * Project Nayuki (licencia MIT).
 * Uso: const qr = HorarIA.qr.generar('https://…', 'M'); HorarIA.qr.dibujar(canvas, qr, 8);
 */
(function (global) {
  'use strict';
  const H = global.HorarIA = global.HorarIA || {};

  const NIVEL = { L: 0, M: 1, Q: 2, H: 3 };
  const BITS_FORMATO = [1, 0, 3, 2]; // L, M, Q, H
  const ECC_POR_BLOQUE = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  const NUM_BLOQUES = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];

  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  // Módulos disponibles para datos (sin patrones fijos) en una versión
  function modulosCrudos(v) {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) {
      const n = Math.floor(v / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (v >= 7) r -= 36;
    }
    return r;
  }
  const codigosDatos = (v, e) => Math.floor(modulosCrudos(v) / 8) - ECC_POR_BLOQUE[e][v] * NUM_BLOQUES[e][v];

  // Reed-Solomon sobre GF(2^8) con el polinomio 0x11D
  function multiplicar(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function divisorRS(grado) {
    const r = new Array(grado - 1).fill(0).concat([1]);
    let raiz = 1;
    for (let i = 0; i < grado; i++) {
      for (let j = 0; j < r.length; j++) {
        r[j] = multiplicar(r[j], raiz);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      raiz = multiplicar(raiz, 0x02);
    }
    return r;
  }
  function restoRS(datos, divisor) {
    const r = divisor.map(() => 0);
    datos.forEach((b) => {
      const factor = b ^ r.shift();
      r.push(0);
      divisor.forEach((c, i) => { r[i] ^= multiplicar(c, factor); });
    });
    return r;
  }

  // Divide en bloques, agrega la corrección de errores y entrelaza
  function intercalar(datos, v, e) {
    const nBloques = NUM_BLOQUES[e][v], eccLen = ECC_POR_BLOQUE[e][v];
    const crudos = Math.floor(modulosCrudos(v) / 8);
    const cortos = nBloques - crudos % nBloques, largoCorto = Math.floor(crudos / nBloques);
    const div = divisorRS(eccLen), bloques = [];
    for (let i = 0, k = 0; i < nBloques; i++) {
      const dat = datos.slice(k, k + largoCorto - eccLen + (i < cortos ? 0 : 1));
      k += dat.length;
      const ecc = restoRS(dat, div);
      if (i < cortos) dat.push(0);
      bloques.push(dat.concat(ecc));
    }
    const r = [];
    for (let i = 0; i < bloques[0].length; i++) {
      bloques.forEach((b, j) => { if (i !== largoCorto - eccLen || j >= cortos) r.push(b[i]); });
    }
    return r;
  }

  function generar(texto, nivel) {
    const e = NIVEL[nivel || 'M'];
    const bytes = Array.from(new TextEncoder().encode(String(texto)));
    let v = 1;
    for (; v <= 40; v++) if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= codigosDatos(v, e) * 8) break;
    if (v > 40) throw new Error('El texto es demasiado largo para un código QR.');

    // Bits: modo byte, longitud, datos, terminador y relleno
    const bits = [];
    const poner = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    poner(4, 4);
    poner(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach((b) => poner(b, 8));
    const capacidad = codigosDatos(v, e) * 8;
    poner(0, Math.min(4, capacidad - bits.length));
    poner(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < capacidad; pad ^= 0xEC ^ 0x11) poner(pad, 8);
    const datos = [];
    for (let i = 0; i < bits.length; i += 8) datos.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

    const tam = v * 4 + 17;
    const m = Array.from({ length: tam }, () => new Array(tam).fill(false));
    const fijo = Array.from({ length: tam }, () => new Array(tam).fill(false));
    const fijar = (x, y, oscuro) => { m[y][x] = oscuro; fijo[y][x] = true; };

    // Patrones fijos: sincronización, buscadores, alineación, formato y versión
    for (let i = 0; i < tam; i++) { fijar(6, i, i % 2 === 0); fijar(i, 6, i % 2 === 0); }
    [[3, 3], [tam - 4, 3], [3, tam - 4]].forEach(([cx, cy]) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < tam && y >= 0 && y < tam) fijar(x, y, d !== 2 && d !== 4);
      }
    });
    const alin = [];
    if (v > 1) {
      const n = Math.floor(v / 7) + 2;
      const paso = v === 32 ? 26 : Math.ceil((tam - 13) / (n * 2 - 2)) * 2;
      alin.push(6);
      for (let p = tam - 7; alin.length < n; p -= paso) alin.splice(1, 0, p);
    }
    alin.forEach((ax, i) => alin.forEach((ay, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === alin.length - 1) || (i === alin.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fijar(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    function dibujarFormato(mascara) {
      const dat = (BITS_FORMATO[e] << 3) | mascara;
      let rem = dat;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((dat << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) fijar(8, i, bit(b, i));
      fijar(8, 7, bit(b, 6)); fijar(8, 8, bit(b, 7)); fijar(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) fijar(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) fijar(tam - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) fijar(8, tam - 15 + i, bit(b, i));
      fijar(8, tam - 8, true);
    }
    dibujarFormato(0);
    if (v >= 7) {
      let rem = v;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const b = (v << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const a = tam - 11 + i % 3, c = Math.floor(i / 3);
        fijar(a, c, bit(b, i)); fijar(c, a, bit(b, i));
      }
    }

    // Datos en zigzag de derecha a izquierda
    const todo = intercalar(datos, v, e);
    let k = 0;
    for (let der = tam - 1; der >= 1; der -= 2) {
      if (der === 6) der = 5;
      for (let vert = 0; vert < tam; vert++) for (let j = 0; j < 2; j++) {
        const x = der - j, sube = ((der + 1) & 2) === 0, y = sube ? tam - 1 - vert : vert;
        if (!fijo[y][x] && k < todo.length * 8) { m[y][x] = bit(todo[k >>> 3], 7 - (k & 7)); k++; }
      }
    }

    const MASCARAS = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
    ];
    const enmascarar = (k2) => {
      for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) if (!fijo[y][x] && MASCARAS[k2](x, y)) m[y][x] = !m[y][x];
    };
    function penalizacion() {
      let p = 0;
      for (let eje = 0; eje < 2; eje++) for (let a = 0; a < tam; a++) {
        const val = (b) => (eje ? m[b][a] : m[a][b]);
        let corrida = 1, ventana = 0;
        for (let b = 0; b < tam; b++) {
          if (b > 0) {
            if (val(b) === val(b - 1)) { corrida++; if (corrida === 5) p += 3; else if (corrida > 5) p++; } else corrida = 1;
          }
          ventana = ((ventana << 1) | (val(b) ? 1 : 0)) & 0x7FF;
          if (b >= 10 && (ventana === 0x5D0 || ventana === 0x05D)) p += 40;
        }
      }
      let oscuros = 0;
      for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) {
        if (m[y][x]) oscuros++;
        if (x < tam - 1 && y < tam - 1) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
      }
      const total = tam * tam;
      p += Math.max(0, Math.ceil(Math.abs(oscuros * 20 - total * 10) / total) - 1) * 10;
      return p;
    }
    let mejor = 0, menor = Infinity;
    for (let k2 = 0; k2 < 8; k2++) {
      enmascarar(k2); dibujarFormato(k2);
      const p = penalizacion();
      if (p < menor) { menor = p; mejor = k2; }
      enmascarar(k2);
    }
    enmascarar(mejor); dibujarFormato(mejor);
    return { version: v, tamano: tam, modulos: m };
  }

  /** Pinta el código en un <canvas> con margen blanco de 4 módulos (zona silenciosa) */
  function dibujar(canvas, qr, escala) {
    escala = escala || 8;
    const margen = 4, lado = (qr.tamano + margen * 2) * escala;
    canvas.width = lado; canvas.height = lado;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, lado, lado);
    ctx.fillStyle = '#111827';
    qr.modulos.forEach((fila, y) => fila.forEach((osc, x) => { if (osc) ctx.fillRect((x + margen) * escala, (y + margen) * escala, escala, escala); }));
    return canvas;
  }

  H.qr = { generar, dibujar };
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
})(typeof window !== 'undefined' ? window : globalThis);
