// tier-pricing-model.js: decides what the widget shows.
import { registerComponent } from '../loader/registry.js'
import { computeWidgetViewModel } from '../viewModel.js'

registerComponent({ root: window, name: 'model', api: { computeWidgetViewModel } })
