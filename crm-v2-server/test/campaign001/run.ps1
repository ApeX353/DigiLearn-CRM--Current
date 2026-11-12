# Campaign 001 regression harness runner (Windows PowerShell).
#
# Usage (from any directory):
#   $env:CRM_TEST_PG_ADMIN_PASSWORD = '<superuser password of the LOCAL portable PostgreSQL 16>'
#   powershell -File test\campaign001\run.ps1              # whole suite
#   powershell -File test\campaign001\run.ps1 harness      # one spec by name fragment
#
# Requirements this script checks or enforces:
#   - a loopback PostgreSQL 16 on CRM_TEST_PG_HOST:CRM_TEST_PG_PORT (default 127.0.0.1:5433,
#     the repo's portable instance started by start-local-postgres.ps1);
#   - Node 22.12.0 obtained through the npm cache (no system install, see 005-TEST-ENVIRONMENT.md);
#   - no application environment variables in this shell (the harness refuses them).
param([string]$Spec = "")

$ErrorActionPreference = "Stop"
if (-not $env:CRM_TEST_PG_ADMIN_PASSWORD) {
  throw "CRM_TEST_PG_ADMIN_PASSWORD is not set. Use the superuser password of the LOCAL portable PostgreSQL 16 only."
}
if (-not $env:CRM_TEST_PG_HOST) { $env:CRM_TEST_PG_HOST = "127.0.0.1" }
if (-not $env:CRM_TEST_PG_PORT) { $env:CRM_TEST_PG_PORT = "5433" }

$leaked = Get-ChildItem env: | Where-Object {
  $_.Name -like "DATABASE_*" -or $_.Name -like "DB_*" -or $_.Name -like "SMTP_*" -or
  $_.Name -in @("JWT_SECRET_TOKEN","JWT_REFRESH_TOKEN","CRM_API_KEY","BLOB_READ_WRITE_TOKEN","PORT","CORS_ORIGIN")
}
if ($leaked) { throw "Refusing to run: application variables present in this shell: $($leaked.Name -join ', ')" }

$server = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $server
$jestArgs = @("exec","--yes","--package=node@22.12.0","--","node","node_modules/jest/bin/jest.js","--config","test/jest-campaign001.json","--runInBand")
if ($Spec) { $jestArgs += $Spec }
& npm @jestArgs
exit $LASTEXITCODE
