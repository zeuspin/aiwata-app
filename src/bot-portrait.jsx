import React, { useId } from 'react'

const faces = {
  oval: 'M24 41C24 26 34 19 50 19S76 28 76 42L74 59C71 72 63 81 51 82 39 82 27 74 25 60Z',
  round: 'M22 43C22 29 34 21 50 21 66 21 78 31 78 46L76 61C73 74 62 81 50 81 36 81 25 73 23 60Z',
  square: 'M24 38C25 26 34 20 50 20 66 20 75 27 76 40L75 62Q73 74 61 80L50 83 39 80Q27 75 25 63Z',
  long: 'M25 40C26 26 36 19 50 19 66 19 74 28 75 41L73 62C70 76 61 84 50 85 39 83 29 75 26 62Z',
}

const beanEye = 'M-.5-9C2.5-9.6 4.4-7.7 4.5-4.8 4.7-1 4.4 2.7 3.6 5.9 2.9 8.8.5 9.9-1.8 8.9-4.1 8-4.8 5.9-4.5 3.2L-3.9-4.6C-3.6-7.1-2.5-8.6-.5-9Z'

export function BotPortrait({ portrait, state, still }) {
  const clip = useId()
  const face = faces[portrait.face]
  const [skin, shade, blush] = portrait.skin
  const [hair, middle, highlight] = portrait.hair
  const [shirt, collar] = portrait.shirt
  const eyeColor = portrait.eyeColor ?? '#211d1e'

  return <g transform="scale(.64)">
    <defs><clipPath id={clip}><rect x="3" y="3" width="94" height="94" rx="22" /></clipPath></defs>
    <g clipPath={`url(#${clip})`}>
      <rect data-portrait-layer="background" width="100" height="100" fill={portrait.background ?? '#1b1c22'} />
      <g data-portrait-layer="clothing">
        <path d="M8 100C12 87 26 83 39 80H61C76 83 90 88 94 100Z" fill={shirt} />
        <path d="M30 83Q50 99 70 83L75 85Q50 105 24 86Z" fill={collar} />
      </g>
      <path data-portrait-layer="neck" d="M41 71H59L63 84Q50 93 37 84Z" fill={shade} />
      <g className="bot-portrait-head" data-portrait-layer="head">
        <g transform={`rotate(${portrait.angle} 50 52)`}>
          <path data-portrait-layer="hair-back" d={portrait.back} fill={hair} />
          <g data-portrait-layer="ears" fill={shade}>
            <ellipse cx="25" cy="55" rx="6" ry="9" />
            <ellipse cx="75" cy="55" rx="6" ry="9" />
          </g>
          <g data-portrait-layer="face">
            <path d={face} fill={skin} />
            <path d="M65 28Q78 36 75 53 74 72 62 78 70 68 70 50 71 38 65 28Z" fill={shade} opacity=".52" />
          </g>
          {portrait.accessory === 'stubble' && <path d="M29 64Q33 75 50 76 67 75 72 64L70 72Q61 83 50 83 36 81 30 73Z" fill={shade} opacity=".6" />}
          <g data-portrait-layer="blush" fill={blush} opacity=".8">
            <ellipse cx="34" cy="63" rx="6" ry="3.1" />
            <ellipse cx="66" cy="63" rx="6" ry="3.1" />
          </g>
          <g data-portrait-layer="hair-front">
            <path d={portrait.front} fill={middle} />
            <path d={portrait.sheen} fill={highlight} />
          </g>
          {portrait.accessory === 'hoops' && <path d="M22 63c-4 7 4 10 6 3m45-2c-2 8 6 9 7 1" fill="none" stroke="#e1b56f" strokeWidth="2.2" strokeLinecap="round" />}
          {portrait.accessory === 'studs' && <g fill="#e1be83"><circle cx="23" cy="62" r="1.7" /><circle cx="77" cy="62" r="1.7" /></g>}
          {portrait.accessory === 'freckles' && <path data-portrait-layer="freckles" d="M30 62h.1m3-2h.1m3 3h.1m28 0h.1m3-3h.1m3 2h.1" stroke={shade} strokeWidth="1.65" strokeLinecap="round" />}
          <g className="bot-avatar-eyes bot-portrait-eyes" fill={eyeColor} data-portrait-layer="bean-eyes">
            <path data-portrait-layer="eye-left" d={beanEye} transform="translate(40 54) rotate(4)" />
            <path data-portrait-layer="eye-right" d={beanEye} transform="translate(60 54) rotate(-4)" />
            {state === 'thinking' && <path data-portrait-layer="brows" d="m35 40 8 2m14 0 8-2" fill="none" stroke={eyeColor} strokeWidth="2.1" strokeLinecap="round" />}
          </g>
          {portrait.accessory === 'glasses' && <g data-portrait-layer="glasses" fill="none" stroke="#604232" strokeWidth="1.8">
            <circle cx="40" cy="54" r="11" /><circle cx="60" cy="54" r="11" /><path d="M49 53q1-2 2 0m-23-3-5-2m49 2 5-2" />
          </g>}
          {state === 'idle' && !still && <ellipse className="bot-avatar-idle-mouth" data-portrait-layer="mouth" cx="50" cy="68" rx="2.2" ry="1.7" fill="#211d1e" />}
        </g>
      </g>
    </g>
  </g>
}
