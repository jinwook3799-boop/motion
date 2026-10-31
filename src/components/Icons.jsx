// 글자 대신 쓰는 아이콘들
export function PlayIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="#3BCEAC" />
      <path d="M40 30 L72 50 L40 70 Z" fill="#fff" stroke="#fff" strokeWidth="6" strokeLinejoin="round" />
    </svg>
  );
}

export function FullscreenIcon({ exit = false }) {
  const d = exit
    ? 'M38 20 V38 H20 M62 20 V38 H80 M38 80 V62 H20 M62 80 V62 H80'
    : 'M20 38 V20 H38 M80 38 V20 H62 M20 62 V80 H38 M80 62 V80 H62';
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d={d} fill="none" stroke="#3A86FF" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CameraOffIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="12" y="30" width="56" height="42" rx="10" fill="#8D99AE" />
      <path d="M68 44 L88 32 V70 L68 58 Z" fill="#8D99AE" />
      <circle cx="40" cy="51" r="11" fill="#EDF2F4" />
      <line x1="16" y1="16" x2="86" y2="86" stroke="#FF5A5F" strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}

export function SadCloudIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M28 72 a18 18 0 0 1 2-36 a22 22 0 0 1 42 4 a16 16 0 0 1-2 32 Z" fill="#BFD7FF" />
      <circle cx="40" cy="54" r="4" fill="#3D2C2E" />
      <circle cx="62" cy="54" r="4" fill="#3D2C2E" />
      <path d="M42 66 q9 -7 18 0" fill="none" stroke="#3D2C2E" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function RetryIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M74 38 A28 28 0 1 0 78 58" fill="none" stroke="#3A86FF" strokeWidth="10" strokeLinecap="round" />
      <path d="M80 20 V42 H58" fill="none" stroke="#3A86FF" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
