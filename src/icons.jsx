import React from 'react'
import {
  IconAlertCircle, IconArchive, IconArrowDown, IconArrowLeft, IconArrowRight, IconArrowUp, IconArrowsMaximize,
  IconArrowsMinimize, IconBell, IconBook2, IconBrandWechat, IconBrowser, IconChevronDown,
  IconChevronRight, IconCircleCheck, IconClock, IconCoins, IconDeviceLaptop,
  IconDots, IconDownload, IconFileText, IconFolder, IconFolderOpen, IconFolders, IconGitBranch, IconHome,
  IconLayoutDashboard, IconLayoutSidebar, IconLayoutSidebarRight, IconLink,
  IconLogout, IconMail, IconMicrophone, IconMovie, IconPaperclip, IconPencil,
  IconPhoto, IconPhotoEdit, IconPlus, IconRefresh, IconRobot, IconSearch,
  IconSettings, IconShield, IconSparkles, IconSquareFilled, IconTag, IconTrash, IconUsers,
  IconTerminal2, IconWifiOff, IconX,
} from '@tabler/icons-react'

const icons = {
  terminal: IconTerminal2, git: IconGitBranch, down: IconArrowDown, back: IconArrowLeft, next: IconArrowRight, send: IconArrowUp,
  full: IconArrowsMaximize, split: IconArrowsMinimize, bell: IconBell, book: IconBook2,
  wechat: IconBrandWechat, browser: IconBrowser, chevron: IconChevronDown,
  right: IconChevronRight, check: IconCircleCheck, clock: IconClock, coins: IconCoins,
  laptop: IconDeviceLaptop, more: IconDots, file: IconFileText, folder: IconFolder,
  openFolder: IconFolderOpen, folders: IconFolders, home: IconHome, canvas: IconLayoutDashboard,
  sidebar: IconLayoutSidebar, tools: IconLayoutSidebarRight, link: IconLink,
  logout: IconLogout, mail: IconMail, mic: IconMicrophone, movie: IconMovie,
  attach: IconPaperclip, edit: IconPencil, photo: IconPhoto, retouch: IconPhotoEdit,
  add: IconPlus, refresh: IconRefresh, bot: IconRobot, search: IconSearch,
  settings: IconSettings, shield: IconShield, spark: IconSparkles, stop: IconSquareFilled,
  group: IconUsers, alert: IconAlertCircle, archive: IconArchive, download: IconDownload, tag: IconTag, trash: IconTrash, offline: IconWifiOff, close: IconX,
}

export const toolIcons = {
  浏览器: 'browser', 无限画布: 'canvas', 修图工具: 'retouch', 剪辑工具: 'movie', 生图工具: 'photo', 文件与产物: 'folder', 终端: 'terminal', Git: 'git',
}

export function Icon({ name, size = 17 }) {
  const Component = icons[name]
  return <Component aria-hidden="true" size={size} stroke={1.65} />
}

export function IconButton({ icon, label, className = '', ...props }) {
  return <button type="button" className={'icon-button ' + className} title={label} aria-label={label} {...props}><Icon name={icon} /></button>
}
