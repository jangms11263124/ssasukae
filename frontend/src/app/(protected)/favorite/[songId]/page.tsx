import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AuthenticatedHeader } from '@/widgets/authenticated-header';
import { LikedSongDetailSection } from '@/widgets/liked-song-detail';
import { LiveFeedFooter } from '@/widgets/live-feed-footer';

export const metadata: Metadata = {
  title: '찜한 곡 상세',
  description: '찜한 곡 1건의 정보와 가사를 확인합니다.',
};

interface LikedSongDetailPageProps {
  params: Promise<{ songId: string }>;
}

// 정적인 셸(헤더·브레드크럼·푸터)은 서버에서 렌더링하고,
// 데이터를 구독하는 LikedSongDetailSection만 클라이언트 경계로 남긴다.
export default async function LikedSongDetailPage({ params }: LikedSongDetailPageProps) {
  const { songId: rawSongId } = await params;
  const songId = Number(rawSongId);

  if (!Number.isInteger(songId) || songId <= 0) {
    notFound();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#0b0b0d] text-zinc-100">
      <AuthenticatedHeader />

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-6 py-12 sm:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-sm tracking-[0.4em] text-zinc-400">
              PERSONAL_ARCHIVE / SAVED_TRACKS / TRACK_DETAIL
            </p>
            <h1 className="mt-2 font-sans text-2xl font-black uppercase italic tracking-tight text-white">
              Track Detail.
            </h1>
          </div>
          <Link
            href="/favorite"
            className="flex items-center gap-1.5 border border-white/10 bg-black/25 px-3 py-2 font-mono text-[0.58rem] font-bold tracking-[0.14em] text-zinc-400 transition-colors hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            &lt; BACK_TO_FAVORITES
          </Link>
        </div>

        <div className="mt-8">
          <LikedSongDetailSection songId={songId} />
        </div>
      </main>

      <LiveFeedFooter />
    </div>
  );
}
