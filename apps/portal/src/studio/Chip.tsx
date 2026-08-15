/** Studio badge: text always, tone as reinforcement (never colour alone). */

export type ChipTone = 'success' | 'neutral' | 'warning' | 'danger' | 'accent' | 'inverse';

export default function Chip({
  tone = 'neutral',
  dot = false,
  children,
}: {
  readonly tone?: ChipTone;
  readonly dot?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <span className={`chip-badge chip-${tone}`}>
      {dot && <span className="chip-dot" />}
      {children}
    </span>
  );
}
