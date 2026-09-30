// 把组态的二维码 / 条形码编码器打包成 ESM，按 req.json 批量输出模块矩阵 / 序列，供 verify-codes.py 交叉验证。
// 用法：node scripts/scada-smoke/codes-dump.mjs <req.json> <res.json>（esbuild 需可 resolve，见 README「测试」）
import { build } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'scada-codes-'))
await build({ entryPoints: [path.join(root, 'src/views/Home/scada/codes/qrcode.ts'), path.join(root, 'src/views/Home/scada/codes/barcode.ts')], bundle: true, format: 'esm', outdir, logLevel: 'error' })
const { encodeQr, numDataCodewords, alignmentPositions } = await import(pathToFileURL(path.join(outdir, 'qrcode.js')).href)
const { encodeBarcode } = await import(pathToFileURL(path.join(outdir, 'barcode.js')).href)

const req = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'))
const out = { tables: { dataCodewords: {}, align: {} }, qr: [], bars: [] }
for (let v = 1; v <= 40; v++) {
  out.tables.align[v] = alignmentPositions(v)
  for (const e of ['L', 'M', 'Q', 'H']) out.tables.dataCodewords[`${v}${e}`] = numDataCodewords(v, e)
}
for (const q of req.qr) {
  const r = encodeQr(q.text, { ecc: q.ecc, mask: q.mask })
  out.qr.push(r ? { version: r.version, mask: r.mask, size: r.size, rows: r.modules.map(row => row.map(b => (b ? '1' : '0')).join('')) } : null)
}
for (const b of req.bars) {
  const r = encodeBarcode(b.text, b.format)
  out.bars.push(r ? { text: r.text, modules: r.modules.map(m => (m ? '1' : '0')).join('') } : null)
}
fs.writeFileSync(process.argv[3], JSON.stringify(out))
fs.rmSync(outdir, { recursive: true, force: true })
