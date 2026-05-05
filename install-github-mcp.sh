#!/usr/bin/env bash
set -euo pipefail

CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

# --- sanity checks ---
command -v jq >/dev/null || { echo "jq ontbreekt. Installeer via: brew install jq"; exit 1; }
command -v docker >/dev/null || { echo "docker ontbreekt. Installeer Docker Desktop eerst."; exit 1; }

if [[ ! -f "$CONFIG" ]]; then
  echo "Config bestaat nog niet op $CONFIG — ik maak een lege aan."
  mkdir -p "$(dirname "$CONFIG")"
  echo '{"mcpServers":{}}' > "$CONFIG"
fi

# --- vraag PAT ---
read -r -s -p "Plak je GitHub Personal Access Token (verborgen): " PAT
echo
if [[ -z "$PAT" ]]; then
  echo "Geen token opgegeven, abort."
  exit 1
fi

# --- backup ---
BACKUP="$CONFIG.bak.$(date +%Y%m%d-%H%M%S)"
cp "$CONFIG" "$BACKUP"
echo "Backup: $BACKUP"

# --- merge entry ---
TMP=$(mktemp)
jq --arg pat "$PAT" '
  .mcpServers.github = {
    "command": "docker",
    "args": [
      "run", "-i", "--rm",
      "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
      "ghcr.io/github/github-mcp-server"
    ],
    "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": $pat }
  }
' "$CONFIG" > "$TMP" && mv "$TMP" "$CONFIG"

echo "GitHub MCP toegevoegd aan $CONFIG."
echo "Pull image nu zodat eerste gebruik sneller gaat:"
docker pull ghcr.io/github/github-mcp-server || echo "(pull failed, niet erg — gebeurt automatisch bij eerste call)"

echo
echo "Klaar. Herstart Claude Desktop om de nieuwe MCP te laden."
