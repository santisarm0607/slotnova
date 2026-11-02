# SlotNova · Guía del proyecto para el pitch

> Planificación inteligente de horarios escolares · **versión 2.0.0**.
> Reto Gnosoft · Hackathon Colombia 5.0 Cúcuta · Equipo: Santiago Sarmiento, Cielo y Colmenares.
> El detalle técnico y el registro de cambios están en `CONTEXTO.md`.

Este documento explica qué es SlotNova, cómo funciona por dentro y por fuera, qué cifras mostrar y cómo responder al jurado. Si solo tienes 2 minutos, lee las secciones 1, 6 y 9.

---

## 1. SlotNova en una frase

**SlotNova arma el horario de un colegio en segundos, sin un solo cruce, explica lo que no se pudo programar y lo reacomoda cuando alguien dice «Luis no viene el martes».**

El lema técnico, para repetir en el pitch: **«La IA entiende, el motor garantiza».**

---

## 2. El problema

- El coordinador académico arma el horario a mano o en Excel: toma días y casi siempre quedan **cruces** (un docente en dos salones a la vez, un salón con dos cursos).
- Cuando cambia algo (un docente no puede un día, llega una reunión), hay que **rehacer medio horario**.
- Cuando algo **no cabe**, nadie lo dice con claridad: el problema aparece en la semana de clases.
- Las ausencias del día obligan a improvisar quién cubre y a escribir uno por uno los mensajes a las familias.

---

## 3. La solución

Una página web publicada en GitHub Pages (también abre con doble clic y **sin internet**), que funciona en computador y en celular:

1. **Sube el Excel** del colegio (el mismo formato de Gnosoft).
2. SlotNova **revisa los datos** y avisa antes de generar si algo no va a caber.
3. **Genera** el horario completo de todos los cursos en segundos.
4. Un **validador independiente** comprueba clase por clase que no haya cruces ni reglas rotas.
5. Los **cambios** se escriben o se **dictan por voz** en lenguaje natural y el horario se reacomoda moviendo lo mínimo.
6. Un **asistente con IA** (Claude o Gemini) conversa y hace el trabajo: genera, agrega eventos, cambia nombres, descarga.
7. Para las **ausencias del día** propone quién cubre y deja listos los avisos para WhatsApp.
8. Se **descarga** en Excel, PDF, PNG o JPEG, o se lleva **al celular con un código QR**.

---

## 4. Cómo funciona por dentro

```
 Excel de Gnosoft
       │
       ▼
 ┌──────────────┐   «Carlos Peña tendría 28 clases y su máximo es 24»
 │ Diagnóstico  │── avisa antes de generar y propone la solución
 └──────────────┘
       │
       ▼
 ┌──────────────┐   1. Reparte docentes (backtracking)
 │    Motor     │   2. Ubica las clases en la semana (recocido simulado)
 └──────────────┘   3. Lo que no cabe → PENDIENTE con motivo (nunca un cruce)
       │
       ▼
 ┌──────────────┐   No confía en el motor: revisa cada fila contra
 │  Validador   │   los datos originales y calcula las métricas oficiales
 └──────────────┘
       │
       ▼
   Horario + reporte + Excel de resultados

 Frase del coordinador ──► IA (o intérprete local) ──► regla JSON ──► el coordinador confirma ──► el motor reprograma
```

### Las tres piezas

