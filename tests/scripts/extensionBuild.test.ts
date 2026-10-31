import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { build } from 'esbuild'
import { buildExtension } from '../../scripts/extensionBuild.mjs'

const TOOLS = {
  build,
  listFiles: (folder: string) => fs.readdir(folder),
  removeFile: (file: string) => fs.rm(file, { force: true }),
  makeFolder: (folder: string) => fs.mkdir(folder, { recursive: true }),
  readSize: async (file: string) => (await fs.stat(file)).size,
}

let workFolder = ''
let sourceFolder = ''
let outFolder = ''

async function writeSource(name: string, text: string) {
  await fs.writeFile(path.join(sourceFolder, name), text)
}

function runBuilt(code: string): Record<string, unknown> {
  const holder: Record<string, unknown> = {}
  new Function('holder', code)(holder)
  return holder
}

beforeEach(async () => {
  workFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'extension-build-'))
  sourceFolder = path.join(workFolder, 'src')
  outFolder = path.join(workFolder, 'assets')
  await fs.mkdir(sourceFolder, { recursive: true })
})
afterEach(async () => { await fs.rm(workFolder, { recursive: true, force: true }) })

describe('buildExtension', () => {
  it('bundles a script and what it imports into one minified file that still runs', async () => {
    await writeSource('helper.js', '// the helper adds two numbers\nexport function addNumbers(first, second) {\n  return first + second\n}\n')
    await writeSource('entry.js', "import { addNumbers } from './helper.js'\n// the entry stores the answer\nholder.answer = addNumbers(2, 3)\n")

    await buildExtension({ sourceFolder, outFolder, scripts: [{ entry: 'entry.js', name: 'tool.js' }], stylesheets: [], byteLimit: 10_000, tools: TOOLS })

    const code = await fs.readFile(path.join(outFolder, 'tool.js'), 'utf8')
    expect(code).not.toContain('the helper adds')
    expect(code).not.toMatch(/\bimport\b|\bexport\b/)
    expect(runBuilt(code).answer).toBe(5)
  })

  it('minifies a stylesheet', async () => {
    await writeSource('look.css', '/* the look */\n.sparkly {\n  color: red;\n  margin: 0 auto;\n}\n')

    await buildExtension({ sourceFolder, outFolder, scripts: [], stylesheets: [{ entry: 'look.css', name: 'look.css' }], byteLimit: 10_000, tools: TOOLS })

    const css = await fs.readFile(path.join(outFolder, 'look.css'), 'utf8')
    expect(css).not.toContain('the look')
    expect(css).toContain('.sparkly{color:red;margin:0 auto}')
  })

  it('says how big each built file is', async () => {
    await writeSource('entry.js', 'holder.value = 1\n')
    await writeSource('look.css', '.sparkly { color: red; }\n')

    const result = await buildExtension({
      sourceFolder, outFolder, scripts: [{ entry: 'entry.js', name: 'tool.js' }], stylesheets: [{ entry: 'look.css', name: 'look.css' }], byteLimit: 10_000, tools: TOOLS,
    })

    expect(result.files.map((file: { name: string }) => file.name)).toEqual(['tool.js', 'look.css'])
    const toolStat = await fs.stat(path.join(outFolder, 'tool.js'))
    expect(result.files[0].bytes).toBe(toolStat.size)
  })

  it('fails naming the script and its size when a built script is over the limit', async () => {
    await writeSource('big.js', `holder.text = ${JSON.stringify('x'.repeat(300))}\n`)

    const attempt = buildExtension({ sourceFolder, outFolder, scripts: [{ entry: 'big.js', name: 'big-tool.js' }], stylesheets: [], byteLimit: 200, tools: TOOLS })

    await expect(attempt).rejects.toThrow(/big-tool\.js is \d+ bytes.*limit is 200/)
  })

  it('does not hold a stylesheet to the script limit', async () => {
    await writeSource('wide.css', `.sparkly { content: "${'x'.repeat(300)}"; }\n`)

    await expect(buildExtension({ sourceFolder, outFolder, scripts: [], stylesheets: [{ entry: 'wide.css', name: 'wide.css' }], byteLimit: 200, tools: TOOLS })).resolves.toBeDefined()
  })

  it('removes the scripts and stylesheets of an earlier build but leaves other files alone', async () => {
    await fs.mkdir(outFolder, { recursive: true })
    await fs.writeFile(path.join(outFolder, 'old-tool.js'), 'old')
    await fs.writeFile(path.join(outFolder, 'old-look.css'), 'old')
    await fs.writeFile(path.join(outFolder, 'picture.svg'), '<svg/>')
    await writeSource('entry.js', 'holder.value = 1\n')

    await buildExtension({ sourceFolder, outFolder, scripts: [{ entry: 'entry.js', name: 'tool.js' }], stylesheets: [], byteLimit: 10_000, tools: TOOLS })

    expect((await fs.readdir(outFolder)).sort()).toEqual(['picture.svg', 'tool.js'])
  })

  it('creates the output folder when it is not there yet', async () => {
    await writeSource('entry.js', 'holder.value = 1\n')

    await buildExtension({ sourceFolder, outFolder, scripts: [{ entry: 'entry.js', name: 'tool.js' }], stylesheets: [], byteLimit: 10_000, tools: TOOLS })

    expect(await fs.readdir(outFolder)).toEqual(['tool.js'])
  })
})
