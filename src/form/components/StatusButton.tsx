import SubmitButton from '@/form/components/SubmitButton'

// Go live for a draft, Take offline for a live discount. Either saves the form first (it is part of the one save).
export default function StatusButton({ status, isDisabled }: { status: 'draft' | 'live'; isDisabled: boolean }) {
  return status === 'live'
    ? <SubmitButton label="Take offline" name="takeOffline" value="on" tone="secondary" isDisabled={isDisabled} />
    : <SubmitButton label="Go live" name="goLive" value="on" tone="secondary" isDisabled={isDisabled} />
}
