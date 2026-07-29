'use client';

import { RoomCreateForm } from '@/features/room-create';
import { RoomJoinForm } from '@/features/room-join';
import { cn } from '@/shared/lib/cn';
import { AuthenticatedHeader } from '@/widgets/authenticated-header';

interface MainHomeProps {
  className?: string;
}

// 음수 delay로 각 막대가 처음부터 서로 다른 위상에서 일렁이게 한다.
const LATENCY_BARS = [
  { delay: '0s', height: 10 },
  { delay: '-1.2s', height: 16 },
  { delay: '-0.5s', height: 12 },
  { delay: '-1.6s', height: 25 },
  { delay: '-0.3s', height: 18 },
  { delay: '-0.9s', height: 21 },
];

export function MainHome({ className }: MainHomeProps) {
  return (
    <div className={cn('flex min-h-dvh flex-col bg-[#09090b] text-white', className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_15%_20%,rgba(34,211,238,0.08),transparent_40%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_85%_80%,rgba(217,70,239,0.06),transparent_35%)]"
      />

      <AuthenticatedHeader />

      <main className="relative z-10 mx-auto w-full max-w-[1500px] flex-1 px-6 py-12 sm:px-10 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] text-cyan-300">
              ROOM_GATEWAY / LIVE_CONNECTION
            </p>
            <h1 className="mt-4 text-4xl font-black leading-[0.95] tracking-tight italic sm:text-6xl">
              CREATE OR
              <br />
              JOIN A STAGE.
            </h1>
          </div>
          <div className="hidden text-right font-mono text-[9px] leading-5 text-zinc-600 sm:block">
            <p className="text-cyan-300">● SERVER_ONLINE</p>
            <p>REGION: ASIA-2</p>
          </div>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.3fr_0.9fr]">
          <section className="border border-white/10 bg-[linear-gradient(145deg,#1c1c20,#101012)] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.35)] sm:p-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <h2 className="font-mono text-xl text-zinc-100">
                <span className="mr-3 text-cyan-300">01</span>/ CREATE_ROOM
              </h2>
              <span className="font-mono text-[9px] text-zinc-700">REF_ID: CR_002_77</span>
            </div>
            <div className="mt-7">
              <RoomCreateForm />
            </div>
          </section>

          <section className="border border-white/10 bg-[linear-gradient(145deg,#1c1c20,#101012)] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.35)] sm:p-8">
            <div className="border-b border-white/10 pb-5">
              <h2 className="font-mono text-xl text-zinc-100">
                <span className="mr-3 text-fuchsia-400">02</span>/ JOIN_ROOM
              </h2>
            </div>
            <div className="mt-7">
              <RoomJoinForm />
            </div>
            <div className="mt-14 border-t border-white/8 pt-6">
              <p className="font-mono text-[9px] tracking-[0.2em] text-zinc-600">
                LATENCY MONITOR
              </p>
              <div className="mt-5 flex h-8 items-end gap-2" aria-hidden="true">
                {LATENCY_BARS.map((bar, index) => (
                  <span
                    key={index}
                    className="flex-1 origin-bottom animate-latency-bar bg-zinc-700"
                    style={{ animationDelay: bar.delay, height: bar.height }}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 bg-[#131315]">
        <div className="mx-auto flex h-12 max-w-[1500px] items-center justify-between gap-4 px-6 font-mono text-[9px] text-zinc-600 sm:px-10">
          <span>[ROOM_SYSTEM] CREATE_CHANNEL_READY :: INVITE_CHANNEL_READY</span>
          <span className="hidden sm:inline">
            CORE_STATUS: OPTIMAL &nbsp; LATENCY: 12MS &nbsp; ENCRYPTION: AES_256
          </span>
        </div>
      </footer>
    </div>
  );
}
