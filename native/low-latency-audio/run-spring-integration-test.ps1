[CmdletBinding()]
param(
    [long]$RoomId = 0,

    [string]$BackendUrl = "https://ssafystar-k.site",

    [string]$RoomName = "Spring Integration Test",

    [string]$Nickname = $env:USERNAME,

    [string]$AccessToken,

    [switch]$Mock,

    [switch]$FullAudio,

    [string]$RelayServer = "15.165.205.31:50000",

    [long]$SessionId = 0
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$executable = Join-Path $projectRoot "target\release\audio-gui.exe"

function Start-AudioGui {
    param([string[]]$Arguments)

    $argumentLine = ($Arguments | ForEach-Object {
        '"' + $_.Replace('"', '\"') + '"'
    }) -join ' '
    $process = Start-Process `
        -FilePath $executable `
        -ArgumentList $argumentLine `
        -PassThru `
        -Wait
    if ($process.ExitCode -ne 0) {
        throw "audio-gui exited with code $($process.ExitCode)."
    }
}

Write-Host "Building the latest release audio-gui before the integration test." -ForegroundColor Cyan
& cargo build --release -p audio-gui --manifest-path (Join-Path $projectRoot "Cargo.toml")
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $executable)) {
    throw "Failed to build the audio-gui release binary."
}

$useMock = $Mock

if ($useMock) {
    Write-Host "Starting the built-in mock Spring test. No room ID or JWT is required." -ForegroundColor Cyan
    Start-AudioGui -Arguments @("--mock-spring-test")
    exit 0
}

if ($RoomId -le 0) {
    $roomInput = Read-Host "Enter the actual numeric Spring room ID"
    $parsedRoomId = 0L
    if (-not [long]::TryParse($roomInput, [ref]$parsedRoomId) -or $parsedRoomId -le 0) {
        throw "A positive numeric Spring room ID is required."
    }
    $RoomId = $parsedRoomId
}

if ([string]::IsNullOrWhiteSpace($AccessToken)) {
    $AccessToken = $env:SSAFYSTAR_ACCESS_TOKEN
}

if ([string]::IsNullOrWhiteSpace($AccessToken)) {
    $secureToken = Read-Host "Enter the current Spring access JWT (input is hidden)" -AsSecureString
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try {
        $AccessToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
}

if ([string]::IsNullOrWhiteSpace($AccessToken)) {
    throw "A Spring access JWT is required."
}

if ($SessionId -le 0) {
    $SessionId = $RoomId
}

$previousToken = $env:SSAFYSTAR_ACCESS_TOKEN
$previousBackendUrl = $env:SSAFYSTAR_BACKEND_URL

try {
    $env:SSAFYSTAR_ACCESS_TOKEN = $AccessToken
    $env:SSAFYSTAR_BACKEND_URL = $BackendUrl

    try {
        $health = Invoke-RestMethod `
            -Method Get `
            -Uri "$($BackendUrl.TrimEnd('/'))/actuator/health" `
            -TimeoutSec 5
        Write-Host "Spring health: $($health.status)" -ForegroundColor Green
    }
    catch {
        Write-Warning "Spring health check failed; continuing with the authenticated test: $($_.Exception.Message)"
    }

    $launchArguments = @(
        "--room-id", $RoomId.ToString(),
        "--room-name", $RoomName,
        "--invite-code", "TEST",
        "--session-id", $SessionId.ToString(),
        "--nickname", $Nickname,
        "--backend-url", $BackendUrl,
        "--server", $RelayServer
    )

    if (-not $FullAudio) {
        $launchArguments += "--backend-only-test"
        Write-Host "Starting the Spring REST/STOMP-only test mode." -ForegroundColor Cyan
    }
    else {
        Write-Host "Starting the full Spring + rendezvous + P2P audio test mode." -ForegroundColor Cyan
    }

    Start-AudioGui -Arguments $launchArguments
}
finally {
    $env:SSAFYSTAR_ACCESS_TOKEN = $previousToken
    $env:SSAFYSTAR_BACKEND_URL = $previousBackendUrl
    $AccessToken = $null
}
