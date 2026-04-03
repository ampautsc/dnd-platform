// Migrate vitest test files to node:test + node:assert/strict
// Handle nested parentheses properly
// Usage: node scripts/migrate-vitest-to-node-test.mjs <directory>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv } from 'node:process';

const dir = resolve(argv[2] || '.');

function findTestFiles(d) {
  const results = [];
  for (const entry of readdirSync(d, { withFileTypes: true })) {
    const full = join(d, entry.name);
    if (entry.isDirectory()) results.push(...findTestFiles(full));
    else if (entry.name.endsWith('.test.js')) results.push(full);
  }
  return results;
}

// Find expect(...) in a line, handling nested parens
function findExpect(line, startFrom) {
  const idx = line.indexOf('expect(', startFrom || 0);
  if (idx === -1) return null;
  const argStart = idx + 6;
  let depth = 0;
  for (let i = argStart; i < line.length; i++) {
    if (line[i] === '(') depth++;
    else if (line[i] === ')') { depth--; if (depth === 0) return { start: idx, argEnd: i, inner: line.slice(argStart + 1, i), rest: line.slice(i + 1) }; }
  }
  return null;
}

function convertLine(line) {
  if (line.trim().startsWith('//') || line.trim().startsWith('*')) return line;
  const info = findExpect(line);
  if (!info) return line;
  const { start, inner, rest } = info;
  const prefix = line.slice(0, start);

  // Separate value from optional message in expect(value, 'msg')
  let expectArg = inner;
  let expectMsg = null;
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) {
      expectArg = inner.slice(0, i).trim();
      expectMsg = inner.slice(i + 1).trim();
      break;
    }
  }
  const chain = rest;
  const msgSuffix = expectMsg ? `, ${expectMsg}` : '';

  let m;
  // .not.toBe(x)
  if ((m = chain.match(/^\.not\.toBe\((.+)\)(.*)$/s))) return `${prefix}assert.notStrictEqual(${expectArg}, ${m[1].trim()}${msgSuffix})${m[2]}`;
  // .toBe(x)
  if ((m = chain.match(/^\.toBe\((.+)\)(.*)$/s))) return `${prefix}assert.strictEqual(${expectArg}, ${m[1].trim()}${msgSuffix})${m[2]}`;
  // .not.toEqual(x)
  if ((m = chain.match(/^\.not\.toEqual\((.+)\)(.*)$/s))) return `${prefix}assert.notDeepStrictEqual(${expectArg}, ${m[1].trim()}${msgSuffix})${m[2]}`;
  // .toEqual(x)
  if ((m = chain.match(/^\.toEqual\((.+)\)(.*)$/s))) return `${prefix}assert.deepStrictEqual(${expectArg}, ${m[1].trim()}${msgSuffix})${m[2]}`;
  // .toBeTruthy()
  if ((m = chain.match(/^\.toBeTruthy\(\)(.*)$/s))) return `${prefix}assert.ok(${expectArg}${msgSuffix})${m[1]}`;
  // .toBeFalsy()
  if ((m = chain.match(/^\.toBeFalsy\(\)(.*)$/s))) return `${prefix}assert.ok(!(${expectArg})${msgSuffix})${m[1]}`;
  // .not.toBeNull()
  if ((m = chain.match(/^\.not\.toBeNull\(\)(.*)$/s))) return `${prefix}assert.notStrictEqual(${expectArg}, null${msgSuffix})${m[1]}`;
  // .toBeNull()
  if ((m = chain.match(/^\.toBeNull\(\)(.*)$/s))) return `${prefix}assert.strictEqual(${expectArg}, null${msgSuffix})${m[1]}`;
  // .not.toBeUndefined()
  if ((m = chain.match(/^\.not\.toBeUndefined\(\)(.*)$/s))) return `${prefix}assert.notStrictEqual(${expectArg}, undefined${msgSuffix})${m[1]}`;
  // .toBeUndefined()
  if ((m = chain.match(/^\.toBeUndefined\(\)(.*)$/s))) return `${prefix}assert.strictEqual(${expectArg}, undefined${msgSuffix})${m[1]}`;
  // .not.toBeDefined()
  if ((m = chain.match(/^\.not\.toBeDefined\(\)(.*)$/s))) return `${prefix}assert.strictEqual(${expectArg}, undefined${msgSuffix})${m[1]}`;
  // .toBeDefined()
  if ((m = chain.match(/^\.toBeDefined\(\)(.*)$/s))) return `${prefix}assert.notStrictEqual(${expectArg}, undefined${msgSuffix})${m[1]}`;
  // Comparisons
  if ((m = chain.match(/^\.toBeGreaterThan\((.+)\)(.*)$/s))) return `${prefix}assert.ok(${expectArg} > ${m[1].trim()}${msgSuffix})${m[2]}`;
  if ((m = chain.match(/^\.toBeGreaterThanOrEqual\((.+)\)(.*)$/s))) return `${prefix}assert.ok(${expectArg} >= ${m[1].trim()}${msgSuffix})${m[2]}`;
  if ((m = chain.match(/^\.toBeLessThan\((.+)\)(.*)$/s))) return `${prefix}assert.ok(${expectArg} < ${m[1].trim()}${msgSuffix})${m[2]}`;
  if ((m = chain.match(/^\.toBeLessThanOrEqual\((.+)\)(.*)$/s))) return `${prefix}assert.ok(${expectArg} <= ${m[1].trim()}${msgSuffix})${m[2]}`;
  // .not.toContain(x)
  if ((m = chain.match(/^\.not\.toContain\((.+)\)(.*)$/s))) return `${prefix}assert.ok(!${expectArg}.includes(${m[1].trim()})${msgSuffix})${m[2]}`;
  // .toContain(x)
  if ((m = chain.match(/^\.toContain\((.+)\)(.*)$/s))) return `${prefix}assert.ok(${expectArg}.includes(${m[1].trim()})${msgSuffix})${m[2]}`;
  // .not.toMatch(x)
  if ((m = chain.match(/^\.not\.toMatch\((.+)\)(.*)$/s))) return `${prefix}assert.doesNotMatch(${expectArg}, ${m[1].trim()})${m[2]}`;
  // .toMatch(x)
  if ((m = chain.match(/^\.toMatch\((.+)\)(.*)$/s))) return `${prefix}assert.match(${expectArg}, ${m[1].trim()})${m[2]}`;
  // .toHaveLength(n)
  if ((m = chain.match(/^\.toHaveLength\((.+)\)(.*)$/s))) return `${prefix}assert.strictEqual(${expectArg}.length, ${m[1].trim()}${msgSuffix})${m[2]}`;
  // .toHaveProperty('key', val)
  if ((m = chain.match(/^\.toHaveProperty\('([^']+)',\s*(.+)\)(.*)$/s))) return `${prefix}assert.strictEqual(${expectArg}['${m[1]}'], ${m[2].trim()}${msgSuffix})${m[3]}`;
  // .toHaveProperty('key')
  if ((m = chain.match(/^\.toHaveProperty\('([^']+)'\)(.*)$/s))) return `${prefix}assert.notStrictEqual(${expectArg}['${m[1]}'], undefined${msgSuffix})${m[2]}`;
  // .toHaveProperty(dynamicKey)
  if ((m = chain.match(/^\.toHaveProperty\((\w+)\)(.*)$/s))) return `${prefix}assert.notStrictEqual(${expectArg}[${m[1]}], undefined${msgSuffix})${m[2]}`;
  // .toBeInstanceOf(C)
  if ((m = chain.match(/^\.toBeInstanceOf\((.+)\)(.*)$/s))) return `${prefix}assert.ok(${expectArg} instanceof ${m[1].trim()}${msgSuffix})${m[2]}`;
  // .toThrow(x) or .toThrow()
  if ((m = chain.match(/^\.toThrow\(([^)]*)\)(.*)$/s))) {
    return m[1].trim() ? `${prefix}assert.throws(${expectArg}, ${m[1].trim()})${m[2]}` : `${prefix}assert.throws(${expectArg})${m[2]}`;
  }
  // .not.toThrow()
  if ((m = chain.match(/^\.not\.toThrow\(\)(.*)$/s))) return `${prefix}assert.doesNotThrow(${expectArg})${m[1]}`;
  // .toHaveBeenCalled()
  if ((m = chain.match(/^\.toHaveBeenCalled\(\)(.*)$/s))) return `${prefix}assert.ok(${expectArg}.mock.calls.length > 0${msgSuffix})${m[1]}`;
  // .not.toHaveBeenCalled()
  if ((m = chain.match(/^\.not\.toHaveBeenCalled\(\)(.*)$/s))) return `${prefix}assert.strictEqual(${expectArg}.mock.calls.length, 0${msgSuffix})${m[1]}`;
  // .toHaveBeenCalledWith(...)
  if ((m = chain.match(/^\.toHaveBeenCalledWith\((.+)\)(.*)$/s))) return `${prefix}assert.deepStrictEqual(${expectArg}.mock.calls.at(-1).arguments, [${m[1]}])${m[2]}`;
  // .toHaveBeenCalledTimes(n)
  if ((m = chain.match(/^\.toHaveBeenCalledTimes\((.+)\)(.*)$/s))) return `${prefix}assert.strictEqual(${expectArg}.mock.calls.length, ${m[1].trim()})${m[2]}`;
  // .toBeNaN()
  if ((m = chain.match(/^\.toBeNaN\(\)(.*)$/s))) return `${prefix}assert.ok(Number.isNaN(${expectArg})${msgSuffix})${m[1]}`;
  // .resolves.toBe / .resolves.toEqual etc — convert to await
  if ((m = chain.match(/^\.resolves\.toBe\((.+)\)(.*)$/s))) return `${prefix}assert.strictEqual(await ${expectArg}, ${m[1].trim()})${m[2]}`;
  if ((m = chain.match(/^\.resolves\.toEqual\((.+)\)(.*)$/s))) return `${prefix}assert.deepStrictEqual(await ${expectArg}, ${m[1].trim()})${m[2]}`;
  if ((m = chain.match(/^\.rejects\.toThrow\(([^)]*)\)(.*)$/s))) {
    return m[1].trim() ? `${prefix}await assert.rejects(${expectArg}, ${m[1].trim()})${m[2]}` : `${prefix}await assert.rejects(${expectArg})${m[2]}`;
  }
  
  // Not matched — return as is
  return line;
}

function convertFile(filePath) {
  let code = readFileSync(filePath, 'utf8');
  
  const vitestImportRe = /import\s*\{([^}]+)\}\s*from\s*['"]vitest['"]\s*;?\n?/;
  const importMatch = code.match(vitestImportRe);
  if (!importMatch) { console.log(`SKIP (no vitest import): ${filePath}`); return; }
  
  const importedNames = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  const nodeTestNames = [];
  const needAssert = importedNames.includes('expect');
  const needMock = importedNames.includes('vi');
  
  for (const name of importedNames) {
    if (name === 'expect') continue;
    if (name === 'vi') continue;
    if (name === 'beforeAll') { nodeTestNames.push('before'); continue; }
    if (name === 'afterAll') { nodeTestNames.push('after'); continue; }
    nodeTestNames.push(name);
  }
  if (needMock) nodeTestNames.push('mock');
  
  let newImports = `import { ${nodeTestNames.join(', ')} } from 'node:test';\n`;
  if (needAssert) newImports += `import assert from 'node:assert/strict';\n`;
  code = code.replace(vitestImportRe, newImports);
  
  // vi.fn/vi.spyOn
  code = code.replace(/\bvi\.fn\b/g, 'mock.fn');
  code = code.replace(/\bvi\.spyOn\b/g, 'mock.method');
  code = code.replace(/\bvi\.useFakeTimers\b/g, 'mock.timers.enable');
  code = code.replace(/\bvi\.useRealTimers\b/g, 'mock.timers.reset');
  code = code.replace(/\bvi\.advanceTimersByTime\b/g, 'mock.timers.tick');
  code = code.replace(/\bbeforeAll\s*\(/g, 'before(');
  code = code.replace(/\bafterAll\s*\(/g, 'after(');
  
  // it.each -> for loop (proper approach: parse line by line)
  if (code.includes('it.each')) {
    const srcLines = code.split('\n');
    const result = [];
    let i = 0;
    while (i < srcLines.length) {
      const line = srcLines[i];
      const eachMatch = line.match(/^(\s*)it\.each\((\w+)\)\('([^']+)',\s*\((\w+)\)\s*=>\s*\{/);
      if (eachMatch) {
        const [, indent, arr, desc, param] = eachMatch;
        const newDesc = desc.replace(/%s/g, `\${${param}}`);
        // Collect body lines until we find the closing })
        let bodyLines = [];
        let braceCount = 1; // the { after =>
        i++;
        while (i < srcLines.length && braceCount > 0) {
          const bodyLine = srcLines[i];
          for (const ch of bodyLine) {
            if (ch === '{') braceCount++;
            if (ch === '}') braceCount--;
          }
          if (braceCount > 0) {
            bodyLines.push(bodyLine);
            i++;
          } else {
            // This line has the closing } — typically "  })"
            i++;
            break;
          }
        }
        result.push(`${indent}for (const ${param} of ${arr}) {`);
        result.push(`${indent}  it(\`${newDesc}\`, () => {`);
        for (const bl of bodyLines) result.push(bl);
        result.push(`${indent}  });`);
        result.push(`${indent}}`);
      } else {
        result.push(line);
        i++;
      }
    }
    code = result.join('\n');
  }
  
  // Convert expect() lines
  const lines = code.split('\n');
  const converted = lines.map(convertLine);
  code = converted.join('\n');
  
  const remaining = (code.match(/\bexpect\(/g) || []).length;
  writeFileSync(filePath, code, 'utf8');
  console.log(`MIGRATED: ${filePath}${remaining > 0 ? ` (${remaining} remaining expect())` : ''}`);
}

const files = findTestFiles(dir);
console.log(`Found ${files.length} test files in ${dir}\n`);
for (const f of files) convertFile(f);
console.log('\nDone!');
