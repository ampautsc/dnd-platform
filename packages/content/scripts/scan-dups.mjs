import { readFileSync } from 'node:fs'
const [,, file] = process.argv
const data = JSON.parse(readFileSync(file, 'utf-8'))
const allStrings = JSON.stringify(data).match(/[^"]{40,}/g) || []
const sentences = allStrings.flatMap(s => s.split(/[.!?]+/).map(x => x.trim().toLowerCase()).filter(x => x.length > 30))
const seen = new Set()
let dups = 0
for (const s of sentences) {
  if (seen.has(s)) { console.log('DUP:', s); dups++ } else seen.add(s)
}
console.log('DUP_COUNT', dups)
