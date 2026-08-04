[CmdletBinding()]
param(
    [string]$OutputDirectory = "dist\windows-installer"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $projectRoot $OutputDirectory
$wixSource = Join-Path $projectRoot "installer\SSAFYStarAudio.wxs"
$releaseExe = Join-Path $projectRoot "target\release\audio-gui.exe"
$wixTools = Join-Path $projectRoot ".tools\wix311"
$candle = Join-Path $wixTools "candle.exe"
$light = Join-Path $wixTools "light.exe"

Push-Location $projectRoot
try {
    cargo build -p audio-gui --release
    if ($LASTEXITCODE -ne 0) {
        throw "Rust release build failed."
    }
    if (-not (Test-Path -LiteralPath $releaseExe)) {
        throw "Release executable was not produced: $releaseExe"
    }

    if (-not (Test-Path -LiteralPath $candle) -or -not (Test-Path -LiteralPath $light)) {
        $toolRoot = Split-Path -Parent $wixTools
        $archive = Join-Path $toolRoot "wix311-binaries.zip"
        New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
        Invoke-WebRequest `
            -Uri "https://github.com/wixtoolset/wix3/releases/download/wix3112rtm/wix311-binaries.zip" `
            -OutFile $archive
        New-Item -ItemType Directory -Path $wixTools -Force | Out-Null
        Expand-Archive -LiteralPath $archive -DestinationPath $wixTools -Force
        Remove-Item -LiteralPath $archive -Force
    }

    New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
    $objectFile = Join-Path $outputPath "SSAFYStarAudio.wixobj"
    $msi = Join-Path $outputPath "SSAFYStar-LowLatencyAudio-0.1.4-x64.msi"
    & $candle -nologo -arch x64 -out $objectFile $wixSource
    if ($LASTEXITCODE -ne 0) {
        throw "WiX source compilation failed."
    }
    & $light -nologo -sval -out $msi $objectFile
    if ($LASTEXITCODE -ne 0) {
        throw "WiX installer linking failed."
    }
    Write-Host "Installer created: $msi"
    Write-Host "The MSI registers ssafystar:// for the current user and removes it on uninstall."
}
finally {
    Pop-Location
}
