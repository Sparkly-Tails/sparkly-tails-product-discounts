// bundle-popup-ui.js: the pop-up itself (dialog, boxes, adding). Loaded by bundle-popup.js when a pop-up is due.
// A stub until the component is written: it lets every press go ahead.
import { registerComponent } from '../loader/registry.js'

registerComponent({ root: window, name: 'popupUi', api: { openPopup: () => Promise.resolve({ action: 'continue', didAdd: false }) } })
