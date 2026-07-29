import Link from 'next/link';

interface ProfileMenuProps {
  nickname?: string;
  isLoggingOut: boolean;
  onLogout: () => void;
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4">
      <path
        d="m9 5 7 7-7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProfileMenu({ nickname, isLoggingOut, onLogout }: ProfileMenuProps) {
  return (
    <div
      id="profile-menu"
      className="absolute right-0 top-10 w-48 border border-cyan-400 bg-[#252525] p-5 font-mono shadow-[0_18px_40px_rgba(0,0,0,0.6)]"
    >
      <div className="border-b border-white/5 pb-4">
        <p className="truncate font-sans text-lg font-extrabold italic tracking-tight text-white">
          {nickname?.toUpperCase() || 'PLAYER'}
        </p>
        <p className="mt-3 flex items-center gap-2 text-[0.625rem] font-bold tracking-wide text-cyan-400">
          <span className="size-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
          SESSION_ACTIVE
        </p>
      </div>

      <nav aria-label="프로필 메뉴" className="py-2">
        <Link
          href="/mypage"
          className="flex items-center justify-between px-2 py-3 text-sm tracking-[0.08em] text-zinc-200 transition-colors hover:bg-white/5 hover:text-cyan-300 focus-visible:bg-white/5 focus-visible:outline-none"
        >
          MY PAGE
          <ChevronIcon />
        </Link>
        <Link
          href="/help"
          className="flex items-center justify-between px-2 py-3 text-sm tracking-[0.08em] text-zinc-200 transition-colors hover:bg-white/5 hover:text-cyan-300 focus-visible:bg-white/5 focus-visible:outline-none"
        >
          HELP
          <ChevronIcon />
        </Link>
      </nav>

      <button
        type="button"
        onClick={onLogout}
        disabled={isLoggingOut}
        className="flex w-full items-center justify-center gap-2 border border-white/5 bg-white/[0.01] px-3 py-3 text-sm tracking-[0.08em] text-zinc-300 transition-colors hover:border-fuchsia-400/40 hover:text-fuchsia-300 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-wait disabled:text-zinc-600"
      >
        LOGOUT
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4">
          <path
            d="M14 8V5H5v14h9v-3M11 12h8m0 0-3-3m3 3-3 3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