| Pieza | Qué hace | Por qué así |
|---|---|---|
| **Motor** | Primero decide qué docente da cada clase: usa el asignado y, si alguno se pasa de su máximo, busca por *backtracking* la alternativa habilitada que cambie lo mínimo. Luego ubica las clases con **recocido simulado**: intercambia clases del mismo curso y se queda con los cambios que reducen conflictos. Las reglas obligatorias pesan 1000 veces más que las preferencias. Usa una **semilla**, así que el mismo dato da el mismo horario (la demo es reproducible). | Un motor de optimización sí puede **garantizar** cero cruces; una IA sola no. |
| **Validador** | Revisa el resultado sin confiar en el motor: cruces de curso, docente y salón; disponibilidad; tipo y capacidad del salón; docente asignado o habilitado; máximo semanal; clases de más; reglas del coordinador. Calcula las métricas con las fórmulas de la guía. | Es la «segunda firma»: si el motor se equivoca, el validador lo detecta. |
| **IA** | Convierte frases como «No quiero Educación física a primera hora» en una **regla** (no disponible, prohibir, evitar o máximo por día) que el coordinador confirma. En el **asistente**, Claude o Gemini usan 14 herramientas de la app (ver horario, generar, restricciones, eventos, renombrar, jornada, ausencias, descargas…). Sin internet o sin clave funciona un **intérprete local en español**. | La IA **nunca toca el horario**: pide acciones; el motor las hace y el validador las revisa. Por eso no puede crear cruces. |

### Las reglas que respeta (obligatorias)

- Cada clase ocupa un bloque; ni un docente, ni un curso, ni un salón en dos clases a la vez.
- Disponibilidad de cada docente, tipo y capacidad del salón, docente asignado (o alternativa habilitada) y máximo semanal.
- No dar más clases de las pedidas.
- Si algo no cabe, se informa como **pendiente con motivo y solución**.

### Lo que optimiza (preferencias, se reportan aparte)

- Repartir cada materia en días distintos.
- Reducir **huecos** de los docentes (horas libres entre su primera y su última clase del día).
- Evitar clases seguidas de la misma materia.
- La tarjeta **Calidad (0 a 100)** resume estas preferencias.

### El tiempo

El tiempo se mide en **bloques** (B1 a B6, lunes a viernes = 30 bloques). La duración de la clase se configura: **45, 50 minutos u otra**, con hora de entrada y descanso. Las horas se calculan solas; el horario no cambia al cambiar la duración.

---

## 5. Recorrido por la aplicación

### Inicio de sesión

- Correo y contraseña, «Crea una cuenta» o **«Entrar como invitado»**. Es un prototipo visual: no hay servidor y la contraseña no se guarda.

### Cabecera (siempre visible)

- **Mis horarios**: guardar el horario actual con un nombre, abrir uno guardado o borrarlo (pide un segundo toque para confirmar). Se guardan en el navegador de ese computador.
- **Opciones**: tema automático, claro o **nocturno**; letra normal, grande o muy grande; **alto contraste**; reducir animaciones. Se recuerdan para la próxima vez.
- **Cuenta** (círculo con las iniciales): nombre y «Cerrar sesión».

### En el celular

- Las pestañas pasan **abajo**, como una app; el horario se ve **día por día** (Lun, Mar, Mié…) y el asistente ocupa toda la pantalla.

### Pestaña 1 · Datos

- Zona grande para **arrastrar el Excel** (o hacer clic). Enlace para **descargar la plantilla** vacía.
- **Jornada**: duración de la clase (45 / 50 / Otra), entrada, minutos de descanso y después de qué bloque. La lista de horas muestra el **descanso**.
- **Revisión de tus datos**: lo que requiere atención aparece primero (por ejemplo, Carlos Peña sobrecargado y la solución propuesta).
- Botón grande **Generar horario** justo debajo.
- «Ver todos los detalles»: el resto de la revisión y las barras de **clases por docente** frente a su máximo.
- «Editar datos»: corregir cursos, docentes, materias, salones y horas disponibles sin volver a Excel.

### Pestaña 2 · Horario

