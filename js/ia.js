/* SlotNova · ia.js
 * Conexión directa desde el navegador con Claude (Anthropic) o Gemini (Google), incluidas herramientas
 * (function calling). Funciona en GitHub Pages: cada usuario escribe su propia clave, que solo se guarda
 * en su navegador si marca «Recordar». Se usa fetch (sin SDK) porque el proyecto no tiene npm ni empaquetador.
 *
 * API:
 *   HorarIA.ia.conversar(cfg, sistema, historial, entradaUsuario, herramientas, ejecutar, avisar) → texto
 *     historial: arreglo en el formato del proveedor; solo se agrega al final (nunca se editan turnos viejos).
 *   HorarIA.ia.completar(cfg, sistema, texto) → texto (una sola respuesta, sin herramientas)
 *   HorarIA.ia.listarModelos(cfg) → [ids] (también sirve para probar la clave)
 *   cfg = { proveedor: 'anthropic' | 'gemini', modelo, clave }
 */
(function (global) {
  'use strict';
  const H = global.HorarIA = global.HorarIA || {};

  const PROVEEDORES = {
    anthropic: { nombre: 'Claude', modelo: 'claude-opus-5-5', modelos: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] },
    // Google cambia seguido sus modelos: «Probar conexión» trae la lista real de la cuenta.
    gemini: { nombre: 'Gemini', modelo: 'gemini-3.6-flash', modelos: ['gemini-3.6-flash', 'gemini-3.5-flash'] },
  };
  // Modelos de Claude que aceptan el respaldo automático del servidor si el modelo rechaza la solicitud
  const CON_RESPALDO = /^claude-(opus-5-5|sonnet-5-5|opus-5|fable-5-1)$/;
  const CON_ESFUERZO = /^claude-(opus|sonnet|haiku|fable)-5/;

  async function pedir(url, opciones) {
    let r;
    try { r = await fetch(url, opciones); } catch (e) { throw new Error('No hay conexión con el servicio de IA. Revisa tu internet.'); }
    const crudo = await r.text();
    let j = null;
    try { j = JSON.parse(crudo); } catch (e) { /* respuesta sin JSON */ }
    if (!r.ok) {
      const detalle = j && j.error ? (j.error.message || j.error.type || j.error.status || '') : crudo.slice(0, 200);
      if (r.status === 401 || r.status === 403 || (r.status === 400 && /api.?key/i.test(detalle))) throw new Error('La clave no es válida o no tiene permiso (' + r.status + '). Revísala en la configuración de la IA.');
      if (r.status === 429) throw new Error('El servicio de IA está saturado o la cuenta no tiene saldo (429). Espera un momento e inténtalo de nuevo.');
      if (r.status === 404) throw new Error('El modelo «' + (opciones.modelo || '') + '» no existe para esta clave (404). Pulsa «Probar conexión» y elige otro.');
      throw new Error('El servicio de IA respondió ' + r.status + ': ' + detalle);
    }
    return j || {};
  }

  // ---------------- Claude (Messages API) ----------------
  function cabecerasClaude(cfg, respaldo) {
    const h = { 'content-type': 'application/json', 'x-api-key': cfg.clave, 'anthropic-version': '2026-10-21', 'anthropic-dangerous-direct-browser-access': 'true' };
    if (respaldo) h['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    return h;
  }

  async function turnoClaude(cfg, sistema, mensajes, herramientas) {
    const respaldo = CON_RESPALDO.test(cfg.modelo);
    const cuerpo = { model: cfg.modelo, max_tokens: 16000, system: sistema, messages: mensajes };
    if (CON_ESFUERZO.test(cfg.modelo)) cuerpo.output_config = { effort: 'medium' };
    if (respaldo) cuerpo.fallbacks = 'default';
    if (herramientas && herramientas.length) cuerpo.tools = herramientas.map((t) => ({ name: t.nombre, description: t.descripcion, input_schema: t.esquema }));
    const j = await pedir('https://api.anthropic.com/v1/messages', { method: 'POST', headers: cabecerasClaude(cfg, respaldo), body: JSON.stringify(cuerpo), modelo: cfg.modelo });
    const content = j.content || [];
    const crudo = { role: 'assistant', content };
    if (j.stop_reason === 'refusal') return { texto: 'La IA no puede ayudar con esa solicitud. Prueba a escribirla de otra forma.', llamadas: [], crudo };
    return {
      texto: content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(),
      llamadas: content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, nombre: b.name, args: b.input || {} })),
      crudo,
    };
  }

  const usuarioClaude = (partes) => ({ role: 'user', content: partes.map((t) => ({ type: 'text', text: t })) });
  const resultadosClaude = (rs) => ({ role: 'user', content: rs.map(({ ll, res }) => Object.assign({ type: 'tool_result', tool_use_id: ll.id, content: JSON.stringify(res) }, res && res.ok === false ? { is_error: true } : {})) });

  // ---------------- Gemini (generateContent) ----------------
  function esquemaGemini(s) {
    // Gemini acepta un subconjunto de OpenAPI: se quitan las claves que no entiende
    if (Array.isArray(s)) return s.map(esquemaGemini);
    if (!s || typeof s !== 'object') return s;
    const o = {};
    Object.keys(s).forEach((k) => { if (k !== 'additionalProperties') o[k] = esquemaGemini(s[k]); });
    return o;
  }

  async function turnoGemini(cfg, sistema, contenidos, herramientas) {
    const cuerpo = { systemInstruction: { parts: [{ text: sistema }] }, contents: contenidos, generationConfig: { maxOutputTokens: 8192 } };
    if (herramientas && herramientas.length) {
      cuerpo.tools = [{ functionDeclarations: herramientas.map((t) => {
        const d = { name: t.nombre, description: t.descripcion };
        if (t.esquema && t.esquema.properties && Object.keys(t.esquema.properties).length) d.parameters = esquemaGemini(t.esquema);
        return d;
      }) }];
    }
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(cfg.modelo) + ':generateContent';
    const j = await pedir(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.clave }, body: JSON.stringify(cuerpo), modelo: cfg.modelo });
    const cand = (j.candidates || [])[0];
    if (!cand || !cand.content) {
      const motivo = (j.promptFeedback && j.promptFeedback.blockReason) || (cand && cand.finishReason) || '';
      return { texto: 'Gemini no devolvió una respuesta' + (motivo ? ' (' + motivo + ')' : '') + '. Prueba a escribirlo de otra forma.', llamadas: [], crudo: null };
    }
    const parts = cand.content.parts || [];
    return {
      texto: parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('\n').trim(),
      llamadas: parts.filter((p) => p.functionCall).map((p, i) => ({ id: p.functionCall.id || 'llamada-' + i, idReal: p.functionCall.id, nombre: p.functionCall.name, args: p.functionCall.args || {} })),
      // Se devuelve tal cual (con las firmas de pensamiento) para el siguiente turno
      crudo: { role: 'model', parts },
    };
  }

  const usuarioGemini = (partes) => ({ role: 'user', parts: partes.map((t) => ({ text: t })) });
  const resultadosGemini = (rs) => ({ role: 'user', parts: rs.map(({ ll, res }) => ({ functionResponse: Object.assign({ name: ll.nombre, response: res }, ll.idReal ? { id: ll.idReal } : {}) })) });

  // ---------------- Conversación con herramientas ----------------
  async function conversar(cfg, sistema, historial, partesUsuario, herramientas, ejecutar, avisar) {
    const claude = cfg.proveedor !== 'gemini';
    const turno = claude ? turnoClaude : turnoGemini;
    historial.push((claude ? usuarioClaude : usuarioGemini)([].concat(partesUsuario)));
    const textos = [];
    for (let vuelta = 0; vuelta < 8; vuelta++) {
      const r = await turno(cfg, sistema, historial, herramientas);
      if (!r.crudo) { historial.pop(); if (r.texto) textos.push(r.texto); break; }
      historial.push(r.crudo);
      if (r.texto) textos.push(r.texto);
      if (!r.llamadas.length) break;
      const resultados = [];
      for (const ll of r.llamadas) {
        let res;
        try { res = await ejecutar(ll.nombre, ll.args || {}); } catch (e) { res = { ok: false, mensaje: e.message }; }
        if (!res || typeof res !== 'object') res = { ok: true, resultado: res };
        if (avisar) avisar(ll.nombre, ll.args, res);
        resultados.push({ ll, res });
      }
      historial.push((claude ? resultadosClaude : resultadosGemini)(resultados));
    }
    return textos.join('\n\n');
  }

  async function completar(cfg, sistema, texto) {
    const historial = [];
    return conversar(cfg, sistema, historial, [texto], [], null, null);
  }

  async function listarModelos(cfg) {
    if (cfg.proveedor === 'gemini') {
      const j = await pedir('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': cfg.clave } });
      return (j.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name))
        .map((m) => m.name.replace(/^models\//, ''));
    }
    // Claude no permite listar modelos desde el navegador: se prueba la clave con una pregunta mínima
    await pedir('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: cabecerasClaude(cfg, false), modelo: cfg.modelo,
      body: JSON.stringify(Object.assign({ model: cfg.modelo || PROVEEDORES.anthropic.modelo, max_tokens: 16, messages: [{ role: 'user', content: 'ok' }] },
        CON_ESFUERZO.test(cfg.modelo) ? { output_config: { effort: 'low' } } : {})),
    });
    return PROVEEDORES.anthropic.modelos.slice();
  }

  H.ia = { PROVEEDORES, conversar, completar, listarModelos };
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
})(typeof window !== 'undefined' ? window : globalThis);
