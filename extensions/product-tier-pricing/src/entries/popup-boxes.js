// bundle-popup-boxes.js: the boxes of the pop-up (the live products of the bundles that are due, their items and prices).
// Loaded by bundle-popup.js when a bundle is due.
import { BOX_TOOLS, prepareBoxes } from '../popup/boxes.js'
import { registerComponent } from '../loader/registry.js'

registerComponent({ root: window, name: 'popupBoxes', api: { prepareBoxes: prepareBoxes.bind(null, BOX_TOOLS) } })