- Barra: **Guardar**, **+ Evento**, **Otra versión** (otra semilla), **Descargar** (Excel, PDF de lo que se ve, PDF de todos los cursos, PNG, JPEG o **código QR** para el celular) e **Imprimir**.
- **Eventos**: acto cívico, reunión, evaluación, salida u otro, con color, día, horas y cursos. Aparecen en el horario («★») y en las descargas. Con **«Reservar la hora»** no hay clase en ese momento y el motor reacomoda.
- **✎ Editar nombres**: renombrar docentes, materias o salones con un toque; el horario no se mueve.
- Mensaje de estado: «Horario completo y sin cruces» o «con 4 clases pendientes · **Ver por qué y cómo resolverlo →**», que lleva directo a la explicación.
- **Cuatro tarjetas**: clases programadas (cobertura), cruces, pendientes y calidad.
- Interruptor **«Solo el docente asignado»** (modo estricto): al encenderlo el horario se regenera solo.
- Aviso **«Tu archivo trae un cambio»** → **Aplicar cambio** / **Volver al horario original**, con el panel «Qué cambió» (afectadas, movidas, pendientes, cruces y tabla antes → ahora).
- Vista por **curso, docente, salón o todos**. Cada materia tiene color y sigla fijos. La fila del **descanso** aparece en la cuadrícula. Las clases movidas llevan «↻ Movida»; en la vista de docente se marcan «No disponible» y los huecos.
- **Mover clases a mano**: tocas una clase y se resaltan **en verde** las clases con las que se puede intercambiar sin romper ninguna regla (las demás se atenúan). **Deshacer** y **Deshacer todo**.
- **Clases pendientes**: tabla con motivo y solución.
- Plegables: «Cómo se armó este horario» (decisiones del motor) y **«Reporte completo»** (métricas oficiales, cruces por categoría, reglas obligatorias, calidad, huecos y la verificación independiente).

### Pestaña 3 · Cambios

- Estado de la IA, interruptor **«Usar IA»** y **«Configurar IA»**: Claude o Gemini con la clave de cada usuario, «Probar conexión» y «Recordar» opcional.
- Caja «¿Qué cambió?» con **micrófono** (dictado por voz) y **sugerencias armadas con los nombres del Excel subido**.
- «Esto entendí» → **Aplicar al horario** o **Descartar**. Lista de **cambios activos** con «Quitar».

### Asistente (botón flotante abajo a la derecha)

- Chat con la IA: responde preguntas («¿Qué clases tiene Carlos Peña el lunes?») y **hace cosas**: generar, agregar restricciones o eventos, cambiar nombres o el máximo de un docente, ajustar la jornada, preparar la ausencia del día, cambiar la vista, descargar y guardar.
- Se le puede **hablar** (micrófono) y puede **leer en voz alta** sus respuestas (botón del parlante).
- Cada acción aparece como una línea «✓ …» en el chat. Sin IA conectada entiende las frases comunes y órdenes simples («genera el horario», «descarga el PDF»).

### Visor del código QR (en el celular)

- Al escanear el QR se abre el horario de solo lectura: elegir curso, docente o salón y **descargar la imagen o el PDF**. El horario viaja dentro del enlace: no hace falta servidor.

### Pestaña 4 · Ausencias

- «¿Falta un docente hoy?»: docente, día y horas.
- Para cada clase propone, en orden: **suplente** de la misma materia libre → **acompañamiento** de trabajo autónomo → **cancelar** (con salida anticipada o entrada tarde si es la primera o la última clase). Se puede cambiar la opción.
- **Avisos listos** para familias, docentes y coordinación: editables, con **Abrir en WhatsApp**, **Copiar** y **Marcar como enviado**. **Nunca dicen la causa** de la ausencia (privacidad).

---

## 6. Cifras con los datos de Gnosoft (verificadas en pantalla, semilla 1)

