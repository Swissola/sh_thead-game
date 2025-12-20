param(
  [int]$Port = 5173
)

Write-Host "Checking port $Port..."
$connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($connections) {
  $procIds = $connections |
    Where-Object { $_.State -ne 'Closed' } |
    Select-Object -ExpandProperty OwningProcess |
    Sort-Object -Unique
  foreach ($procId in $procIds) {
    try {
      Write-Host "Killing PID $procId using port $Port..."
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    } catch {
      Write-Warning ("Failed to kill PID {0}: {1}" -f $procId, $_)
    }
  }
} else {
  Write-Host "No process found on port $Port."
}

Write-Host "Starting Vite dev server on port $Port..."
# Run dev server; pass the port to ensure consistency
npm run dev -- --port $Port
