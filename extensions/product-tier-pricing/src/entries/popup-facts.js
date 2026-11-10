// bundle-popup-facts.js: the arithmetic of a box (what is missing, Quick auto-fill, the tier chips, the look). Loaded by bundle-popup.js when a pop-up is due.
import { FACTS_API } from '../popup/facts.js'
import { registerComponent } from '../loader/registry.js'

registerComponent({ root: window, name: 'popupFacts', api: FACTS_API })
