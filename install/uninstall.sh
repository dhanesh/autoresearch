#!/bin/bash
set -euo pipefail

# Autoresearch Plugin Uninstaller

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[autoresearch]${NC} $1"; }
ok()    { echo -e "${GREEN}[autoresearch]${NC} $1"; }

info "Uninstalling autoresearch plugin..."

# Claude Code
CLAUDE_DIR="$HOME/.claude"
if [ -f "$CLAUDE_DIR/commands/autoresearch.md" ]; then
  rm -f "$CLAUDE_DIR/commands/autoresearch.md"
  ok "Removed command: $CLAUDE_DIR/commands/autoresearch.md"
fi
if [ -d "$CLAUDE_DIR/skills/autoresearch" ]; then
  rm -rf "$CLAUDE_DIR/skills/autoresearch"
  ok "Removed skill:   $CLAUDE_DIR/skills/autoresearch/"
fi

# AMP
AMP_DIR="$HOME/.amp"
if [ -f "$AMP_DIR/commands/autoresearch.md" ]; then
  rm -f "$AMP_DIR/commands/autoresearch.md"
  ok "Removed command: $AMP_DIR/commands/autoresearch.md"
fi
if [ -d "$AMP_DIR/skills/autoresearch" ]; then
  rm -rf "$AMP_DIR/skills/autoresearch"
  ok "Removed skill:   $AMP_DIR/skills/autoresearch/"
fi

echo ""
ok "Uninstall complete."
