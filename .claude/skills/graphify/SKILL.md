# Graphify — Knowledge Graph Builder

Turns your entire codebase into a dependency and function graph, linking every file and function together. Claude then uses this map instead of re-reading every file every time you ask a question.

## Usage

```
/graphify [--build] [--view] [--search <term>]
```

**Options:**
- `--build` — Scan codebase and build/update knowledge graph
- `--view` — Display current graph statistics
- `--search <term>` — Find related files/functions

## How it works

1. **Scans** your entire codebase recursively
2. **Extracts** imports, exports, function definitions, class definitions
3. **Maps** dependencies: which files import which, which functions call which
4. **Stores** graph in `.claude/knowledge-graph.json`
5. **Returns** a compact map Claude can reference by file/function name instead of re-reading

## Graph Structure

```json
{
  "files": {
    "src/lib/feature-flags.ts": {
      "imports": ["src/lib/supabase", "src/lib/cache"],
      "exports": ["shouldRouteToDograh", "setDograhRolloutPercentage"],
      "functions": ["shouldRouteToDograh", "getDograhRolloutPercentage", "setDograhRolloutPercentage"],
      "dependencies": ["db", "loadKnowledge"]
    }
  },
  "functions": {
    "shouldRouteToDograh": {
      "file": "src/lib/feature-flags.ts",
      "calls": ["getDograhRolloutPercentage", "hashCallerNumber"],
      "calledBy": ["src/app/api/voice/status/route.ts"]
    }
  }
}
```

## Example

**Before:** Claude reads entire codebase for every question (10+ files × 2000 tokens each)

**After:** Claude looks up file in graph, gets relevant connections in 200 tokens

**Savings: ~18,000 tokens per complex question**
