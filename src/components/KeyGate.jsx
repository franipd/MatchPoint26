import { useState } from 'react';

const STORAGE_KEY = 'matchpoint26:api-key';

export function loadStoredKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export default function KeyGate({ apiKey, onKeyChange, disabled }) {
  const [remember, setRemember] = useState(() => Boolean(loadStoredKey()));
  const [visible, setVisible] = useState(false);

  const handleChange = (value) => {
    onKeyChange(value);
    persist(value, remember);
  };

  const handleRemember = (checked) => {
    setRemember(checked);
    persist(apiKey, checked);
  };

  const persist = (value, shouldStore) => {
    try {
      if (shouldStore && value) localStorage.setItem(STORAGE_KEY, value);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable (private mode) — key stays in memory only */
    }
  };

  return (
    <section className="keygate" aria-label="API key">
      <div className="keygate-row">
        <label className="keygate-label" htmlFor="api-key-input">
          Anthropic API key
        </label>
        <div className="keygate-input-wrap">
          <input
            id="api-key-input"
            type={visible ? 'text' : 'password'}
            className="keygate-input"
            placeholder="sk-ant-…"
            value={apiKey}
            autoComplete="off"
            spellCheck="false"
            disabled={disabled}
            onChange={(e) => handleChange(e.target.value.trim())}
          />
          <button
            type="button"
            className="keygate-toggle"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide key' : 'Show key'}
          >
            {visible ? 'hide' : 'show'}
          </button>
        </div>
        <label className="keygate-remember">
          <input
            type="checkbox"
            checked={remember}
            disabled={disabled}
            onChange={(e) => handleRemember(e.target.checked)}
          />
          Remember on this device
        </label>
      </div>
      <p className="keygate-note">
        Your key stays in this browser and is sent only to api.anthropic.com — this
        site has no backend. Get a key at console.anthropic.com. A full run makes 5
        model calls with up to ~10 web searches (search is billed by Anthropic on
        top of tokens).
      </p>
    </section>
  );
}
