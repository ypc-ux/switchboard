#!/usr/bin/env node
/**
 * Code Burn: Token Usage Analytics
 * Tracks and visualizes token spending by model, tool, task
 */

const fs = require('fs');
const path = require('path');

const PRICING = {
  'claude-opus-5': { input: 15 / 1000000, output: 45 / 1000000 },
  'claude-sonnet-5': { input: 3 / 1000000, output: 15 / 1000000 },
  'claude-haiku-4-5-20251001': { input: 0.80 / 1000000, output: 4 / 1000000 },
  'claude-3.5-sonnet': { input: 3 / 1000000, output: 15 / 1000000 },
  'claude-3-haiku': { input: 0.25 / 1000000, output: 1.25 / 1000000 },
};

class CodeBurnTracker {
  constructor(dataPath = '.claude/code-burn.json') {
    this.dataPath = dataPath;
    this.data = this.load();
  }

  load() {
    if (fs.existsSync(this.dataPath)) {
      return JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
    }
    return {
      sessions: [],
      summary: {},
    };
  }

  save() {
    const dir = path.dirname(this.dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
  }

  recordUsage(usage) {
    const {
      model = 'unknown',
      inputTokens = 0,
      outputTokens = 0,
      tool = 'unknown',
      task = 'general',
      timestamp = new Date().toISOString(),
    } = usage;

    const entry = {
      model,
      inputTokens,
      outputTokens,
      tool,
      task,
      timestamp,
      cost: this.calculateCost(model, inputTokens, outputTokens),
    };

    this.data.sessions.push(entry);
    this.save();
    return entry;
  }

  calculateCost(model, inputTokens, outputTokens) {
    const pricing = PRICING[model] || PRICING['claude-3.5-sonnet'];
    return (inputTokens * pricing.input) + (outputTokens * pricing.output);
  }

  getSummary(daysBack = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    const entries = this.data.sessions.filter(e => new Date(e.timestamp) > cutoff);

    if (entries.length === 0) {
      return {
        period: `Last ${daysBack} days`,
        sessions: 0,
        totalCost: 0,
        byModel: {},
        byTool: {},
        byTask: {},
      };
    }

    const summary = {
      period: `Last ${daysBack} days`,
      sessions: entries.length,
      totalInputTokens: entries.reduce((sum, e) => sum + e.inputTokens, 0),
      totalOutputTokens: entries.reduce((sum, e) => sum + e.outputTokens, 0),
      totalCost: entries.reduce((sum, e) => sum + e.cost, 0),
      byModel: {},
      byTool: {},
      byTask: {},
    };

    // Group by model
    for (const entry of entries) {
      if (!summary.byModel[entry.model]) {
        summary.byModel[entry.model] = { cost: 0, tokens: 0, sessions: 0 };
      }
      summary.byModel[entry.model].cost += entry.cost;
      summary.byModel[entry.model].tokens += entry.inputTokens + entry.outputTokens;
      summary.byModel[entry.model].sessions += 1;
    }

    // Group by tool
    for (const entry of entries) {
      if (!summary.byTool[entry.tool]) {
        summary.byTool[entry.tool] = { cost: 0, tokens: 0, sessions: 0 };
      }
      summary.byTool[entry.tool].cost += entry.cost;
      summary.byTool[entry.tool].tokens += entry.inputTokens + entry.outputTokens;
      summary.byTool[entry.tool].sessions += 1;
    }

    // Group by task
    for (const entry of entries) {
      if (!summary.byTask[entry.task]) {
        summary.byTask[entry.task] = { cost: 0, tokens: 0, sessions: 0 };
      }
      summary.byTask[entry.task].cost += entry.cost;
      summary.byTask[entry.task].tokens += entry.inputTokens + entry.outputTokens;
      summary.byTask[entry.task].sessions += 1;
    }

    return summary;
  }

  formatSummary(summary) {
    const lines = [
      '📊 CODE BURN ANALYTICS',
      '═══════════════════════════════════════\n',
      `Period: ${summary.period}`,
      `Sessions: ${summary.sessions}`,
      `Input Tokens: ${summary.totalInputTokens?.toLocaleString() || 'N/A'} (~$${(summary.totalInputTokens * 0.000003).toFixed(2)})`,
      `Output Tokens: ${summary.totalOutputTokens?.toLocaleString() || 'N/A'} (~$${(summary.totalOutputTokens * 0.000015).toFixed(2)})`,
      `Total Cost: $${summary.totalCost.toFixed(2)}\n`,
    ];

    // By Model
    if (Object.keys(summary.byModel).length > 0) {
      lines.push('By Model:');
      const modelEntries = Object.entries(summary.byModel)
        .sort((a, b) => b[1].cost - a[1].cost)
        .slice(0, 5);
      const maxCost = modelEntries[0]?.[1].cost || 0;
      for (const [model, stats] of modelEntries) {
        const pct = ((stats.cost / summary.totalCost) * 100).toFixed(1);
        const bar = '█'.repeat(Math.floor((stats.cost / maxCost) * 20));
        lines.push(`  ${model.padEnd(30)} $${stats.cost.toFixed(2).padStart(8)} (${pct}%) ${bar}`);
      }
      lines.push('');
    }

    // By Tool
    if (Object.keys(summary.byTool).length > 0) {
      lines.push('By Tool:');
      const toolEntries = Object.entries(summary.byTool)
        .sort((a, b) => b[1].cost - a[1].cost)
        .slice(0, 5);
      const maxCost = toolEntries[0]?.[1].cost || 0;
      for (const [tool, stats] of toolEntries) {
        const pct = ((stats.cost / summary.totalCost) * 100).toFixed(1);
        const bar = '█'.repeat(Math.floor((stats.cost / maxCost) * 20));
        lines.push(`  ${tool.padEnd(20)} $${stats.cost.toFixed(2).padStart(8)} (${pct}%) ${bar}`);
      }
      lines.push('');
    }

    // By Task
    if (Object.keys(summary.byTask).length > 0) {
      lines.push('By Task/Project:');
      const taskEntries = Object.entries(summary.byTask)
        .sort((a, b) => b[1].cost - a[1].cost)
        .slice(0, 5);
      const maxCost = taskEntries[0]?.[1].cost || 0;
      for (const [task, stats] of taskEntries) {
        const pct = ((stats.cost / summary.totalCost) * 100).toFixed(1);
        const bar = '█'.repeat(Math.floor((stats.cost / maxCost) * 20));
        lines.push(`  ${task.padEnd(25)} $${stats.cost.toFixed(2).padStart(8)} (${pct}%) ${bar}`);
      }
      lines.push('');
    }

    // Tips
    lines.push('💡 Optimization Tips:');
    if (summary.totalCost > 100) {
      lines.push('  • Your usage is high - consider using Headroom to compress large files');
      lines.push('  • Build knowledge graph with Graphify to avoid re-reading files');
    }
    if (summary.byModel && summary.byModel['claude-3.5-sonnet']?.cost > summary.totalCost * 0.7) {
      lines.push('  • Use Haiku for simple tasks to cut costs by 95%');
    }

    return lines.join('\n');
  }

  reset() {
    this.data = { sessions: [], summary: {} };
    this.save();
    return 'Code burn data cleared.';
  }
}

// CLI
if (require.main === module) {
  const tracker = new CodeBurnTracker();
  const summary = tracker.getSummary();
  console.log(tracker.formatSummary(summary));
}

module.exports = { CodeBurnTracker };
