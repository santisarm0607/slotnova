# Especificación de las tareas del motor

## 1. Modo estricto y sesiones pendientes

**API:** `motor.generar(datos, { modoDocente: 'alternativas' | 'estricto', ... })`. Por defecto `'alternativas'`. `reprogramar` hereda la opción.

**En `preparar`:** si `modoDocente === 'estricto'`, cada grupo tiene como único candidato a su `principal` (si está habilitado; si no, el grupo queda pendiente completo con motivo «el docente asignado no está habilitado»).

**En `asignarDocentes`:** cuando no exista un reparto que respete todas las capacidades (siempre pasa en estricto con D4), no devolver error. Calcular un reparto parcial:
- Para cada docente con `carga > capacidad`, `exceso = carga − capacidad`.
- Elegir qué sesiones quedan pendientes: primero las de asignaturas que tienen alternativa en `habilitados` (Inglés), luego el grupo con más sesiones; desempate por orden de cursos. Quitar sesiones completas de un mismo curso antes de repartir el faltante entre cursos.
- Devolver `pendientesPorGrupo[g] = k` y reducir las sesiones de ese grupo en `k` para la ubicación.
- Motivo (texto para el coordinador): `"Carlos Peña (D4) tiene 28 sesiones asignadas y su máximo es 24. En modo estricto no se puede usar a otro docente; con la alternativa del Léeme, Andrés Castro (D6) podría darlas."`

**En `resolver`:** las sesiones pendientes dejan bloques libres en la cuadrícula del curso. Si al terminar el recocido `duro > 0`:
1. Calcular para cada celda el número de conflictos duros en los que participa.
2. Retirar la celda con más conflictos (pasa a pendiente con motivo según el tipo: «cruce de docente con 7B», «docente no disponible», «sin salón del tipo disponible», «regla obligatoria: …»). Recalcular. Repetir hasta `duro === 0`.
3. Intentar reubicar cada retirada en un bloque libre del mismo curso sin conflictos (voraz). Si entra, deja de estar pendiente.

**Salida:** `resultado.pendientes = [{ curso, asignatura, docente, sesiones, motivo }]`, `resultado.ok = conflictos === 0` (puede haber pendientes y estar ok), `resultado.estadisticas.pendientes = suma de sesiones`. Las filas nunca contienen sesiones en conflicto.

**Pruebas a agregar:** estricto → 116 sesiones asignadas, 4 pendientes de Inglés de un curso, `H.validar` sin errores de cruces, auditor `--estricto` con 0 infracciones. Alternativa → sin cambios (120/120).

**Nota para la interfaz:** el validador actual marca «bloques vacíos» si un curso no llena su jornada. Con pendientes, ese mensaje debe pasar a ser informativo (no error), porque los pendientes se reportan aparte.

## 2. Reporte oficial

`HorarIA.reporte(datos, filas, reglas, { modoDocente, pendientesMotor })` en `validador.js` (sin depender del motor). Debe dar **los mismos números que `auditar.js`**:

```js
{
  requeridas, asignadas, validas, pendientes, cobertura,          // cobertura con 1 decimal
  colisiones: { total, curso, docente, salon, detalle: [{ categoria, dia, bloque, clave, sesiones: [...] }] },
  infracciones: { total, porTipo: { bloqueInvalido, sinCarga, habilitacion, docenteAsignado, disponibilidad,
                                    tipoSalon, capacidad, maximoSemanal, intensidadExcedida }, detalle: [...] },
  pendientesDetalle: [{ curso, asignatura, requeridas, validas, faltan, motivo }],
  preferencias: { consecutivas, mismoDia, huecosDocentes, detalle: [...] }
}
```
Reglas de cálculo (iguales al auditor):
- Colisión = pares C(n,2) por (curso | docente | salón, día, bloque). Toda sesión en colisión es inválida.
- `docenteAsignado` solo cuenta en modo estricto.
- Máximo semanal: el exceso de sesiones por lo demás válidas del docente (en orden día-bloque) es inválido.
- Válidas por (curso, asignatura) topadas en lo requerido; el excedente es `intensidadExcedida`.
- Consecutivas: pares de bloques contiguos con la misma asignatura en un curso y día. Misma materia mismo día: suma de (n − 1). Huecos: por docente y día, `(último − primero + 1) − ocupados`.
- El motivo de cada pendiente viene de `resultado.pendientes` si existe; si no, «sin bloque válido disponible».

Prueba: comparar `H.reporte(...)` con `auditar.js --json` en base y cambio, modo alternativa y estricto.

## 3. Comparar el cambio

`HorarIA.compararCambio(filasBase, filasNuevas, datosEscenario)` →
`{ afectadas, movidas, pendientes, listaAfectadas: [fila], listaMovidas: [{curso, asignatura, de:{dia,bloque}, a:{dia,bloque}}] }`
- Afectadas: sesiones del horario base cuyo docente queda no disponible en ese bloque con el escenario.
- Movidas: por (curso, asignatura), posiciones nuevas que no estaban en la base (diferencia de multiconjuntos).
- Pendientes: del reporte del horario nuevo.
Valores esperados con semilla 1: 2 afectadas, 4 movidas, 0 pendientes.

## 4. Normalizar IDs y configurar bloques

- `normId(x)`: mayúsculas, sin espacios, y quitar ceros a la izquierda tras las letras (`D02 → D2`, `B01 → B1`). Aplicar al leer el Excel (todas las columnas *_id) y en `normalizarRegla`.
- Configuración `datos.config = { duracionBloque: 50 | 45, inicio: '07:00', descansos: [{ despuesDe: 'B3', minutos: 20 }] }`. Calcular `bloques[i].inicio/fin` para mostrar. El motor y el validador **no usan horas**, solo IDs. Por defecto 50 minutos desde la hora de inicio del primer bloque del Excel, sin descansos.
