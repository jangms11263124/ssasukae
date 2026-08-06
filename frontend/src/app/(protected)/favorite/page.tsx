import { AuthenticatedHeader } from '@/widgets/authenticated-header';
import { LikedSongsSection } from '@/widgets/liked-songs';
import { LiveFeedFooter } from '@/widgets/live-feed-footer';

export default function LikePage() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#0b0b0d] text-zinc-100">
      <AuthenticatedHeader />

      <main className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col px-6 pt-8 sm:px-10">
        <header className="shrink-0">
          <p className="font-mono text-sm tracking-[0.4em] text-zinc-400">
            PERSONAL_ARCHIVE / SAVED_TRACKS
          </p>
          <h1 className="mt-2 font-sans text-2xl font-black uppercase italic tracking-tight text-white">
            My Favorites.
          </h1>
        </header>

        <LikedSongsSection className="mt-5 min-h-0 flex-1" />
      </main>

      <LiveFeedFooter />
    </div>
  );
}
