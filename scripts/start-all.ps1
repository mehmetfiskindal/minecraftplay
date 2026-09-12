param(
    [switch]$BotOnly,
    [switch]$NoWait
)

$Root = Split-Path $PSScriptRoot -Parent
$JavaPath = Get-ChildItem "$Root\tools\jdk-25*\bin\java.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
$ServerDir = "$Root\server"
$BotDir = "$Root\bot"
$OutLog = "$ServerDir\stdout.log"

function Start-Server {
    if (Get-Process java -ErrorAction SilentlyContinue) {
        Write-Host "  [i] Paper zaten calisiyor." -ForegroundColor Cyan
        return
    }
    if (-not (Test-Path "$ServerDir\paper.jar")) {
        Write-Host "  [hata] server\paper.jar yok. Once JDK 25 + Paper kur." -ForegroundColor Red
        exit 1
    }
    Write-Host "  [1/2] Paper baslatiliyor..." -ForegroundColor Cyan
    Start-Process $JavaPath -ArgumentList '-Xmx2G','-jar','paper.jar','nogui' -WorkingDirectory $ServerDir -RedirectStandardOutput $OutLog -RedirectStandardError "$ServerDir\stderr.log" -PassThru -WindowStyle Hidden | Out-Null
}

function Wait-Server {
    if ($NoWait) { return }
    Write-Host "  [2/2] Sunucu hazir laniyor..." -ForegroundColor Cyan
    $t0 = Get-Date
    do {
        Start-Sleep -Seconds 3
        $elapsed = (Get-Date) - $t0
        if ($elapsed.TotalSeconds -ge 120) { Write-Host "  [hata] Timeout." -ForegroundColor Red; exit 1 }
    } until (Select-String -Path $OutLog -Pattern 'Done ' -Quiet -ErrorAction SilentlyContinue)
    Write-Host "  [ok] Sunucu hazir." -ForegroundColor Green
}

function Start-Bot {
    Write-Host "  [3/3] Bot MCP sunucusu baslatiliyor..." -ForegroundColor Cyan
    Write-Host "     Calisiyor: node $BotDir\index.js (stdio)" -ForegroundColor DarkGray
    Write-Host "     Test:      cd $BotDir && node index.js" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  opencode'u bu klasorde baslatin -> MCP otomatik baglanir." -ForegroundColor Green
}

if (-not $BotOnly) { Start-Server }
Wait-Server
Start-Bot

if (-not $BotOnly -and -not $NoWait) {
    Write-Host ""
    Write-Host "Devam etmek icin bir tusa basin..." -ForegroundColor DarkGray
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}
