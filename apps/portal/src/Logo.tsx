/**
 * The Midnight logo mark — a clock face with the hand at midnight, drawn as
 * three stacked squares. Path data extracted verbatim from the official logo
 * SVG (midnight.network brand hub); colored via currentColor, per the brand
 * rule that the mark is only ever white-on-dark or black-on-light.
 */

export default function LogoMark({ className }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 343.02 343.02" fill="currentColor" className={className} aria-label="Midnight">
      <path d="m171.51,0C76.79,0,0,76.79,0,171.51s76.79,171.51,171.51,171.51,171.51-76.79,171.51-171.51S266.23,0,171.51,0Zm0,311.39c-77.13,0-139.88-62.75-139.88-139.88S94.37,31.62,171.51,31.62s139.88,62.75,139.88,139.88-62.75,139.88-139.88,139.88Z" />
      <rect x="155.41" y="155.41" width="32.2" height="32.2" />
      <rect x="155.41" y="104.58" width="32.2" height="32.2" />
      <rect x="155.41" y="53.75" width="32.2" height="32.2" />
    </svg>
  );
}
