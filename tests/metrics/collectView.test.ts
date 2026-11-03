import { describe, it, expect, vi } from 'vitest'
import { parseViewBody, acceptView, VIEW_PARSE_TOOLS } from '@/metrics/collectView'

const GOOD = { shop: 'demo.myshopify.com', productId: 'gid://shopify/Product/9', clientId: 'abc-123' }
const parse = (value: unknown) => parseViewBody({ text: typeof value === 'string' ? value : JSON.stringify(value), tools: VIEW_PARSE_TOOLS })

describe('parseViewBody', () => {
  it('accepts a view with a real shop, a product id and a client id', () => {
    expect(parse(GOOD)).toEqual(GOOD)
  })

  it.each([
    ['not JSON', '{oops'],
    ['an array', '[]'],
    ['a shop that is not a shop host', { ...GOOD, shop: 'evil.example.com' }],
    ['a shop with a path', { ...GOOD, shop: 'demo.myshopify.com/x' }],
    ['a product id that is not a product gid', { ...GOOD, productId: '9' }],
    ['a product gid of another type', { ...GOOD, productId: 'gid://shopify/Collection/9' }],
    ['a client id that is not text', { ...GOOD, clientId: 5 }],
    ['an empty client id', { ...GOOD, clientId: '' }],
    ['a client id over 128 characters', { ...GOOD, clientId: 'x'.repeat(129) }],
    ['a body over 2,048 characters', { ...GOOD, extra: 'x'.repeat(2100) }],
  ])('refuses %s', (_name, value) => {
    expect(parse(value)).toBeNull()
  })
})

describe('acceptView', () => {
  const tools = () => ({ ...VIEW_PARSE_TOOLS, recordView: vi.fn(async () => 'counted' as const), viewTools: {} as never })

  it('records a valid view with the secret and the time it is given', async () => {
    const toolbox = tools()
    expect(await acceptView({ text: JSON.stringify(GOOD), nowMs: 5, secret: 's', tools: toolbox })).toBe('counted')
    expect(toolbox.recordView).toHaveBeenCalledExactlyOnceWith({ ...GOOD, nowMs: 5, secret: 's', tools: toolbox.viewTools })
  })

  it('ignores a refused body, and records nothing', async () => {
    const toolbox = tools()
    expect(await acceptView({ text: '{oops', nowMs: 5, secret: 's', tools: toolbox })).toBe('ignored')
    expect(toolbox.recordView).not.toHaveBeenCalled()
  })

  it('ignores every view when the secret is missing, so no unkeyed hash is ever stored', async () => {
    const toolbox = tools()
    expect(await acceptView({ text: JSON.stringify(GOOD), nowMs: 5, secret: '', tools: toolbox })).toBe('ignored')
    expect(toolbox.recordView).not.toHaveBeenCalled()
  })
})