| Escenario | Resultado |
|---|---|
| Datos | 4 cursos · 120 clases a la semana · 6 docentes · 16 salones · 30 bloques |
| Hallazgo del diagnóstico | **Carlos Peña (D4) tendría 28 clases y su máximo es 24**: es imposible cumplirlo solo con él |
| Horario base (alternativa permitida por el Léeme) | **120 de 120 (100 %)**, 0 cruces, 0 reglas incumplidas, calidad 97/100. Decisión: el Inglés de 6B pasa a Andrés Castro (D6) |
| Modo estricto (solo el docente asignado) | **116 de 120 (96,7 %)**, 0 cruces, **4 pendientes** (Inglés de 6B) con motivo y solución |
| Prueba de cambio: D02 (Luis Vega) no disponible el martes | **2 clases afectadas, 4 movidas, 0 pendientes**, sigue sin cruces |

**Por qué 116 y no 120 en estricto:** 28 clases asignadas contra un máximo de 24 es matemáticamente imposible. SlotNova no lo esconde ni hace trampa: lo muestra, explica el motivo y propone la alternativa que el mismo archivo permite.

---

## 7. Qué hace diferente a SlotNova

1. **IA con garantía**: la IA entiende al coordinador, pero el horario lo arma un motor y lo certifica un validador. Cero cruces, siempre.
2. **Honestidad**: lo que no cabe queda como **pendiente con motivo y solución**, nunca escondido ni con cruces.
3. **Cambios mínimos**: al reprogramar, penaliza cada clase movida; solo se mueve lo necesario (4 clases en la prueba oficial).
4. **Del horario al aviso**: ausencia del día → quién cubre → mensaje a familias por WhatsApp, sin revelar la causa.
5. **Intercambio guiado**: al mover una clase a mano, la app muestra en verde solo las opciones válidas.
6. **Asistente que actúa**: con Claude o Gemini, una frase o una orden de voz genera, agrega eventos, cambia nombres o descarga.
7. **Del computador al celular**: código QR con el horario dentro del enlace, sin servidor.
8. **Funciona sin internet** y sin instalar nada; la IA es un extra opcional que se activa o apaga.
9. **Accesible**: modo nocturno, letra grande, alto contraste; estados con ícono y texto (no solo color); versión móvil tipo app.

---

## 8. Cómo cumplimos los criterios de evaluación

| Criterio (peso) | Qué mostrar |
|---|---|
| **Efectividad (40 %)** | 120/120 sin cruces; reporte completo con las fórmulas de la guía (cobertura = válidas ÷ requeridas × 100; pendientes = requeridas − válidas; cruces por pares y por categoría; preferencias aparte); modo estricto 116/120 con pendientes explicadas; prueba de cambio 2 afectadas / 4 movidas / 0 pendientes; Excel de resultados |
| **Usabilidad (20 %)** | 4 pestañas claras, un botón principal por pantalla, revisión antes de generar, vistas por curso, docente y salón, intercambio guiado, versión móvil tipo app, QR al celular, accesibilidad, animaciones discretas |
| **Flexibilidad (20 %)** | Cualquier Excel con el mismo formato, clases de 45, 50 u otra duración, descanso configurable, eventos, editar datos y nombres, cambios en lenguaje natural, modo estricto o con alternativa, otra versión, varios horarios guardados, descargas en 4 formatos |
| **Innovación e IA (20 %)** | «La IA entiende, el motor garantiza»; asistente con Claude o Gemini que ejecuta acciones seguras; voz (dictado y lectura); frases → reglas confirmables; intérprete local sin internet; avisos redactados sin la causa |

---

## 9. Guion de la demo (3 a 4 minutos)

Reparto: **Cielo** abre y cierra · **Santiago** maneja la página y explica el método · **Colmenares** hace la parte de IA.

