import { AuthenticatedHeader } from '@/widgets/authenticated-header';

export default function LikePage() {
  return (
    <div className="min-h-dvh bg-white">
      <AuthenticatedHeader />
      <main className="grid place-items-center py-24">
        <h1 className="text-4xl font-black text-zinc-900">LIKE PAGE</h1>
      </main>
    </div>
  );
}
