import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../prisma/migrations')

function readMigrations(): string[] {
  return fs.readdirSync(MIGRATIONS_FOLDER)
    .filter((name) => fs.existsSync(path.join(MIGRATIONS_FOLDER, name, 'migration.sql')))
    .sort()
    .map((name) => fs.readFileSync(path.join(MIGRATIONS_FOLDER, name, 'migration.sql'), 'utf8'))
}

describe("Prisma's own table of applied migrations", () => {
  it('denies the Supabase REST API, like the app tables: row-level security on, no policies', () => {
    const allSql = readMigrations().join('\n')
    expect(allSql).toContain('ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;')
    expect(allSql).not.toMatch(/CREATE POLICY[^;]*_prisma_migrations/)
  })
})
