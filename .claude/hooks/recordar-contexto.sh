#!/bin/sh
# SlotNova · recordar-contexto.sh (hook Stop de Claude Code)
# Si cambió el código, las pruebas, las skills o la documentación y CONTEXTO.md quedó más viejo,
# no deja terminar la respuesta (una sola vez) y pide actualizar CONTEXTO.md.
# POSIX sh: funciona en Git Bash (Windows), macOS y Linux, sin Node ni jq.
entrada=$(cat)
# Si ya se está continuando por este mismo hook, no volver a bloquear (evita ciclos)
case "$entrada" in *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;; esac
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
if [ ! -f CONTEXTO.md ]; then
  printf '%s\n' '{"decision":"block","reason":"Falta CONTEXTO.md en la raíz del proyecto. Créalo siguiendo las instrucciones de CLAUDE.md antes de terminar."}'
  exit 0
fi
cambiados=$(find index.html css js pruebas README.md PITCH.md .claude/skills .claude/agents -type f -newer CONTEXTO.md 2>/dev/null | head -5 | tr '\n' ' ')
[ -z "$cambiados" ] && exit 0
printf '{"decision":"block","reason":"Cambiaste %s pero CONTEXTO.md no está al día. Antes de terminar, actualízalo: sube la versión, agrega la entrada del registro de cambios (qué cambió, cifras verificadas y pruebas corridas) y revisa Estado y pendientes."}\n' "$cambiados"
