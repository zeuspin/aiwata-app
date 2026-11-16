import { botPortraits, getPortraitDesign } from './bot-portraits.mjs'
import { getPeekingDesign } from './bot-peeking.mjs'

// Silhouette vocabulary follows AIWATA Desktop's New Bot picker.
export const botShapes = {
  round: { label: '圆形', path: 'M32 11a21 21 0 1 1 0 42 21 21 0 1 1 0-42Z' },
  organic: { label: '软团', path: 'M14 22c5-11 15-14 23-10 5 3 9 1 13 6 5 6 1 12 4 18 3 8-2 17-12 18-8 1-11-3-18-2-10 1-16-6-15-15 1-5 3-10 5-15Z' },
  boxy: { label: '方形', path: 'M23 11h18c9 0 13 4 13 13v17c0 8-5 13-13 13H23c-8 0-13-5-13-13V24c0-9 4-13 13-13Z' },
  capsule: { label: '胶囊', path: 'M23 16h18a16 16 0 0 1 0 32H23a16 16 0 0 1 0-32Z', eyeY: -1 },
  nub: { label: '小芽', path: 'M16 24c4-4 8-6 14-6-4-5-1-10 3-10 5 0 8 5 6 10 10 2 16 8 16 18 0 11-8 17-22 17S10 47 10 36c0-5 2-9 6-12Z', eyeY: 2 },
  cloud: { label: '云朵', path: 'M16 23c1-6 6-10 12-8 4-7 16-5 20 4 7 0 11 5 11 12 0 6-4 10-9 12-3 7-10 9-17 6-6 4-15 2-18-4C8 45 4 40 4 33c0-6 5-10 12-10Z', eyeY: 1 },
  droplet: { label: '水滴', path: 'M28 12c2-3 6-3 8 0 7 9 16 17 16 27 0 10-8 16-20 16s-20-6-20-16c0-10 9-18 16-27Z', eyeY: 4 },
  hexagon: { label: '六边形', path: 'M28 12q4-3 8 0l15 9q4 2 4 7v10q0 5-4 7l-15 9q-4 3-8 0l-15-9q-4-2-4-7V28q0-5 4-7Z' },
  sun: { label: '太阳', path: 'M32 8c4 0 5 5 8 6s7-2 10 1 0 7 1 10 5 4 5 7-4 5-5 8 2 7-1 10-7 0-10 1-4 5-8 5-5-4-8-5-7 2-10-1 0-7-1-10-5-4-5-8 4-5 5-8-2-7 1-10 7 0 10-1 4-5 8-5Z' },
  triangle: { label: '三角形', path: 'M26 14q6-9 12 0l17 28c4 6 0 11-7 11H16c-7 0-11-5-7-11Z', eyeY: 4 },
}

export const botBodyColors = [
  ['蜜橘', '#ed774c'], ['雾紫', '#9e86e1'], ['青玉', '#4aa998'], ['湖蓝', '#689edc'],
  ['琥珀', '#d5a358'], ['莓粉', '#d47c9b'], ['薄荷', '#90ba73'], ['石墨', '#5f687a'],
]

export const botEyeColors = [
  ['墨黑', '#2b202e'], ['奶白', '#fff5dd'], ['琥珀', '#f4b344'],
  ['湖蓝', '#244d9d'], ['翡翠', '#155f52'], ['紫罗兰', '#6e2a94'],
]

export const botEyeStyles = { pill: '椭圆眼', round: '圆眼', narrow: '细长眼' }

const shapeNames = Object.keys(botShapes)
const seeded = { editor: ['boxy', 0], designer: ['cloud', 1], researcher: ['droplet', 2] }

export function botAppearanceSeed(bot) {
  let hash = 2166136261
  for (const char of bot.id || bot.profile || 'new') hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0
  return hash
}

function validColor(color) {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null
}

export function getBotAppearance(bot) {
  const id = bot.id || bot.profile
  const hash = botAppearanceSeed(bot)
  const [shape, index] = Object.hasOwn(seeded, id) ? seeded[id]
    : [shapeNames[hash % shapeNames.length], Math.floor(hash / shapeNames.length) % botBodyColors.length]
  const saved = bot.appearance
  const primaryFallback = bot.isDefault && !saved
  const portrait = Object.hasOwn(botPortraits, saved?.portrait) ? saved.portrait : undefined
  return {
    mode: saved?.mode === 'peeking' ? 'peeking' : portrait && saved?.mode === 'portrait' ? 'portrait'
      : bot.avatar && saved?.mode !== 'character' ? 'photo' : 'character',
    ...(portrait ? { portrait } : {}),
    ...(portrait && saved.portraitDesign ? { portraitDesign: getPortraitDesign(portrait, saved.portraitDesign) } : {}),
    ...(saved?.peekingDesign || saved?.mode === 'peeking' ? { peekingDesign: getPeekingDesign(saved?.peekingDesign) } : {}),
    shape: Object.hasOwn(botShapes, saved?.shape) ? saved.shape : primaryFallback ? 'boxy' : shape,
    bodyColor: validColor(saved?.bodyColor) ?? (primaryFallback ? '#141414' : botBodyColors[index][1]),
    eyeColor: validColor(saved?.eyeColor) ?? (primaryFallback ? '#ffffff' : null),
    eyeStyle: Object.hasOwn(botEyeStyles, saved?.eyeStyle) ? saved.eyeStyle : 'pill',
  }
}

export function automaticEyeColor(bodyColor) {
  const channels = bodyColor.slice(1).match(/../g).map(hex => {
    const rgb = parseInt(hex, 16) / 255
    return rgb <= .04045 ? rgb / 12.92 : ((rgb + .055) / 1.055) ** 2.4
  })
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .2 ? '#261f28' : '#fff7ec'
}
