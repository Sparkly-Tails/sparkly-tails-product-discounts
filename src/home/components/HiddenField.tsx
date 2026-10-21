// A hidden form field that carries a table setting to the next address, left
// out while the setting is at its default (so the address stays short).
export default function HiddenField({ name, value, skipValue }: { name: string; value: string; skipValue: string }) {
  if (value === skipValue) return null
  return <input type="hidden" name={name} value={value} />
}
