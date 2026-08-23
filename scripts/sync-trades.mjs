// Publishes trade screenshots from the Desktop drop folder into the site's
// carousel: copies images from  Desktop\Echelon Trades  into  echelon/trades/
// and rebuilds trades.json (the manifest the landing-page carousel fetches).
// Run from the repo root:  node scripts/sync-trades.mjs   — then commit + push.
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(process.env.USERPROFILE ?? 'C:/Users/Deb', 'Desktop', 'Echelon Trades')
const DEST = path.join(import.meta.dirname, '..', 'echelon', 'trades')
const OK = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

fs.mkdirSync(DEST, { recursive: true })
const files = fs.existsSync(SRC)
  ? fs.readdirSync(SRC).filter((f) => OK.has(path.extname(f).toLowerCase()))
  : []

const out = []
for (const f of files.sort()) {
  const clean = f.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
  fs.copyFileSync(path.join(SRC, f), path.join(DEST, clean))
  out.push(clean)
}
fs.writeFileSync(path.join(DEST, 'trades.json'), JSON.stringify(out, null, 2) + '\n')
console.log(`synced ${out.length} photo(s) -> echelon/trades/trades.json`)
if (!out.length) console.log(`drop screenshots into: ${SRC}`)
