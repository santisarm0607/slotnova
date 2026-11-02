# SlotNova · correr-recorrido.ps1
# Abre la página en Chrome (o Edge) sin interfaz, hace el recorrido de pruebas/recorrido-navegador.js
# e imprime el resultado. No necesita Node ni instalar nada.
# Uso:
#   powershell -ExecutionPolicy Bypass -File pruebas/correr-recorrido.ps1
#   powershell -ExecutionPolicy Bypass -File pruebas/correr-recorrido.ps1 -Hasta generado -Captura C:\temp\horario.png -Ancho 1280 -Alto 2000
# Termina con código 1 si algún paso falla o si hubo errores de consola.
param([string]$Hasta = 'todo', [string]$Captura = '', [int]$Ancho = 1280, [int]$Alto = 900)

$raiz = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path $env:TEMP 'slotnova-prueba'
New-Item -ItemType Directory -Force $tmp | Out-Null
$navegador = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $navegador) { Write-Error 'No encontré Chrome ni Edge.'; exit 1 }

# Copia de index.html con <base> apuntando al proyecto y el script del recorrido al final
$base = ([System.Uri]($raiz + '\')).AbsoluteUri
$html = Get-Content (Join-Path $raiz 'index.html') -Raw -Encoding UTF8
$html = $html.Replace('<head>', "<head>`n  <base href=`"$base`">").Replace('</body>', "<script src=`"${base}pruebas/recorrido-navegador.js`"></script>`n</body>")
$pagina = Join-Path $tmp 'prueba.html'
Set-Content $pagina $html -Encoding utf8
$url = ([System.Uri]$pagina).AbsoluteUri + "?hasta=$Hasta"

$comun = @('--headless=new', '--disable-gpu', '--allow-file-access-from-files', "--user-data-dir=$tmp\perfil",
  '--virtual-time-budget=90000', '--hide-scrollbars', "--window-size=$Ancho,$Alto")
function Correr($argumentos, $salida) {
  $p = Start-Process -FilePath $navegador -ArgumentList $argumentos -RedirectStandardOutput $salida -RedirectStandardError "$tmp\err.txt" -PassThru -WindowStyle Hidden
  if (-not $p.WaitForExit(150000)) { $p.Kill(); Write-Error 'Se agotó el tiempo.'; exit 1 }
}
if ($Captura) { Correr ($comun + @("--screenshot=$Captura", $url)) "$tmp\captura.txt"; Write-Output "Captura: $Captura" }

Correr ($comun + @('--dump-dom', $url)) "$tmp\dom.html"
$dom = Get-Content "$tmp\dom.html" -Raw -Encoding UTF8
if ($dom -match '(?s)<pre id="resultado-prueba"[^>]*>(.*?)</pre>') {
  $r = [System.Net.WebUtility]::HtmlDecode($matches[1])
  Write-Output $r
  # Un paso falla solo si la línea EMPIEZA con ✘ (los mensajes de la página también pueden traer ✘)
  $fallas = ([regex]::Matches($r, '(?m)^\s*' + [char]0x2718 + ' ')).Count
  $pasos = ([regex]::Matches($r, '(?m)^\s*[' + [char]0x2714 + [char]0x2718 + '] ')).Count
  Write-Output ("RESULTADO: " + ($pasos - $fallas) + " de " + $pasos + " pasos correctos")
  if ($fallas -gt 0 -or $r -notmatch 'ERRORES: ninguno') { exit 1 }
} else { Write-Error 'La página no devolvió resultado.'; exit 1 }
