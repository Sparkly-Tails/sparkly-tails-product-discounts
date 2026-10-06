import { useCallback, useRef } from 'react'

/**
 * Runs saves one at a time, in the order they were requested. All time-based
 * discounts live in ONE shop metafield and every save rewrites it, so two
 * overlapping saves (a title blur and a row save) could overwrite each
 * other. A failed task never blocks the ones queued behind it.
 */
export function useSaveQueue() {
  const tail = useRef<Promise<unknown>>(Promise.resolve())

  return useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = tail.current.then(task, task)
    tail.current = run.catch(() => undefined)
    return run
  }, [])
}
