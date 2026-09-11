# Собирает PDF из report/index.html через headless Chrome.
#
# В браузере отчёт печатается кнопкой «Скачать PDF» — этот скрипт нужен, когда
# файл требуется получить без участия человека: приложить к письму, положить в
# рассылку, отдать по ссылке заранее.
#
#   pwsh ./scripts/make-pdf.ps1
#   pwsh ./scripts/make-pdf.ps1 -Out dist/happ-report-august.pdf
#
# Печатью управляет @media print в report/assets/report.css: A4, обложка
# отдельной страницей, разделы с новой страницы. Фоны включены — без них
# обложка, тепловая карта и шкалы оценок теряют смысл.

[CmdletBinding()]
param(
	[string]$Out = 'dist/happ-report.pdf',
	[string]$ChromePath
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'report/index.html'

if (-not (Test-Path $source)) {
	throw "Не найден $source"
}

# Порядок поиска: явный параметр, затем PATH, затем стандартные установки.
# Edge в списке потому, что это тот же Chromium с тем же --print-to-pdf, и на
# Windows он есть всегда, а Chrome — не всегда.
$candidates = @()
if ($ChromePath) { $candidates += $ChromePath }
$candidates += @(
	(Get-Command chrome -ErrorAction SilentlyContinue)?.Source,
	(Get-Command msedge -ErrorAction SilentlyContinue)?.Source,
	"$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
	"${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
	"$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
	"$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
	"${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)

$browser = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $browser) {
	throw 'Не найден Chrome или Edge. Укажите путь: -ChromePath "C:\path\to\chrome.exe"'
}

$outPath = if ([System.IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path $root $Out }
$outDir = Split-Path -Parent $outPath
if (-not (Test-Path $outDir)) {
	New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

# file:// вместо локального сервера: страница статическая, внешних запросов у
# неё два — шрифты с Google Fonts, и они работают и так. Профиль отдельный,
# чтобы запуск не цеплялся к уже открытому браузеру пользователя.
$profileDir = Join-Path ([System.IO.Path]::GetTempPath()) "happ-report-pdf-$PID"
$uri = ([System.Uri]$source).AbsoluteUri

Write-Host "Браузер : $browser"
Write-Host "Источник: $source"
Write-Host "Результат: $outPath"

# Не $args: это автоматическая переменная PowerShell, и присваивание ей внутри
# скрипта работает, но перетирает список аргументов самого скрипта.
$chromeArgs = @(
	'--headless=new'
	'--disable-gpu'
	'--no-first-run'
	'--no-default-browser-check'
	"--user-data-dir=$profileDir"
	# Шрифты приходят по сети; без бюджета времени Chrome печатает до того, как
	# применится @font-face, и документ выходит в системном фолбэке.
	'--virtual-time-budget=8000'
	'--run-all-compositor-stages-before-draw'
	"--print-to-pdf=$outPath"
	# Два флага на одно и то же: имя менялось между версиями Chrome, а лишний
	# неизвестный флаг Chromium молча игнорирует. Без них на каждой странице
	# печатается дата, <title> и путь file:// — в документе, который уходит
	# клиенту, этого быть не должно.
	'--print-to-pdf-no-header'
	'--no-pdf-header-footer'
	$uri
)

if (Test-Path $outPath) {
	Remove-Item -Force $outPath
}

& $browser @chromeArgs

# На Windows запущенный процесс Chrome передаёт работу уже существующему
# браузерному процессу и завершается раньше, чем PDF записан: `&` возвращает
# управление с пустым $LASTEXITCODE, а файл появляется через секунду-две. Поэтому
# успех определяется появлением файла с переставшим расти размером, а не кодом
# возврата — старый файл для этого удалён выше, иначе «успехом» сошёл бы
# результат предыдущего запуска.
$deadline = (Get-Date).AddSeconds(90)
$lastSize = -1
$stable = 0

while ((Get-Date) -lt $deadline) {
	Start-Sleep -Milliseconds 500

	if (-not (Test-Path $outPath)) {
		continue
	}

	$size = (Get-Item $outPath).Length
	if ($size -gt 0 -and $size -eq $lastSize) {
		$stable++
		if ($stable -ge 2) { break }
	} else {
		$stable = 0
	}
	$lastSize = $size
}

if (Test-Path $profileDir) {
	Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
}

if (-not (Test-Path $outPath)) {
	throw "PDF не создан за 90 секунд: $outPath"
}

$size = [math]::Round((Get-Item $outPath).Length / 1KB)
Write-Host "Готово: $outPath ($size KB)" -ForegroundColor Green
