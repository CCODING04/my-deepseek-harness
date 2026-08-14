// Pokémon-theme brand wordmark: a Pokéball mark + "POKÉ HARNESS" letterforms
// in one svg. Native 182×24 (kept so existing layout math — width = size×182/24 —
// is unchanged). The ball carries its own colors; "POKÉ" rides the Pokéball
// red and "HARNESS" rides currentColor so the mark stays legible in both themes.

import type { IconProps } from './icons/props.ts'

/**
 * Render the full brand wordmark.
 * @param props.size - height in px (default 24; width keeps the 182:24 ratio).
 * @param props.className - extra class for layout placement.
 * @returns the wordmark svg (aria-hidden decorative brand art).
 */
export function BrandWordmark({ size = 24, className }: IconProps) {
  return (
    <svg
      width={(size * 182) / 24}
      height={size}
      className={className}
      viewBox="0 0 182 24"
      fill="none"
      aria-hidden="true"
    >
      {/* Pokéball mark (24×24 at the left). */}
      <g transform="translate(0 0)">
        <circle cx="12" cy="12" r="10" fill="#ffffff" />
        <path d="M2 12 A10 10 0 0 1 22 12 Z" fill="#EE1515" />
        <rect x="2" y="10.9" width="20" height="2.2" fill="#1f1f1f" />
        <circle cx="12" cy="12" r="3.4" fill="#ffffff" stroke="#1f1f1f" strokeWidth="1.4" />
        <circle cx="12" cy="12" r="1.4" fill="#1f1f1f" />
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1" />
      </g>
      <text
        x="30"
        y="17.5"
        fontFamily="'Baloo 2', 'Nunito', -apple-system, 'Segoe UI', sans-serif"
        fontSize="16"
        fontWeight="700"
        letterSpacing="0.4"
      >
        <tspan fill="#EE1515">POKÉ</tspan>
        <tspan fill="currentColor"> HARNESS</tspan>
      </text>
    </svg>
  )
}
