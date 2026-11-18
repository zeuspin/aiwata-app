import React from "react";
import { createRoot } from "react-dom/client";

import { LocalUserLogin } from './local-user-login.jsx';
import { StartupPreview } from "./startup-preview.jsx";
import { NativeStartupScreen } from './startup-screens.jsx';
import { NativeWindowFrame } from './native-window-chrome.jsx';
import { bindNativeWindowChrome } from './native-window-chrome.mjs';
import "./styles.css";

class WorkbenchBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) {
    console.error('AIWATA renderer failed', error);
    void window.hermesDesktop?.localUsers?.reportWorkspace?.('failed').catch(() => {});
  }
  render() {
    if (this.state.error) return <main className="login-screen"><section className="login-card" role="alert">
      <h1>工作台暂时无法显示</h1><p>{this.state.error.message}</p>
      <button className="primary" onClick={() => location.reload()}>重新载入界面</button>
    </section></main>;
    return this.props.children;
  }
}

const root = createRoot(document.getElementById("root"));
const peer = new URLSearchParams(window.location.search).get('peer') === '1';
if (window.hermesDesktop) {
  window.aiwataNativeChrome = bindNativeWindowChrome({ host: window.hermesDesktop, element: document.documentElement });
}
function render(content) {
  root.render(<React.StrictMode><NativeWindowFrame>{content}</NativeWindowFrame></React.StrictMode>);
}
async function openWorkspace() {
  try {
    if (__AIWATA_NATIVE__ && !window.aiwataNativeRuntime) {
      render(<NativeStartupScreen />);
      const { initializeNativeDesktop } = await import('#native-desktop');
      await initializeNativeDesktop();
    }
    const { App } = await import('./App.jsx');
    render(<WorkbenchBoundary>{__AIWATA_NATIVE__
      ? <App onUserLogout={signOut} />
      : <StartupPreview><App /></StartupPreview>}
    </WorkbenchBoundary>);
  } catch (error) { showFailure(error); }
}
function showFailure(error) {
  void window.hermesDesktop?.localUsers?.reportWorkspace?.('failed').catch(() => {});
  render(<main className="login-screen"><section className="login-card" role="alert"><h1>AIWATA 桌面连接失败</h1><p>{error.message}</p>
    <button className="primary" onClick={() => location.reload()}>重新连接</button>
    {!peer && window.hermesDesktop?.localUsers && <button className="secondary" onClick={showUsers}>返回用户选择</button>}
  </section></main>);
}
async function signOut() {
  const handedOff = await window.hermesDesktop?.localUsers?.logout?.();
  if (handedOff) render(null);
  else if (peer) throw new Error('请在 AIWATA 主窗口退出登录。');
  else showUsers();
}
function showUsers() {
  const service = window.hermesDesktop?.localUsers;
  if (!service) { location.reload(); return; }
  render(<WorkbenchBoundary><LocalUserLogin service={service} onSelected={async user => {
    window.aiwataLocalUser = user;
    await openWorkspace();
  }} /></WorkbenchBoundary>);
}
async function start() {
  if (__AIWATA_NATIVE__) {
    const { bootRenderer } = await import('#native-preferences');
    await bootRenderer(async () => {});
    const service = window.hermesDesktop?.localUsers;
    if (!service) throw new Error('当前原生宿主未支持本机多用户，请更新原生宿主后重试。');
    const snapshot = await service.list();
    const user = snapshot.users.find(user => user.id === snapshot.currentUserId);
    if (!user) {
      if (peer) throw new Error('请先在 AIWATA 主窗口选择本机用户。');
      showUsers(); return;
    }
    window.aiwataLocalUser = user;
  }
  await openWorkspace();
}

start().catch(showFailure);
