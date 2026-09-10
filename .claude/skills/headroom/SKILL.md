# Headroom — Context Compression

Compresses code and documentation by removing unnecessary lines: comments, blank lines, unused imports, redundant whitespace. Returns the same semantic content with significantly fewer tokens.

## Usage

```
/headroom <file_path>
```

Analyzes the file and returns a compressed version. Useful for:
- Reducing context window usage before sharing large files
- Pre-processing code before sending to Claude
- Optimizing knowledge base documentation

## How it works

1. **Removes** unnecessary comments, blank lines, empty blocks
2. **Minifies** JSON/YAML where possible
3. **Strips** unused imports (detects via basic analysis)
4. **Collapses** multi-line constructs
5. **Returns** both compressed version and token savings estimate

## Example

**Before** (500 tokens):
```typescript
// This is a helper function
// It does important work
// Written by Alice on 2024-01-01

/**
 * Calculate the sum
 * @param a - first number
 * @param b - second number
 * @returns the sum
 */
function add(a: number, b: number): number {
  // add the numbers
  const result = a + b;

  // return the result
  return result;
}
```

**After** (120 tokens):
```typescript
function add(a: number, b: number): number {
  return a + b;
}
```

**Savings: ~380 tokens (76% reduction)**
