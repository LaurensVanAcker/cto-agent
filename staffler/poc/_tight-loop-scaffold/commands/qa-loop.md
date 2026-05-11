---
description: Volledige QA-flow draaien op de PoC. Lint, unit tests, prod build, typecheck. Output samengevat.
allowed-tools: Bash(npm run *), Bash(npx *), Bash(ng *), Bash(cd *)
argument-hint: "[frontend|backend|all] (default all)"
---

Voer de QA-flow uit voor de scope `$ARGUMENTS` (default `all`).

Stappen:

1. Backend typecheck: `cd staffler/poc && npm run typecheck`
2. Frontend lint: `cd staffler/poc/frontend && npx ng lint`
3. Frontend unit tests headless: `cd staffler/poc/frontend && npx ng test --watch=false --browsers=ChromeHeadless`
4. Frontend prod build: `cd staffler/poc/frontend && npx ng build --configuration production`

Bij elke stap die rood gaat: stop, vat het probleem in twee zinnen samen, vraag aan Laurens of je het mag fixen. Niet stilzwijgend doorgaan.

Bij alles groen: print een lijntje "QA groen, commit klaar".
