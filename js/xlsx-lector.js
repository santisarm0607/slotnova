/* HorarIA · xlsx-lector.js
 * Lee archivos .xlsx sin librerías externas (funciona sin internet).
 * Un .xlsx es un ZIP con archivos XML adentro: aquí abrimos el ZIP,
 * descomprimimos cada XML y convertimos cada hoja en filas.
 *
 * Uso en el navegador:
 *   const libro = await HorarIA.leerXlsx(archivo.arrayBuffer());
 *   libro["Carga"]  →  [[encabezados...], [fila1...], ...]
 */
(function (root) {
  const H = (root.HorarIA = root.HorarIA || {});

  // ---------- Descompresión (navegador o Node) ----------
  async function inflarRaw(bytes) {
    if (typeof DecompressionStream !== 'undefined') {
      const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(flujo).arrayBuffer());
    }
    if (typeof require === 'function') {
      return new Uint8Array(require('zlib').inflateRawSync(bytes));
    }
    throw new Error('Este navegador no puede descomprimir archivos .xlsx. Usa Chrome, Edge o Firefox actualizados.');
  }

  // ---------- Lectura del ZIP ----------
  async function abrirZip(buffer) {
    const bytes = new Uint8Array(buffer);
    const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Buscar el "End of Central Directory" desde el final
    let fin = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
      if (vista.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    }
    if (fin < 0) throw new Error('El archivo no es un Excel (.xlsx) válido.');
    const total = vista.getUint16(fin + 10, true);
    let pos = vista.getUint32(fin + 16, true);
    const decodificador = new TextDecoder('utf-8');
    const entradas = {};
    for (let n = 0; n < total; n++) {
      if (vista.getUint32(pos, true) !== 0x02014b50) throw new Error('El Excel está dañado (directorio ZIP inválido).');
      const metodo = vista.getUint16(pos + 10, true);
      const tamComprimido = vista.getUint32(pos + 20, true);
      const largoNombre = vista.getUint16(pos + 28, true);
      const largoExtra = vista.getUint16(pos + 30, true);
      const largoComentario = vista.getUint16(pos + 32, true);
      const offsetLocal = vista.getUint32(pos + 42, true);
      const nombre = decodificador.decode(bytes.subarray(pos + 46, pos + 46 + largoNombre));
      entradas[nombre] = { metodo, tamComprimido, offsetLocal };
      pos += 46 + largoNombre + largoExtra + largoComentario;
    }
    async function leerTexto(nombre) {
      const e = entradas[nombre];
      if (!e) return null;
      const p = e.offsetLocal;
      const inicio = p + 30 + vista.getUint16(p + 26, true) + vista.getUint16(p + 28, true);
      const datos = bytes.subarray(inicio, inicio + e.tamComprimido);
      const crudo = e.metodo === 0 ? datos : await inflarRaw(datos);
      return decodificador.decode(crudo);
    }
    return { nombres: Object.keys(entradas), leerTexto };
  }

  // ---------- Utilidades XML ----------
  function decodificarXml(t) {
    return t
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }
  function atributo(etiqueta, nombre) {
    const m = etiqueta.match(new RegExp('\\s' + nombre + '="([^"]*)"'));
    return m ? decodificarXml(m[1]) : null;
  }
  function textosT(xml) {
    // Une todos los <t>...</t> (texto enriquecido trae varios)
    let s = '';
    const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
    let m;
    while ((m = re.exec(xml))) s += m[1] ? decodificarXml(m[1]) : '';
    return s;
  }
  function columnaAIndice(ref) {
    const letras = ref.replace(/[0-9]/g, '');
    let n = 0;
    for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  function resolverRuta(base, destino) {
    if (destino.startsWith('/')) return destino.slice(1);
    const partes = base.split('/').slice(0, -1);
    for (const p of destino.split('/')) {
      if (p === '..') partes.pop();
      else if (p !== '.') partes.push(p);
    }
    return partes.join('/');
  }

  // ---------- Lectura del libro ----------
  async function leerXlsx(entrada) {
    const buffer = entrada instanceof Promise ? await entrada : entrada;
    const zip = await abrirZip(buffer);
    const libroXml = await zip.leerTexto('xl/workbook.xml');
    if (!libroXml) throw new Error('No se encontró el libro dentro del Excel.');
    const relsXml = (await zip.leerTexto('xl/_rels/workbook.xml.rels')) || '';
    const rels = {};
    (relsXml.match(/<Relationship\b[^>]*>/g) || []).forEach((r) => {
      rels[atributo(r, 'Id')] = atributo(r, 'Target');
    });

    // Textos compartidos
    const compartidos = [];
    const ssRuta = zip.nombres.find((n) => /^xl\/sharedStrings\.xml$/i.test(n));
    if (ssRuta) {
      const ss = await zip.leerTexto(ssRuta);
      (ss.match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).forEach((si) => compartidos.push(textosT(si)));
    }

    const libro = {};
    const hojas = libroXml.match(/<sheet\b[^>]*>/g) || [];
    for (const h of hojas) {
      const nombre = atributo(h, 'name');
      const rid = atributo(h, 'r:id');
      const destino = rels[rid];
      if (!destino) continue;
      const ruta = resolverRuta('xl/workbook.xml', destino);
      const xml = await zip.leerTexto(ruta);
      if (!xml) continue;
      libro[nombre] = leerHoja(xml, compartidos);
    }
    return libro;
  }

  function leerHoja(xml, compartidos) {
    const filas = [];
    const reFila = /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g;
    let mf;
    while ((mf = reFila.exec(xml))) {
      const atribs = mf[1] || mf[3] || '';
      const numFila = parseInt(atributo(' ' + atribs, 'r') || String(filas.length + 1), 10) - 1;
      const fila = [];
      const contenido = mf[2] || '';
      const reCelda = /<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;
      let mc, colAuto = 0;
      while ((mc = reCelda.exec(contenido))) {
        const atr = ' ' + (mc[1] !== undefined ? mc[1] : mc[2]);
        const interior = mc[3] || '';
        const ref = atributo(atr, 'r');
        const col = ref ? columnaAIndice(ref) : colAuto;
        colAuto = col + 1;
        const tipo = atributo(atr, 't');
        let valor = null;
        const v = interior.match(/<v>([\s\S]*?)<\/v>/);
        if (tipo === 's') valor = v ? compartidos[parseInt(v[1], 10)] : null;
        else if (tipo === 'inlineStr') valor = textosT(interior);
        else if (tipo === 'str' || tipo === 'e') valor = v ? decodificarXml(v[1]) : null;
        else if (tipo === 'b') valor = v ? v[1] === '1' : null;
        else if (v) {
          const num = Number(v[1]);
          valor = Number.isNaN(num) ? decodificarXml(v[1]) : num;
        }
        fila[col] = valor;
      }
      filas[numFila] = fila;
    }
    // Rellenar huecos para que todas las filas sean arreglos
    for (let i = 0; i < filas.length; i++) if (!filas[i]) filas[i] = [];
    return filas;
  }

  H.leerXlsx = leerXlsx;
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
})(typeof window !== 'undefined' ? window : globalThis);
