// Serializable part IDs only: SVG geometry is owned by bot-peeking-art.mjs.
const hair = (label, group, front, back, anchor = [77, 14]) => ({ label, group, front, back, anchor,
  slots: ['clip', 'band', ...(['盘发', '束发'].includes(group) ? ['pin', 'tie'] : ['cap'])] })

export const peekingHair = {
  messyBun: hair('蓬松盘发', '盘发', 'sweep', 'messyBun'),
  smoothBun: hair('光洁高髻', '盘发', 'smooth', 'smoothBun'),
  doubleBun: hair('双丸子', '盘发', 'curtain', 'doubleBun', [78, 12]),
  lowBun: hair('低挽发髻', '盘发', 'side', 'lowBun', [85, 61, 75]),
  loopBun: hair('环形发髻', '盘发', 'wave', 'loopBun'),
  braidedBun: hair('编辫盘发', '盘发', 'braided', 'braidedBun'),
  highPony: hair('高马尾', '束发', 'sweep', 'highPony', [83, 14]),
  lowPony: hair('低马尾', '束发', 'side', 'lowPony', [86, 59, 65]),
  sidePony: hair('侧束马尾', '束发', 'curtain', 'sidePony', [87, 31]),
  twinPony: hair('双马尾', '束发', 'blunt', 'twinPony', [84, 29]),
  halfUp: hair('半扎长发', '束发', 'wave', 'halfUp', [83, 18]),
  knotPony: hair('竹节束发', '束发', 'smooth', 'knotPony', [85, 19]),
  bob: hair('微翘短发', '波波头', 'sweep', 'bob'),
  bluntBob: hair('齐刘海短发', '波波头', 'blunt', 'bluntBob'),
  wavyBob: hair('卷边波波头', '波波头', 'wave', 'wavyBob'),
  asymBob: hair('不对称短发', '波波头', 'asym', 'asymBob'),
  pixie: hair('精灵短发', '波波头', 'pixie', 'pixie'),
  mushroom: hair('蘑菇短发', '波波头', 'bowl', 'mushroom'),
  sidePart: hair('利落侧分', '利落短发', 'side', 'short'),
  quiff: hair('蓬松飞机头', '利落短发', 'quiff', 'quiff'),
  crop: hair('法式短寸', '利落短发', 'crop', 'crop'),
  spikes: hair('碎刺短发', '利落短发', 'spikes', 'spikes'),
  curlyCrop: hair('短卷发', '利落短发', 'curly', 'curlyCrop'),
  slickBack: hair('后梳短发', '利落短发', 'smooth', 'slickBack'),
  longWaves: hair('长波浪', '披发', 'wave', 'longWaves'),
  longStraight: hair('中分长直发', '披发', 'curtain', 'longStraight'),
  layeredLong: hair('层次长发', '披发', 'sweep', 'layeredLong'),
  wolfCut: hair('狼尾层次', '披发', 'spikes', 'wolfCut'),
  sideWaves: hair('侧分大波浪', '披发', 'asym', 'sideWaves'),
  hime: hair('姬式长发', '披发', 'blunt', 'hime'),
  twinBraids: hair('双麻花辫', '编发', 'curtain', 'twinBraids'),
  sideBraid: hair('侧麻花辫', '编发', 'side', 'sideBraid'),
  crownBraid: hair('环绕编发', '编发', 'braided', 'crownBraid'),
  ropeBraids: hair('双股绳辫', '编发', 'smooth', 'ropeBraids'),
  afro: { ...hair('圆蓬卷发', '蓬松卷发', 'curly', 'afro'), slots: ['clip', 'band'] },
  corkscrew: hair('螺旋长卷', '蓬松卷发', 'curly', 'corkscrew'),
}

