/** The variables of a style attribute's text (`--a:#fff;--b:12px`) as a map React can set as a style. */
export function parseStyleText({ text }: { text: string }): Record<string, string> {
  return Object.fromEntries(text.split(';').map((pair) => pair.split(':')))
}
