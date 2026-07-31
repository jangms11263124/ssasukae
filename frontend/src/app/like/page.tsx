import { AuthenticatedHeader } from '@/widgets/authenticated-header';
import { LikedSongsSection } from '@/widgets/liked-songs';

export default function LikePage() {
  return (
    <div className="min-h-dvh bg-[#0b0b0d] text-zinc-100">
      <AuthenticatedHeader />
      <main className="mx-auto max-w-[1500px] px-6 py-12 sm:px-10">
        <p className="font-mono text-sm tracking-[0.4em] text-zinc-400">
          PERSONAL_ARCHIVE / SAVED_TRACKS
        </p>
        <h1 className="mt-2 font-sans text-2xl font-black uppercase italic tracking-tight text-white">
          My Favorites.
        </h1>
        <div className="mt-6">
          <LikedSongsSection />
        </div>
      </main>
    </div>
  );
}