const headwear = (label, group, slot) => ({ label, group, slot })
export const peekingHeadwear = {
  none: headwear('无头饰', '无头饰', 'none'),
  guanjin: headwear('诸葛纶巾', '东方巾冠', 'cap'),
  scholar: headwear('书生方巾', '东方巾冠', 'cap'),
  dongpo: headwear('东坡巾灵感', '东方巾冠', 'cap'),
  rujin: headwear('折角儒巾', '东方巾冠', 'cap'),
  lotusCrown: headwear('莲瓣束发冠', '东方巾冠', 'pin'),
  daoCrown: headwear('小道冠', '东方巾冠', 'pin'),
  jadePin: headwear('玉簪流苏', '簪钗', 'pin'),
  bambooPin: headwear('竹簪', '簪钗', 'pin'),
  woodPin: headwear('素木簪', '簪钗', 'pin'),
  cloudPin: headwear('如意云簪', '簪钗', 'pin'),
  phoenixPin: headwear('飞羽钗', '簪钗', 'pin'),
  pearlPin: headwear('珍珠步摇', '簪钗', 'pin'),
  flowerPin: headwear('梅花簪', '簪钗', 'pin'),
  ginkgoPin: headwear('银杏钗', '簪钗', 'pin'),
  doublePin: headwear('交叉双簪', '簪钗', 'pin'),
  moonPin: headwear('弯月簪', '簪钗', 'pin'),
  silkRibbon: headwear('长尾丝带', '丝带发带', 'tie'),
  redRibbon: headwear('结绳发绳', '丝带发带', 'tie'),
  wideRibbon: headwear('宽绸蝴蝶结', '丝带发带', 'tie'),
  knottedBand: headwear('打结发带', '丝带发带', 'band'),
  jadeBand: headwear('玉扣抹额', '丝带发带', 'band'),
  braidedBand: headwear('编织发带', '丝带发带', 'band'),
  barClip: headwear('一字发夹', '发夹', 'clip'),
  starClip: headwear('星星发夹', '发夹', 'clip'),
  moonClip: headwear('月牙发夹', '发夹', 'clip'),
  leafClip: headwear('叶片发夹', '发夹', 'clip'),
  doubleClip: headwear('双排发夹', '发夹', 'clip'),
  beret: headwear('贝雷帽', '现代帽饰', 'cap'),
  beanie: headwear('针织帽', '现代帽饰', 'cap'),
  baseball: headwear('棒球帽', '现代帽饰', 'cap'),
  bucket: headwear('渔夫帽', '现代帽饰', 'cap'),
  straw: headwear('宽檐草帽', '现代帽饰', 'cap'),
}

const palette = rows => Object.fromEntries(rows.map(([id, label, ...colors]) => [id, { label, colors }]))
export const peekingPalettes = {
  hairColor: palette([
    ['brown', '深棕', '#302119', '#62402c'], ['ink', '墨黑', '#151c23', '#35434e'],
    ['chestnut', '栗棕', '#38221d', '#754932'], ['copper', '赤铜', '#592b20', '#954b32'],
    ['teal', '青墨', '#153536', '#35615d'], ['navy', '深蓝', '#1b2841', '#43567b'],
    ['wine', '葡萄酒', '#452438', '#794759'], ['plum', '紫棕', '#32263e', '#62506e'],
    ['silver', '银灰', '#b1adbf', '#e2dfeb'], ['pearl', '珍珠白', '#cbc6d1', '#eee9ef'],
    ['blonde', '蜜金', '#b99150', '#edc47e'], ['flax', '亚麻金', '#c4ac7c', '#ecdbb1'],
    ['rose', '玫瑰粉', '#ce809d', '#f0b0c4'], ['lilac', '浅藤紫', '#aa97c5', '#d7c7eb'],
    ['mint', '浅薄荷', '#96b8a5', '#c5e2cf'], ['sky', '雾蓝', '#94aeca', '#c9d9ec'],
  ]),
  headwearColor: palette([
    ['ink', '玄墨', '#252b3a', '#54627e'], ['jade', '青玉', '#27564b', '#4d8470'],
    ['wine', '绛红', '#602e42', '#9b5368'], ['copper', '赭石', '#77432e', '#a96a42'],
    ['navy', '靛青', '#273957', '#506c93'], ['plum', '紫檀', '#503751', '#866183'],
    ['gold', '暖金', '#c59a4b', '#efcb80'], ['ivory', '月白', '#d6c8ac', '#f4e7cf'],
    ['celadon', '粉青', '#a7c6ad', '#d7e6ce'], ['silver', '银白', '#b8b9c9', '#e8e7ef'],
    ['rose', '藕粉', '#c898a4', '#ebc2cc'], ['sky', '天青', '#9ebbd0', '#d3e4ec'],
  ]),
  skin: palette([
    ['apricot', '暖杏', '#efb98c', '#d19468', '#e79a7a'], ['peach', '蜜桃', '#f1c6ad', '#d3a084', '#e8a096'],
    ['ivory', '柔象牙', '#f3dac2', '#d5b99c', '#e8b2a2'], ['honey', '浅蜜', '#dfa974', '#bc8255', '#d78d71'],
    ['wheat', '小麦', '#d49b70', '#af744f', '#d8896d'], ['caramel', '焦糖', '#bb8059', '#945b3d', '#cc816c'],
    ['cocoa', '可可', '#975f47', '#754532', '#ba7765'], ['umber', '暖深棕', '#754936', '#593425', '#a66c5b'],
    ['rose', '玫棕', '#ba836d', '#95634f', '#cf8b7e'], ['sand', '暖沙', '#e2ba91', '#be926c', '#df9a84'],
  ]),
  background: palette([
    ['charcoal', '炭黑', '#1b1c22'], ['navy', '夜蓝', '#202c40'], ['pine', '松针', '#223c33'],
    ['wine', '暗梅', '#3d2939'], ['plum', '深紫', '#302a42'], ['coffee', '咖啡', '#392d28'],
    ['ivory', '暖象牙', '#eee1cb'], ['sage', '鼠尾草', '#cedcc5'], ['peach', '浅桃', '#f0d3c0'],
    ['lilac', '浅丁香', '#ded2e8'], ['sky', '晴空', '#cdddea'], ['mint', '薄荷', '#cee3d9'],
  ]),
  clothing: palette([
    ['ivory', '奶白', '#eee4d5', '#cfc3b2'], ['jade', '青玉', '#477768', '#2e554a'],
    ['rust', '陶红', '#b4684e', '#8a4937'], ['navy', '藏蓝', '#506581', '#34465e'],
    ['lilac', '雾紫', '#b0a0c9', '#84779d'], ['rose', '豆沙', '#c88d9b', '#9c6575'],
    ['gold', '姜黄', '#d4ad69', '#a68044'], ['gray', '石墨', '#727e8a', '#4d5864'],
    ['mint', '浅绿', '#a8c8b1', '#799b85'], ['sky', '灰蓝', '#a5bdce', '#7792a6'],
  ]),
}

