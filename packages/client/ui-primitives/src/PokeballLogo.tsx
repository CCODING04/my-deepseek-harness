// Pokéball mark (Pokémon theme). Native 24×24; the ball is self-colored
// (classic #EE1515 red top / white bottom / dark band + button) with an ink
// outline riding currentColor so it stays legible against either sidebar fill.

import type { IconProps } from './icons/props.ts'

/**
 * Render the Pokéball mark.
 * @param props.size - width in px (default 24; square).
 * @param props.className - extra class for layout placement.
 * @returns the pokéball svg (aria-hidden decorative brand art).
 */
export function PokeballLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" fill="#ffffff" />
      <path d="M2 12 A10 10 0 0 1 22 12 Z" fill="#EE1515" />
      <rect x="2" y="10.9" width="20" height="2.2" fill="#1f1f1f" />
      <circle cx="12" cy="12" r="3.4" fill="#ffffff" stroke="#1f1f1f" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="1.4" fill="#1f1f1f" />
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}
