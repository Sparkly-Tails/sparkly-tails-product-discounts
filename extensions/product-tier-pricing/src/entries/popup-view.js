// bundle-popup-view.js: the drawing of the pop-up (the dialog and the boxes). Loaded by bundle-popup.js when a pop-up is due.
import { BOX_VIEW_TOOLS, createBox, paintBox, setCountdown } from '../popup/box.js'
import { buildHeadingText, buildBoxTitle, buildBadgeText, buildIncentiveText, buildFixedIncentive, buildSavingText, readTierMode } from '../popup/copy.js'
import { NODE_TOOLS } from '../popup/node.js'
import { pickHexColor, setBoxProperty, hasPropertyValue } from '../popup/look.js'
import { buildDialog, SHELL_TOOLS } from '../popup/shell.js'
import { registerComponent } from '../loader/registry.js'

const VIEW_TOOLS = {
  ...NODE_TOOLS, ...SHELL_TOOLS, ...BOX_VIEW_TOOLS, pickHexColor, setBoxProperty, hasPropertyValue,
  buildHeadingText, buildBoxTitle, buildBadgeText, buildIncentiveText, buildFixedIncentive, buildSavingText, readTierMode,
}

registerComponent({
  root: window,
  name: 'popupView',
  api: { buildDialog: buildDialog.bind(null, VIEW_TOOLS), createBox: createBox.bind(null, VIEW_TOOLS), paintBox: paintBox.bind(null, VIEW_TOOLS), setCountdown: setCountdown.bind(null, VIEW_TOOLS) },
})
