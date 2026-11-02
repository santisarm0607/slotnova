# Plantilla del README de entrega

Reemplazar todo lo que está entre `{}` con datos reales del auditor. Borrar lo que no aplique.

```markdown
# HorarIA · Horarios escolares sin cruces

Equipo: Santiago Sarmiento, Cielo y Colmenares · Hackathon Colombia 5.0 Cúcuta · Reto Gnosoft · 29 de octubre de 2026

HorarIA genera el horario semanal de un colegio sin cruces, explica lo que no se puede asignar y se ajusta a las novedades. **La IA entiende, el motor garantiza.**

## Cómo ejecutarlo
1. Abrir `HorarIA.html` (o `horaria/index.html`) con Chrome, Edge o Firefox. No requiere instalar nada ni internet.
2. Pulsar «Usar datos de prueba» o arrastrar `Datos_prueba_Gnosoft.xlsx`.
3. Pulsar «Generar horario». Revisar las vistas por curso y por docente y el reporte.
4. Pulsar «Aplicar hoja Cambio (D02 martes)» para la prueba de cambio.
5. «Exportar a Excel» descarga el archivo de resultados.
Opcional: escribir novedades en español («Luis no viene el martes»). Con una clave de API usa un modelo de IA; sin internet usa el intérprete local.

## Resultados con los datos de prueba
| Escenario | Requeridas | Válidas | Pendientes | Cobertura | Colisiones (curso/docente/salón) | Infracciones | Consecutivas | Huecos docentes |
|---|---|---|---|---|---|---|---|---|
| Base · alternativa del Léeme | 120 | {120} | {0} | {100 %} | {0/0/0} | {0} | {…} | {…} |
| Base · docente asignado estricto | 120 | {116} | {4} | {96,7 %} | {0/0/0} | {0} | {…} | {…} |
| Cambio D02 martes | 120 | {…} | {…} | {…} | {…} | {…} | {…} | {…} |

Cambio D02 martes: {n} sesiones afectadas, {n} movidas, {n} pendientes.
Pendientes en modo estricto: {lista con motivo, p. ej. «6B Inglés ×4: Carlos Peña (D4) tiene 28 sesiones asignadas y su máximo es 24»}.

## Método
1. **Diagnóstico** antes de generar: compara la carga de cada docente con su máximo y su disponibilidad; detecta imposibles y propone soluciones.
2. **Reparto de docentes:** respeta el docente asignado. En el modo con alternativa usa la opción permitida por el Léeme (Inglés con D4 o D6) cambiando lo mínimo.
3. **Ubicación de sesiones:** búsqueda local (recocido simulado) que intercambia clases dentro de cada curso. Las reglas obligatorias pesan 1000 veces más que las preferencias (distribuir materias en días distintos, reducir huecos).
4. **Salones:** emparejamiento por tipo y capacidad, sin cruces.
5. **Pendientes:** lo que no cabe sin romper una regla queda pendiente con su motivo. Nunca se entrega un horario con cruces.
6. **Reprogramación:** ante un cambio parte del horario anterior y penaliza cada clase movida.
7. **Validación independiente:** un validador separado del motor recalcula todas las reglas y las métricas con las fórmulas de la guía.
8. **IA:** convierte frases del coordinador en reglas estructuradas que el coordinador confirma; nunca modifica el horario directamente.

## Límites
- Es una heurística: si no encuentra solución completa no demuestra que no exista; por eso reporta pendientes con su causa.
- Tiempo máximo configurado de {4} s por generación; con colegios mucho más grandes puede necesitar más.
- La IA puede equivocarse al entender una frase; por eso la regla se muestra para confirmar y el validador impide errores en el horario. Sin internet entiende un conjunto de frases frecuentes.
- Los avisos a padres se envían con un toque por WhatsApp; el envío automático requiere integrarse con la plataforma del colegio.

## Intercambio de datos con Gnosoft (sin API)
- **Entrada:** el mismo libro de Excel del reto (hojas Bloques, Cursos, Docentes, Asignaturas docentes, Carga, Salones, Disponibilidad, Cambio) con los mismos IDs. Gnosoft lo exporta y HorarIA lo lee tal cual.
- **Salida:** Excel con la hoja «Horario» (curso_id, dia, bloque_id, asignatura, docente_id, salon_id) lista para importar, más hojas por curso, por docente y de validación.
- **A futuro:** el motor es JavaScript sin dependencias; puede correr como servicio dentro de la plataforma o en el navegador del coordinador.

## Archivos
`horaria/` código · `resultados/` Excel de resultados · `documentos-oficiales/` datos de entrada · `HorarIA.html` versión de un solo archivo.
```
