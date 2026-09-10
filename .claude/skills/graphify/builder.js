#!/usr/bin/env node
/**
 * Graphify: Knowledge Graph Builder
 * Maps dependencies and function relationships in your codebase
 */

const fs = require('fs');
const path = require('path');

class KnowledgeGraphBuilder {
  constructor(rootDir = '.') {
    this.rootDir = rootDir;
    this.graph = {
      files: {},
      functions: {},
      imports: {},
      buildTime: new Date().toISOString(),
    };
    this.ignoreDirs = new Set([
      'node_modules', '.git', '.next', 'dist', 'build', '.env', '.venv',
      '__pycache__', '.pytest_cache', 'coverage', '.claude'
    ]);
    this.extensions = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.cpp', '.c'
    ]);
  }

  build() {
    console.log('🔨 Building knowledge graph...');
    this.scanDirectory(this.rootDir);
    this.resolveReferences();
    return this.graph;
  }

  scanDirectory(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (this.ignoreDirs.has(entry.name)) continue;
          this.scanDirectory(path.join(dir, entry.name));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (this.extensions.has(ext)) {
            const filePath = path.join(dir, entry.name);
            this.analyzeFile(filePath);
          }
        }
      }
    } catch (e) {
      // Silently skip inaccessible directories
    }
  }

  analyzeFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(this.rootDir, filePath);
      const ext = path.extname(filePath);

      const analysis = this.parseFile(content, ext);

      this.graph.files[relativePath] = {
        imports: analysis.imports,
        exports: analysis.exports,
        functions: analysis.functions,
        classes: analysis.classes,
        linesOfCode: content.split('\n').length,
        lastScan: new Date().toISOString(),
      };

      // Register functions
      for (const func of analysis.functions) {
        if (!this.graph.functions[func]) {
          this.graph.functions[func] = {
            file: relativePath,
            calls: [],
            calledBy: [],
          };
        }
      }
    } catch (e) {
      // Silently skip unreadable files
    }
  }

  parseFile(content, ext) {
    const result = {
      imports: [],
      exports: [],
      functions: [],
      classes: [],
    };

    if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
      result.imports = this.parseJSImports(content);
      result.exports = this.parseJSExports(content);
      result.functions = this.parseJSFunctions(content);
      result.classes = this.parseJSClasses(content);
    } else if (ext === '.py') {
      result.imports = this.parsePythonImports(content);
      result.exports = this.parsePythonExports(content);
      result.functions = this.parsePythonFunctions(content);
      result.classes = this.parsePythonClasses(content);
    }

    return result;
  }

  parseJSImports(code) {
    const imports = [];
    const patterns = [
      /import\s+(?:{([^}]+)}|(\w+)|(?:\w+\s*,\s*)?{([^}]+)}|(?:\*\s+as\s+(\w+)))\s+from\s+['"]([^'"]+)['"]/g,
      /const\s+({[^}]+}|\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const moduleName = match[5] || match[2];
        if (moduleName) imports.push(moduleName);
      }
    }

    return [...new Set(imports)];
  }

  parseJSExports(code) {
    const exports = [];
    const patterns = [
      /export\s+(?:function|const|class|default)\s+(\w+)/g,
      /export\s+{([^}]+)}/g,
      /module\.exports\s*=\s*(?:{([^}]+)}|(\w+))/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const names = (match[1] || match[2] || '').split(',').map(n => n.trim().split(' ')[0]).filter(n => n);
        exports.push(...names);
      }
    }

    return [...new Set(exports)];
  }

  parseJSFunctions(code) {
    const functions = [];
    const patterns = [
      /(?:async\s+)?function\s+(\w+)\s*\(/g,
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g,
      /(\w+)\s*:\s*(?:async\s*)?\([^)]*\)\s*(?::|=>)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        functions.push(match[1]);
      }
    }

    return [...new Set(functions)];
  }

  parseJSClasses(code) {
    const classes = [];
    const pattern = /class\s+(\w+)/g;
    let match;
    while ((match = pattern.exec(code)) !== null) {
      classes.push(match[1]);
    }
    return classes;
  }

  parsePythonImports(code) {
    const imports = [];
    const patterns = [
      /import\s+([\w.]+)(?:\s+as\s+\w+)?/g,
      /from\s+([\w.]+)\s+import/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        imports.push(match[1]);
      }
    }

    return [...new Set(imports)];
  }

  parsePythonExports(code) {
    const exports = [];
    const pattern = /^def\s+(\w+)\s*\(|^class\s+(\w+)/gm;
    let match;
    while ((match = pattern.exec(code)) !== null) {
      exports.push(match[1] || match[2]);
    }
    return exports;
  }

  parsePythonFunctions(code) {
    const functions = [];
    const pattern = /def\s+(\w+)\s*\(/g;
    let match;
    while ((match = pattern.exec(code)) !== null) {
      functions.push(match[1]);
    }
    return functions;
  }

  parsePythonClasses(code) {
    const classes = [];
    const pattern = /class\s+(\w+)/g;
    let match;
    while ((match = pattern.exec(code)) !== null) {
      classes.push(match[1]);
    }
    return classes;
  }

  resolveReferences() {
    // Build reverse index of exported functions
    const exported = {};
    for (const [file, info] of Object.entries(this.graph.files)) {
      for (const exp of info.exports) {
        exported[exp] = file;
      }
    }

    // Link function calls
    for (const [file, info] of Object.entries(this.graph.files)) {
      const content = fs.readFileSync(path.join(this.rootDir, file), 'utf8');
      for (const func of info.functions) {
        const graph_func = this.graph.functions[func];
        if (!graph_func) continue;

        // Find what this function calls (basic regex)
        const callPattern = new RegExp(`\\b(\\w+)\\s*\\(`, 'g');
        let match;
        while ((match = callPattern.exec(content)) !== null) {
          const called = match[1];
          if (exported[called] && called !== func) {
            if (!graph_func.calls.includes(called)) {
              graph_func.calls.push(called);
            }
          }
        }
      }
    }
  }

  save(outputPath = '.claude/knowledge-graph.json') {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(this.graph, null, 2));
    console.log(`✅ Graph saved to ${outputPath}`);
    return outputPath;
  }

  summary() {
    const fileCount = Object.keys(this.graph.files).length;
    const funcCount = Object.keys(this.graph.functions).length;
    const classCount = Object.values(this.graph.files).reduce((sum, f) => sum + f.classes.length, 0);

    return {
      files: fileCount,
      functions: funcCount,
      classes: classCount,
      buildTime: this.graph.buildTime,
    };
  }
}

if (require.main === module) {
  const rootDir = process.argv[2] || '.';
  const builder = new KnowledgeGraphBuilder(rootDir);
  const graph = builder.build();
  const output = builder.save();
  const summary = builder.summary();

  console.log('\n📊 Graph Summary:');
  console.log(`  Files: ${summary.files}`);
  console.log(`  Functions: ${summary.functions}`);
  console.log(`  Classes: ${summary.classes}`);
}

module.exports = { KnowledgeGraphBuilder };
