// The widget is a core script plus components, each its own script. A component registers its functions on one
// shared object of the page when it runs; the core waits for the ones it needs and adds the script of any
// that is not on the page yet. `root` is the page's window.
const REGISTRY_KEY = 'SparklyTierPricing'

/** A promise that something else settles: here, the component's script, when it runs or fails to load. */
class Deferred {
  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}

/** The page's shared object: the components that have registered, and the loads in progress. */
function readRegistry({ root }) {
  if (!root[REGISTRY_KEY]) root[REGISTRY_KEY] = { components: {}, deferreds: {} }
  return root[REGISTRY_KEY]
}

/** Adds the component's script to the page; a missing address or a script that cannot load rejects the load. */
function addScript({ document, url, deferred }) {
  if (!url) {
    deferred.reject(new Error('No address for the component'))
    return
  }
  const script = document.createElement('script')
  script.src = url
  script.async = true
  script.addEventListener('error', deferred.reject)
  document.head.appendChild(script)
}

/** Forgets a load that failed, so the next request for the component tries again (a flaky connection may be back). */
function removeFailedLoad({ registry, name }) {
  delete registry.deferreds[name]
}

const REGISTRY_STEPS = { readRegistry, addScript, removeFailedLoad }

/** The functions a component registered, or null while it has not. */
export function findComponent({ root, name }) {
  return REGISTRY_STEPS.readRegistry({ root }).components[name] || null
}

/** Called by a component's script when it runs: keeps its functions and answers whoever is waiting for it. */
export function registerComponent({ root, name, api }) {
  const registry = REGISTRY_STEPS.readRegistry({ root })
  registry.components[name] = api
  const deferred = registry.deferreds[name]
  if (deferred) deferred.resolve(api)
}

/** Resolves with the component's functions. The script is added once per name, however many widgets ask. */
export function loadComponent({ root, document, name, url }) {
  const registry = REGISTRY_STEPS.readRegistry({ root })
  if (registry.components[name]) return Promise.resolve(registry.components[name])
  if (!registry.deferreds[name]) {
    registry.deferreds[name] = new Deferred()
    registry.deferreds[name].promise.catch(REGISTRY_STEPS.removeFailedLoad.bind(null, { registry, name }))
    REGISTRY_STEPS.addScript({ document, url, deferred: registry.deferreds[name] })
  }
  return registry.deferreds[name].promise
}
