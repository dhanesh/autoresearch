#!/bin/bash
set -euo pipefail

# Autoresearch Plugin Installer
# Installs the autoresearch skill as a Claude Code plugin
#
# Usage:
#   bash install.sh                    # Install from local clone
#   curl -fsSL <url>/install.sh | bash # Install from remote

PLUGIN_NAME="autoresearch"
VERSION="1.0.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[autoresearch]${NC} $1"; }
ok()    { echo -e "${GREEN}[autoresearch]${NC} $1"; }
warn()  { echo -e "${YELLOW}[autoresearch]${NC} $1"; }
error() { echo -e "${RED}[autoresearch]${NC} $1"; }

# ── Locate plugin source ──────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PLUGIN_SRC="$REPO_ROOT/plugin"

if [ ! -f "$PLUGIN_SRC/plugin.json" ]; then
  error "Cannot find plugin source at $PLUGIN_SRC/plugin.json"
  error "Run this script from within the autoresearch repository."
  exit 1
fi

info "Autoresearch Plugin Installer v${VERSION}"
echo ""

# ── Detect Claude Code ────────────────────────────────────────────────

CLAUDE_DIR="$HOME/.claude"
CLAUDE_COMMANDS="$CLAUDE_DIR/commands"
CLAUDE_SKILLS="$CLAUDE_DIR/skills"
CLAUDE_HOOKS_FILE="$CLAUDE_DIR/settings.json"

INSTALLED=false

if [ -d "$CLAUDE_DIR" ]; then
  info "Detected Claude Code at $CLAUDE_DIR"

  # Create directories
  mkdir -p "$CLAUDE_COMMANDS"
  mkdir -p "$CLAUDE_SKILLS/$PLUGIN_NAME"

  # ── Install command ───────────────────────────────────────────────

  COMMAND_FILES=(
    "autoresearch.md"
  )

  for cmd in "${COMMAND_FILES[@]}"; do
    if [ -f "$PLUGIN_SRC/commands/$cmd" ]; then
      cp "$PLUGIN_SRC/commands/$cmd" "$CLAUDE_COMMANDS/$cmd"
      ok "  Command: /autoresearch → $CLAUDE_COMMANDS/$cmd"
    fi
  done

  # ── Install skill ─────────────────────────────────────────────────

  if [ -f "$PLUGIN_SRC/skills/autoresearch/SKILL.md" ]; then
    cp "$PLUGIN_SRC/skills/autoresearch/SKILL.md" "$CLAUDE_SKILLS/$PLUGIN_NAME/SKILL.md"
    ok "  Skill:   /autoresearch → $CLAUDE_SKILLS/$PLUGIN_NAME/SKILL.md"
  fi

  # ── Install lib (reference implementations) ───────────────────────

  LIB_DIR="$CLAUDE_SKILLS/$PLUGIN_NAME/lib"
  mkdir -p "$LIB_DIR/evaluators"

  LIB_FILES=(
    "types.ts"
    "loop.ts"
    "discovery.ts"
    "report.ts"
    "evaluators/index.ts"
    "evaluators/static.ts"
    "evaluators/tests.ts"
    "evaluators/llm.ts"
    "evaluators/custom.ts"
  )

  for lib in "${LIB_FILES[@]}"; do
    if [ -f "$PLUGIN_SRC/lib/$lib" ]; then
      cp "$PLUGIN_SRC/lib/$lib" "$LIB_DIR/$lib"
    fi
  done
  ok "  Lib:     9 reference modules → $LIB_DIR/"

  # ── Install profiles ──────────────────────────────────────────────

  PROFILES_DIR="$CLAUDE_SKILLS/$PLUGIN_NAME/profiles"
  mkdir -p "$PROFILES_DIR"

  for profile in "$PLUGIN_SRC/profiles/"*.json; do
    if [ -f "$profile" ]; then
      cp "$profile" "$PROFILES_DIR/"
    fi
  done
  ok "  Profiles: quality, performance, coverage → $PROFILES_DIR/"

  INSTALLED=true
else
  warn "Claude Code not detected at $CLAUDE_DIR"
fi

# ── Detect AMP ────────────────────────────────────────────────────────

AMP_DIR="$HOME/.amp"

if [ -d "$AMP_DIR" ]; then
  info "Detected AMP at $AMP_DIR"

  AMP_COMMANDS="$AMP_DIR/commands"
  AMP_SKILLS="$AMP_DIR/skills/$PLUGIN_NAME"
  mkdir -p "$AMP_COMMANDS"
  mkdir -p "$AMP_SKILLS/lib/evaluators"
  mkdir -p "$AMP_SKILLS/profiles"

  # Command
  cp "$PLUGIN_SRC/commands/autoresearch.md" "$AMP_COMMANDS/autoresearch.md"
  ok "  Command: /autoresearch → $AMP_COMMANDS/autoresearch.md"

  # Skill
  cp "$PLUGIN_SRC/skills/autoresearch/SKILL.md" "$AMP_SKILLS/SKILL.md"
  ok "  Skill:   /autoresearch → $AMP_SKILLS/SKILL.md"

  # Lib
  for lib in "${LIB_FILES[@]}"; do
    if [ -f "$PLUGIN_SRC/lib/$lib" ]; then
      cp "$PLUGIN_SRC/lib/$lib" "$AMP_SKILLS/lib/$lib"
    fi
  done
  ok "  Lib:     9 reference modules → $AMP_SKILLS/lib/"

  # Profiles
  for profile in "$PLUGIN_SRC/profiles/"*.json; do
    if [ -f "$profile" ]; then
      cp "$profile" "$AMP_SKILLS/profiles/"
    fi
  done
  ok "  Profiles: quality, performance, coverage → $AMP_SKILLS/profiles/"

  INSTALLED=true
fi

# ── Summary ───────────────────────────────────────────────────────────

echo ""
if [ "$INSTALLED" = true ]; then
  ok "Installation complete!"
  echo ""
  info "Usage:"
  echo "  /autoresearch                         # Interactive discovery"
  echo "  /autoresearch src/ --profile quality   # Quality-focused"
  echo "  /autoresearch --profile coverage       # Test coverage"
  echo "  /autoresearch --resume                 # Resume previous run"
  echo ""
  info "Or use as a plugin directory:"
  echo "  claude --plugin-dir $PLUGIN_SRC"
else
  error "No supported AI agents detected."
  echo ""
  info "Supported agents:"
  echo "  - Claude Code (~/.claude/)"
  echo "  - AMP (~/.amp/)"
  echo ""
  info "Manual installation:"
  echo "  claude --plugin-dir $PLUGIN_SRC"
  exit 1
fi
