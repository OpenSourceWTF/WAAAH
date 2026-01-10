#!/bin/bash
# spawn-agents.sh - Start multiple WAAAH agents
#
# Usage: ./spawn-agents.sh
# Or:    ./spawn-agents.sh --dry-run

set -e
cd "$(dirname "$0")"

WRAPPER="node packages/cli-wrapper/dist/index.js"

# Agent configuration: [name] [cli] [workflow]
AGENTS=(
  "orc-gemini-1:gemini:waaah-orc-loop"
  "orc-gemini-2:gemini:waaah-orc-loop"
  "orc-claude-1:claude:waaah-orc-loop"
  "orc-claude-2:claude:waaah-orc-loop"
  "doctor-claude:claude:waaah-doctor-loop"
)

echo "🤖 WAAAH Agent Fleet Launcher"
echo "   Agents: ${#AGENTS[@]}"
echo ""

for agent in "${AGENTS[@]}"; do
  IFS=':' read -r name cli workflow <<< "$agent"
  
  echo "🚀 Spawning: $name ($cli → $workflow)"
  
  if [[ "$1" == "--dry-run" ]]; then
    echo "   [DRY RUN] Would run: $WRAPPER --start=$cli --as=$workflow"
  else
    # Start in background with nohup, log to file
    nohup $WRAPPER --start=$cli --as=$workflow \
      > ".waaah/logs/$name.log" 2>&1 &
    echo "   PID: $!"
  fi
done

echo ""
echo "✅ Fleet launched. Logs in .waaah/logs/"
echo "   Monitor: tail -f .waaah/logs/*.log"
echo "   Stop all: pkill -f 'waaah-agent\|gemini\|claude'"
