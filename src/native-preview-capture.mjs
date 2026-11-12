// capturePreview crops a Retina bitmap, whereas the overlay supplies CSS pixels.
// Keep the original host's viewport contract instead of guessing device scale.
export async function captureNativePreview(host, view, execute, rect) {
  const zoom=view.getZoomFactor()
  const viewport=await execute(view,'({width:innerWidth,height:innerHeight})')
  return host.capturePreview({ webContentsId:view.getWebContentsId(),
    rect:{x:rect.x/zoom,y:rect.y/zoom,width:rect.width/zoom,height:rect.height/zoom},viewport })
}
