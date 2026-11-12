import React, { useMemo } from 'react'
import { AttachmentPreview } from './attachment-preview.jsx'

// Mounted only by the user's transcript click; it offers preview/download,
// without creating a file-tree root or enabling edits outside the project.
export function NativeArtifactPreview({ live, sessionId, target, onClose }) {
  const entry = useMemo(() => ({ nativePath: target, name: target.split(/[\\/]/).at(-1) || '会话产物' }), [target])
  return <AttachmentPreview live={live} sessionId={sessionId} entry={entry} onClose={onClose} />
}
