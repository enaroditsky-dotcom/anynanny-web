# Eddie / dev: fix duplicate public nanny serials in Supabase
# Run from anynanny-web: .\scripts\fix-duplicate-nanny-serials.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sqlFile = Join-Path $root "sql\fix_duplicate_nanny_serials.sql"

Write-Host ""
Write-Host "AnyNanny — duplicate nanny_serial repair" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Open Supabase Dashboard -> SQL Editor"
Write-Host "2. Paste and run the SQL in:"
Write-Host "   $sqlFile"
Write-Host ""
Write-Host "3. Review step 1 output (duplicate norm_serial rows)."
Write-Host "   If AN-1004 appears twice, edit step 5 in the SQL file"
Write-Host "   and assign a unique serial to the extra profile."
Write-Host ""
Write-Host "4. After updates, run: NOTIFY pgrst, 'reload schema'; (included at end of SQL)"
Write-Host ""
Write-Host "5. Re-test parent search for AN-1004 — expect exactly one sitter."
Write-Host ""

if (Get-Command supabase -ErrorAction SilentlyContinue) {
  Write-Host "Optional (Supabase CLI linked to project):" -ForegroundColor Yellow
  Write-Host "  supabase db execute --file sql/fix_duplicate_nanny_serials.sql"
  Write-Host ""
}

if (Test-Path $sqlFile) {
  Write-Host "Opening SQL file in default editor..." -ForegroundColor DarkGray
  Start-Process $sqlFile
}
