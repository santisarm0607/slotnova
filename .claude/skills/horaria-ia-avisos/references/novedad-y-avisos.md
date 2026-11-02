# Novedad del día y avisos

## Dos formas de aplicar una novedad
- **De la semana** (se sabe con tiempo): regla `bloquear_docente` → `motor.reprogramar` (mueve lo mínimo) → reporte y comparación.
- **De hoy** (imprevista): no se reprograma la semana. Se resuelve cada clase afectada de ese día.

## Algoritmo de la novedad de hoy
Entrada: horario vigente, docente ausente, día, bloques (vacío = todo el día).
Para cada clase del docente en esos bloques, en orden:
1. **Suplente:** otro docente **habilitado para esa asignatura**, disponible en ese bloque, sin clase a esa hora y sin pasar su máximo semanal. Si hay varios, el de menos carga ese día. Resultado: la clase se dicta normal con el suplente.
2. **Acompañamiento:** cualquier docente disponible y libre a esa hora (aunque no sea de la materia). Resultado: hora de trabajo autónomo acompañada.
3. **Cancelada:** si no hay nadie. Si la clase es la primera o la última del curso ese día (o todas las siguientes también se cancelan), proponer **entrada tarde** o **salida anticipada** con la hora calculada.
El coordinador puede cambiar la opción de cada clase antes de confirmar. Al confirmar se generan los avisos.

Ejemplo con los datos: si falta D4 un día, el Inglés puede cubrirlo D6 (habilitado) cuando esté libre; Educación física no tiene otro habilitado → acompañamiento o cancelada.

## Plantillas (llenar con datos reales; la hora sale de la configuración de bloques)
- **Suplente · padres:** «Estimados padres de familia de {curso}: hoy {día}, la clase de {materia} de {inicio} a {fin} la dictará {tratamiento} {suplente} por una novedad del docente titular. La jornada sigue normal.»
- **Acompañamiento · padres:** «Estimados padres de familia de {curso}: hoy {día}, la clase de {materia} de {inicio} a {fin} no se dictará por una novedad del docente. Los estudiantes tendrán hora de trabajo autónomo acompañados por {tratamiento} {acompañante}.»
- **Salida anticipada · padres:** «Estimados padres de familia de {curso}: hoy {día}, la última clase ({inicio} a {fin}) se cancela por una novedad del docente. Los estudiantes saldrán a las {nuevaSalida}. Por favor tomen sus previsiones para recogerlos.»
- **Entrada tarde · padres:** «Estimados padres de familia de {curso}: hoy {día}, la primera clase ({inicio} a {fin}) se cancela por una novedad del docente. Los estudiantes pueden ingresar a las {nuevaEntrada}.»
- **Docente suplente o acompañante:** «{nombre}: hoy {día} usted cubre la clase de {materia} de {curso}, de {inicio} a {fin}, en {salón}.»
- **Coordinación (resumen):** «Novedad de {docenteAusente} el {día}: {n} clases afectadas. Suplencias: {lista}. Acompañamientos: {lista}. Canceladas: {lista}.»

Reglas de redacción: nunca la causa de la ausencia; «docente» como tratamiento neutro si no se conoce el género; horas en formato «8:00 a. m.», «12:00 m.», «1:00 p. m.».

## Bandeja de avisos
Lista del día con destinatario, curso, texto editable y estado (pendiente / enviado). Acciones: Copiar, Abrir en WhatsApp (`https://wa.me/?text=` + `encodeURIComponent(texto)`), Marcar como enviado. El estado vive en memoria de la página.
