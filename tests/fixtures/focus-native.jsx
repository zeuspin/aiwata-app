import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Dialog, Field } from '../../src/management-ui.jsx'
import { TabDialog, ContextMenu } from '../../src/tab-controls.jsx'
import { ProjectDialog } from '../../src/surfaces.jsx'
import { AttachmentPreview } from '../../src/attachment-preview.jsx'
import { BotSettingsDrawer } from '../../src/bot-settings-drawer.jsx'
import { AnnotationImage } from '../../src/browser-annotations.jsx'
import { Composer } from '../../src/chat.jsx'
import '../../src/styles.css'

function Fixture() {
  const [dialog, setDialog] = useState(null)
  const [nested, setNested] = useState(false)
  const [menu, setMenu] = useState(null)
  const [chat, setChat] = useState({ id: 'focus-test', draft: '', attachments: [], attachmentDetails: {}, messages: [], source: 'managed' })
  const [sent, setSent] = useState(0)
  const [actions, setActions] = useState(0)
  const close = () => setDialog(null)
  const api = {
    current: () => ({ approvalMode: 'manual' }),
    getChat: () => chat,
    setDraft: (_, draft) => setChat(value => ({ ...value, draft })),
    changeChat: (_, change) => setChat(value => ({ ...value, ...change })),
  }
  const groups = [[
    { label: 'Ordinary action', icon: 'edit', run: () => setActions(value => value + 1) },
    { label: 'Open dialog', icon: 'file', run: () => setDialog('normal') },
    { label: 'Navigate', icon: 'next', run: () => document.getElementById('destination').focus() },
  ]]
  return <main>
    <button id="opener" onClick={() => setDialog('normal')}>Open form</button>
    <button id="project-opener" onClick={() => setDialog('project')}>New project</button>
    <button id="attachment-opener" onClick={() => setDialog('attachment')}>Preview attachment</button>
    <button id="nested-opener" onClick={() => setDialog('nested')}>Bot settings</button>
    <button id="tab-opener" onClick={() => setDialog('tab')}>Rename tab</button>
    <button id="menu-opener" onClick={event => setMenu({ x: 20, y: 60, label: 'Actions', anchor: event.currentTarget })}>Actions</button>
    <button id="destination">Destination</button>
    {dialog === 'normal' && <Dialog title="Focus form" onClose={close} onSubmit={form => {
      if (form.get('name') === 'reject') return Promise.reject(new Error('Save failed'))
      if (form.get('name') === 'wait') return new Promise(resolve => { window.finishSave = resolve })
    }}><Field label="Name" name="name" defaultValue="Ready" /></Dialog>}
    {dialog === 'nested' && <BotSettingsDrawer name="Focus Bot" onClose={close} returnFocus={document.getElementById('nested-opener')}>
      <button id="nested-child-opener" onClick={() => setNested(true)}>Edit setting</button>
      {nested && <Dialog title="Nested setting" onClose={() => setNested(false)} onSubmit={() => false}><Field label="Nested value" /></Dialog>}
    </BotSettingsDrawer>}
    {dialog === 'project' && <ProjectDialog onClose={close} onCreate={close} />}
    {dialog === 'attachment' && <AttachmentPreview entry={{ name: 'Synthetic attachment' }} onClose={close} />}
    <AnnotationImage image={{ blobId: 'synthetic-image' }} chatId="focus-test" number={1}
      api={{ readLocalAttachment: async () => new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: 'image/svg+xml' }) }} />
    {dialog === 'tab' && <TabDialog action={{ kind: 'rename', title: 'Original tab' }} onClose={close} onSubmit={close} />}
    {menu && <ContextMenu position={menu} groups={groups} dismiss={restore => {
      if (restore) menu.anchor.focus()
      setMenu(null)
    }} />}
    <section className="chat-pane"><Composer chat={chat} bot={{ name: 'Focus Bot' }} api={api} assets={[]}
      refresh={() => {}} send={() => setSent(value => value + 1)} stop={() => {}} report={() => {}} /></section>
    <output id="sent">{sent}</output><output id="actions">{actions}</output>
  </main>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture /></React.StrictMode>)
