import React, { useEffect, useRef } from 'react'
import {
  IconAlertCircle, IconArchive, IconArrowBackUp, IconArrowDown, IconArrowLeft, IconArrowRight, IconArrowUp, IconArrowsMaximize,
  IconArrowsMinimize, IconBell, IconBook2, IconBrandWechat, IconBrowser, IconBug, IconChevronDown, IconCopy,
  IconChevronRight, IconCircleCheck, IconClock, IconClockFilled, IconFoldersFilled, IconCoins, IconDeviceLaptop, IconDevices2, IconRotateClockwise,
  IconDots, IconDownload, IconFileText, IconFolder, IconFolderOpen, IconFolderPlus, IconFolders, IconGitBranch, IconHome,
  IconLayoutDashboard, IconLayoutSidebar, IconLayoutSidebarRight, IconLink,
  IconLogout, IconMail, IconMessageCircle, IconMicrophone, IconMovie, IconPaperclip, IconPencil,
  IconPhoto, IconPhotoEdit, IconPlus, IconRefresh, IconRobot, IconSearch,
  IconSettings, IconShield, IconSparkles, IconSquareFilled, IconTag, IconTrash, IconUsers,
  IconTerminal2, IconWifiOff, IconX, IconClick, IconEye, IconEyeOff, IconGripVertical, IconCheck,
} from '@tabler/icons-react'

const botBlink = [{ scale: '1 1' }, { scale: /* @ai-token comp.icon.motion.blink-scale */ "1 .14", offset: /* @ai-token comp.icon.motion.blink-offset */ 0.45 }, { scale: '1 1' }]
const botGlance = [
  { translate: '0' }, { translate: /* @ai-token comp.icon.motion.glance-distance */ "2.25px", offset: /* @ai-token comp.icon.motion.glance-start */ 0.25 },
  { translate: /* @ai-token comp.icon.motion.glance-distance */ "2.25px", offset: /* @ai-token comp.icon.motion.glance-end */ 0.72 }, { translate: '0' },
]

