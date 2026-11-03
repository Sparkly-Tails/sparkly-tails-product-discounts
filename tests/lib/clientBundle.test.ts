import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/** A browser bundle must never reach a module that only works on the server (Next.js fails the build). */
const SOURCE_DIR = path.resolve(__dirname, '../../src')
const SERVER_ONLY_IMPORT = /from\s+['"](next\/headers|server-only)['"]/
const CLIENT_MARKER = /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/
const ACTION_MARKER = /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use server['"]/
const IMPORT_PATTERN = /^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm

const listSourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

const resolveImport = (specifier: string, fromFile: string): string | null => {
  const base = specifier.startsWith('@/') ? path.join(SOURCE_DIR, specifier.slice(2)) : specifier.startsWith('.') ? path.resolve(path.dirname(fromFile), specifier) : null
  if (!base) return null
  const candidates = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

const listImports = (file: string): string[] =>
  [...fs.readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)]
    .map((match) => resolveImport(match[1] ?? match[2], file))
    .filter((target): target is string => target !== null)

const findServerOnlyChain = (start: string): string[] | null => {
  const parents = new Map<string, string | null>([[start, null]])
  const queue = [start]
  while (queue.length) {
    const current = queue.shift() as string
    if (SERVER_ONLY_IMPORT.test(fs.readFileSync(current, 'utf8'))) {
      const chain: string[] = []
      for (let step: string | null = current; step; step = parents.get(step) ?? null) chain.unshift(path.relative(SOURCE_DIR, step))
      return chain
    }
    // A server action file is replaced by a stub in the browser bundle, so what it imports stays on the server.
    if (ACTION_MARKER.test(fs.readFileSync(current, 'utf8'))) continue
    for (const target of listImports(current)) {
      if (!parents.has(target)) {
        parents.set(target, current)
        queue.push(target)
      }
    }
  }
  return null
}

const clientFiles = listSourceFiles(SOURCE_DIR).filter((file) => CLIENT_MARKER.test(fs.readFileSync(file, 'utf8')))

describe('client components', () => {
  it('finds the client components', () => {
    expect(clientFiles.length).toBeGreaterThan(10)
  })

  it.each(clientFiles.map((file) => [path.relative(SOURCE_DIR, file), file]))('%s does not reach a server-only module', (_name, file) => {
    expect(findServerOnlyChain(file)?.join(' -> ') ?? null).toBeNull()
  })
})
