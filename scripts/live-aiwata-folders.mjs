export async function selectedWorkspaceFolders(workspace, paths, directoryFor) {
  if (!Array.isArray(paths) || paths.length > 12 || paths.some(path => typeof path !== 'string' || !path)) {
    throw new Error('系统目录选择结果无效，最多可选择 12 个文件夹。')
  }
  return [...new Set(await Promise.all(paths.map(path => directoryFor(workspace, path))))]
}

