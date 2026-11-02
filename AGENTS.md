# SlotNova · instrucciones para asistentes de IA (Codex, Gemini, Copilot, Cursor, Claude y otros)

1. **Antes de cambiar nada, lee [`CONTEXTO.md`](CONTEXTO.md)**: versión, registro de cambios, mapa de archivos, contratos, decisiones y pendientes. Es la fuente única de verdad del proyecto.
2. Trabaja en español. HTML + CSS + JavaScript puro con scripts clásicos (`window.HorarIA`), sin librerías, sin CDN y sin `import`: la página debe abrir con doble clic y funcionar sin internet (salvo la IA).
3. No cambies las decisiones listadas en `CONTEXTO.md` sin preguntarle al equipo.
4. Verifica con `powershell -ExecutionPolicy Bypass -File pruebas/correr-recorrido.ps1` (recorrido en Chrome, sin Node) y, si hay Node, `node pruebas/prueba.js`.
5. **Al terminar cualquier cambio, actualiza `CONTEXTO.md`** siguiendo su «Protocolo de actualización»: sube la versión, agrega una entrada al registro de cambios (fecha, qué cambió, cifras y pruebas, quién lo hizo: persona o IA) y actualiza el estado y los pendientes. Si cambiaste un contrato o un archivo, actualiza también su sección.
6. Las guías detalladas por área están en `.claude/skills/*/SKILL.md` (son texto normal: cualquier IA puede leerlas).
