export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M8.4 20.4c2.2-4.7 6.2-7.3 10.4-6.6 3.4.5 5.3 3 4.3 5.7-1.2 3.2-6.1 4.5-10.6 3.1"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <circle cx="20.9" cy="12.1" r="2.4" fill="currentColor" />
        <path
          d="M9.1 11.3h4.2M11.2 9.2v4.2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity=".8"
        />
      </svg>
    </span>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand" aria-label="Picolah">
      <Logo size={compact ? 26 : 30} />
      {!compact && (
        <span className="brand-word">
          picolah<span className="brand-dot">.</span>
        </span>
      )}
    </span>
  );
}
