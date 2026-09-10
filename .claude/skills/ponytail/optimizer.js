#!/usr/bin/env node
/**
 * Ponytail: Output Optimization Engine
 * Removes redundancy, consolidates ideas, compresses explanations
 */

class PonytailOptimizer {
  constructor() {
    this.redundancyPatterns = [
      // Repeated phrases
      /(\b\w+(?:\s+\w+){0,3}\b)[\s\S]*?\1/gi,
      // Unnecessary qualifiers
      /\b(really|very|actually|essentially|basically|literally|quite)\s+/gi,
      // Filler phrases
      /\b(in essence|that is|to put it simply|in other words|as a matter of fact|it is important to note that)\b/gi,
      // Redundant transitions
      /\b(First|Secondly|Finally|Additionally|Moreover|Furthermore),?\s+(?=\1|Second|Third)/gi,
    ];

    this.verbosityMap = {
      'need to be': 'must be',
      'is able to': 'can',
      'is capable of': 'can',
      'due to the fact that': 'because',
      'in the event that': 'if',
      'with the exception of': 'except',
      'for the reason that': 'since',
      'at the present time': 'now',
      'until such time as': 'until',
      'in accordance with': 'per',
      'a number of': 'several',
      'make use of': 'use',
      'come to a decision': 'decide',
      'in consideration of': 'given',
      'the fact that': '',
      'the reason why': 'why',
    };
  }

  optimize(text, aggressive = false) {
    let optimized = text;

    // Step 1: Remove filler words
    optimized = this.removeFiller(optimized);

    // Step 2: Replace verbose phrases
    optimized = this.replaceVerbose(optimized);

    // Step 3: Consolidate repeated concepts
    optimized = this.consolidateRedundancy(optimized);

    // Step 4: Compress examples to inline notes
    optimized = this.compressExamples(optimized);

    // Step 5: Merge related paragraphs
    if (aggressive) {
      optimized = this.mergeRelatedParagraphs(optimized);
    }

    // Step 6: Remove unnecessary punctuation and whitespace
    optimized = this.cleanWhitespace(optimized);

    return optimized.trim();
  }

  removeFiller(text) {
    let result = text;

    // Remove unnecessary qualifiers
    result = result.replace(/\b(really|very|actually|essentially|basically|literally|quite|somewhat|rather|pretty)\s+/gi, '');

    // Remove filler phrases
    result = result.replace(/\b(in essence|that is|to put it simply|in other words|as a matter of fact|it is important to note that)\b[,.]?\s*/gi, '');

    return result;
  }

  replaceVerbose(text) {
    let result = text;

    for (const [verbose, concise] of Object.entries(this.verbosityMap)) {
      const pattern = new RegExp(`\\b${verbose}\\b`, 'gi');
      result = result.replace(pattern, concise);
    }

    return result;
  }

  consolidateRedundancy(text) {
    let result = text;
    const sentences = text.split(/(?<=[.!?])\s+/);

    const consolidated = [];
    const seen = new Map();

    for (const sentence of sentences) {
      const normalized = sentence.toLowerCase().replace(/[.,!?]/g, '');
      const hash = this.hash(normalized);

      if (!seen.has(hash)) {
        consolidated.push(sentence);
        seen.set(hash, true);
      } else if (sentence.length > sentences[consolidated.length - 1]?.length) {
        // Keep longer version if more detailed
        consolidated[consolidated.length - 1] = sentence;
      }
    }

    return consolidated.join(' ');
  }

  compressExamples(text) {
    let result = text;

    // Find code blocks and wrap in <code>...</code>
    result = result.replace(/```[\s\S]*?```/g, match => `[code: ${match.split('\n')[0]}]`);

    // Compress "For example," sections
    result = result.replace(/For example,?\s+([^.!?]+[.!?])/gi, '(e.g., $1)');

    // Compress multi-sentence examples into single bullets
    result = result.replace(/[-•]\s+([^-•\n]+)\n[-•]\s+([^-•\n]+)/g, (match, first, second) => {
      if (first.length < 60 && second.length < 60) {
        return `• ${first.trim()}; ${second.trim()}`;
      }
      return match;
    });

    return result;
  }

  mergeRelatedParagraphs(text) {
    const paragraphs = text.split(/\n\n+/);
    const merged = [];

    let current = paragraphs[0];

    for (let i = 1; i < paragraphs.length; i++) {
      const next = paragraphs[i];

      // Merge if paragraphs are short and related
      if (current.split(' ').length < 50 && this.relatedness(current, next) > 0.3) {
        current += ' ' + next;
      } else {
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);
    return merged.join('\n\n');
  }

  relatedness(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\W+/));
    const words2 = new Set(text2.toLowerCase().split(/\W+/));

    const intersection = [...words1].filter(w => words2.has(w)).length;
    const union = new Set([...words1, ...words2]).size;

    return intersection / union;
  }

  cleanWhitespace(text) {
    // Remove extra spaces
    let result = text.replace(/  +/g, ' ');

    // Remove spaces before punctuation
    result = result.replace(/\s+([.!?,;:])/g, '$1');

    // Clean multiple line breaks
    result = result.replace(/\n\n\n+/g, '\n\n');

    return result;
  }

  analyze(text) {
    const original = text;
    const optimized = this.optimize(text);

    const originalLength = original.split(' ').length;
    const optimizedLength = optimized.split(' ').length;
    const saved = originalLength - optimizedLength;
    const savings = Math.round((saved / originalLength) * 100);

    const issues = [];

    // Find repeated phrases
    const phrases = text.split(/\s+/).slice(0, -1);
    const phraseCounts = {};
    for (let i = 0; i < phrases.length - 2; i++) {
      const phrase = `${phrases[i]} ${phrases[i + 1]} ${phrases[i + 2]}`;
      phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
    }

    for (const [phrase, count] of Object.entries(phraseCounts)) {
      if (count > 1) {
        issues.push(`Repeated phrase: "${phrase}" (${count}x)`);
      }
    }

    // Find filler words
    const fillerCount = (text.match(/\b(really|very|actually|basically)\b/gi) || []).length;
    if (fillerCount > 0) {
      issues.push(`Found ${fillerCount} unnecessary qualifiers`);
    }

    return {
      original: {
        words: originalLength,
        characters: original.length,
      },
      optimized: {
        words: optimizedLength,
        characters: optimized.length,
      },
      savings: {
        words: saved,
        percent: savings,
      },
      issues,
    };
  }

  hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}

// CLI
if (require.main === module) {
  const text = require('fs').readFileSync(0, 'utf-8');
  const optimizer = new PonytailOptimizer();

  const cmd = process.argv[2] || '--optimize';

  if (cmd === '--analyze') {
    const analysis = optimizer.analyze(text);
    console.log('📊 OPTIMIZATION ANALYSIS');
    console.log(`Original: ${analysis.original.words} words (${analysis.original.characters} chars)`);
    console.log(`Optimized: ${analysis.optimized.words} words (${analysis.optimized.characters} chars)`);
    console.log(`Savings: ${analysis.savings.words} words (${analysis.savings.percent}%)\n`);

    if (analysis.issues.length > 0) {
      console.log('Issues found:');
      for (const issue of analysis.issues) {
        console.log(`  • ${issue}`);
      }
    }
  } else {
    const aggressive = process.argv[3] === '--aggressive';
    const optimized = optimizer.optimize(text, aggressive);
    console.log(optimized);
  }
}

module.exports = { PonytailOptimizer };
