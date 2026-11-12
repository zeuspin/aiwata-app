import React, { useId } from 'react'
import { getPeekingDesign, peekingHair, peekingHeadwear, peekingPalettes } from './bot-peeking.mjs'
import { peekingBackArt, peekingFaceArt, peekingFrontArt, peekingHeadwearArt } from './bot-peeking-art.mjs'

const bean = 'M0-8C3-8 4-6 4-3L4 4Q4 9 0 9T-4 4V-3Q-4-8 0-8Z'

function ColoredPart({ art, colors, layer }) {
  return <g data-peeking-layer={layer}>
    {art.base && <path d={art.base} fill={colors[0]} />}
    {art.highlight && <path d={art.highlight} fill={colors[1]} />}
    {art.trim && <path d={art.trim} fill={colors[1]} />}
  </g>
}

function Eyewear({ type }) {
  if (type === 'none') return null
  const color = type === 'rimless' ? '#8c8582' : '#3b3034'
  return <g data-peeking-layer="eyewear" fill="none" stroke={color} strokeWidth={type === 'rimless' ? .65 : 1.6} strokeLinecap="round" strokeLinejoin="round">
    {type === 'square' ? <><rect x="27" y="39" width="23" height="21" rx="4" /><rect x="51" y="39" width="23" height="21" rx="4" /></>
      : type === 'oval' ? <><ellipse cx="38.5" cy="49" rx="12" ry="9" /><ellipse cx="62.5" cy="49" rx="12" ry="9" /></>
        : <><circle cx="38.5" cy="49" r="11.5" /><circle cx="62.5" cy="49" r="11.5" /></>}
    <path d="M49 48q1.5-2 3 0M26 46l-5-3m54 3 5-3" />
    {type === 'browline' && <path d="M27 44q11-12 23 0m1 0q11-12 23 0" strokeWidth="3" />}
  </g>
}

function Earrings({ type }) {
  if (type === 'none') return null
  const gold = type === 'silverHoops' ? '#d3d7df' : '#e4bd73'
  return <g data-peeking-layer="earrings">
    {[22, 78].map(x => <g key={x} transform={`translate(${x} 62)`}>
      {['hoops', 'silverHoops'].includes(type) ? <><ellipse cx="0" cy="3" rx="2.1" ry="3.2" fill="none" stroke={gold} strokeWidth="1.8" /><path d="M-1-1q-2 2-1 4" fill="none" stroke="#f5dfa4" strokeWidth=".7" /></>
        : type === 'pearl' ? <><circle r="1.9" fill="#f4e6ce" /><circle cx="-.5" cy="-.5" r=".55" fill="#fff8ef" /></>
          : type === 'studs' ? <circle r="1.7" fill={gold} />
            : <><circle r="1" fill={gold} /><path d="M0 1v2" stroke={gold} strokeWidth=".8" />
              <path d="M0 3Q-4 8 0 9 4 8 0 3Z" fill={type === 'jade' ? '#8ebda5' : '#b5c9e1'} /></>}
    </g>)}
  </g>
}

export function PeekingPortrait({ design: raw, state = 'idle', still = false }) {
  const clip = useId(), faceClip = useId()
  const design = getPeekingDesign(raw)
  const hairstyle = peekingHair[design.hair]
  const headwear = peekingHeadwear[design.headwear]
  const ornament = peekingHeadwearArt[design.headwear]
  const hairColors = peekingPalettes.hairColor[design.hairColor].colors
  const ornamentColors = peekingPalettes.headwearColor[design.headwearColor].colors
  const [skin, shade, blush] = peekingPalettes.skin[design.skin].colors
  const [shirt, collar] = peekingPalettes.clothing[design.clothing].colors
  const face = peekingFaceArt[design.face]
  const anchor = ['pin', 'tie'].includes(headwear.slot) ? hairstyle.anchor : headwear.slot === 'clip' ? [80, 34, -20] : [0, 0, 0]
  const mounted = `translate(${anchor[0]} ${anchor[1]}) rotate(${anchor[2] ?? 0})`
  return <g transform="scale(.64)" data-peeking-hair={design.hair} data-peeking-headwear={design.headwear}>
    <defs>
      <clipPath id={clip}><rect x="3" y="3" width="94" height="94" rx="20" /></clipPath>
      <clipPath id={faceClip}><path d={face} /></clipPath>
    </defs>
    <g clipPath={`url(#${clip})`}>
      <rect data-peeking-layer="background" width="100" height="100" fill={peekingPalettes.background[design.background].colors[0]} />
      <g transform="translate(-2 1) rotate(15 50 50)">
        <g className="bot-portrait-head">
          <ColoredPart layer="hair-back" art={peekingBackArt[hairstyle.back]} colors={hairColors} />
          {ornament.rear && <path data-peeking-layer="headwear-back" d={ornament.rear} fill={ornamentColors[0]} />}
          <g data-peeking-layer="shoulder">
            <path d="M-22 106Q-18 80 19 77L45 83 61 107Z" fill={shirt} />
            <path d="M1 81Q15 90 24 108H17Q10 91-4 84Z" fill={collar} />
          </g>
          <path data-peeking-layer="neck" d="M34 69H64L62 86 64 106 26 105 27 91Z" fill={skin} />
          <path d="M34 73 64 76 62 85Q42 96 28 85Z" fill={shade} />
          <g data-peeking-layer="ears" fill={skin}>
            <ellipse cx="22" cy="52" rx="5.5" ry="9" /><ellipse cx="78" cy="52" rx="5.5" ry="9" />
          </g>
          <path d="M78 48q6 2 1 10" fill="none" stroke={shade} strokeWidth="2" strokeLinecap="round" />
          <path data-peeking-layer="face" d={face} fill={skin} />
          <g clipPath={`url(#${faceClip})`}><path data-peeking-layer="face-shade" d="M66 20Q83 31 78 60L72 69Q77 42 66 20Z" fill={shade} opacity=".5" /></g>
          <ColoredPart layer="hair-front" art={peekingFrontArt[hairstyle.front]} colors={hairColors} />
          <g transform={mounted}><ColoredPart layer="headwear" art={ornament} colors={ornamentColors} /></g>
          <g data-peeking-layer="blush" fill={blush}>
            <ellipse cx="29" cy="61" rx="5.2" ry="3.1" /><ellipse cx="69" cy="61" rx="5.2" ry="3.1" />
          </g>
          <g className="bot-avatar-eyes bot-portrait-eyes" data-peeking-layer="eyes" fill="#211d1e">
            <path d={bean} transform="translate(38.5 49)" /><path d={bean} transform="translate(62.5 49)" />
          </g>
          <Eyewear type={design.eyewear} />
          <Earrings type={design.earrings} />
        </g>
      </g>
    </g>
  </g>
}
