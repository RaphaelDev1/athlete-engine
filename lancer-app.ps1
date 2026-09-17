# Lance l'application Athlete Engine (Next.js + Prisma)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
    Write-Host "Fichier .env introuvable. Copie .env.example vers .env et renseigne DATABASE_URL." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "node_modules")) {
    Write-Host "Installation des dependances..." -ForegroundColor Cyan
    npm install
}

Write-Host "Synchronisation du client Prisma..." -ForegroundColor Cyan
npx prisma generate

Write-Host "Synchronisation du schema avec la base de donnees..." -ForegroundColor Cyan
npx prisma db push

$url = "http://localhost:3000"
Start-Job -ScriptBlock {
    param($u)
    Start-Sleep -Seconds 3
    Start-Process $u
} -ArgumentList $url | Out-Null

Write-Host "Demarrage de l'application sur $url ..." -ForegroundColor Green
npm run dev