function BotChatIcon({ size, stroke, animated, selected, ...props }) {
  const eyes = useRef(null)
  useEffect(() => {
    if (!animated) return
    const eyeGroup = eyes.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let timer
    let animation

    function schedule() {
      timer = window.setTimeout(() => {
        const glance = Math.random() < /* @ai-token comp.icon.motion.glance-probability */ 0.3
        animation = eyeGroup.animate(glance ? botGlance : botBlink, {
          duration: glance ? /* @ai-token comp.icon.motion.glance-duration */ 710 : /* @ai-token comp.icon.motion.blink-duration */ 180, easing: /* @ai-token comp.icon.motion.easing */ "ease-in-out",
        })
        schedule()
      }, /* @ai-token comp.icon.motion.interval-min */ 2500 + Math.random() * /* @ai-token comp.icon.motion.interval-span */ 4000)
    }

    function stop() {
      window.clearTimeout(timer)
      animation?.cancel()
    }

    function syncMotion() {
      stop()
      if (!reducedMotion.matches) schedule()
    }

    syncMotion()
    reducedMotion.addEventListener('change', syncMotion)
    return () => {
      stop()
      reducedMotion.removeEventListener('change', syncMotion)
    }
  }, [animated])

  return <svg {...props} className="bot-chat-icon" width={size} height={size} viewBox="0 0 24 24"
    fill={selected ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <g ref={eyes} className="bot-chat-eyes" stroke={selected ? 'var(--app-surface)' : 'currentColor'}><path d="M9 10.5v3m6-3v3" /></g>
  </svg>
}

function AiwataIcon({ size, selected = true }) {
  return <img className="aiwata-nav-icon" src={selected ? './aiwata-app-icon.svg' : './aiwata-app-icon-outline.svg'} alt="" width={size} height={size} />
}

function ApprovalGlyph({ kind, size, stroke, children, ...props }) {
  return <svg {...props} data-approval-icon={kind} width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
}

function ApprovalHand(props) {
  return <ApprovalGlyph {...props} kind="hand">
    <path d="M8 12.8V6.6a1.4 1.4 0 0 1 2.8 0v4.3V4.7a1.4 1.4 0 0 1 2.8 0v6.2V5.8a1.4 1.4 0 0 1 2.8 0v5.7-3a1.4 1.4 0 0 1 2.8 0v5.2c0 4.6-2.5 7.6-6.5 7.6-3 0-5-1.4-6.5-3.6l-2.3-3.5a1.5 1.5 0 0 1 2.4-1.8l2.5 2.6" />
    <path d="M8.8 15c1-.1 2.2.4 2.8 1.4" />
  </ApprovalGlyph>
}

function ApprovalShield({ children }) {
  return <>
    <path d="M10.8 3.3a3 3 0 0 1 2.4 0l5.7 2.5A2.2 2.2 0 0 1 20.2 8v4.4c0 4.2-3.3 7.1-7.4 8.7a2.3 2.3 0 0 1-1.6 0c-4.1-1.6-7.4-4.5-7.4-8.7V8a2.2 2.2 0 0 1 1.3-2.2z" />
    {children}
  </>
}

function ApprovalTerminal(props) {
  return <ApprovalGlyph {...props} kind="terminal">
    <ApprovalShield><path d="m8 10 2.4 2.3L8 14.6m5.1 0h2.9" /></ApprovalShield>
  </ApprovalGlyph>
}

function ApprovalWarning(props) {
  return <ApprovalGlyph {...props} kind="warning">
    <ApprovalShield><path d="M12 8.2v4.5m0 3.2h.01" /></ApprovalShield>
  </ApprovalGlyph>
}

const icons = {
  devices: IconDevices2, rotate: IconRotateClockwise,
  terminal: IconTerminal2, bug: IconBug, copy: IconCopy, git: IconGitBranch, reply: IconArrowBackUp, down: IconArrowDown, back: IconArrowLeft, next: IconArrowRight, send: IconArrowUp,
  full: IconArrowsMaximize, split: IconArrowsMinimize, bell: IconBell, book: IconBook2,
  wechat: IconBrandWechat, browser: IconBrowser, chevron: IconChevronDown,
  right: IconChevronRight, check: IconCircleCheck, clock: IconClock, coins: IconCoins,
  laptop: IconDeviceLaptop, more: IconDots, file: IconFileText, folder: IconFolder,
  openFolder: IconFolderOpen, folderAdd: IconFolderPlus, folders: IconFolders, home: IconHome, aiwata: AiwataIcon, canvas: IconLayoutDashboard,
  sidebar: IconLayoutSidebar, tools: IconLayoutSidebarRight, link: IconLink,
  logout: IconLogout, mail: IconMail, mic: IconMicrophone, movie: IconMovie,
  attach: IconPaperclip, edit: IconPencil, photo: IconPhoto, retouch: IconPhotoEdit,
  add: IconPlus, comment: IconMessageCircle, annotate: IconClick, tick: IconCheck, eye: IconEye, eyeOff: IconEyeOff, grip: IconGripVertical, refresh: IconRefresh, bot: IconRobot, botChat: BotChatIcon, search: IconSearch,
  settings: IconSettings, shield: IconShield, spark: IconSparkles, stop: IconSquareFilled,
  approvalHand: ApprovalHand, approvalTerminal: ApprovalTerminal, approvalWarning: ApprovalWarning,
  group: IconUsers, alert: IconAlertCircle, archive: IconArchive, download: IconDownload, tag: IconTag, trash: IconTrash, offline: IconWifiOff, close: IconX,
}

export const toolIcons = {
  浏览器: 'browser', 无限画布: 'canvas', 修图工具: 'retouch', 剪辑工具: 'movie', 生图工具: 'photo', 文件与产物: 'folder', 终端: 'terminal', Git: 'git',
}

const selectedIcons = { clock: IconClockFilled, folders: IconFoldersFilled }

export function Icon({ name, size = /* @ai-token comp.icon.size */ 17, animated = false, selected = false }) {
  const Component = (selected && selectedIcons[name]) || icons[name]
  return <Component aria-hidden="true" size={size} stroke={/* @ai-token comp.icon.stroke-width */ 1.65} {...(['botChat', 'aiwata'].includes(name) ? { selected, ...(name === 'botChat' ? { animated } : {}) } : {})} />
}

export function IconButton({ icon, label, className = '', selected = false, ...props }) {
  return <button type="button" className={'icon-button ' + className} title={label} aria-label={label} {...props}><Icon name={icon} animated selected={selected} /></button>
}