| Tiempo | Quién | Qué se dice / se hace |
|---|---|---|
| 0:00–0:20 | Cielo | **Problema**: armar horarios a mano toma días, deja cruces y cada cambio obliga a rehacerlo. |
| 0:20–0:45 | Santiago | **Método**: «La IA entiende, el motor garantiza». Motor de optimización + validador independiente; la IA traduce lo que dice el coordinador. |
| 0:45–1:05 | Santiago | **Arrastrar el Excel** de Gnosoft. Mostrar la revisión: «Carlos Peña tendría 28 clases y su máximo es 24». |
| 1:05–1:45 | Santiago | **Generar horario**. Tarjetas: 120/120, 0 cruces. Vista del curso 6B y del docente Carlos Peña. Encender **«Solo el docente asignado»**: 116/120 → tocar **«Ver por qué»** → tabla de pendientes con la solución. Apagar el interruptor. |
| 1:45–2:20 | Santiago | **Prueba de cambio**: «Tu archivo trae un cambio» → **Aplicar cambio**: 2 afectadas, 4 movidas, 0 pendientes; mostrar las clases «↻ Movida». |
| 2:20–3:00 | Colmenares | **IA en vivo** (pestaña Cambios): **dictar con el micrófono** una de las sugerencias (por ejemplo «No quiero Ciencias naturales a primera hora») → «Esto entendí» → **Aplicar al horario**. Si hay clave conectada, abrir el **Asistente** y pedir «Agrega una izada de bandera el lunes a primera hora para todos». Luego en **Ausencias**: elegir **Marta Ruiz** y el **lunes** → **Buscar quién cubre** → mostrar la propuesta y un aviso a padres (sin la causa). *(No usar «Usar el cambio del archivo» aquí: como el cambio de Luis Vega ya se aplicó, sus clases del martes ya se movieron y no habría nada que cubrir.)* |
| 3:00–3:30 | Cielo | **Cierre**: **Descargar → Código QR** y escanearlo con un celular (el horario se abre ahí), **Excel** para devolverlo a Gnosoft con los mismos IDs, **Guardar** el horario y límites honestos. |

**Si sobra tiempo:** tocar una clase en la vista de curso para mostrar el **intercambio guiado en verde**, o abrir **Opciones** y activar el modo nocturno y la letra grande.

**Plan B:** si falla el Wi-Fi, todo sigue funcionando (la IA usa el modo local). Si falla el computador, video de respaldo. **Llevar el Excel `Datos_prueba_Gnosoft.xlsx` en la USB**: la página ya no trae datos de ejemplo.

---

## 10. Preguntas probables del jurado

**¿Dónde está la IA?**
Entiende al coordinador en lenguaje natural y redacta los avisos. El horario lo arma un motor de optimización porque una IA sola no garantiza cero cruces. Esa separación es la innovación: la IA nunca puede dañar el horario.

**¿Por qué 116 en modo estricto?**
Carlos Peña tiene 28 clases asignadas y su máximo es 24: es imposible. Lo mostramos en vez de esconderlo, explicamos el motivo y proponemos la alternativa que el mismo Léeme permite (Inglés con D4 o D6).

**¿Y si no hay solución?**
Las clases que no caben quedan como pendientes, con motivo y sugerencia. Nunca entregamos un horario con cruces.

**¿Cómo sé que no hay cruces?**
Un validador independiente revisa cada fila contra los datos originales. Está en «Reporte completo» → «Verificación independiente».

**¿Escala a un colegio grande?**
Lee cualquier cantidad de cursos con el mismo formato. Es una heurística con tiempo máximo (unos 4 segundos): con cientos de grupos puede tardar más o dejar pendientes, y siempre lo dice.

**¿Cómo se integra con Gnosoft?**
Sin suponer una API: entra el mismo Excel con los mismos IDs (curso, docente, asignatura, salón, bloque) y sale un Excel con una fila por clase, listo para importar de vuelta. A futuro, el motor (JavaScript sin dependencias) podría correr como servicio dentro de la plataforma.

**¿Qué tan bueno es el horario, más allá de no tener cruces?**
Reportamos las preferencias aparte, como pide la guía: clases seguidas de la misma materia, huecos de docentes y materias repartidas en la semana, resumidas en un puntaje de calidad (97/100 en el caso base).

**¿Qué pasa con los datos personales?**
Los datos del reto son simulados. La página funciona en el navegador, sin servidor. Los avisos nunca dicen la causa de la ausencia de un docente. La clave de la IA solo vive en esa pestaña.

