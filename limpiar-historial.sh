#!/bin/bash
# ═══ LIMPIAR EL HISTORIAL PUBLICADO EN GITHUB ═══════════════════════
#
# Deja en GitHub SOLO la versión cifrada de hoy y retira las versiones
# anteriores, que hoy siguen siendo públicas y con los datos en claro.
#
# Nada se pierde: en este Mac quedan las ramas de respaldo
#   respaldo-sin-cifrar · respaldo-gh-pages · respaldo-rama-claude-workshop
# que no se suben a ningún sitio.
#
# Ejecutar con:   bash ~/tcb-docs/limpiar-historial.sh
set -e
cd ~/tcb-docs

echo "Copias de seguridad en este Mac:"
git branch --list "respaldo*" -v | cut -c1-70
echo

git checkout -q --orphan limpio
git reset -q
git add CNAME favicon.png tcb-logo.png tcb-wordmark.png index.html docs \
        nomad_campaign_deck.html panel-cifrar.js candado.json .gitignore

echo "Lo que queda publicado:"
git diff --cached --name-only
echo

git commit -q -m "Panel cifrado · historial anterior retirado de GitHub

Las paginas en claro viven solo en el Mac (fuente/), fuera del repositorio.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"

git push -f origin limpio:main
git push -f origin limpio:gh-pages
git push origin --delete claude/barberia-workshop-offer-359b5e

git branch -f main limpio
git checkout -q main
git branch -qD limpio

echo
echo "Ramas que quedan en GitHub:"
git ls-remote --heads origin
echo "Versiones publicadas ahora: $(git rev-list --count origin/main)"
echo
echo "Listo. Avisa a Claude para que compruebe la web."
