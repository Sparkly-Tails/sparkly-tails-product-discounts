// bundle-popup-parts.js: the parts of a box (the progress rail, the tier chips, the list of items, the buttons) and what their controls do. Loaded by bundle-popup.js when a pop-up is due.
import { PARTS_TOOLS, buildAddParts, buildViewParts, buildChips, buildRailOf, addRow, incrementQuantity, decrementQuantity, toggleRows } from '../popup/parts.js'
import { registerComponent } from '../loader/registry.js'

registerComponent({
  root: window,
  name: 'popupParts',
  api: {
    buildAddParts: buildAddParts.bind(null, PARTS_TOOLS), buildViewParts: buildViewParts.bind(null, PARTS_TOOLS), buildChips: buildChips.bind(null, PARTS_TOOLS), buildRail: buildRailOf.bind(null, PARTS_TOOLS),
    actions: { add: addRow.bind(null, PARTS_TOOLS), plus: incrementQuantity.bind(null, PARTS_TOOLS), minus: decrementQuantity.bind(null, PARTS_TOOLS), reveal: toggleRows.bind(null, PARTS_TOOLS) },
  },
})
