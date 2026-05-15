interface IconProps {
  size?: number;
  className?: string;
}

export function EyeIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M1 8s2.5-4 7-4 7 4 7 4-2.5 4-7 4S1 8 1 8Z" />
      <circle cx="8" cy="8" r="2.25" />
    </svg>
  );
}

export function EyeOffIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2 2l12 12" />
      <path d="M3 8s2.5-4 5-4c1.05 0 2.05.27 2.93.7" />
      <path d="M6.6 6.6a2.25 2.25 0 0 0 2.8 2.8" />
      <path d="M13 8s-2.5 4-5 4c-1.05 0-2.05-.27-2.93-.7" />
    </svg>
  );
}

export function TargetIcon({ size = 12, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 0v2M8 14v2M0 8h2M14 8h2" />
    </svg>
  );
}