**¿Se puede editar el horario a mano?**
Sí: tocas una clase y se resaltan en verde las que se pueden intercambiar sin romper reglas. El validador revisa cada intercambio y hay «Deshacer» y «Deshacer todo».

**¿Dónde se guardan los horarios?**
En el navegador de ese computador («Mis horarios»). Para compartir uno, se descarga el Excel o el PDF, o se escanea el código QR.

**¿Qué IA usan y quién la paga?**
Claude (Anthropic) o Gemini (Google), a elección. Cada colegio pone su propia clave en «Configurar IA»; las solicitudes van directo del navegador al proveedor. Sin clave, todo sigue funcionando con el intérprete local.

**¿Qué puede hacer el asistente?**
Responder sobre el horario y ejecutar 14 acciones de la app (generar, restricciones, eventos, renombrar, máximo de un docente, jornada, ausencias, vistas, descargas, guardar). No puede escribir el horario a mano: todo pasa por el motor y el validador.

**¿Funciona en celular?**
Sí: pestañas abajo, horario día por día, asistente a pantalla completa y dictado por voz. El QR lleva el horario al celular sin servidor.

**¿El inicio de sesión es real?**
Es un prototipo visual para mostrar la experiencia; no hay servidor ni cuentas. Integrarlo con las cuentas de Gnosoft es un paso siguiente.

---

## 11. Límites (decirlos con honestidad)

- Es una heurística con tiempo máximo: si no encuentra una solución completa, no demuestra que no exista. Por eso informa los pendientes con su causa.
- La IA puede interpretar mal una frase: por eso muestra «Esto entendí» antes de aplicar, y el validador impide errores.
- Las preferencias (huecos, materias repartidas) se optimizan, pero no siempre llegan a cero.
- Los horarios guardados no se sincronizan entre computadores.
- El inicio de sesión es un prototipo visual; la IA depende de la clave y del saldo de cada usuario; el dictado no funciona en Firefox; el QR necesita la página publicada.
- La ausencia del día cubre un solo día; el envío de avisos es con un toque en WhatsApp, no automático.

---

## 12. Glosario rápido

| Término | Significado |
|---|---|
| **Bloque** | Franja horaria del día (B1 a B6). Es la unidad de tiempo; su duración se configura. |
| **Clase / sesión** | Una hora de una materia para un curso, con docente, salón, día y bloque. |
| **Cruce (colisión)** | Dos clases que comparten curso, docente o salón en el mismo bloque. Se cuentan por pares. |
| **Cobertura** | Clases válidas ÷ clases requeridas × 100. |
| **Pendiente** | Clase requerida que no se pudo programar sin romper una regla. Siempre lleva motivo. |
| **Modo estricto** | Cada clase solo con su docente asignado en el Excel. |
| **Alternativa (Léeme)** | Otro docente habilitado para la materia puede darla si el asignado supera su máximo. |
| **Hueco** | Hora libre de un docente entre su primera y su última clase del día. |
| **Semilla** | Número que hace reproducible el horario; «Otra versión» cambia la semilla. |
| **Validador** | Revisión independiente del horario contra los datos originales. |

---

## 13. Antes de presentar (checklist)

- [ ] `index.html` abre con doble clic con el Wi-Fi apagado.
- [ ] El Excel de Gnosoft está en el escritorio y en la USB.
- [ ] Generar da 120/120; la prueba de cambio da 2 afectadas, 4 movidas, 0 pendientes; el modo estricto da 116/120.
- [ ] La frase «No quiero Educación física a primera hora» se entiende sin IA conectada.
- [ ] Opciones en tema claro y letra normal (o grande si el proyector es pequeño).
- [ ] Borrar horarios guardados de prueba en «Mis horarios» para que la lista se vea limpia.
- [ ] Video de respaldo grabado.
