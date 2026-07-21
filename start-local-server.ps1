# Starts the NestJS API (Dube build) against local PostgreSQL. All local, no remote calls.
# Env is set here (authoritative) in case anything reads vars at import-time,
# before crm-v2-server/.env is loaded. Values mirror crm-v2-server/.env.
$env:NODE_ENV            = "development"
$env:PORT                = "3001"
$env:DB_TYPE             = "postgres"
$env:DATABASE_HOST       = "127.0.0.1"
$env:DATABASE_PORT       = "5433"  # 5432 is taken by a system postgresql-x64-18 service
$env:DATABASE_USERNAME   = "postgres"
$env:DATABASE_PASSWORD   = "localdev"
$env:DATABASE_NAME       = "digilearn_crm"
$env:DB_SYNCHRONIZE      = "false"      # schema via migrations only — mirrors prod
$env:DB_RUN_MIGRATIONS   = "true"
$env:DB_RUN_SEEDS        = "true"
$env:ADMIN_EMAIL         = "admin@digilearn.local"
$env:ADMIN_PASSWORD      = "LocalAdmin2026"
$env:JWT_SECRET_TOKEN    = "f1f7f21b3d94f771e816e6579765a044e8d2475663a05d4393f0b5e2cfc9f23ef4ff9f42d26e6c8bed0e869b58041b42"
$env:JWT_EXPIRATION      = "7"
$env:JWT_REFRESH_EXPIRATION = "15"
$env:CRM_API_KEY         = "7a727a7404f0d410c1615efdff7906de3069415d73ddc587"
$env:CORS_ORIGIN         = "http://localhost:5173"
$env:CORS_CREDENTIALS    = "true"

Set-Location "$PSScriptRoot\crm-v2-server"
npm run dev