export const peekingFields = {
  hair: { label: '发型', options: peekingHair },
  headwear: { label: '头饰', options: peekingHeadwear },
  hairColor: { label: '发色', options: peekingPalettes.hairColor },
  headwearColor: { label: '头饰颜色', options: peekingPalettes.headwearColor },
  skin: { label: '肤色', options: peekingPalettes.skin },
  face: { label: '脸型', options: { oval: { label: '鹅蛋脸' }, round: { label: '圆脸' }, long: { label: '长脸' }, softSquare: { label: '柔方脸' } } },
  eyewear: { label: '眼镜', options: { none: { label: '无眼镜' }, round: { label: '圆框' }, oval: { label: '椭圆框' }, square: { label: '方框' }, browline: { label: '眉线框' }, rimless: { label: '无框' } } },
  earrings: { label: '耳饰', options: { none: { label: '无耳饰' }, hoops: { label: '金色圆环' }, silverHoops: { label: '银色圆环' }, pearl: { label: '珍珠耳钉' }, jade: { label: '玉石耳坠' }, studs: { label: '金色耳钉' }, drop: { label: '水滴耳坠' } } },
  clothing: { label: '衣服颜色', options: peekingPalettes.clothing },
  background: { label: '背景', options: peekingPalettes.background },
}

const defaults = { hair: 'messyBun', headwear: 'none', hairColor: 'brown', headwearColor: 'ink',
  skin: 'apricot', face: 'oval', eyewear: 'none', earrings: 'hoops', clothing: 'ivory', background: 'charcoal' }

export function canWearHeadwear(hairId, headwearId) {
  if (!Object.hasOwn(peekingHair, hairId) || !Object.hasOwn(peekingHeadwear, headwearId)) return false
  return headwearId === 'none' || peekingHair[hairId].slots.includes(peekingHeadwear[headwearId].slot)
}

export function getPeekingDesign(raw) {
  const result = Object.fromEntries(Object.entries(peekingFields).map(([field, { options }]) =>
    [field, Object.hasOwn(options, raw?.[field]) ? raw[field] : defaults[field]]))
  if (!canWearHeadwear(result.hair, result.headwear)) result.headwear = 'none'
  return result
}

export function updatePeekingDesign(raw, field, value) {
  const design = getPeekingDesign(raw)
  if (!Object.hasOwn(peekingFields, field) || !Object.hasOwn(peekingFields[field].options, value)) return design
  if (field === 'headwear' && !canWearHeadwear(design.hair, value)) return design
  return getPeekingDesign({ ...design, [field]: value })
}

function luminance(color) {
  return color.slice(1).match(/../g).reduce((sum, hex, index) => {
    const channel = parseInt(hex, 16) / 255
    return sum + (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index]
  }, 0)
}

