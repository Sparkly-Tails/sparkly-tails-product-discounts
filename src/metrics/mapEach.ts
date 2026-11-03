// Kept apart from the order readers so client components can use it without pulling in server-only modules.
/** Runs `run` on every item and gives the results in order; `run` gets the item and the shared context, so it needs no outside variable. */
export function mapEach<Item, Result, Context>({ items, run, context }: { items: Item[]; run: (args: { item: Item; context: Context }) => Result; context: Context }): Result[] {
  const results: Result[] = []
  for (const item of items) results.push(run({ item, context }))
  return results
}
