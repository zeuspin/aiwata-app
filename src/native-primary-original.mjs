// Loaded ONLY through the native entry. These helpers do not bootstrap another
// renderer, install styles, mount providers or connect a gateway.
export { resolveDeepLinkAction } from '@/lib/deeplink-routes'
export { pathFromHermesDeepLink } from '@/lib/hermes-open-target'
export { parseMcpInstallDeepLink, MCP_DEEPLINK_NAME_RE } from '@/lib/mcp-deeplink'
export { inspectAgentPlugin, installAgentPlugin } from '@/store/agent-plugins'
export { lookupPluginCatalogEntry } from '@/lib/plugin-catalog'
export * as updates from '@/store/updates'

export { NativePetSurface } from './native-pet-surface.jsx'

export { $petReaction as petReaction } from '@/store/pet-overlay'
export { $petPluginMessages as petPluginMessages } from '@/store/pet-plugin-messages'

export { copyTextThroughSelection } from '@hermes/shared/clipboard-selection'
