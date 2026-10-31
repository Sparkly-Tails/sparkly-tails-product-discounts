// Builds the files the theme extension serves from its readable source: every script becomes one minified
// classic script, every stylesheet is minified. The built files are never committed; the deploy scripts run
// this build first (scripts/build-extension.mjs). What touches the disk, or esbuild, comes in through `tools`.
import path from 'node:path'

const BUILT_EXTENSIONS = ['.js', '.css']

/** Clears the scripts and stylesheets of an earlier build, so a renamed file never lingers in the upload. */
async function prepareOutFolder({ outFolder, tools }) {
  await tools.makeFolder(outFolder)
  const names = await tools.listFiles(outFolder)
  for (const name of names) {
    if (BUILT_EXTENSIONS.includes(path.extname(name))) await tools.removeFile(path.join(outFolder, name))
  }
}

/** One entry and everything it imports, as a single minified script. Fails when it is over the byte limit. */
async function buildScript({ entryFile, outFile, name, byteLimit, tools }) {
  await tools.build({
    entryPoints: [entryFile], outfile: outFile, bundle: true, minify: true, format: 'iife', target: 'es2019', legalComments: 'none', logLevel: 'silent',
  })
  const bytes = await tools.readSize(outFile)
  if (bytes > byteLimit) throw new Error(`${name} is ${bytes} bytes; the limit is ${byteLimit}`)
  return { name, bytes }
}

/** A stylesheet, minified. */
async function buildStylesheet({ entryFile, outFile, name, tools }) {
  await tools.build({ entryPoints: [entryFile], outfile: outFile, minify: true, legalComments: 'none', logLevel: 'silent' })
  return { name, bytes: await tools.readSize(outFile) }
}

const BUILD_STEPS = { prepareOutFolder, buildScript, buildStylesheet }

/**
 * Builds every script and stylesheet of the extension into `outFolder`; resolves with each built file's name and size.
 * `scripts` and `stylesheets` list `{ entry, name }`: the source file (under `sourceFolder`) and the built file's name.
 */
export async function buildExtension({ sourceFolder, outFolder, scripts, stylesheets, byteLimit, tools }) {
  await BUILD_STEPS.prepareOutFolder({ outFolder, tools })
  const files = []
  for (const script of scripts) {
    const entryFile = path.join(sourceFolder, script.entry)
    files.push(await BUILD_STEPS.buildScript({ entryFile, outFile: path.join(outFolder, script.name), name: script.name, byteLimit, tools }))
  }
  for (const sheet of stylesheets) {
    const entryFile = path.join(sourceFolder, sheet.entry)
    files.push(await BUILD_STEPS.buildStylesheet({ entryFile, outFile: path.join(outFolder, sheet.name), name: sheet.name, tools }))
  }
  return { files }
}
