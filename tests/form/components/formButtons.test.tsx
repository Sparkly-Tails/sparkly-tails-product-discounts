// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import DiscardButton from '@/form/components/DiscardButton'
import SubmitButton from '@/form/components/SubmitButton'

afterEach(cleanup)

describe('DiscardButton', () => {
  it('leaves the page, to the discounts, when creating (nothing was saved)', () => {
    render(<DiscardButton mode="create" onDiscard={() => {}} />)
    expect(screen.getByRole('link', { name: 'Discard' })).toHaveAttribute('href', '/')
  })

  it('takes back the unsaved changes when editing', () => {
    const onDiscard = vi.fn()
    render(<DiscardButton mode="edit" onDiscard={onDiscard} />)
    const button = screen.getByRole('button', { name: 'Discard' })
    expect(button).toHaveAttribute('type', 'button')
    fireEvent.click(button)
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })
})

describe('SubmitButton', () => {
  it('submits the form, carrying its name and value when it has them', () => {
    render(<form><SubmitButton label="Go live" name="goLive" value="on" tone="secondary" isDisabled={false} /></form>)
    const button = screen.getByRole('button', { name: 'Go live' })
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toHaveAttribute('name', 'goLive')
    expect(button).toHaveAttribute('value', 'on')
  })

  it('can be switched off', () => {
    render(<form><SubmitButton label="Save" tone="primary" isDisabled /></form>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
