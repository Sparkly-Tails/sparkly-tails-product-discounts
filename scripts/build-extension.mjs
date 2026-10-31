// Usage: node scripts/build-extension.mjs
//
// Builds the files the theme extension serves (extensions/product-tier-pricing/assets) from its readable
// source (extensions/product-tier-pricing/src): minified scripts, minified stylesheets, and a stop when a
// script is over Shopify's 10,000 byte limit. The built files are not committed; `npm run deploy:dev` and
// `npm run deploy:prod` run this first, every time. `shopify app dev` needs the built files too: run this once.
import { build } from 'esbuild'
import fileSystem from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildExtension } from './extensionBuild.mjs'
import { EXTENSION_SCRIPTS, EXTENSION_SCRIPT_BYTE_LIMIT, EXTENSION_STYLESHEETS } from './extensionFiles.mjs'

const extensionFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../extensions/product-tier-pricing')
const tools = {
  build,
  listFiles: (folder) => fileSystem.readdir(folder),
  removeFile: (file) => fileSystem.rm(file, { force: true }),
  makeFolder: (folder) => fileSystem.mkdir(folder, { recursive: true }),
  readSize: async (file) => (await fileSystem.stat(file)).size,
}

try {
  const { files } = await buildExtension({
    sourceFolder: path.join(extensionFolder, 'src'),
    outFolder: path.join(extensionFolder, 'assets'),
    scripts: EXTENSION_SCRIPTS,
    stylesheets: EXTENSION_STYLESHEETS,
    byteLimit: EXTENSION_SCRIPT_BYTE_LIMIT,
    tools,
  })
  for (const file of files) console.log(`${file.name.padEnd(32)} ${String(file.bytes).padStart(6)} bytes`)
} catch (error) {
  console.error(`Extension build failed: ${error.message}`)
  process.exit(1)
}
