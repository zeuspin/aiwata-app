// Native deletion uses a fresh metadata token. Chat ownership must not change
// when that token gains a canonical session or advances settings revisions.
export function sameBotOwner(previous, current) {
  if (previous.profileIdentity && current.profileIdentity) return previous.profileIdentity === current.profileIdentity
  if (!previous.identity || !current.identity) return true
  if (!current.profileIdentity) return previous.identity === current.identity
  if (previous.profileIdentity) return previous.profileIdentity === current.profileIdentity
  try {
    const legacy = JSON.parse(previous.identity)
    return Array.isArray(legacy) && legacy.length >= 4 && JSON.stringify(legacy.slice(0, 4)) === current.profileIdentity
  } catch { return false }
}
