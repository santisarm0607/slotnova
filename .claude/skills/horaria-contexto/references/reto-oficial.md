# Reto oficial Gnosoft (ficha + guía, resumen fiel)

## Pregunta
¿Cómo generar y mejorar horarios escolares comprensibles, respetando las restricciones de docentes, cursos y espacios, y mostrando claramente los problemas que no se puedan resolver?

## Objetivo y usuario
Prototipo funcional, de uso intuitivo, para un **coordinador académico**. Debe generar un horario semanal con el conjunto de prueba, mostrarlo **por curso y por docente** y **explicar las asignaciones pendientes o los conflictos**.

## Entradas
Cursos, número de estudiantes, docentes, asignaturas, carga semanal por curso, disponibilidad, bloques y salones. El archivo trae una asignación de docente por curso y asignatura.

## Reglas obligatorias
1. Cada sesión ocupa un bloque.
2. No asignar a la vez un docente, un curso o un salón a más de una clase.
3. Respetar disponibilidad docente, capacidad y tipo de salón, bloques disponibles y **docente asignado**.
4. **No exceder** la intensidad requerida.
5. **Informar sesiones pendientes** si no existe solución.
6. Bloques de 50 minutos en el caso; **la configuración debe admitir 45 o 50 minutos**. El tiempo se representa con el **identificador de bloque**, no como 60 minutos de clase.

Léeme del Excel: «Inglés puede ser asignado a D4 o D6; respetar disponibilidad, capacidad máxima y evitar cruces». Por eso hay modo estricto (docente asignado) y modo con alternativa, y se explica la diferencia.

## Preferencias (reportar aparte de las reglas obligatorias)
- Distribuir las sesiones de una asignatura en días distintos cuando sea posible.
- Reducir huecos entre clases de un docente.

## Medición (definiciones exactas de la guía)
- **Asignación** = curso, asignatura, docente, salón, día y bloque. Cada fila es una sesión.
- **Colisión** = cada **par** de asignaciones que comparte curso, docente o salón en el mismo bloque. Identificar la **categoría**. Una asignación puede causar más de un tipo.
- **Cobertura** = sesiones válidas asignadas ÷ sesiones requeridas × 100.
- **Pendientes** = requeridas − válidas asignadas, sin contar sobrantes.
- **Sesión válida** = cumple todas las reglas obligatorias. Duplicadas o sobrantes no suben la cobertura.
- Informar **por separado** las infracciones y el número de pendientes.
- Preferencias a reportar: **sesiones consecutivas** de la misma asignatura para el mismo curso y **huecos docentes** (bloque libre entre la primera y la última clase del docente en un día).

## Prueba de cambio (obligatoria)
Tras el horario base, aplicar la hoja Cambio: **D02 no disponible el martes** (excluir todos sus bloques del martes). Regenerar o ajustar y mostrar **sesiones afectadas, movidas y pendientes**.

## Entregables
Prototipo ejecutable o demostrable · datos de entrada usados · vistas por curso y docente · resumen de requeridas, asignadas, pendientes, conflictos y preferencias · instrucciones breves de ejecución · explicación del método **y sus límites** · archivo de resultados. Se acepta un resultado parcial si se identifica con transparencia. Integración con Gnosoft no es requisito: describir un intercambio de datos posible **sin asumir que hay API**.

## Evaluación
Efectividad **40 %** · Usabilidad 20 % · Flexibilidad 20 % · Innovación e integración de IA 20 %.

## Demo sugerida (3 a 4 minutos)
Problema y método → horario base → vista de curso, vista de docente y métricas → aplicar el cambio → limitaciones.

## Condiciones
Datos simulados; no cargar información personal real. Hora de entrega y formato los confirma la organización.
