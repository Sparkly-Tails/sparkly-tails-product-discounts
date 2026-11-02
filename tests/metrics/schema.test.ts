import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/** The homepage metrics tables the plan names; the migration must create the same ones. */
const ROOT = path.resolve(__dirname, '../..')
const schema = fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8')
const migrationDir = fs.readdirSync(path.join(ROOT, 'prisma/migrations')).find((name) => name.endsWith('_homepage_metrics'))
const migration = migrationDir ? fs.readFileSync(path.join(ROOT, 'prisma/migrations', migrationDir, 'migration.sql'), 'utf8') : ''

const readModel = (name: string) => new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`).exec(schema)?.[0] ?? ''

describe('the metrics tables', () => {
  it.each(['DiscountDailyStat', 'VisitorSeen', 'BundleOrder', 'MetricsSync'])('%s is a model and has a table in the migration', (name) => {
    expect(readModel(name)).not.toBe('')
    expect(migration).toContain(`CREATE TABLE "${name}"`)
  })

  it('keeps one row per shop, discount and day for the visitor counts', () => {
    expect(readModel('DiscountDailyStat')).toContain('@@unique([shop, discountId, day])')
  })

  it('remembers a visitor once per shop, discount and day', () => {
    expect(readModel('VisitorSeen')).toContain('@@unique([shop, discountId, day, visitorKey])')
  })

  it('keeps one row per shop, order and discount, so saving an order twice changes nothing', () => {
    expect(readModel('BundleOrder')).toContain('@@unique([shop, orderId, discountId])')
    expect(readModel('BundleOrder')).toContain('@@index([shop, orderedAt])')
  })

  it('keeps the shop time zone and the live products on the sync row, with defaults', () => {
    const model = readModel('MetricsSync')
    expect(model).toMatch(/timeZone\s+String\s+@default\("UTC"\)/)
    expect(model).toMatch(/liveProducts\s+Json\s+@default\("\{\}"\)/)
  })

  it('denies the Supabase REST API on every new table, like the session table', () => {
    for (const name of ['DiscountDailyStat', 'VisitorSeen', 'BundleOrder', 'MetricsSync']) {
      expect(migration).toContain(`ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY;`)
    }
  })
})
