import React, { useEffect, useRef } from 'react'
import {
  IconAlertCircle, IconArchive, IconArrowDown, IconArrowLeft, IconArrowRight, IconArrowUp, IconArrowsMaximize,
  IconArrowsMinimize, IconBell, IconBook2, IconBrandWechat, IconBrowser, IconChevronDown,
  IconChevronRight, IconCircleCheck, IconClock, IconCoins, IconDeviceLaptop,
  IconDots, IconDownload, IconFileText, IconFolder, IconFolderOpen, IconFolderPlus, IconFolders, IconGitBranch, IconHome,
  IconLayoutDashboard, IconLayoutSidebar, IconLayoutSidebarRight, IconLink,
  IconLogout, IconMail, IconMicrophone, IconMovie, IconPaperclip, IconPencil,
  IconPhoto, IconPhotoEdit, IconPlus, IconRefresh, IconRobot, IconSearch,
  IconSettings, IconShield, IconSparkles, IconSquareFilled, IconTag, IconTrash, IconUsers,
  IconTerminal2, IconWifiOff, IconX,
} from '@tabler/icons-react'

const botBlink = [{ scale: '1 1' }, { scale: '1 .14', offset: .45 }, { scale: '1 1' }]
const botGlance = [
  { translate: '0' }, { translate: '2.25px', offset: .25 },
  { translate: '2.25px', offset: .72 }, { translate: '0' },
]

function BotChatIcon({ size, stroke, animated, ...props }) {
  const eyes = useRef(null)
  useEffect(() => {
    if (!animated) return
    const eyeGroup = eyes.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let timer
    let animation

    function schedule() {
      timer = window.setTimeout(() => {
        const glance = Math.random() < .3
        animation = eyeGroup.animate(glance ? botGlance : botBlink, {
          duration: glance ? 710 : 180, easing: 'ease-in-out',
        })
        schedule()
      }, 2500 + Math.random() * 4000)
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
    fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <g ref={eyes} className="bot-chat-eyes"><path d="M9 10.5v3m6-3v3" /></g>
  </svg>
}

function AiwataIcon({ size }) {
  return <img className="aiwata-nav-icon" src="/aiwata-app-icon.svg" alt="" width={size} height={size} />
}

const icons = {
  terminal: IconTerminal2, git: IconGitBranch, down: IconArrowDown, back: IconArrowLeft, next: IconArrowRight, send: IconArrowUp,
  full: IconArrowsMaximize, split: IconArrowsMinimize, bell: IconBell, book: IconBook2,
  wechat: IconBrandWechat, browser: IconBrowser, chevron: IconChevronDown,
  right: IconChevronRight, check: IconCircleCheck, clock: IconClock, coins: IconCoins,
  laptop: IconDeviceLaptop, more: IconDots, file: IconFileText, folder: IconFolder,
  openFolder: IconFolderOpen, folderAdd: IconFolderPlus, folders: IconFolders, home: IconHome, aiwata: AiwataIcon, canvas: IconLayoutDashboard,
  sidebar: IconLayoutSidebar, tools: IconLayoutSidebarRight, link: IconLink,
  logout: IconLogout, mail: IconMail, mic: IconMicrophone, movie: IconMovie,
  attach: IconPaperclip, edit: IconPencil, photo: IconPhoto, retouch: IconPhotoEdit,
  add: IconPlus, refresh: IconRefresh, bot: IconRobot, botChat: BotChatIcon, search: IconSearch,
  settings: IconSettings, shield: IconShield, spark: IconSparkles, stop: IconSquareFilled,
  group: IconUsers, alert: IconAlertCircle, archive: IconArchive, download: IconDownload, tag: IconTag, trash: IconTrash, offline: IconWifiOff, close: IconX,
}

export const toolIcons = {
  浏览器: 'browser', 无限画布: 'canvas', 修图工具: 'retouch', 剪辑工具: 'movie', 生图工具: 'photo', 文件与产物: 'folder', 终端: 'terminal', Git: 'git',
}

export function Icon({ name, size = 17, animated = false }) {
  const Component = icons[name]
  return <Component aria-hidden="true" size={size} stroke={1.65} {...(name === 'botChat' ? { animated } : {})} />
}

export function IconButton({ icon, label, className = '', ...props }) {
  return <button type="button" className={'icon-button ' + className} title={label} aria-label={label} {...props}><Icon name={icon} animated /></button>
}
