/** The App Bridge ID token: the Authorization header (fetches) first, else the `id_token` query parameter (page loads). */
export function pickIdToken(input: { authorization: string | null; idTokenParam: string | null }): string | null {
  const bearer = input.authorization?.match(/^Bearer\s+(\S+)$/i)
  if (bearer) return bearer[1]
  return input.idTokenParam || null
}
