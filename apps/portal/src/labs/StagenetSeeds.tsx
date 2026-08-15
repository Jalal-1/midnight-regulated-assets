/**
 * Stagenet seed entry — with a way to START from nothing.
 *
 * A first-time visitor has no seed, so the row can generate fresh ones
 * (CSPRNG, in the page, shown so they can be saved). Rules unchanged: seeds
 * live in memory only, are never persisted or bundled, and this whole control
 * renders only on hosted test networks. Generated seeds are developer/test
 * material — whoever loses the seed loses the (test) funds.
 */

import { useState } from 'react';

export interface SeedField {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

const randomSeed = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
};

export default function StagenetSeeds({
  fields,
  disabled,
  say,
}: {
  readonly fields: readonly SeedField[];
  readonly disabled: boolean;
  readonly say: (message: string, kind?: 'info' | 'ok' | 'error') => void;
}) {
  const [visible, setVisible] = useState(false);

  const onGenerate = () => {
    let generated = 0;
    for (const field of fields) {
      if (!field.value.trim()) {
        field.onChange(randomSeed());
        generated += 1;
      }
    }
    setVisible(true);
    say(
      `generated ${generated} fresh seed${generated === 1 ? '' : 's'} — SAVE THEM NOW (copy each field). ` +
        'They exist only in this page’s memory; reloading forgets them, and a lost seed is lost test funds.',
      'ok',
    );
    say('next: Create wallets, then fund each address via its faucet button below', 'info');
  };

  return (
    <>
      {fields.map((field) => (
        <label key={field.key}>
          <span className="label">{field.label}</span>
          <span className="seed-wrap">
            <input
              className="mono seed-input"
              type={visible ? 'text' : 'password'}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              disabled={disabled}
              placeholder="64 hex · faucet-funded"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className="link"
              onClick={() => {
                try {
                  void navigator.clipboard.writeText(field.value.trim());
                  say(`${field.label} seed copied — store it safely`, 'ok');
                } catch {
                  /* clipboard unavailable */
                }
              }}
              disabled={!field.value.trim()}
              title="Copy this seed — you are responsible for keeping it"
            >
              copy
            </button>
          </span>
        </label>
      ))}
      <div className="seed-controls">
        <button className="secondary seed-generate" onClick={onGenerate} disabled={disabled}>
          Generate fresh seeds
        </button>
        <button className="link" onClick={() => setVisible((v) => !v)}>
          {visible ? 'hide' : 'show'}
        </button>
        <span className="muted small naming-note">
          developer/test entry — memory only, never persisted; save generated seeds before moving on
        </span>
      </div>
    </>
  );
}
