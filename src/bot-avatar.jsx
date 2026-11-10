import React, { useId } from 'react'
import { automaticEyeColor, botAppearanceSeed, botShapes, getBotAppearance } from './bot-appearance.mjs'
import { BotPortrait } from './bot-portrait.jsx'
import { resolveBotPortrait } from './bot-portraits.mjs'
import { Icon } from './icons.jsx'
import './bot-avatar.css'

function Eyes({ state, style }) {
  if (state === 'done') return <g className="bot-avatar-eyes" fill="none" stroke="currentColor" strokeWidth="3.3" strokeLinecap="round">
    <path d="M22 35q3-5 6 0m8 0q3-5 6 0" />
  </g>
  if (state === 'blocked') return <g className="bot-avatar-eyes" fill="none" stroke="currentColor" strokeWidth="3.3" strokeLinecap="round">
    <path d="m22 33 6 2m8 0 6-2" />
  </g>
  if (state === 'stopped') return <g className="bot-avatar-eyes" fill="none" stroke="currentColor" strokeWidth="3.1" strokeLinecap="round">
    <path d="M22 35h6m8 0h6" />
  </g>
  const [width, height] = style === 'round' ? [8, 8] : style === 'narrow' ? [4, 11] : [6, 10]
  return <g className="bot-avatar-eyes" fill="currentColor">
    {state === 'thinking' && <path d="m21 24 7 2m8 0 7-2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />}
    <rect className="bot-avatar-eye-open" x={25 - width / 2} y={34 - height / 2 - (state === 'waiting' ? 1 : 0)}
      width={width} height={height} rx={width / 2} />
    <rect className="bot-avatar-eye-open" x={39 - width / 2} y={34 - height / 2 + (state === 'waiting' ? 2 : 0)}
      width={width} height={height - (state === 'waiting' ? 2 : 0)} rx={width / 2} />
    {state === 'waiting' && <path d="M30 43q2-2 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
  </g>
}

const badgePaths = {
  waiting: 'M32 27v5m0 3v.1',
  blocked: 'm29.5 29.5 5 5m0-5-5 5',
  done: 'm29 32 2 2 4-4',
  stopped: 'M30 29v6m4-6v6',
}

export function BotFace({ bot, size = 'normal', state = 'idle', still = false }) {
  const gradient = useId()
  const { mode, portrait, portraitDesign, shape, bodyColor, eyeColor, eyeStyle } = getBotAppearance(bot)
  const person = mode === 'portrait' ? resolveBotPortrait(portrait, portraitDesign) : undefined
  const { path, eyeY } = botShapes[shape]
  const effectY = person ? 2 : eyeY ?? 0
  const shade = 'color-mix(in srgb, ' + bodyColor + ' 64%, #272031)'
  const light = 'color-mix(in srgb, ' + bodyColor + ' 56%, #fff8eb)'
  const autoInk = automaticEyeColor(bodyColor)
  const delay = (botAppearanceSeed(bot) % 4000) / 1000
  const badge = badgePaths[state]
  return <span className={'bot-avatar bot-avatar-' + size} data-bot-state={state} data-bot-still={still || undefined}
    data-bot-shape={mode === 'character' ? shape : undefined} data-bot-avatar-mode={mode}
    data-bot-portrait={person ? portrait : undefined}
    style={{ '--bot-base': person ? person.shirt[0] : bodyColor, '--bot-ink': eyeColor ?? autoInk, '--bot-outline': eyeColor ? autoInk : 'transparent',
      '--bot-delay': '-' + delay + 's' }} aria-hidden="true">
    {mode === 'photo' && <span className="bot-avatar-photo"><img src={bot.avatar} alt="" /></span>}
    <svg viewBox="0 0 64 64" focusable="false">
      <defs>
        <linearGradient id={gradient} x1="15%" y1="0%" x2="80%" y2="100%">
          <stop style={{ stopColor: light }} /><stop offset=".58" stopColor={bodyColor} /><stop offset="1" style={{ stopColor: shade }} />
        </linearGradient>
        {mode === 'character' && <clipPath id={gradient + '-shape'}><path d={path} /></clipPath>}
      </defs>
      {person && <BotPortrait portrait={person} state={state} still={still} />}
      <g className="bot-avatar-orbit" fill="none" strokeLinecap="round">
        <path d="M11 16a26 26 0 0 1 18-10m21 45a26 26 0 0 1-14 7" />
        <circle cx="54" cy="17" r="1.6" fill="currentColor" stroke="none" />
      </g>
      {mode === 'character' && <g className="bot-avatar-body">
        <path d={path} fill={`url(#${gradient})`} style={{ stroke: shade }} strokeOpacity=".28" strokeWidth="1.1" />
        <g clipPath={`url(#${gradient}-shape)`}>
          <path className="bot-avatar-highlight" d="M17 26c2-4 6-7 11-8" fill="none" stroke="#fff" strokeOpacity=".52" strokeWidth="2.3" strokeLinecap="round" />
          <g transform={eyeY ? `translate(0 ${eyeY})` : undefined}>
            <Eyes state={state} style={eyeStyle} />
            {state === 'idle' && !still && <ellipse className="bot-avatar-idle-mouth" cx="32" cy="43" rx="2.7" ry="2.1" />}
          </g>
        </g>
      </g>}
      {state === 'idle' && !still && <g className="bot-avatar-idle-effects">
        <path className="bot-avatar-idle-note" d="M49 8v11a3 3 0 1 1-2-2.8V7l10-3v4Z" />
        <g className="bot-avatar-gum">
          <circle cx="35" cy={42 + effectY} r="10" />
          <path d={`M29 ${41 + effectY}q1-4 5-5`} />
        </g>
        <path className="bot-avatar-gum-pop" d={`M24 ${35 + effectY}l-3-3m14 0v-4m10 7 4-3m-3 15 4 2`} />
      </g>}
      {state === 'thinking' && <g className="bot-avatar-idea">
        <g className="bot-avatar-bulb" strokeLinecap="round" strokeLinejoin="round">
          <path className="bot-avatar-bulb-rays" d="M48 1v1m10 3 2-2m0 10h3M36 13h-3m5-8-2-2" fill="none" />
          <path className="bot-avatar-bulb-glass" d="M44 21v-2c0-2-4-3-4-8a8 8 0 0 1 16 0c0 5-4 6-4 8v2Z" />
          <path className="bot-avatar-bulb-filament" d="m45 12 3 3 3-3m-3 3v5" fill="none" />
          <path className="bot-avatar-bulb-base" d="M44 21h8v1l-2 3h-4l-2-3Z" />
        </g>
        <g className="bot-avatar-bulb-shards">
          <path d="m42 8 4-3 1 6Z" />
          <path d="m51 6 4 3-4 4Z" />
          <path d="m43 14 5 2-3 4Z" />
          <path d="m50 16 5-2-1 6Z" />
        </g>
      </g>}
      {badge && <g className="bot-avatar-badge" transform="translate(17 17)">
        <circle cx="32" cy="32" r="8.3" />
        <path d={badge} fill="none" stroke="white" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" />
      </g>}
    </svg>
  </span>
}

export function GroupFace({ members, large = false }) {
  return <span className={large ? 'group-face group-face-large' : 'group-face'} aria-hidden="true">
    {members.length ? members.slice(0, 4).map(bot => <BotFace key={bot.id} bot={bot} size="small" still />)
      : <Icon name="group" size={large ? 19 : 17} />}
  </span>
}
