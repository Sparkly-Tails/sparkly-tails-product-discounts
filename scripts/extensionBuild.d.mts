/** What the build touches outside itself: esbuild's `build` and a few file-system steps. */
export interface BuildTools {
  build(options: never): Promise<unknown>
  listFiles(folder: string): Promise<string[]>
  removeFile(file: string): Promise<void>
  makeFolder(folder: string): Promise<unknown>
  readSize(file: string): Promise<number>
}

export interface BuildEntry {
  /** The source file, relative to the source folder. */
  entry: string
  /** The built file's name in the output folder. */
  name: string
}

export interface BuiltFile {
  name: string
  bytes: number
}

export function buildExtension(options: {
  sourceFolder: string
  outFolder: string
  scripts: BuildEntry[]
  stylesheets: BuildEntry[]
  byteLimit: number
  tools: BuildTools
}): Promise<{ files: BuiltFile[] }>
