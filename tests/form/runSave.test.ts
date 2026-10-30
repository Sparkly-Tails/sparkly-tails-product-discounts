import { describe, it, expect, vi } from 'vitest'
import { runSave, readDiscountId, type RunSaveTools } from '@/form/runSave'

type Fakes = RunSaveTools & { saveDiscountFlow: ReturnType<typeof vi.fn> }

function buildTools(overrides: Record<string, unknown> = {}): Fakes {
  return {
    parseDiscountForm: vi.fn(() => ({ values: { name: 'x' } })),
    saveDiscountFlow: vi.fn(async () => ({ ok: true, discountId: 'disc_9' })),
    readDiscountId,
    parseTools: { parse: true },
    saveTools: { save: true },
    ...overrides,
  } as unknown as Fakes
}

function formWith(fields: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) formData.append(key, value)
  return formData
}

describe('readDiscountId', () => {
  it('is the id of the discount being edited, or nothing for a new one', () => {
    expect(readDiscountId({ formData: formWith({ discountId: ' disc_1 ' }) })).toBe('disc_1')
    expect(readDiscountId({ formData: formWith({ discountId: '' }) })).toBeUndefined()
    expect(readDiscountId({ formData: formWith({}) })).toBeUndefined()
  })
})

describe('runSave', () => {
  it('hands back the id of the discount that was saved', async () => {
    const tools = buildTools()
    expect(await runSave({ formData: formWith({}), tools })).toEqual({ discountId: 'disc_9' })
  })

  it('saves the values that were read, for the discount named in the form', async () => {
    const tools = buildTools()
    await runSave({ formData: formWith({ discountId: 'disc_1' }), tools })
    expect(tools.saveDiscountFlow).toHaveBeenCalledWith({ discountId: 'disc_1', values: { name: 'x' }, tools: { save: true } })
  })

  it('hands back why a form cannot be saved, without trying to save it', async () => {
    const tools = buildTools({ parseDiscountForm: vi.fn(() => ({ error: 'A name is required' })) })
    expect(await runSave({ formData: formWith({}), tools })).toEqual({ error: 'A name is required' })
    expect(tools.saveDiscountFlow).not.toHaveBeenCalled()
  })

  it('hands back why a save was refused', async () => {
    const tools = buildTools({ saveDiscountFlow: vi.fn(async () => ({ ok: false, error: 'Shopify allows only 25 active discounts.' })) })
    expect(await runSave({ formData: formWith({}), tools })).toEqual({ error: 'Shopify allows only 25 active discounts.' })
  })
})
