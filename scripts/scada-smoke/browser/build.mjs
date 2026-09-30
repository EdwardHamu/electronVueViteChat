/**
 * 打包真浏览器验证页：node scripts/scada-smoke/browser/build.mjs [输出目录，默认 <系统临时目录>/scada-browser]
 * 产物：bundle.js（esbuild，ESM）、index.html、locales / assets 软链（i18n 会 fetch /locales/zh-CN.json，style.scss 里的按钮图片在 assets）。
 * 样式要另外编译（应用的 style.scss 只有 `@tailwind utilities`，没有 preflight）：见同目录 README.md。
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..')
const out = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'scada-browser'))
fs.mkdirSync(out, { recursive: true })
const stubs = {
  '@/store': path.join(repo, 'scripts/scada-smoke/stubs/store.ts'),
  '@/store/config': path.join(repo, 'scripts/scada-smoke/stubs/config.ts'),
  '@/utils/callm': path.join(repo, 'scripts/scada-smoke/stubs/callm.ts')
}
await build({
  entryPoints: [path.join(here, 'entry.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: path.join(out, 'bundle.js'),
  jsx: 'automatic',
  jsxImportSource: 'vue',
  tsconfig: path.join(repo, 'tsconfig.json'),
  absWorkingDir: repo,
  nodePaths: [path.join(repo, 'node_modules'), ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)],
  define: { 'import.meta.env.BASE_URL': '"/"', 'process.env.NODE_ENV': '"development"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  logLevel: 'error',
  plugins: [{ name: 'stubs', setup(b) { b.onResolve({ filter: /^@\/(store|store\/config|utils\/callm)$/ }, a => ({ path: stubs[a.path] })) } }]
})
fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html>\n<html><head><meta charset="utf-8"><title>scada harness</title><link rel="stylesheet" href="style.css"></head>\n<body><div id="app"></div><script type="module" src="bundle.js"></script></body></html>\n')
for (const [name, target] of [['locales', path.join(repo, 'public/locales')], ['assets', path.join(repo, 'src/assets')]]) {
  const link = path.join(out, name)
  fs.rmSync(link, { recursive: true, force: true })
  fs.symlinkSync(target, link)
}
console.log('built ->', out, '（还需要 style.css，见 README.md）')
