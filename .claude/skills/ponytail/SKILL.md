# Ponytail — Output Optimization

Optimizes Claude output, cutting down usage by over 50% without losing any accuracy. Removes redundant sections, consolidates similar ideas, compresses explanations.

## Usage

```
/ponytail [--analyze] [--optimize] [--aggressive]
```

**Options:**
- `--analyze` — Show where redundancy exists
- `--optimize` — Apply optimizations (default)
- `--aggressive` — Aggressive consolidation (may lose nuance)

## How it works

1. **Detects** repeated concepts, redundant explanations, verbose phrasings
2. **Consolidates** similar sections into single statements
3. **Removes** filler words, unnecessary qualifiers
4. **Compresses** examples into inline notes
5. **Returns** optimized version with ~50% fewer tokens

## Example

**Before** (800 tokens):
```
To implement this feature, you need to follow these steps:

First, you'll want to start by understanding the requirements. 
The requirements, in essence, are that the system needs to handle 
multiple requests concurrently. This is important because multiple 
requests need to be handled at the same time.

Second, after understanding the requirements, you should then 
create a data structure. Creating a data structure is important 
because you need something to store the data in. The data structure, 
which stores data, should be efficient.

Third, you'll need to implement the logic. The logic implementation 
is the part where you actually implement the business logic. 
Implementing business logic is crucial because it's what makes 
the feature work.

Finally, you need to test. Testing is important because it ensures 
that your code works. Without testing, you won't know if your code 
works correctly.
```

**After** (400 tokens):
```
Implement concurrent request handling:
1. Create an efficient data structure for concurrent access
2. Implement business logic
3. Test thoroughly

Each step prevents errors: wrong data structures cause race conditions, 
untested logic fails in production.
```

**Savings: 400 tokens (50% reduction)**

## When to use

- **After long explanations** — Ponytail finds the redundant parts
- **Multi-section responses** — Consolidates repeated concepts
- **Documentation** — Compresses verbose guides into concise references
- **Code comments** — Tightens explanations without losing meaning
