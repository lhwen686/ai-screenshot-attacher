import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './options.css';
import { PRIVACY_URL, SHORTCUTS_HELP_URL, SUPPORT_URL, TARGET_IDS } from '../shared/constants';
import { getTargetDisplayName, t } from '../shared/i18n';
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
            <p>{t('optionsLoadFailed')}</p>
            <button
              type="button"
              onClick={() => {
                setLoadError(false);
                void loadSettings();
              }}
            >
              {t('optionsReload')}
            </button>
          </section>
        ) : (
          t('optionsLoading')
        )}
      </main>
    );
  }

  return (
    <main className="options-shell">
      <header className="hero">
        <p className="eyebrow">{t('extName')}</p>
        <h1>{t('optionsTitle')}</h1>
        <p>{t('optionsIntro')}</p>
      </header>

      <section className="info-panel" aria-labelledby="getting-started-title">
        <h2 id="getting-started-title">{t('optionsGettingStarted')}</h2>
        <div className="info-grid">
          <p>{t('optionsStep1')}</p>
          <p>{t('optionsStep2')}</p>
          <p>{t('optionsStep3')}</p>
        </div>
      </section>

      <section className="settings-section">
        <Toggle
          checked={settings.autoAttachEnabled}
          label={t('optionAutoAttach')}
          onChange={(checked) => void patchSettings({ autoAttachEnabled: checked })}
        />

        <fieldset className="model-field">
          <legend>{t('optionDefaultTarget')}</legend>
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
                <span>{getTargetDisplayName(targetId)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Toggle
          checked={settings.showPageToast}
          label={t('optionShowToast')}
          onChange={(checked) => void patchSettings({ showPageToast: checked })}
        />
        <Toggle
          checked={settings.writeBackOnFailure}
          label={t('optionWriteBack')}
          onChange={(checked) => void patchSettings({ writeBackOnFailure: checked })}
        />
        <Toggle
          checked={settings.openInNewTab}
          label={t('optionOpenInNewTab')}
          onChange={(checked) => void patchSettings({ openInNewTab: checked })}
        />
        <Toggle
          checked={settings.debugLogs}
          label={t('optionDebugLogs')}
          onChange={(checked) => void patchSettings({ debugLogs: checked })}
        />
      </section>

      <section className="info-panel" aria-labelledby="privacy-title">
        <h2 id="privacy-title">{t('optionsPrivacyTitle')}</h2>
        <div className="info-grid">
          <p>{t('optionsPrivacyNoHistory')}</p>
          <p>{t('optionsPrivacyClipboard')}</p>
          <p>{t('optionsPrivacySites')}</p>
        </div>
        <div className="link-row">
          <button type="button" onClick={() => void openExternal(PRIVACY_URL)}>
            {t('linkPrivacyPolicy')}
          </button>
          <button type="button" onClick={() => void openExternal(SHORTCUTS_HELP_URL)}>
            {t('linkShortcuts')}
          </button>
          <button type="button" onClick={() => void openExternal(SUPPORT_URL)}>
            {t('linkReportIssue')}
          </button>
        </div>
      </section>

      <footer className="footer-status" role={saveError ? 'alert' : 'status'}>
        {saveError ? t('optionsSaveFailed') : savedAt ? t('optionsSavedAt', savedAt) : t('optionsAutoSave')}
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

document.documentElement.lang = t('localeTag');
document.title = t('optionsDocumentTitle');
createRoot(document.getElementById('root')!).render(<Options />);
