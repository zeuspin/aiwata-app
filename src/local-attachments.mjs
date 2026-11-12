export const liveImageSlots = ['liveImage', 'liveImageEdit', 'liveImageSource']
export const liveMediaSlots = [...liveImageSlots, 'liveVideoEdit']

export function createLocalAttachmentStore(indexedDB) {
  let connection

  function open() {
    connection ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('aiwata-ui-prototype:attachments', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('files')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }).catch(error => {
      connection = undefined
      throw error
    })
    return connection
  }

  async function transact(mode, operate) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('files', mode)
      const request = operate(transaction.objectStore('files'))
      transaction.oncomplete = () => resolve(request?.result)
      transaction.onabort = () => reject(transaction.error)
    })
  }

  return {
    save(account, chat, files) {
      return transact('readwrite', store => {
        for (const { id, file } of files) store.put(file, [account, chat, id])
      })
    },
    async removeAccount(account) {
      const db = await open()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('files', 'readwrite')
        const request = transaction.objectStore('files').openCursor()
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) return
          if (Array.isArray(cursor.key) && cursor.key[0] === account) cursor.delete()
          cursor.continue()
        }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
    },
    read(account, chat, id) {
      return transact('readonly', store => store.get([account, chat, id]))
    },
    remove(account, chat, ids) {
      return transact('readwrite', store => {
        for (const id of ids) store.delete([account, chat, id])
      })
    },
  }
}

export function attachmentIds(chat) {
  const sources = [chat, chat.lastInput, chat.gatewaySubmission?.input, ...(chat.queue ?? []), ...(chat.messages ?? [])]
  const ids = new Set(sources.flatMap(source => Object.values(source?.attachmentDetails ?? {})
    .flatMap(entry => entry?.blobId ? [entry.blobId] : [])))
  for (const slot of liveMediaSlots) {
    const entry = chat.toolEdits?.[slot]
    if (entry?.blobId) ids.add(entry.blobId)
  }
  const browsers = [chat.browser, ...Object.values(chat.toolInstances ?? {}).map(instance => instance.browser)]
  for (const browser of browsers) {
    for (const pin of [...(browser?.annotations ?? []), ...Object.values(browser?.annotationDrafts ?? {})]) {
      const image = pin.capture?.image
      if (image?.blobId) ids.add(image.blobId)
    }
  }
  return ids
}

export function isLocalAttachment(entry) {
  return entry?.kind === 'image' || entry?.kind === 'file'
}

export function hasPromptContent({ text, attachments }) {
  return Boolean(text.trim() || attachments?.length)
}
