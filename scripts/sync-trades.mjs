// Publishes trade screenshots from the Desktop drop folder into the site's
// carousel: copies images from  Desktop\Echelon Trades  into  echelon/trades/
// and rebuilds trades.json (the manifest the landing-page carousel fetches).
//
// Phone screenshots get the chrome cropped automatically: portrait images
// (height/width >= 1.6) lose the top ~6.8% (status bar: clock, battery) and
// the bottom ~3.5% (home indicator), so only the trade shows. Name a file
// with "nocrop" in it to publish it untouched. Output is webp.
//
// Additive by default: photos already published stay even when the drop
// folder on this machine does not hold their originals (the drop folder is
// per machine). Pass --prune to remove published photos missing from the
// drop folder.
//
// Run from the repo root:  node scripts/sync-trades.mjs [--prune]   — then commit + push.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const PRUNE = process.argv.includes('--prune')
const HOME = process.env.USERPROFILE ?? 'C:/Users/Deb'

// sharp lives in other projects; borrow it rather than adding a
// node_modules to this static site. First install that resolves wins.
const SHARP_HOSTS = [
  'C:/Users/Deb/Desktop/Projects/gex-worker/package.json',
  path.join(HOME, 'OneDrive/Desktop/Projects/clients/outback-running-club/client/package.json'),
  path.join(HOME, 'OneDrive/Desktop/Projects/tools/discord-risk-bot/package.json'),
]
let sharp
for (const host of SHARP_HOSTS) {
  try { sharp = createRequire(host)('sharp'); break } catch {}
}
if (!sharp) throw new Error(`sharp not found; tried ${SHARP_HOSTS.join(', ')}`)

const SRC_CANDIDATES = [
  process.env.ECHELON_TRADES,
  path.join(HOME, 'Desktop', 'Echelon Trades'),
  path.join(HOME, 'OneDrive', 'Desktop', 'Echelon Trades'),
].filter(Boolean)
const SRC = SRC_CANDIDATES.find((p) => fs.existsSync(p)) ?? SRC_CANDIDATES[0]
const DEST = path.join(import.meta.dirname, '..', 'echelon', 'trades')
const MANIFEST = path.join(DEST, 'trades.json')
const OK = new Set(['.png', '.jpg', '.jpeg', '.webp'])

fs.mkdirSync(DEST, { recursive: true })
const files = fs.existsSync(SRC)
  ? fs.readdirSync(SRC).filter((f) => OK.has(path.extname(f).toLowerCase()))
  : []
const skipped = fs.existsSync(SRC)
  ? fs.readdirSync(SRC).filter((f) => !OK.has(path.extname(f).toLowerCase()) && f !== 'README.txt')
  : []
const previous = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : []

const fresh = []
for (const f of files.sort()) {
  const base = path.basename(f, path.extname(f)).toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  const img = sharp(path.join(SRC, f))
  const meta = await img.metadata()
  let pipeline = img
  const portrait = meta.height / meta.width >= 1.6
  if (portrait && !f.toLowerCase().includes('nocrop')) {
    const top = Math.round(meta.height * 0.068)
    const bottom = Math.round(meta.height * 0.035)
    pipeline = img.extract({ left: 0, top, width: meta.width, height: meta.height - top - bottom })
    console.log(`${f}: cropped phone chrome (${meta.width}x${meta.height} -> ${meta.width}x${meta.height - top - bottom})`)
  } else {
    console.log(`${f}: published as-is (${meta.width}x${meta.height})`)
  }
  // Display size is ~340px tall; 720 keeps retina crisp at a fraction of the
  // decode cost. Content-hashed names bust browser caches on any change.
  const buf = await pipeline.resize({ height: 720, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer()
  const name = `${base}-${crypto.createHash('md5').update(buf).digest('hex').slice(0, 8)}.webp`
  fs.writeFileSync(path.join(DEST, name), buf)
  fresh.push(name)
}

// A re-rendered photo (same base, new hash) replaces its older version.
const baseOf = (n) => n.replace(/-[0-9a-f]{8}\.webp$/, '')
const freshBases = new Set(fresh.map(baseOf))
const kept = PRUNE ? [] : previous.filter((n) => !freshBases.has(baseOf(n)) && fs.existsSync(path.join(DEST, n)))
const out = [...new Set([...kept, ...fresh])].sort()

for (const existing of fs.readdirSync(DEST)) {
  if (existing.endsWith('.webp') && !out.includes(existing)) {
    fs.unlinkSync(path.join(DEST, existing))
    console.log(`${existing}: removed (${PRUNE ? 'no longer in the drop folder' : 'superseded'})`)
  }
}

fs.writeFileSync(MANIFEST, JSON.stringify(out, null, 2) + '\n')
console.log(`synced ${fresh.length} new, ${out.length} total -> echelon/trades/trades.json (source: ${SRC})`)
if (skipped.length) console.log(`skipped (unsupported type): ${skipped.join(', ')}`)
if (!fresh.length) console.log(`drop screenshots into: ${SRC}`)
