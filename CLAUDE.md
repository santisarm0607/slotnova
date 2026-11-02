# SlotNova · instrucciones para Claude

Lee primero el contexto completo del proyecto (versión, registro de cambios, arquitectura, contratos y pendientes):

@CONTEXTO.md

## Reglas de trabajo

- Responde y escribe en español. Producto: SlotNova (antes HorarIA). HTML + CSS + JavaScript puro, scripts clásicos, sin librerías ni CDN.
- Usa las skills del proyecto en `.claude/skills/` (versión 2.0.0): `horaria-contexto` al empezar, y `horaria-motor`, `horaria-interfaz`, `horaria-ia-avisos` o `horaria-entrega` según la tarea. Para la revisión final, el agente `auditor-horaria` (`.claude/agents/`). Si también ves el plugin `horaria-hackathon` 0.1.0, es la versión anterior: usa las del proyecto.
- Antes de dar algo por terminado, corre `powershell -ExecutionPolicy Bypass -File pruebas/correr-recorrido.ps1` (y `node pruebas/prueba.js` si hay Node).
- **Obligatorio al terminar cualquier cambio**: actualiza `CONTEXTO.md` siguiendo su «Protocolo de actualización» (versión, registro de cambios, estado). Un hook del proyecto (`.claude/hooks/recordar-contexto.sh`) bloquea el cierre una vez si lo olvidas.
