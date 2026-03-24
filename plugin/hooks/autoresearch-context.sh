#!/bin/bash
# Autoresearch PreCompact hook
# Preserves autoresearch loop state across context compaction

STATE_FILE=".autoresearch/state.json"

if [ -f "$STATE_FILE" ]; then
  ITERATION=$(cat "$STATE_FILE" | grep -o '"currentIteration":[0-9]*' | grep -o '[0-9]*' || echo "?")
  MAX_ITER=$(cat "$STATE_FILE" | grep -o '"maxIterations":[0-9]*' | grep -o '[0-9]*' || echo "?")
  SCORE=$(cat "$STATE_FILE" | grep -o '"composite":[0-9.]*' | head -1 | grep -o '[0-9.]*' || echo "?")

  echo "AUTORESEARCH STATE (preserved across compaction):"
  echo "  Iteration: $ITERATION/$MAX_ITER"
  echo "  Last composite score: $SCORE"
  echo "  State file: $STATE_FILE"
  echo "  Resume with: /autoresearch --resume"
fi
