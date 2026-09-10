# Code Burn — Token Usage Analytics

Shows you exactly where you're burning tokens, breaking everything down by cost, task, model, tool, and project. Helps you optimize from the hotspots.

## Usage

```
/code-burn [--summary] [--by-model] [--by-tool] [--by-task] [--today] [--reset]
```

**Options:**
- `--summary` — Show total usage and top consumers
- `--by-model` — Break down by model (Claude 3.5 Sonnet, Haiku, etc.)
- `--by-tool` — Break down by tool used (Read, Grep, Bash, etc.)
- `--by-task` — Break down by project/task
- `--today` — Show today's usage only
- `--reset` — Clear usage log (careful!)

## How it works

1. **Tracks** every API call: tokens used, model, tool, timestamp
2. **Calculates** cost based on input/output token pricing
3. **Categorizes** by model, tool, task, project
4. **Stores** in `.claude/code-burn.json`
5. **Displays** breakdown with costs and optimization tips

## Example Output

```
📊 CODE BURN ANALYTICS
═══════════════════════════════════════

Total Usage (Last 7 days):
  Input Tokens: 1,245,000 (estimated cost: $18.68)
  Output Tokens: 342,000 (estimated cost: $20.52)
  Total Cost: $39.20

By Model:
  Claude 3.5 Sonnet: $32.40 (82.7%)
  Claude 3 Haiku:    $6.80 (17.3%)

By Tool:
  Read:     $14.20 (36.2%)
  Bash:     $8.50 (21.7%)
  Grep:     $6.30 (16.1%)
  Agent:    $5.20 (13.3%)
  Other:    $4.80 (12.7%)

By Project:
  switchboard:  $28.50 (72.7%)
  ypc-ux:       $8.20 (20.9%)
  other:        $2.50 (6.4%)

💡 Optimization Tips:
  • Using Headroom on large files saves ~20% on Read operations
  • Build the knowledge graph with Graphify to reduce re-reading
  • Use Haiku for simple tasks (5% of Sonnet cost)
```

## Integration with other skills

Code Burn automatically tracks:
- **Headroom** savings: tokens saved by compression
- **Graphify** usage: graph lookups vs. file reads
- **Ponytail** optimizations: output reduction %
