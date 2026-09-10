#!/usr/bin/env node
/**
 * Headroom: Context Compression Engine
 * Removes unnecessary tokens: comments, blank lines, unused imports
 */

const fs = require('fs');
const path = require('path');

function compressFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const extension = path.extname(filePath);

  let compressed = content;

  switch (extension) {
    case '.js':
    case '.ts':
    case '.tsx':
    case '.jsx':
      compressed = compressTypeScript(content);
      break;
    case '.py':
      compressed = compressPython(content);
      break;
    case '.json':
      compressed = compressJSON(content);
      break;
    case '.yaml':
    case '.yml':
      compressed = compressYAML(content);
      break;
    case '.md':
      compressed = compressMarkdown(content);
      break;
    case '.sql':
      compressed = compressSQL(content);
      break;
    default:
      compressed = compressGeneric(content);
  }

  const originalLines = content.split('\n').length;
  const compressedLines = compressed.split('\n').length;
  const savedLines = originalLines - compressedLines;
  const percentSaved = Math.round((savedLines / originalLines) * 100);

  return {
    original: content,
    compressed: compressed,
    stats: {
      originalLines,
      compressedLines,
      savedLines,
      percentSaved,
      originalChars: content.length,
      compressedChars: compressed.length,
    }
  };
}

function compressTypeScript(code) {
  let lines = code.split('\n');

  // Remove single-line comments
  lines = lines.filter(line => !line.trim().startsWith('//'));

  // Remove multi-line comment blocks
  let inComment = false;
  lines = lines.filter(line => {
    if (line.includes('/*')) inComment = true;
    if (line.includes('*/')) {
      inComment = false;
      return false;
    }
    return !inComment;
  });

  // Remove blank lines (keep max 1 consecutive)
  lines = lines.reduce((acc, line, i) => {
    if (line.trim() === '' && acc[acc.length - 1]?.trim() === '') {
      return acc;
    }
    return [...acc, line];
  }, []);

  // Remove trailing whitespace
  lines = lines.map(line => line.trimEnd());

  // Remove unused imports (basic detection)
  const code_str = lines.join('\n');
  lines = lines.filter(line => {
    if (!line.includes('import ')) return true;
    const match = line.match(/import\s+(?:{([^}]+)}|(\w+))\s+from/);
    if (!match) return true;
    const imported = (match[1] || match[2] || '').split(',').map(s => s.trim());
    return imported.some(name => {
      const regex = new RegExp(`\\b${name}\\b(?!\\s*:)`, 'g');
      const count = (code_str.match(regex) || []).length;
      return count > 1; // used more than just the import statement
    });
  });

  return lines.join('\n').trim();
}

function compressPython(code) {
  let lines = code.split('\n');

  // Remove comments
  lines = lines.filter(line => {
    const hashIdx = line.indexOf('#');
    if (hashIdx === -1) return true;
    // Keep if # is in string
    return line.substring(0, hashIdx).split('"').length % 2 === 1 &&
           line.substring(0, hashIdx).split("'").length % 2 === 1;
  });

  // Remove docstrings (triple quotes)
  let inDocstring = false;
  lines = lines.filter(line => {
    if (line.includes('"""') || line.includes("'''")) {
      inDocstring = !inDocstring;
      return false;
    }
    return !inDocstring;
  });

  // Remove blank lines
  lines = lines.filter((line, i, arr) =>
    line.trim() !== '' || arr[i-1]?.trim() !== ''
  );

  return lines.join('\n').trim();
}

function compressJSON(code) {
  try {
    const obj = JSON.parse(code);
    return JSON.stringify(obj);
  } catch {
    return code;
  }
}

function compressYAML(code) {
  let lines = code.split('\n');
  // Remove comments
  lines = lines.filter(line => !line.trim().startsWith('#'));
  // Remove blank lines
  lines = lines.filter(line => line.trim() !== '');
  return lines.join('\n').trim();
}

function compressMarkdown(code) {
  let lines = code.split('\n');
  // Keep structure but remove extra blank lines
  lines = lines.filter((line, i, arr) =>
    line.trim() !== '' || arr[i-1]?.trim() !== ''
  );
  return lines.join('\n').trim();
}

function compressSQL(code) {
  let lines = code.split('\n');
  // Remove -- comments
  lines = lines.filter(line => !line.trim().startsWith('--'));
  // Remove /* */ comments
  let inComment = false;
  lines = lines.filter(line => {
    if (line.includes('/*')) inComment = true;
    if (line.includes('*/')) {
      inComment = false;
      return false;
    }
    return !inComment;
  });
  // Remove blank lines
  lines = lines.filter(line => line.trim() !== '');
  // Normalize whitespace
  lines = lines.map(line => line.trim());
  return lines.join('\n').trim();
}

function compressGeneric(code) {
  let lines = code.split('\n');
  // Remove blank lines, keep content
  lines = lines.filter((line, i, arr) =>
    line.trim() !== '' || arr[i-1]?.trim() !== ''
  );
  return lines.join('\n').trim();
}

// CLI interface
if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node compress.js <file_path>');
    process.exit(1);
  }

  const result = compressFile(filePath);

  console.log('=== COMPRESSION RESULTS ===\n');
  console.log(`Original: ${result.stats.originalLines} lines (${result.stats.originalChars} chars)`);
  console.log(`Compressed: ${result.stats.compressedLines} lines (${result.stats.compressedChars} chars)`);
  console.log(`Saved: ${result.stats.savedLines} lines (${result.stats.percentSaved}% reduction)\n`);
  console.log('=== COMPRESSED OUTPUT ===\n');
  console.log(result.compressed);
}

module.exports = { compressFile };
