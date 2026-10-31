// tier-pricing-flash.js: the flash sale's bar, countdown and phases. Loaded only for a discount with a flash sale.
import { FLASH_TOOLS, paintFlashBar } from '../flash.js'
import { registerComponent } from '../loader/registry.js'

registerComponent({ root: window, name: 'flash', api: { flashTools: FLASH_TOOLS, paintFlashBar } })
