param(
    [int]$DurationSeconds = 10,
    [string]$Output = "results/local-network-test.csv"
)

$ErrorActionPreference = "Stop"
$serverPath = Resolve-Path ".\target\release\audio-relay-server.exe" -ErrorAction SilentlyContinue
if (-not $serverPath) {
    cargo build --release -p audio-relay-server -p network-tester-client
    $serverPath = Resolve-Path ".\target\release\audio-relay-server.exe"
}

$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $serverPath
$startInfo.Arguments = "--bind 127.0.0.1:50000"
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$server = [System.Diagnostics.Process]::Start($startInfo)
try {
    Start-Sleep -Seconds 1
    & ".\target\release\network-tester-client.exe" --server 127.0.0.1:50000 --duration-seconds $DurationSeconds --interval-micros 2500 --packet-bytes 300 --output $Output
} finally {
    if (-not $server.HasExited) {
        $server.Kill()
        $server.WaitForExit()
    }
}
