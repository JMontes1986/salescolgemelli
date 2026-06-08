export function Logo(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 150 50"
      role="img"
      aria-label="ColGemelli Logo"
      className={props.className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="150" height="50" rx="14" fill="currentColor" opacity="0.08" />
      <circle cx="27" cy="25" r="15" fill="#2563eb" opacity="0.95" />
      <path
        d="M19 26.5c4.5-8 11.5-8 16 0M22 32c3.2 3 7.8 3 11 0"
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <text
        x="50"
        y="23"
        fill="#1e3a8a"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="15"
        fontWeight="700"
      >
        ColGemelli
      </text>
      <text
        x="51"
        y="36"
        fill="#64748b"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="9"
        fontWeight="600"
        letterSpacing="1"
      >
        FAMILIA
      </text>
    </svg>
  );
}
