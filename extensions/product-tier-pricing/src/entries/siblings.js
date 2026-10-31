// tier-pricing-siblings.js: the Mix & match list. Loaded the first time the list is opened.
import { registerComponent } from '../loader/registry.js'
import { paintSiblingsList } from '../siblings.js'

registerComponent({ root: window, name: 'siblings', api: { paintSiblingsList } })
