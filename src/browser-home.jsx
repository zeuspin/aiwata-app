import React from 'react'
import { tools } from './fixtures.mjs'
import { Icon, toolIcons } from './icons.jsx'
import { demoBrowser } from './tool-surfaces.mjs'

export function BrowserHome({ openTool, navigate, availableTools = tools }) {
  const recommended = ['无限画布', '生图工具', '修图工具'].filter(tool => availableTools.includes(tool))
  return <div className="tool-home">
    <div className="tool-title browser-home-heading"><h3>工具</h3>
      {navigate && <button type="button" className="tool-text-button" onClick={() => navigate(demoBrowser)}>演示站点</button>}</div>
    <div className="tool-launchers">{availableTools.filter(tool => tool !== '浏览器').map(tool =>
      <button type="button" key={tool} onClick={() => openTool(tool)}><Icon name={toolIcons[tool]} size={/* @ai-token sys.icon.size.17 */ 17} />{tool}</button>)}</div>
    {recommended.length > 0 && <>
      <h3 className="tool-section-title">推荐</h3>
      <div className="recommended">{recommended.map(tool =>
        <button type="button" key={tool} onClick={() => openTool(tool)}><span><Icon name={toolIcons[tool]} size={/* @ai-token sys.icon.size.24 */ 24} /></span>{tool}</button>)}</div>
    </>}
  </div>
}
