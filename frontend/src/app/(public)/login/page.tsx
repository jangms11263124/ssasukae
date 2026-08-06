import { GuestOnlyGuard } from '@/features/auth-guard';
import { LandingSplit } from '@/widgets/landing-split';

export default function LoginPage() {
  return (
    <GuestOnlyGuard>
      <LandingSplit />
    </GuestOnlyGuard>
  );
}
