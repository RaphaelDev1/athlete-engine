#!/bin/bash
# Lance l'application Athlete Engine (Next.js + Prisma) sur Chromebook Linux (Crostini)
set -e

cd "$(dirname "$0")"

if [ ! -f ".env" ]; then
    echo -e "\e[31mFichier .env introuvable. Copie .env.example vers .env et renseigne DATABASE_URL.\e[0m"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo -e "\e[36mInstallation des dependances...\e[0m"
    npm install
fi

echo -e "\e[36mSynchronisation du client Prisma...\e[0m"
npx prisma generate

echo -e "\e[36mSynchronisation du schema avec la base de donnees...\e[0m"
npx prisma db push

URL="http://localhost:3000"

(
    sleep 3
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$URL" >/dev/null 2>&1
    fi
) &

echo -e "\e[32mDemarrage de l'application sur $URL ...\e[0m"
npm run dev
