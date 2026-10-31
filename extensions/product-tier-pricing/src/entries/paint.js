// tier-pricing-paint.js: paints what the model decided.
import { registerComponent } from '../loader/registry.js'
import { paintWidget } from '../paint.js'

registerComponent({ root: window, name: 'paint', api: { paintWidget } })
