# Starts the Vite dev server for the React client. All local.
$env:VITE_PUBLIC_API_URL = "http://localhost:3000/api/v2"
Set-Location "$PSScriptRoot\crm-v2-client"
npm run dev
