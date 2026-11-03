interface HeaderReader {
  get: (name: string) => string | null
}

/** The host a request came in on: the forwarded one first, then the plain one, or an empty text. */
export function pickRequestHost({ forwarded, host }: { forwarded: string | null; host: string | null }): string {
  return forwarded || host || ''
}

/** Server only. The host the current request came in on, or an empty text outside a request. `readHeaders` is `headers` from next/headers. */
export async function getRequestHost({ readHeaders, tools }: { readHeaders: () => Promise<HeaderReader>; tools: { pickRequestHost: typeof pickRequestHost } }): Promise<string> {
  try {
    const requestHeaders = await readHeaders()
    return tools.pickRequestHost({ forwarded: requestHeaders.get('x-forwarded-host'), host: requestHeaders.get('host') })
  } catch {
    return ''
  }
}

export const REQUEST_HOST_TOOLS = { pickRequestHost }
