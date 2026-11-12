// Contract: AIWATA electron/select-paths-dialog.ts, directories + multiple.
export function createFolderPicker({ trusted, scope, show }) {
  let pending = false
  return async (event, account) => {
    const owner = scope()
    if (!trusted(event) || !owner || owner.closed || owner.account !== account) throw new Error('无法确认目录选择的当前账号。')
    if (pending) throw new Error('目录选择已打开。')
    pending = true
    try {
      const result = await show({ title: '选择项目文件夹', buttonLabel: '选择文件夹',
        properties: ['openDirectory', 'createDirectory', 'multiSelections'] })
      if (!trusted(event) || scope() !== owner || owner.closed) throw new Error('账号已切换，目录选择已取消。')
      return { available: true, paths: result.canceled ? [] : result.filePaths }
    } finally { pending = false }
  }
}
