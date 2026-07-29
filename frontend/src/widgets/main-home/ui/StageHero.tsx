import { anybody, jetBrainsMono } from '@/shared/config/fonts';

export function StageHero() {
  return (
    <section className="relative flex min-h-44 items-end justify-between overflow-hidden border-b border-white/[0.06] px-5 pb-7 pt-8 sm:px-8 lg:min-h-52 lg:px-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_35%_28%,rgba(255,255,255,0.035),transparent_32%),linear-gradient(115deg,rgba(255,255,255,0.018),transparent_48%)]"
      />

      <div className="relative">
        <p
          className={`${jetBrainsMono.className} mb-3 text-[0.58rem] font-bold tracking-[0.28em] text-cyan-400`}
        >
          ROOM_GATEWAY / LIVE_CONNECTION
        </p>
        <h1
          className={`${anybody.className} max-w-3xl text-[2.55rem] font-black italic leading-[0.92] tracking-[0.015em] text-white sm:text-5xl lg:text-[4.25rem]`}
        >
          CREATE OR
          <br />
          JOIN A STAGE.
        </h1>
      </div>

      <div
        className={`${jetBrainsMono.className} relative mb-1 hidden space-y-1 text-right text-[0.52rem] font-bold tracking-wider sm:block`}
      >
        <p className="flex items-center justify-end gap-2 text-cyan-400">
          <span className="size-1.5 bg-cyan-400" /> SERVER_ONLINE
        </p>
        <p className="flex items-center justify-end gap-2 text-zinc-500">
          <span className="size-1.5 bg-zinc-500" /> MONITOR_READY
        </p>
      </div>
    </section>
  );
}
