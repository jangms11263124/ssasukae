import { SIGNUP_COPY } from '../config/signup';

interface SignupTermsAgreementProps {
  hasAcceptedTerms: boolean;
  hasAcceptedPrivacy: boolean;
  onTermsChange: (isChecked: boolean) => void;
  onPrivacyChange: (isChecked: boolean) => void;
}

interface AgreementCheckboxProps {
  id: string;
  isChecked: boolean;
  label: string;
  onChange: (isChecked: boolean) => void;
}

function AgreementCheckbox({ id, isChecked, label, onChange }: AgreementCheckboxProps) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-3 text-xs text-zinc-400">
      <input
        id={id}
        type="checkbox"
        checked={isChecked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 shrink-0 appearance-none border border-neon-cyan checked:bg-neon-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan"
      />
      <span>
        {SIGNUP_COPY.termsPrefix}{' '}
        <span className="text-neon-cyan">{label}</span>
      </span>
    </label>
  );
}

export function SignupTermsAgreement({
  hasAcceptedTerms,
  hasAcceptedPrivacy,
  onTermsChange,
  onPrivacyChange,
}: SignupTermsAgreementProps) {
  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">필수 약관 동의</legend>
      <AgreementCheckbox
        id="terms-of-service"
        isChecked={hasAcceptedTerms}
        label={SIGNUP_COPY.termsOfService}
        onChange={onTermsChange}
      />
      <AgreementCheckbox
        id="privacy-policy"
        isChecked={hasAcceptedPrivacy}
        label={SIGNUP_COPY.privacyPolicy}
        onChange={onPrivacyChange}
      />
    </fieldset>
  );
}
