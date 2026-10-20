/** Brand mark: one input node routed to three agents. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="lm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b6cf0" />
          <stop offset="1" stopColor="#1f45c2" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#lm)" />
      <path d="M10.5 16 C15 16 15 9.5 20.5 9.5 M10.5 16 H20.5 M10.5 16 C15 16 15 22.5 20.5 22.5" stroke="white" strokeOpacity=".9" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="9" cy="16" r="2.6" fill="white" />
      <circle cx="22.5" cy="9.5" r="2.1" fill="white" fillOpacity=".95" />
      <circle cx="22.5" cy="16" r="2.1" fill="white" fillOpacity=".95" />
      <circle cx="22.5" cy="22.5" r="2.1" fill="white" fillOpacity=".95" />
    </svg>
  )
}
