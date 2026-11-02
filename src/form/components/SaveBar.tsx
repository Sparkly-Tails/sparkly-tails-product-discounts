'use client'

import { useEffect } from 'react'

// App Bridge's save bar on the page, or nothing when the page has no App Bridge.
function readSaveBar({ page }: { page: Window }) {
  return page.shopify?.saveBar
}

// Shopify's own save bar, at the top of the admin: "Unsaved changes", Discard and Save. App Bridge draws it from
// this element and its two buttons; the page shows it while the form has changes and hides it when it has none
// (and when the page goes away, so it is not left on the next one). Without App Bridge on the page (outside the
// admin) nothing is shown. The buttons are plain buttons that call what the form gives them.
export default function SaveBar({ id, isVisible, canSave, onSave, onDiscard }: {
  id: string
  isVisible: boolean
  canSave: boolean
  onSave: () => void
  onDiscard: () => void
}) {
  useEffect(() => {
    const saveBar = readSaveBar({ page: window })
    if (!saveBar) return
    if (isVisible) saveBar.show(id)
    else saveBar.hide(id)
  }, [id, isVisible])

  useEffect(() => () => { readSaveBar({ page: window })?.hide(id) }, [id])

  return (
    <ui-save-bar id={id}>
      <button type="button" {...{ variant: 'primary' }} disabled={!canSave} onClick={onSave}>Save</button>
      <button type="button" onClick={onDiscard}>Discard</button>
    </ui-save-bar>
  )
}
