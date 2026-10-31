// Every pure function of the widget in one object, for the admin preview and the node tests. The view model
// comes with the flash functions already given, as the storefront's model component gets them from the flash one.
import { FLASH_TOOLS } from './flash.js'
import { bindFlashTools, computeWidgetViewModel as computeModel } from './viewModel.js'

export * from './tierMath.js'
export * from './progress.js'
export * from './copy.js'
export * from './flash.js'
export * from './timeSale.js'
export { buildMixMatchRows, buildDisplayMixMatchItems, formatItemsChosen } from './siblings.js'
export { listedMixMatchItems } from './config.js'

export const computeWidgetViewModel = bindFlashTools({ computeModel, flashTools: FLASH_TOOLS })
