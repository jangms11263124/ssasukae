interface RefreshIconProps {
  className?: string;
}

export function RefreshIcon({ className = 'size-3.5' }: RefreshIconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
