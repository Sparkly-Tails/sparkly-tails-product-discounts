// bundle-popup-ui.js: the pop-up's controller (state, events, adding, the clock). Loaded by bundle-popup.js when a pop-up is due.
import { UI_TOOLS, openPopup } from '../popup/ui.js'
import { registerComponent } from '../loader/registry.js'

registerComponent({ root: window, name: 'popupUi', api: { openPopup: openPopup.bind(null, UI_TOOLS) } })
