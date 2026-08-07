import type { FeedbackScores } from '@/entities/feedback';

/* 축 라벨을 키운 만큼 좌우 여백이 필요하다 — 폭을 넓히지 않으면 RHYTHM이 오른쪽에서 잘린다 */
const VIEW_WIDTH = 360;
const VIEW_HEIGHT = 292;
const CENTER_X = VIEW_WIDTH / 2;
const CENTER_Y = 150;
const RADIUS = 104;
const LABEL_RADIUS = RADIUS + 20;

const ACCENT = '#22d3ee';
/* 정점 도트를 데이터 선과 분리하는 서피스 링 색 (SettingsPanel 배경 계열) */
const SURFACE = '#141416';

type MetricKey = keyof Pick<
  FeedbackScores,
  'pitch' | 'rhythm' | 'stability' | 'lyricsAccuracy' | 'difficulty'
>;

/* difficulty만 곡 LV(0~10) 스케일이라 지표별 만점으로 비율을 계산한다 */
const METRICS: readonly { key: MetricKey; label: string; max: number }[] = [
  { key: 'pitch', label: 'PITCH', max: 100 },
  { key: 'rhythm', label: 'RHYTHM', max: 100 },
  { key: 'stability', label: 'STABILITY', max: 100 },
  { key: 'lyricsAccuracy', label: 'LYRICS', max: 100 },
  { key: 'difficulty', label: 'DIFF', max: 10 },
];

function formatMetricValue(key: MetricKey, value: number | null): string {
  if (value == null) return '--';
  return key === 'difficulty' ? `LV.${value}` : String(value);
}

function vertexAt(index: number, ratio: number): { x: number; y: number } {
  const angle = ((-90 + index * 72) * Math.PI) / 180;
  return {
    x: CENTER_X + RADIUS * ratio * Math.cos(angle),
    y: CENTER_Y + RADIUS * ratio * Math.sin(angle),
  };
}

function polygonPoints(ratios: number[]): string {
  return ratios
    .map((ratio, index) => {
      const { x, y } = vertexAt(index, ratio);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/* 데이터와 무관한 지오메트리는 렌더마다 재계산하지 않는다 */
const GRID_POLYGONS = [25, 50, 75, 100].map((level) =>
  polygonPoints(METRICS.map(() => level / 100)),
);

const SPOKES = METRICS.map((_, index) => vertexAt(index, 1));

const AXIS_LABELS = METRICS.map((metric, index) => {
  const angle = ((-90 + index * 72) * Math.PI) / 180;
  const cos = Math.cos(angle);

  let textAnchor: 'start' | 'middle' | 'end' = 'middle';
  if (cos > 0.3) textAnchor = 'start';
  if (cos < -0.3) textAnchor = 'end';

  return {
    label: metric.label,
    x: CENTER_X + LABEL_RADIUS * cos,
    y: CENTER_Y + LABEL_RADIUS * Math.sin(angle),
    textAnchor,
    dy: Math.sin(angle) > 0.3 ? '0.8em' : '0.3em',
  };
});

interface MetricRadarChartProps {
  scores: FeedbackScores;
}

export function MetricRadarChart({ scores }: MetricRadarChartProps) {
  const values = METRICS.map((metric) => scores[metric.key]);

  return (
    <div>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="지표별 점수 레이더 차트"
        className="mx-auto w-full max-w-[24rem]"
      >
        {GRID_POLYGONS.map((points) => (
          <polygon
            key={points}
            points={points}
            fill="none"
            stroke="rgb(255 255 255 / 0.06)"
            strokeWidth="1"
          />
        ))}
        {SPOKES.map(({ x, y }, index) => (
          <line
            key={METRICS[index].key}
            x1={CENTER_X}
            y1={CENTER_Y}
            x2={x}
            y2={y}
            stroke="rgb(255 255 255 / 0.06)"
            strokeWidth="1"
          />
        ))}

        <polygon
          points={polygonPoints(values.map((value, index) => (value ?? 0) / METRICS[index].max))}
          fill="rgb(34 211 238 / 0.10)"
          stroke={ACCENT}
          strokeWidth="2"
          strokeLinejoin="round"
          className="drop-shadow-[0_0_6px_rgba(34,211,238,0.45)]"
        />

        {values.map((value, index) => {
          const { x, y } = vertexAt(index, (value ?? 0) / METRICS[index].max);
          return (
            <circle key={METRICS[index].key} cx={x} cy={y} r="4" fill={ACCENT} stroke={SURFACE} strokeWidth="2">
              <title>{`${METRICS[index].label} ${formatMetricValue(METRICS[index].key, value)}`}</title>
            </circle>
          );
        })}

        {AXIS_LABELS.map(({ label, x, y, textAnchor, dy }) => (
          <text
            key={label}
            x={x}
            y={y}
            dy={dy}
            textAnchor={textAnchor}
            className="fill-zinc-300 font-mono text-[11px] font-bold tracking-[0.14em]"
          >
            {label}
          </text>
        ))}
      </svg>

      {/* 정확한 수치는 차트가 아니라 이 리스트가 담당한다 */}
      <ul className="mt-6 space-y-3 border-t border-white/[0.06] pt-5">
        {METRICS.map((metric, index) => {
          const value = values[index];
          return (
            <li key={metric.key} className="flex items-center gap-4">
              <span className="w-24 shrink-0 font-mono text-[0.66rem] font-bold tracking-[0.16em] text-zinc-300">
                {metric.label}
              </span>
              <span className="h-1.5 flex-1 bg-cyan-400/15">
                <span
                  className="block h-full bg-cyan-400"
                  style={{ width: `${((value ?? 0) / metric.max) * 100}%` }}
                />
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-sm font-bold tabular-nums text-white">
                {formatMetricValue(metric.key, value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
