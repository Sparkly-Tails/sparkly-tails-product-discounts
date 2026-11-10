// bundle-popup-parts.js: the parts of a box (the tier chips, the list of items, the buttons). Loaded by bundle-popup.js when a pop-up is due.
import { PARTS_TOOLS, buildAddParts, buildViewParts, buildChips } from '../popup/parts.js'
import { registerComponent } from '../loader/registry.js'

registerComponent({
  root: window,
  name: 'popupParts',
  api: { buildAddParts: buildAddParts.bind(null, PARTS_TOOLS), buildViewParts: buildViewParts.bind(null, PARTS_TOOLS), buildChips: buildChips.bind(null, PARTS_TOOLS) },
})
