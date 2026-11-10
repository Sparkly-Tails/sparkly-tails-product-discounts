// The addresses the pop-up asks for. `rootUrl` is the shop's root link: "/" or a language such as "/fr" (no slash after it).

/** The shop's address for `path` (such as "cart.js" or "checkout"), under the root link. */
export function buildRootPath({ rootUrl, path }) {
  return (rootUrl.endsWith('/') ? rootUrl : rootUrl + '/') + path
}
