# Tight-loop scaffold voor Claude Code

Deze map bevat een voorgestelde Claude Code configuratie voor de PoC. Bedoeling: Claude draait na elke edit automatisch lint + tests, en geeft zichzelf rode feedback waaruit hij verder corrigeert.

Niet meteen actief, jij moet eerst de files verplaatsen naar `.claude/` (die map is door Cowork beschermd, dus ik kon er zelf niet in schrijven).

## Verplaatsing

```bash
cd staffler/poc

# settings + hooks
mkdir -p .claude/scripts .claude/commands .claude/agents
cp _tight-loop-scaffold/settings.json .claude/settings.json
cp _tight-loop-scaffold/scripts/*.sh .claude/scripts/
chmod +x .claude/scripts/*.sh

# slash command
cp _tight-loop-scaffold/commands/qa-loop.md .claude/commands/qa-loop.md

# subagent
cp _tight-loop-scaffold/agents/test-runner.md .claude/agents/test-runner.md

# weggooien
rm -rf _tight-loop-scaffold
```

## Wat zit erin

- `settings.json`: PostToolUse hook draait `post-edit.sh` na elke Edit/Write/MultiEdit. Stop hook draait een korte sanity check.
- `scripts/post-edit.sh`: detecteert of FE of BE geraakt is, draait gerichte lint + test of typecheck. Output gaat terug naar Claude.
- `scripts/pre-stop-check.sh`: backend typecheck + frontend smoke build + git status, zodat afsluit-moment helder is.
- `commands/qa-loop.md`: `/qa-loop` slash command voor volledige lint + test + build run.
- `agents/test-runner.md`: subagent om rood-naar-groen autonoom op te lossen, enkel inzetten als jij expliciet vraagt.

## Wat NIET in zit

- Pre-commit Git hooks: bewust niet, die werken los van Claude Code en kan je via `husky` of `lefthook` regelen.
- CI: blijft op GitHub Actions, zie `../.github/workflows/` indien aanwezig.
- E2E (Playwright/Cypress): kost te veel tijd per loop. Kan later als optionele `/regression` skill.

## Waarom deze opzet

- PostToolUse hook is de tightste loop die Claude Code biedt zonder dat je elke run handmatig start.
- Hook output komt terug in Claude's context, dus hij ziet wat rood is en kan zelfstandig herstellen.
- Slash command + subagent zijn er voor de momenten waarop je expliciet QA wil draaien zonder dat de loop in elke edit hangt.

## Tweaks die je later kan willen

- `post-edit.sh` heeft nu `tail -n 60` op test-output. Te kort als suite groot wordt, dan tail verhogen of grep op `FAILED`.
- `ng test --watch=false` start Karma elke keer opnieuw (~5-10s). Voor snellere loop: Jest met `--findRelatedTests`.
- Stop-hook is verbose. Als het te veel ruis geeft, kan je hem in `.claude/settings.local.json` overriden voor je eigen sessies.
