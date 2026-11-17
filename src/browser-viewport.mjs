// CSS viewport sizes from Chrome DevTools' EmulatedDevices.ts; no device emulation.
export const viewportPresets = [
  {id:'iphone-16',label:'iPhone 16 / 14 Pro',width:393,height:852},
  {id:'iphone-16-plus',label:'iPhone 16 Plus',width:430,height:932},
  {id:'iphone-16-pro',label:'iPhone 16 Pro',width:402,height:874},
  {id:'iphone-16-pro-max',label:'iPhone 16 Pro Max',width:440,height:956},
  {id:'pixel-7',label:'Pixel 7',width:412,height:915},
  {id:'galaxy-s8',label:'Galaxy S8+',width:360,height:740},
  {id:'galaxy-s20',label:'Galaxy S20 Ultra',width:412,height:915},
  {id:'galaxy-a55',label:'Galaxy A55',width:360,height:800},
]
export const viewportZooms = ['fit','50','75','100','125','150','200']
export function validViewportDimension(value) {
  return Number.isInteger(value) && value >= 200 && value <= 3840
}
export function browserViewport(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const width = validViewportDimension(value.width) ? value.width : 393
  const height = validViewportDimension(value.height) ? value.height : 852
  const preset = viewportPresets.find(p => p.id === (value.presetId ?? 'iphone-16'))
  const matches = preset && ((width === preset.width && height === preset.height) || (width === preset.height && height === preset.width))
  return {enabled:value.enabled === true,presetId:matches ? preset.id : 'custom',width,height,
    zoom:viewportZooms.includes(value.zoom) ? value.zoom : 'fit'}
}
export function updateBrowserViewport(browser, patch) {
  return {...browser,viewport:browserViewport({...browserViewport(browser.viewport),...patch})}
}
export function viewportLayout(settings, available) {
  const width = settings.enabled ? settings.width : Math.max(0,available.width)
  const height = settings.enabled ? settings.height : Math.max(0,available.height)
  const scale = !settings.enabled ? 1 : settings.zoom === 'fit'
    ? Math.max(.01,Math.min(1,available.width / width,available.height / height)) : Number(settings.zoom) / 100
  return {width,height,scale,scaledWidth:width * scale,scaledHeight:height * scale}
}
export function scaleViewportRect(rect, {left,top,scale}) {
  return {x:left + rect.x * scale,y:top + rect.y * scale,width:rect.width * scale,height:rect.height * scale}
}
