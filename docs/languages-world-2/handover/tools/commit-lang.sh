#!/bin/bash
# commit-lang.sh <locale> <lproj> <guardLang> <message-file> — commits ONLY this language's files (+ the shared generated ones)
set -e; cd /Users/dominicbonini/dev/village-foodie
L=$1; P=$2; G=$3; MSGFILE=$4
F=(messages/$L.json messages/ns/$L docs/i18n/back/$L.json docs/languages-world-2/$L-translation-flags.md lib/i18n/locales.ts lib/i18n/locale-files.ts lib/i18n/catalog lib/allergen-guard.ts lib/allergen-guard/$G.json scripts/ios/native-strings.cjs ios/App/App.xcodeproj/project.pbxproj ios/App/App/$P.lproj)
shift 4; F+=("$@")
git add -- "${F[@]}"; git commit -q -F "$MSGFILE" -- "${F[@]}"; git log --oneline -1
