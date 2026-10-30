// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import DiscardButton from '@/form/components/DiscardButton'
import SubmitButton from '@/form/components/SubmitButton'
import DeleteButton from '@/form/components/DeleteButton'
import StatusButton from '@/form/components/StatusButton'

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

describe('StatusButton', () => {
  it('is Go live for a draft, sending goLive', () => {
    render(<form><StatusButton status="draft" isDisabled={false} /></form>)
    const button = screen.getByRole('button', { name: 'Go live' })
    expect(button).toHaveAttribute('name', 'goLive')
    expect(button).toHaveAttribute('value', 'on')
  })

  it('is Take offline for a live discount, sending takeOffline', () => {
    render(<form><StatusButton status="live" isDisabled={false} /></form>)
    const button = screen.getByRole('button', { name: 'Take offline' })
    expect(button).toHaveAttribute('name', 'takeOffline')
    expect(button).toHaveAttribute('value', 'on')
  })

  it('can be switched off', () => {
    render(<form><StatusButton status="draft" isDisabled /></form>)
    expect(screen.getByRole('button', { name: 'Go live' })).toBeDisabled()
  })
})

describe('DeleteButton', () => {
  it('asks before it deletes, and does nothing when the answer is no', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const submit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
    const { container } = render(<form onSubmit={submit}><DeleteButton deleteAction={async () => {}} /></form>)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(confirm).toHaveBeenCalledWith('Delete this discount? This cannot be undone.')
    expect(submit).not.toHaveBeenCalled()
    expect(container.querySelector('button')).toHaveAttribute('type', 'submit')
    confirm.mockRestore()
  })

  it('goes ahead when the answer is yes, without checking the other fields of the form', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const submit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
    render(<form onSubmit={submit}><DeleteButton deleteAction={async () => {}} /></form>)
    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button).toHaveAttribute('formnovalidate')
    fireEvent.click(button)
    expect(submit).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })

  it('is red', () => {
    render(<form><DeleteButton deleteAction={async () => {}} /></form>)
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('text-form-error')
  })
})
