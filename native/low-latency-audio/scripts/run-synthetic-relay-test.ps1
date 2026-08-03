param(
    [int]$DurationSeconds = 5,
    [int]$Port = 50001,
    [string]$Server = ""
)

$ErrorActionPreference = "Stop"

function Start-RelayProcess([string]$File, [string]$Arguments) {
    $info = [System.Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $File
    $info.Arguments = $Arguments
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    [System.Diagnostics.Process]::Start($info)
}

$clientPath = (Resolve-Path ".\target\release\audio-client.exe").Path
$serverProcess = $null
if (-not $Server) {
    $serverPath = (Resolve-Path ".\target\release\audio-relay-server.exe").Path
    $Server = "127.0.0.1:$Port"
    $serverProcess = Start-RelayProcess $serverPath "--bind $Server"
}

try {
    Start-Sleep -Milliseconds 300
    $clientA = Start-RelayProcess $clientPath "relay --server $Server --session-id 42 --client-id 1 --duration-seconds $DurationSeconds --synthetic"
    $clientB = Start-RelayProcess $clientPath "relay --server $Server --session-id 42 --client-id 2 --duration-seconds $DurationSeconds --synthetic"
    $clientA.WaitForExit()
    $clientB.WaitForExit()
    Write-Output "Client A:"
    Write-Output $clientA.StandardOutput.ReadToEnd()
    Write-Output $clientA.StandardError.ReadToEnd()
    Write-Output "Client B:"
    Write-Output $clientB.StandardOutput.ReadToEnd()
    Write-Output $clientB.StandardError.ReadToEnd()
    if ($clientA.ExitCode -ne 0 -or $clientB.ExitCode -ne 0) {
        throw "A relay client failed"
    }
} finally {
    if ($serverProcess -and -not $serverProcess.HasExited) {
        $serverProcess.Kill()
        $serverProcess.WaitForExit()
    }
}
