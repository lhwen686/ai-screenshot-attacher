import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './options.css';
import { AI_TARGETS, PRIVACY_URL, SHORTCUTS_HELP_URL, SUPPORT_URL, TARGET_IDS } from '../shared/constants';
import { getSettings, saveSettings, type AppSettings } from '../shared/settings';

function Options() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [savedAt, setSavedAt] = useState<string>('');
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);

  async function loadSettings() {
    try {
      setSettings(await getSettings());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    let active = true;
    void getSettings().then(
      (loadedSettings) => {
        if (active) {
          setSettings(loadedSettings);
          setLoadError(false);
        }
      },
      () => {
        if (active) {
          setLoadError(true);
        }
      }
    );
    return () => {
      active = false;
    };
  }, []);

  async function patchSettings(partial: Partial<AppSettings>) {
    setSaveError(false);
    try {
      const next = await saveSettings(partial);
      setSettings(next);
      setSavedAt(new Date().toLocaleTimeString());
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }

  if (!settings) {
    return (
      <main className="options-shell">
        {loadError ? (
          <section role="alert">
            <p>设置加载失败，请重试。</p>
            <button
              type="button"
              onClick={() => {
                setLoadError(false);
                void loadSettings();
              }}
            >
              重新加载
            </button>
          </section>
        ) : (
          '加载设置...'
        )}
      </main>
    );
  }

  return (
    <main className="options-shell">
      <header className="hero">
        <p className="eyebrow">AI Screenshot Attacher</p>
        <h1>设置</h1>
        <p>手动模式只在你触发时运行；自动模式默认关闭，开启后也只在受支持 AI 页面已打开时检测新截图。</p>
      </header>

      <section className="info-panel" aria-labelledby="getting-started-title">
        <h2 id="getting-started-title">首次使用</h2>
        <div className="info-grid">
          <p>1. 先用系统截图工具把图片复制到剪贴板。</p>
          <p>2. 点击 popup 按钮，或使用快捷键附加到目标 AI 页面。</p>
          <p>3. 检查附件和提示词，然后自己发送消息。</p>
        </div>
      </section>

      <section className="settings-section">
        <Toggle
          checked={settings.autoAttachEnabled}
          label="启用自动粘贴模式"
          onChange={(checked) => void patchSettings({ autoAttachEnabled: checked })}
        />

        <fieldset className="model-field">
          <legend>默认模型</legend>
          <div className="model-options">
            {TARGET_IDS.map((targetId) => (
              <label
                className={`model-option ${settings.defaultTargetId === targetId ? 'is-selected' : ''}`}
                key={targetId}
              >
                <input
                  checked={settings.defaultTargetId === targetId}
                  name="default-model"
                  onChange={() => void patchSettings({ defaultTargetId: targetId })}
                  type="radio"
                  value={targetId}
                />
                <span>{AI_TARGETS[targetId].name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Toggle
          checked={settings.showPageToast}
          label="操作成功或失败后显示页面 Toast"
          onChange={(checked) => void patchSettings({ showPageToast: checked })}
        />
        <Toggle
          checked={settings.writeBackOnFailure}
          label="失败时写回剪贴板"
          onChange={(checked) => void patchSettings({ writeBackOnFailure: checked })}
        />
        <Toggle
          checked={settings.openInNewTab}
          label="没有目标页面时在新标签页打开"
          onChange={(checked) => void patchSettings({ openInNewTab: checked })}
        />
        <Toggle
          checked={settings.debugLogs}
          label="启用调试日志"
          onChange={(checked) => void patchSettings({ debugLogs: checked })}
        />
      </section>

      <section className="info-panel" aria-labelledby="privacy-title">
        <h2 id="privacy-title">隐私与权限</h2>
        <div className="info-grid">
          <p>插件不读取聊天记录，不保存截图历史，也不会自动发送消息。</p>
          <p>剪贴板权限用于读取截图、为手动 Gemini/豆包粘贴准备已捕获图片，以及在失败回退时写回截图。</p>
          <p>站点权限只覆盖 ChatGPT、Claude、Gemini 和豆包。</p>
        </div>
        <div className="link-row">
          <button type="button" onClick={() => void openExternal(PRIVACY_URL)}>
            隐私政策
          </button>
          <button type="button" onClick={() => void openExternal(SHORTCUTS_HELP_URL)}>
            修改快捷键
          </button>
          <button type="button" onClick={() => void openExternal(SUPPORT_URL)}>
            反馈问题
          </button>
        </div>
      </section>

      <footer className="footer-status" role={saveError ? 'alert' : 'status'}>
        {saveError ? '设置保存失败，请重试。' : savedAt ? `已保存 ${savedAt}` : '设置会自动保存'}
      </footer>
    </main>
  );
}

async function openExternal(url: string): Promise<void> {
  await chrome.tabs.create({ url });
}

function Toggle(props: { checked: boolean; label: string; onChange(checked: boolean): void }) {
  return (
    <label className="toggle-row">
      <span>{props.label}</span>
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
    </label>
  );
}

createRoot(document.getElementById('root')!).render(<Options />);
