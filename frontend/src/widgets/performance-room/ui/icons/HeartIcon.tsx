interface HeartIconProps {
  className?: string;
  filled: boolean;
}

export function HeartIcon({ className = 'size-5', filled }: HeartIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.2 3.6 5 6.8 5c2 0 3.7 1.1 4.5 2.7a1 1 0 0 0 1.4 0C13.5 6.1 15.2 5 17.2 5c3.2 0 5.3 3.2 4.1 6.3-1.8 4.6-9.3 9.2-9.3 9.2z" />
    </svg>
  );
}
