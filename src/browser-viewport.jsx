import React, {useId,useLayoutEffect,useRef,useState} from 'react'
import {IconButton} from './icons.jsx'
import {validViewportDimension,viewportLayout,viewportPresets,viewportZooms} from './browser-viewport.mjs'
import './browser-viewport.css'

export function BrowserViewportControls({settings,onChange}) {
  const errorId = useId()
  const [draft,setDraft] = useState(null)
  const [error,setError] = useState('')
  const key = settings.width + ':' + settings.height
  const values = draft?.key === key ? draft : {width:String(settings.width),height:String(settings.height)}
  function commit() {
    const width = Number(values.width),height = Number(values.height)
    if (!validViewportDimension(width) || !validViewportDimension(height)) {
      setError('宽高须为 200–3840 的整数（CSS 像素）'); return
    }
    setError('');setDraft(null)
    if (width !== settings.width || height !== settings.height) onChange({width,height,presetId:'custom'})
  }
  function change(patch) {setDraft(null);setError('');onChange(patch)}
  return <div className="browser-viewport-controls" role="group" aria-label="响应式预览设置">
    <select aria-label="预览设备型号" value={settings.presetId} onChange={event=>{
      const preset = viewportPresets.find(p=>p.id === event.target.value)
      if (preset) change({presetId:preset.id,width:preset.width,height:preset.height})
      else change({presetId:'custom'})
    }}>
      {viewportPresets.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
      <option value="custom">自定义</option>
    </select>
    <div className="browser-viewport-dimensions">
      {['width','height'].map((axis,index)=><React.Fragment key={axis}>
        {!!index && <span aria-hidden="true">×</span>}
        <input aria-label={index ? '预览高度' : '预览宽度'} type="number" min="200" max="3840" step="1"
          value={values[axis]} aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
          onChange={event=>setDraft({...values,key,[axis]:event.target.value})} onBlur={commit}
          onKeyDown={event=>{if(event.key === 'Enter'){event.preventDefault();commit()}if(event.key === 'Escape'){setDraft(null);setError('')}}} />
      </React.Fragment>)}
      <span className="browser-viewport-unit" title="网页视口尺寸，单位为 CSS 像素">px</span>
      <IconButton icon="rotate" label="切换横竖屏" onClick={()=>change({width:settings.height,height:settings.width})}/>
    </div>
    <select aria-label="预览缩放" value={settings.zoom} onChange={event=>onChange({zoom:event.target.value})}>
      {viewportZooms.map(zoom=><option key={zoom} value={zoom}>{zoom === 'fit' ? '适应窗口' : zoom + '%'}</option>)}
    </select>
    {error && <small id={errorId} role="alert">{error}</small>}
  </div>
}

// Always retain this DOM ancestry so resizing never replaces the native guest.
export function BrowserViewportFrame({settings,onGeometry,children}) {
  const stage = useRef(null),content = useRef(null),callback = useRef(onGeometry)
  callback.current = onGeometry
  const [size,setSize] = useState({width:0,height:0})
  const padding = settings.enabled ? 16 : 0
  const layout = viewportLayout(settings,{width:Math.max(0,size.width-padding*2),height:Math.max(0,size.height-padding*2)})
  useLayoutEffect(()=>{
    const element = stage.current
    let alive = true
    const measure = ()=>{if(alive)setSize(previous=>previous.width === element.clientWidth && previous.height === element.clientHeight
      ? previous : {width:element.clientWidth,height:element.clientHeight})}
    measure();const observer = new ResizeObserver(measure);observer.observe(element)
    return ()=>{alive=false;observer.disconnect()}
  },[])
  function geometry() {
    const outer = stage.current?.parentElement,inner = content.current
    if (!outer || !inner) return
    const a = outer.getBoundingClientRect(),b = inner.getBoundingClientRect()
    callback.current?.({left:b.left-a.left,top:b.top-a.top,scale:layout.scale})
  }
  useLayoutEffect(()=>{stage.current.scrollTo?.(0,0);geometry()},[layout.width,layout.height,layout.scale,settings.enabled,size.width,size.height])
  return <div ref={stage} className={'browser-viewport-stage' + (settings.enabled ? ' responsive' : '')} onScroll={geometry}>
    <div className="browser-viewport-extent" style={settings.enabled ? {width:layout.scaledWidth,height:layout.scaledHeight} : undefined}>
      <div ref={content} className="browser-viewport-content" style={settings.enabled
        ? {width:layout.width,height:layout.height,transform:`scale(${layout.scale})`} : undefined}>{children}</div>
    </div>
  </div>
}
