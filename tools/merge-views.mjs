// 把 src/parts/*.js 合并进 lib/client.js 的标记块。
// 用法：node tools/merge-views.mjs
// 片段文件按文件名排序拼接，纯 JS 语句（函数声明），不得含 import/export。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'lib', 'client.js')
const partsDir = join(root, 'src', 'parts')

const BEGIN = '    // >>> parts:begin'
const END = '    // <<< parts:end'

const source = readFileSync(target, 'utf8')
const b = source.indexOf(BEGIN)
const e = source.indexOf(END)
if (b < 0 || e < 0 || e < b) {
  console.error('找不到 parts 标记块，先确认 lib/client.js 里有 // >>> parts:begin / // <<< parts:end')
  process.exit(1)
}

const files = existsSync(partsDir) ? readdirSync(partsDir).filter((f) => f.endsWith('.js')).sort() : []
const body = files
  .map((f) => '    // ── part: ' + f + ' ──\n' + readFileSync(join(partsDir, f), 'utf8').replace(/\s+$/, '') + '\n')
  .join('\n')

const next = source.slice(0, b + BEGIN.length) + '\n' + body + source.slice(e)
writeFileSync(target, next)
console.log('merged ' + files.length + ' part(s): ' + files.join(', '))
