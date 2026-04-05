# ADR-001: Pure-Function State Machine for Loop Engine

## Status
Accepted

## Date
2026-04-05

## Context
The autoresearch loop follows an improve-evaluate-iterate cycle. The core state (`LoopState` in `types.ts`) tracks iteration history, per-constraint scores, plateau counter, token budget, timing, stop reason, and scope expansion proposals. This state must survive across iterations, be inspectable for debugging, and be persistable to disk so that runs can be resumed across sessions.

The central design question was: how should this state be managed? Options included a class-based `LoopEngine` with methods that mutate internal state, an event-driven architecture with emitters and listeners, or a pure-function approach where state is a plain object threaded through stateless functions.

## Decision
Use an immutable `LoopState` plain object with pure functions (`initLoopState`, `shouldStop`, `processIterationResults`, `updateState`) defined in `loop.ts`. State is created via `initLoopState()`, interrogated via `shouldStop()`, and evolved via `processIterationResults()` which returns both a new `IterationScores` snapshot and an action (`"continue"`, `"revert"`, or `"circuit_break"`). The caller is responsible for threading the state object through each function call.

`LoopState` is a plain TypeScript interface -- no class, no prototype chain, no methods. Every function that operates on it takes state as input and returns a new value without mutating the original.

## Consequences

### Positive
- **Serializable by default**: `LoopState` is a plain object with only JSON-compatible types (`string`, `number`, arrays, nested records). It can be persisted to `.autoresearch/state.json` and resumed across sessions with no custom serialization logic.
- **Trivially testable**: Pure functions require no mocks, no setup/teardown, no dependency injection. Tests pass a state literal and assert on the return value.
- **No hidden side effects**: State transitions are explicit in the function signatures. There is no implicit mutation -- every change is visible in the returned object.
- **Debuggable**: The full state at any point can be logged, diffed, or inspected as JSON. No opaque internal class state.
- **Composable**: Functions can be combined, wrapped, or replaced independently without subclassing or inheritance hierarchies.

### Negative
- **Caller must manage state threading**: The orchestrator must pass state into each function and capture the returned state. This is a mild ergonomic cost compared to `engine.iterate()` on a stateful class.
- **No encapsulation of invariants**: A class could enforce invariants in its constructor and methods. With plain objects, invariants must be maintained by convention and validated externally.

### Neutral
- The pattern is idiomatic in functional TypeScript but may be unfamiliar to developers who expect OOP patterns.
- The `updateState` helper centralizes state evolution, reducing the risk of ad-hoc field mutations despite the lack of class encapsulation.

## Alternatives Considered

### Class-based LoopEngine
A `LoopEngine` class with methods like `iterate()`, `stop()`, and internal mutable state. Rejected because:
- Class instances are not trivially serializable to JSON (methods, prototype chain, potential closures).
- Implicit state mutation makes it harder to reason about state transitions and write deterministic tests.
- Resuming a loop from disk would require reconstructing the class instance, rehydrating internal references, and ensuring method bindings are correct.

### Event-driven architecture
An event emitter pattern where state changes are broadcast as events (`"iteration_complete"`, `"circuit_break"`, etc.) and listeners update shared state. Rejected because:
- Adds indirection and ordering complexity for a fundamentally sequential loop.
- Event listeners with shared mutable state are a common source of race conditions and hard-to-debug issues.
- Overkill for a single-threaded iteration loop with clear sequential phases.

## Related
- Satisfies: RT-6 (Iteration State Machine), RT-2 (Baseline Capture), O1 (Max Iterations), O2 (Token Budget)
- Files: `src/loop.ts`, `src/types.ts` (LoopState, IterationScores interfaces)
