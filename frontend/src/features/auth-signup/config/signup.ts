export const SIGNUP_COPY = {
  title: '회원가입',
  description: '닉네임을 생성해주세요.',
  notice: '닉네임은 이후에 수정이 가능합니다.',
  nicknameLabel: 'STAR NICKNAME',
  nicknamePlaceholder: 'ENTER_IDENTITY',
  checkNickname: 'CHECK ID',
  checkingNickname: 'CHECKING...',
  nicknameAvailable: '사용 가능한 닉네임입니다.',
  termsPrefix: 'I agree to the',
  termsOfService: 'Terms of Service.',
  privacyPolicy: 'Privacy Policy.',
  submit: '회원가입 완료하기',
  submitting: '가입 중...',
  returnToLogin: 'RETURN TO LOGIN',
} as const;

export const SIGNUP_ERROR_COPY = {
  nicknameRequired: '닉네임을 입력해 주세요.',
  nicknameDuplicate: '이미 사용 중인 닉네임입니다.',
  nicknameCheckFailed: '닉네임 확인에 실패했습니다. 다시 시도해 주세요.',
  alreadySignedUp: '이미 가입된 계정입니다. 로그인으로 입장해 주세요.',
  default: '회원가입에 실패했습니다. 다시 시도해 주세요.',
} as const;

// 닉네임 길이 규칙은 마이페이지 수정과 공유하므로 entities/user가 단일 출처다.
export { NICKNAME_MAX_LENGTH } from '@/entities/user';
