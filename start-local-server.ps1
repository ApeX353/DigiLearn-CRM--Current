# Starts the NestJS API against the local restored DB. All local, no remote calls.
# Env is set here (authoritative) because several vars are read at import-time,
# before crm-v2-server/.env is loaded.
$env:NODE_ENV            = "production"     # keeps TypeORM synchronize OFF
$env:SMS_PORT            = "3000"
$env:DATABASE_HOST       = "127.0.0.1"
$env:DATABASE_PORT       = "3306"
$env:DATABASE_USERNAME   = "root"
$env:DATABASE_PASSWORD   = ""
$env:DATABASE_NAME       = "digilearn_crm_v2_live"
$env:JWT_SECRET_TOKEN    = "fba376e4f3b125ecd6c56e6365c44956eefc18316e3a1a4647222fb47536cc38085519be23021debc48fe760c8678896"
$env:JWT_REFRESH_TOKEN   = "aba62c225ba089b790eb26a30cef6feaf625aa76aac000f130dbad3d63267d2e63d65eb098f3a7b87870c383f9aed091"
$env:JWT_EXPIRATION      = "7"
$env:JWT_REFRESH_EXPIRATION = "30"
$env:CORS_ORIGIN         = "http://localhost:5173"
$env:CORS_CREDENTIALS    = "true"
$env:COOKIE_SECURE       = "false"
$env:COOKIE_SAMESITE     = "lax"

Set-Location "$PSScriptRoot\crm-v2-server"
npm run dev
