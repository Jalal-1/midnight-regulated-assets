/**
 * Stagenet seed entry — with a way to START from nothing.
 *
 * "Generate fresh seeds" now starts from a 24-word BIP-39 phrase and derives
 * the wallet seed exactly the way Lace does (HDWallet.fromSeed(
 * bip39.mnemonicToSeedSync(words)) — confirmed on the Midnight forum), so the
 * words restore the SAME wallet in a wallet app. The phrase and seed can be
 * downloaded as a timestamped text file.
 *
 * Rules unchanged: everything lives in memory only, is never persisted or
 * bundled, and this whole control renders only on hosted TEST networks. These
 * are browser-generated developer keys — NOT secure key material. The UI and
 * the downloaded file both say so, loudly.
 */

import { useState } from 'react';

import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

import { currentNetwork } from '@mra/lab-shell';

export interface SeedField {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** Recovery phrase for each seed generated THIS page-load. Memory only. */
const MNEMONICS = new Map<string, string>();

const toHex = (bytes: Uint8Array): string => {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
};

/** 24 words → the exact master seed a wallet app derives from them. */
const freshSeed = (): string => {
  const mnemonic = bip39.generateMnemonic(wordlist, 256);
  const seedHex = toHex(bip39.mnemonicToSeedSync(mnemonic));
  MNEMONICS.set(seedHex, mnemonic);
  return seedHex;
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
        field.onChange(freshSeed());
        generated += 1;
      }
    }
    setVisible(true);
    say(
      `generated ${generated} fresh wallet${generated === 1 ? '' : 's'} — download the seed file below and keep it. ` +
        'Nothing is persisted; reloading forgets these keys, and a lost seed is lost test funds.',
      'ok',
    );
    say('next: Create wallets, then fund each address via its faucet button below', 'info');
  };

  const allFilled = fields.every((f) => f.value.trim());

  const onDownload = () => {
    const network = currentNetwork();
    const when = new Date();
    const lines: string[] = [
      '=================================================================',
      '  TEST KEYS ONLY — NOT SECURE. DO NOT USE ON A REAL NETWORK.',
      '=================================================================',
      '',
      'These keys were generated inside a web page for a Midnight TEST',
      'network. They are developer/demo material:',
      '',
      '  * NEVER use them on Midnight mainnet or any real network.',
      '  * NEVER send real funds to their addresses.',
      '  * Anyone who reads this file controls these test wallets.',
      '',
      `Generated: ${when.toISOString()}`,
      `Network:   ${network.networkId} (test network)`,
      ...(network.faucet ? [`Faucet:    ${network.faucet}`] : []),
      '',
    ];
    for (const field of fields) {
      const seed = field.value.trim().toLowerCase().replace(/^0x/, '');
      const mnemonic = MNEMONICS.get(seed);
      lines.push(`--- ${field.label} ---`, '');
      if (mnemonic) {
        const words = mnemonic.split(' ');
        lines.push(
          'Recovery phrase (24 words — import into a Midnight wallet app,',
          'e.g. Lace, to inspect this TEST wallet):',
          '',
          `  ${words.slice(0, 8).join(' ')}`,
          `  ${words.slice(8, 16).join(' ')}`,
          `  ${words.slice(16).join(' ')}`,
          '',
        );
      } else {
        lines.push('Recovery phrase: none — this seed was entered directly.', '');
      }
      lines.push('Seed (hex — what this dashboard uses):', '', `  ${seed}`, '');
    }
    lines.push(
      '=================================================================',
      '  Reminder: TEST keys. Not generated in secure hardware. Never',
      '  reuse for anything of value.',
      '=================================================================',
      '',
    );
    const stamp = when.toISOString().replace(/[:]/g, '-').slice(0, 19);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
    a.download = `midnight-${network.networkId}-TEST-wallets-${stamp}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    say('seed file downloaded — plaintext TEST keys; keep it out of anything that syncs or ships', 'ok');
  };

  return (
    <>
      {fields.map((field) => {
        const mnemonic = MNEMONICS.get(field.value.trim().toLowerCase().replace(/^0x/, ''));
        return (
          <label key={field.key}>
            <span className="label">{field.label}</span>
            <span className="seed-wrap">
              <input
                className="mono seed-input"
                type={visible ? 'text' : 'password'}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                disabled={disabled}
                placeholder="64/128 hex · faucet-funded"
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
            {visible && mnemonic && <span className="seed-mnemonic mono">{mnemonic}</span>}
          </label>
        );
      })}
      <div className="seed-controls">
        <button className="secondary seed-generate" onClick={onGenerate} disabled={disabled}>
          Generate fresh seeds
        </button>
        <button className="link" onClick={onDownload} disabled={!allFilled}>
          Download seed file (.txt)
        </button>
        <button className="link" onClick={() => setVisible((v) => !v)}>
          {visible ? 'hide' : 'show'}
        </button>
      </div>
      <span className="muted small naming-note">
        TEST keys generated in this page — not secure key material, never for use on a real
        network. Memory only, never persisted: download the seed file before moving on. The
        24-word phrase restores the same wallet in a Midnight wallet app (e.g. Lace).
      </span>
    </>
  );
}
