#!/bin/bash
# Autoresearch plugin session start hook
# Detects if an autoresearch run is in progress and injects context

STATE_FILE=".autoresearch/state.json"

if [ -f "$STATE_FILE" ]; then
  ITERATION=$(cat "$STATE_FILE" | grep -o '"currentIteration":[0-9]*' | grep -o '[0-9]*' || echo "0")
  MAX_ITER=$(cat "$STATE_FILE" | grep -o '"maxIterations":[0-9]*' | grep -o '[0-9]*' || echo "20")
  echo "Autoresearch: Active run detected (iteration $ITERATION/$MAX_ITER). Use /autoresearch --resume to continue."
fi
