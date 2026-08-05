import type { PerformanceSettings } from '@/entities/performance';

/** 사용자에게 보이는 패널 이름. 열기 버튼·패널 제목·aria-label에서 함께 쓴다. */
export const SOUND_PANEL_LABEL = 'DSP';

/** 템포 한 칸 = tempoPercent 몇 %인지. AudioEnginePanel과 같은 값이어야 어긋나지 않는다. */
export const TEMPO_STEP_PERCENT = 5;

export interface DspRowDefinition {
  key: 'pitch' | 'tempo' | 'echo' | 'volume';
  label: string;
  min: number;
  max: number;
  /** 이 픽셀만큼 좌우로 끌 때 1단위 변한다 (음정·템포 120, 에코·음량 12) */
  dragSensitivity: number;
  /** 0 근처에서 자석처럼 붙는지 (음정·템포만) */
  snapToZero: boolean;
  read: (settings: PerformanceSettings) => number;
  write: (value: number) => Partial<PerformanceSettings>;
  format: (value: number) => string;
}

// 값은 stageStore.settings(서버 동기화)에 있고 여기서는 읽고 쓰는 방법만 정의한다.
export const DSP_ROWS: readonly DspRowDefinition[] = [
  {
    key: 'pitch',
    label: '음정',
    min: -6,
    max: 6,
    dragSensitivity: 120,
    snapToZero: true,
    read: (settings) => settings.keyOffset,
    write: (value) => ({ keyOffset: value }),
    format: (value) => `${value > 0 ? '+' : ''}${value} Key`,
  },
  {
    key: 'tempo',
    label: '템포',
    min: -6,
    max: 6,
    dragSensitivity: 120,
    snapToZero: true,
    read: (settings) => Math.round((settings.tempoPercent - 100) / TEMPO_STEP_PERCENT),
    write: (value) => ({ tempoPercent: 100 + value * TEMPO_STEP_PERCENT }),
    // 조절 UI가 +/- 스테퍼라 음정과 같은 'Key' 표기로 통일한다.
    format: (value) => `${value > 0 ? '+' : ''}${value} Key`,
  },
  {
    key: 'echo',
    label: '에코',
    min: 0,
    max: 100,
    dragSensitivity: 12,
    snapToZero: false,
    read: (settings) => settings.echoLevel,
    write: (value) => ({ echoLevel: value }),
    format: (value) => `${value}%`,
  },
  {
    key: 'volume',
    // AudioEnginePanel의 MR VOLUME과 같은 대상이라 라벨도 맞춘다.
    label: 'MR 음량',
    min: 0,
    max: 100,
    dragSensitivity: 12,
    snapToZero: false,
    read: (settings) => settings.mrVolumePercent,
    write: (value) => ({ mrVolumePercent: value }),
    format: (value) => `${value}%`,
  },
];

/**
 * 수성전에서 가창자가 조절할 수 없는 항목. 공격 카드가 흔드는 값이라 손으로 되돌릴 수 없어야 한다.
 * 서버(PerformanceService)도 같은 두 필드는 요청값을 무시하고 저장된 base를 유지하므로,
 * 여기서 빠뜨려도 값이 바뀌지는 않는다. 다만 조절되지 않는 항목을 띄워 두게 되니 맞춰 둔다.
 */
const BATTLE_LOCKED_KEYS: readonly DspRowDefinition['key'][] = ['pitch', 'tempo'];

const BATTLE_DSP_ROWS: readonly DspRowDefinition[] = DSP_ROWS.filter(
  (row) => !BATTLE_LOCKED_KEYS.includes(row.key),
);

/**
 * 제스처와 패널이 같은 배열을 써야 한다 — 행 인덱스로 서로를 가리키므로, 한쪽만 필터하면
 * 강조되는 항목과 실제 조절 대상이 어긋난다. 반환값은 모듈 상수라 렌더마다 바뀌지 않는다.
 */
export function resolveDspRows(isBattleMode: boolean): readonly DspRowDefinition[] {
  return isBattleMode ? BATTLE_DSP_ROWS : DSP_ROWS;
}

/** 0점 자석 스냅이 걸리는 범위 */
export const ZERO_SNAP_RANGE = 0.6;
