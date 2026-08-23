// Publishes trade screenshots from the Desktop drop folder into the site's
// carousel: copies images from  Desktop\Echelon Trades  into  echelon/trades/
// and rebuilds trades.json (the manifest the landing-page carousel fetches).
//
// Phone screenshots get the chrome cropped automatically: portrait images
// (height/width >= 1.6) lose the top ~6.8% (status bar: clock, battery) and
// the bottom ~3.5% (home indicator), so only the trade shows. Name a file
// with "nocrop" in it to publish it untouched. Output is webp.
//
// Run from the repo root:  node scripts/sync-trades.mjs   — then commit + push.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// sharp lives in the gex-worker project; borrow it rather than adding a
// node_modules to this static site.
const requireFrom = createRequire('C:/Users/Deb/Desktop/Projects/gex-worker/package.json')
const sharp = requireFrom('sharp')

const SRC = path.join(process.env.USERPROFILE ?? 'C:/Users/Deb', 'Desktop', 'Echelon Trades')
const DEST = path.join(import.meta.dirname, '..', 'echelon', 'trades')
const OK = new Set(['.png', '.jpg', '.jpeg', '.webp'])

fs.mkdirSync(DEST, { recursive: true })
const files = fs.existsSync(SRC)
  ? fs.readdirSync(SRC).filter((f) => OK.has(path.extname(f).toLowerCase()))
  : []
const skipped = fs.existsSync(SRC)
  ? fs.readdirSync(SRC).filter((f) => !OK.has(path.extname(f).toLowerCase()) && f !== 'README.txt')
  : []

const out = []
for (const f of files.sort()) {
  const base = path.basename(f, path.extname(f)).toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  const name = `${base}.webp`
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
  await pipeline.webp({ quality: 86 }).toFile(path.join(DEST, name))
  out.push(name)
}

// Remove previously published photos that no longer exist in the drop folder.
for (const existing of fs.readdirSync(DEST)) {
  if (existing.endsWith('.webp') && !out.includes(existing)) {
    fs.unlinkSync(path.join(DEST, existing))
    console.log(`${existing}: removed (no longer in the drop folder)`)
  }
}

fs.writeFileSync(path.join(DEST, 'trades.json'), JSON.stringify(out, null, 2) + '\n')
console.log(`synced ${out.length} photo(s) -> echelon/trades/trades.json`)
if (skipped.length) console.log(`skipped (unsupported type): ${skipped.join(', ')}`)
if (!out.length) console.log(`drop screenshots into: ${SRC}`)
