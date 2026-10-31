import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { build } from 'esbuild'
import type { TestProject } from 'vitest/node'
import { buildExtension } from '../../scripts/extensionBuild.mjs'
import { EXTENSION_SCRIPTS, EXTENSION_SCRIPT_BYTE_LIMIT, EXTENSION_STYLESHEETS } from '../../scripts/extensionFiles.mjs'

declare module 'vitest' {
  export interface ProvidedContext {
    builtWidgetFolder: string
  }
}

const EXTENSION_FOLDER = path.resolve(__dirname, '../../extensions/product-tier-pricing')

const TOOLS = {
  build,
  listFiles: (folder: string) => fs.readdir(folder),
  removeFile: (file: string) => fs.rm(file, { force: true }),
  makeFolder: (folder: string) => fs.mkdir(folder, { recursive: true }),
  readSize: async (file: string) => (await fs.stat(file)).size,
}

/**
 * Builds the extension's scripts and stylesheets once per test run, the way a deploy does, into a temporary
 * folder that the storefront tests read from. esbuild cannot run inside the jsdom test environment, so the
 * build happens here, in plain Node, before any test file starts.
 */
export default async function setup(project: TestProject) {
  const outFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'built-widget-'))
  await buildExtension({
    sourceFolder: path.join(EXTENSION_FOLDER, 'src'), outFolder, scripts: EXTENSION_SCRIPTS, stylesheets: EXTENSION_STYLESHEETS, byteLimit: EXTENSION_SCRIPT_BYTE_LIMIT, tools: TOOLS,
  })
  project.provide('builtWidgetFolder', outFolder)
  return () => fs.rm(outFolder, { recursive: true, force: true })
}
