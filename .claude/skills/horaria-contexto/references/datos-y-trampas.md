# Datos de GNOSOFT y trampas

## Hojas de `Datos_prueba_Gnosoft.xlsx`
| Hoja | Contenido |
|---|---|
| Leeme | Reglas del caso |
| Bloques | B1–B6 con inicio y fin (en el archivo, tramos de 60 min desde 7:00; el bloque real dura 50) |
| Cursos | 7A (30 est.), 7B (28), 6A (30), 6B (28) |
| Docentes | D1 Ana Torres, D2 Luis Vega, D3 Marta Ruiz, D4 Carlos Peña, D5 Diana Rojas, D6 Andrés Castro; `max_sesiones_semana` 24 todos |
| Asignaturas docentes | Matemáticas D1 · Lenguaje D2 · C. naturales D3 · C. sociales D3 · **Inglés D4 o D6** · Ed. física D4 · Tecnología D1 · Artística D6 · Ética D5 · Religiosa D5 |
| Carga | curso_id, asignatura, docente_principal_id, sesiones_semana, tipo_salon_requerido. 40 filas, 120 sesiones |
| Salones | GENERAL: A1 Aula 7A 35, A2 Aula 7B 32, A3 Aula 6A 35, A4 Aula 6B 32 · LAB_CIENCIAS: L1–L4 32 · CANCHA: C1 35, C2 32, C3 35, C4 32 · SALA_INFORMATICA: I1 32, I2 30, I3 32, I4 30 |
| Disponibilidad | docente, día, bloque, disponible (1/0). Todo disponible salvo **D1 viernes B6** |
| Cambio | D2, martes, B1–B6, disponible_nuevo 0 |

Carga de cada curso (igual en los 4): Matemáticas 4 (D1, GENERAL) · Lenguaje 4 (D2, GENERAL) · C. naturales 3 (D3, LAB) · C. sociales 3 (D3, GENERAL) · Inglés 4 (D4, GENERAL) · Ed. física 3 (D4, CANCHA) · Tecnología 2 (D1, SALA_INFORMATICA) · Artística 3 (D6, GENERAL) · Ética 1 (D5, GENERAL) · Religiosa 3 (D5, GENERAL).

## Carga por docente
| Docente | Asignada en Carga | Máximo | Bloques libres |
|---|---|---|---|
| D1 Ana Torres | 24 | 24 | 29 |
| D2 Luis Vega | 16 | 24 | 30 (24 sin martes) |
| D3 Marta Ruiz | 24 | 24 | 30 |
| D4 Carlos Peña | **28** | 24 | 30 |
| D5 Diana Rojas | 16 | 24 | 30 |
| D6 Andrés Castro | 12 | 24 | 30 |

## Trampas
1. **D4 supera su máximo (28 > 24).** Estricto → al menos 4 pendientes (dejar las de Inglés, porque Inglés es la asignatura con alternativa). Con alternativa → el Inglés de un curso pasa a D6 (el motor elige 6B) → 120/120.
2. **D1 y D3 al 100 %**, sin margen. D1 no puede viernes B6.
3. **Bloques:** no tomar las horas del Excel como duración. Duración configurable 45/50 y hora de inicio configurable.
4. **IDs:** la ficha dice «D02», el Excel «D2». Normalizar (quitar ceros a la izquierda tras la letra).
5. Los salones no son el cuello de botella: 4 por tipo, todos con capacidad suficiente.
6. El Léeme dice que los organizadores verificaron solución para el caso base y para el cambio.

## Cifras verificadas con el motor actual
- Base: 120/120, 0 cruces, calidad 97–98/100, 5–9 huecos docentes según semilla, ~0,15 s.
- Cambio D2 martes (semilla 1): 2 afectadas, 4 movidas, 0 pendientes. Semilla 2: 3/6/0. Semilla 3: 4/8/0.
- Regla imposible de ejemplo: D1 sin lunes → 24 sesiones en 23 bloques → el diagnóstico lo explica.