function contrast(colors, background) {
  const bg = luminance(background)
  return colors.every(color => {
    const fg = luminance(color)
    return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) >= 3
  })
}

export function randomPeekingBatch({ design: raw, locked = [], count = 10, rng = Math.random } = {}) {
  const base = getPeekingDesign(raw)
  const requested = Number.isFinite(count) ? Math.min(50, Math.max(0, Math.floor(count))) : 10
  if (!requested) return []
  const locks = new Set(locked.filter(field => Object.hasOwn(peekingFields, field)))
  if (locks.size === Object.keys(peekingFields).length) return [base]
  const pick = values => values[Math.min(values.length - 1, Math.max(0, Math.floor(rng() * values.length)))]
  const shuffle = values => {
    const items = [...values]
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items
  }
  const hairs = locks.has('hair') ? [base.hair] : shuffle(Object.keys(peekingHair).filter(id =>
    !locks.has('headwear') || canWearHeadwear(id, base.headwear)))
  const headwears = shuffle(Object.keys(peekingHeadwear))
  const results = [], seen = new Set()
  for (let attempt = 0; results.length < requested && attempt < requested * 30; attempt++) {
    const item = Object.fromEntries(Object.entries(peekingFields).map(([field, { options }]) =>
      [field, locks.has(field) ? base[field] : pick(Object.keys(options))]))
    item.hair = hairs[attempt % hairs.length]
    const compatible = headwears.filter(id => canWearHeadwear(item.hair, id))
    item.headwear = locks.has('headwear') ? base.headwear : compatible[attempt % compatible.length]
    if (!locks.has('background') && locks.has('hairColor')) {
      const backgrounds = Object.keys(peekingPalettes.background).filter(id =>
        contrast(peekingPalettes.hairColor[item.hairColor].colors, peekingPalettes.background[id].colors[0]))
      item.background = pick(backgrounds)
    }
    const bg = peekingPalettes.background[item.background].colors[0]
    if (!locks.has('hairColor')) item.hairColor = pick(Object.keys(peekingPalettes.hairColor).filter(id =>
      contrast(peekingPalettes.hairColor[id].colors, bg)))
    if (!locks.has('headwearColor')) item.headwearColor = pick(Object.keys(peekingPalettes.headwearColor).filter(id =>
      contrast(peekingPalettes.headwearColor[id].colors, bg)))
    const key = JSON.stringify(item)
    if (!seen.has(key)) { seen.add(key); results.push(item) }
  }
  return results
}

export const peekingPresets = [
  ['原样盘发', { hair: 'messyBun' }],
  ['纶巾智士', { hair: 'sidePart', headwear: 'guanjin', hairColor: 'ink', background: 'sage', earrings: 'none' }],
  ['方巾书生', { hair: 'pixie', headwear: 'scholar', hairColor: 'silver', background: 'charcoal', skin: 'wheat', earrings: 'none', clothing: 'navy' }],
  ['玉簪才女', { hair: 'loopBun', headwear: 'jadePin', hairColor: 'teal', headwearColor: 'celadon', background: 'peach', skin: 'wheat', earrings: 'jade', clothing: 'jade' }],
  ['竹簪文士', { hair: 'smoothBun', headwear: 'bambooPin', hairColor: 'navy', headwearColor: 'gold', background: 'ivory', skin: 'caramel', earrings: 'none', clothing: 'rust' }],
  ['锦带束发', { hair: 'highPony', headwear: 'silkRibbon', hairColor: 'wine', headwearColor: 'ivory', background: 'mint', earrings: 'studs' }],
  ['粉玫短发', { hair: 'bob', headwear: 'barClip', hairColor: 'rose', headwearColor: 'gold', earrings: 'pearl' }],
  ['蜜金圆镜', { hair: 'curlyCrop', hairColor: 'blonde', eyewear: 'round', earrings: 'none', background: 'wine', skin: 'honey' }],
  ['青墨侧分', { hair: 'quiff', hairColor: 'teal', earrings: 'pearl', background: 'ivory', skin: 'cocoa', clothing: 'gray' }],
  ['银灰长波', { hair: 'longWaves', hairColor: 'silver', headwear: 'moonClip', headwearColor: 'plum', earrings: 'studs', background: 'pine', clothing: 'lilac' }],
  ['栗棕双辫', { hair: 'twinBraids', hairColor: 'chestnut', headwear: 'knottedBand', headwearColor: 'wine', earrings: 'pearl', background: 'lilac', skin: 'cocoa', clothing: 'rose' }],
].map(([label, design]) => ({ label, design: getPeekingDesign(design) }))
