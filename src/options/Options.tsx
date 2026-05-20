import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './options.css';
import { AI_TARGETS, TARGET_IDS, type TargetId } from '../shared/constants';
import { getSettings, saveSettings, type AppSettings } from '../shared/settings';

function Options() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [savedAt, setSavedAt] = useState<string>('');

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  async function patchSettings(partial: Partial<AppSettings>) {
    const next = await saveSettings(partial);
    setSettings(next);
    setSavedAt(new Date().toLocaleTimeString());
  }

  if (!settings) {
    return <main className="options-shell">加载设置...</main>;
  }

  return (
    <main className="options-shell">
      <header className="hero">
        <p className="eyebrow">AI Screenshot Attacher</p>
        <h1>设置</h1>
        <p>手动模式只在你触发时运行；自动模式开启后，仅在受支持 AI 页面已打开时检测新截图。</p>
      </header>

      <section className="settings-section">
        <Toggle
          checked={settings.autoAttachEnabled}
          label="启用自动粘贴模式"
          onChange={(checked) => void patchSettings({ autoAttachEnabled: checked })}
        />

        <label className="field">
          <span>默认目标 AI</span>
          <select
            value={settings.defaultTargetId}
            onChange={(event) => void patchSettings({ defaultTargetId: event.target.value as TargetId })}
          >
            {TARGET_IDS.map((targetId) => (
              <option key={targetId} value={targetId}>
                {AI_TARGETS[targetId].name}
              </option>
            ))}
          </select>
        </label>

        <Toggle
          checked={settings.showPageToast}
          label="成功后显示页面 Toast"
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

      <footer className="footer-status">{savedAt ? `已保存 ${savedAt}` : '设置会自动保存'}</footer>
    </main>
  );
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
