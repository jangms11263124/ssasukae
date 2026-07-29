export function isMediaDevicesSupported() {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof navigator.mediaDevices?.enumerateDevices === 'function'
  );
}

/** 출력 기기 선택은 setSinkId에 의존하며 현재 Chromium 계열만 지원한다. */
export function isAudioOutputSelectionSupported() {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}
