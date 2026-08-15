/**
 * The multi-party visibility matrix: one asset model's disclosure profile as
 * each participant experiences it. Driven ENTIRELY from the asset-model
 * registry — this component cannot fabricate a differentiated view, because it
 * has no inputs other than the registry's evidence-backed rows. Where a
 * regulator mechanism does not exist, the registry says "Not implemented" and
 * that is what renders.
 */

import type { AssetModel } from '@mra/asset-models';

const PARTIES = [
  ['issuer', 'ACME Bank (issuer)'],
  ['alice', 'Alice (customer)'],
  ['bob', 'Bob (customer)'],
  ['regulator', 'Regulator'],
  ['publicObserver', 'Eve (public)'],
] as const;

export default function VisibilityMatrix({ model }: { readonly model: AssetModel }) {
  return (
    <div className="vis-matrix-wrap">
      <table className="vis-matrix">
        <thead>
          <tr>
            <th scope="col">Fact</th>
            {PARTIES.map(([, label]) => (
              <th scope="col" key={label}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.partyViews.map((row) => (
            <tr key={row.fact}>
              <th scope="row">{row.fact}</th>
              {PARTIES.map(([key]) => {
                const value = row.views[key];
                return (
                  <td key={key} className={value.startsWith('Not implemented') ? 'muted' : undefined}>
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
