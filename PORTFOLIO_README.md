# 🎤 장민석 | Frontend & AI Engineer Portfolio
## 싸스케 (SSASUKAE · SSAFY STAR K) — 실시간 화상 노래방

> **친구들과 화상으로 만나 함께 부르고, 카드로 방해하고, AI에게 피드백 받는 실시간 노래방 서비스**

![랜딩 페이지](docs/images/landing.png)

### 💡 프로젝트 개요
- **프로젝트 기간**: 2026.07.15 ~ 2026.08.13 (SSAFY 15기 공통 프로젝트, 6인 팀)
- **담당 역할**: Frontend & AI
- **수상**: SSAFY 15기 공통 프로젝트 **우수상** 🏆
- ※ 프로젝트 기간 종료로 배포 서버는 운영 중단 — 실제 동작은 하단 [동작 시연](#-동작-시연-demo) GIF 참고
- **핵심 기여**: 
  - 브라우저 기반 Web Audio 보컬 엔진 구축 및 오디오 파이프라인 최적화
  - WebRTC 환경에서의 실시간 인터랙티브 UI(카드 배틀 연출) 개발
  - 웹캠 제스처 인식 기반 실시간 DSP(음정/템포) 제어 시스템 연동
  - AI 가창 피드백 파이프라인 기획 및 프론트엔드 연동(마이페이지 대시보드 구현)

---

## 🏗️ 시스템 아키텍처 (Architecture)
> **💡 노란 블록**이 기획 및 개발을 담당한 영역입니다.

![시스템 아키텍처](docs/images/architecture.png)

---

## 📈 핵심 방 플로우 (Sequence Diagrams)
제가 주도적으로 설계하고 구현에 기여한 '일반 노래방 모드'와 '수성전(카드 배틀) 모드'의 코어 플로우 시퀀스입니다.

**[일반 노래방 모드 플로우]**
![일반 노래방 모드](docs/images/sequence-diagram/일반-노래방-모드.png)

**[수성전 모드 플로우]**
![수성전 모드](docs/images/sequence-diagram/수성전-모드.png)

---

## 🛠 사용 기술 (Tech Stack)

### Frontend
- **Framework & Libraries**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **State & Data**: Zustand 5, TanStack Query 5
- **Real-time & Media**: OpenVidu (WebRTC), `@stomp/stompjs` (WebSocket)
- **Vision**: MediaPipe Hands (웹캠 손 제스처 인식)

### Audio & DSP
- Web Audio API, Tone.js
- SoundTouch AudioWorklet (실시간 템포/피치 시프트)
- RNNoise WASM (노이즈 억제), pitchy (피치 검출)

### AI
- FastAPI, OpenAI API (gpt-5-mini, whisper-1)
- PostgreSQL pgvector (RAG 기반 피드백)

---

## ✨ 주요 기여 내용 및 성과 (Key Contributions)

### 1. Web Audio API 기반 실시간 보컬 엔진 개발 (FE)
브라우저 환경에서 실제 노래방과 같은 경험을 제공하기 위한 오디오 파이프라인을 구축했습니다.
- **노이즈 억제 및 이펙터 적용**: RNNoise WASM을 활용하여 잡음을 제거하고, Tone.js 리버브 기반 에코 효과를 실시간으로 마이크 스트림에 적용.
- **AudioWorklet 최적화**: 오디오 신호 처리를 메인 스레드와 분리하여 오디오 글리치 현상을 방지하고, WebRTC 화상 스트림과 안정적으로 연동.

### 2. 몰입감을 극대화하는 실시간 인터랙티브 UI 연출 (FE)
WebSocket 실시간 이벤트와 동기화되는 화려한 애니메이션을 통해 사용자 경험을 높였습니다.
- **수성전 카드 이펙트**: 상태 관리에 따라 발동되는 원형 타이머, 히트 컷인(Cut-in), 음파 리플 등 동적인 연출을 외부 애니메이션 라이브러리 없이 CSS Keyframes로 구현.
- **비동기 상태 동기화**: 방 플로우(대기방 → 곡 선택 → 공연 시작) 및 채팅 내역, 실시간 가사 싱크를 지연 없이 렌더링.

### 3. 웹캠 제스처 인식 및 실시간 DSP 제어 (FE/AI)
키보드나 마우스 조작 없이 노래 부르는 도중 직관적으로 개입할 수 있는 시스템을 도입했습니다.
- **제스처 인식**: 클라이언트 단에서 MediaPipe Hands로 사용자의 손 제스처를 실시간으로 판별 — 서버 왕복 없이 브라우저 안에서 인식부터 DSP 반영까지 완결.
- **피치 및 템포 시프팅**: 인식된 제스처 데이터를 바탕으로 SoundTouch AudioWorklet을 제어하여 재생 중인 음악의 템포와 피치를 즉각적으로 변경.

### 4. AI 가창 피드백 파이프라인 기획 및 대시보드 구축 (AI/FE)
단순한 노래방을 넘어 사용자 맞춤형 분석을 제공하는 시스템을 설계했습니다.
- **아키텍처 기획**: Whisper(STT)를 활용한 가사 전사 데이터와 pgvector(RAG)를 엮어 LLM이 정교한 피드백을 제공하도록 AI 서버 아키텍처 및 프롬프트 기획.
- **마이페이지 구현**: 사용자가 이전 공연 기록, AI 피드백 요약, 스탯 시각화 차트를 한눈에 확인할 수 있는 반응형 대시보드 개발.

---

## 🎯 트러블 슈팅 (Troubleshooting)

### 1. 청자 화면의 가사 하이라이트가 실제 들리는 소리보다 앞서가는 문제
- **문제**: 가창자의 목소리·MR은 WebRTC 지터 버퍼와 인코딩·디코딩을 거쳐 늦게 들리는데, 가사 시계는 공연 시작 이벤트 기준으로 곧바로 돌기 때문에 청자 화면에서는 가사가 소리보다 먼저 넘어감. 고정 상수로 보정해도 지터 버퍼가 네트워크 상태에 따라 계속 변해 참가자·시점마다 다시 어긋남.
- **해결**:
  1. WebRTC `getStats()`의 `jitterBufferDelay` 누적치를 1초 주기로 폴링, 스냅샷 간 차분으로 구간 평균 체류시간을 계산하고 지수이동평균(α=0.3)으로 스무딩해 **지터 버퍼 지연을 실측**.
  2. 가사 시계의 기준 신호(MR 위치 시그널)도 오디오와 같은 네트워크 경로를 타므로 **전송 지연은 서로 상쇄**됨을 이용 — 실측 지터 버퍼에 측정 불가능한 처리 비용(캡처·인코딩·디코딩, 120ms)만 더해 보정하고, 측정 전이거나 미지원 브라우저에서는 220ms 폴백 상수를 사용.
  3. 소절 넘김(100ms 틱)과 음절 하이라이트(50ms 틱)를 분리하고 말단 컴포넌트만 리렌더하도록 설계해, 보정 정밀도를 올리면서 렌더링 비용은 억제.

### 2. 마이크 스트림 하나로 송출·모니터링·채점을 겸하며 생기는 왜곡
- **문제**: ① 가창자가 자기 목소리를 WebRTC 루프백으로 모니터링하면 지터 버퍼 지연 탓에 에코처럼 들리고, ② 에코·볼륨 이펙트가 걸린 신호로 채점하면 점수가 왜곡되며, ③ 템포를 바꾸면 SoundTouch 처리 지연만큼 목소리와 MR이 어긋남.
- **해결**: Web Audio 그래프를 **송출·모니터·채점 3버스로 분리** 설계.
  - **모니터 버스**는 WebRTC를 거치지 않고 로컬 그래프에서 직접 분기 → 지터 버퍼 지연 제거.
  - **채점·STT 탭**은 에코·음량 이펙트 이전의 드라이 신호에서 분기 → 사용자가 만진 이펙트가 점수에 섞이지 않음.
  - **송출 버스**에만 컴프레서·리미터·메이크업 게인을 걸어 청자가 듣는 음량을 보정하고, SoundTouch 템포 스트레치 시에는 처리 지연만큼 모니터 목소리에 딜레이를 걸어 MR과의 싱크를 유지.

---

## 📸 동작 시연 (Demo)

| 기능 | 화면 (GIF) |
| --- | --- |
| **공연 진행 · 실시간 가사 싱크** | ![공연 진행](docs/images/gifs/01_lyrics_sync.gif) |
| **수성전 카드 배틀 (히트 컷인 연출)** | ![카드 배틀](docs/images/gifs/03_card_battle_interaction.gif) |
| **제스처 인식 DSP 제어 · AR 필터** | ![제스처 제어](docs/images/gifs/02_ar_face_filter.gif) |
| **마이페이지 AI 피드백 대시보드** | ![AI 피드백](docs/images/gifs/04_ai_analysis_dashboard.gif) |
| **곡 검색 모달** | ![곡 검색](docs/images/gifs/05_song_search_modal.gif) |
| **마이크·캠 디바이스 설정** | ![디바이스 설정](docs/images/gifs/06_device_settings.gif) |

---

## 🎤 결선 발표 자료 (직접 제작)

PowerPoint **Morph(모핑) 전환** 기반의 132장 결선 발표 덱을 직접 제작했습니다.
아래는 "Redis–MySQL 이중 쓰기 정합성" 트러블슈팅 파트의 모핑 연출 발췌입니다.

![결선 발표 모핑 연출](docs/images/gifs/07_presentation_morph.gif)

- 전체 흐름은 [발표 자료 발췌 PDF (14장)](exec/싸스케_결선발표_발췌.pdf)에서 확인할 수 있습니다.

---

## 💻 핵심 코드 스니펫 (Code Snippet)

### 1. 카메라 제스처 기반 DSP 실시간 제어 로직 (`useGestureDspControl.ts`)
카메라 렌즈 앞에서의 손 제스처를 인식하여 딜레이 없이 오디오 엔진의 템포와 피치를 조정하는 커스텀 훅의 일부입니다.
제로 스냅(Zero-snap) 처리를 통해 드래그 도중에도 음정이 원음(0)으로 쉽게 복귀하도록 UX를 개선한 점이 특징입니다.

```typescript
export function useGestureDspControl(options: UseGestureDspControlOptions) {
  // ... (초기화 및 생략) ...
  const [grabbedRowIndex, setGrabbedRowIndex] = useState<number | null>(null);
  const dragStartValueRef = useRef(0);

  // 제스처 드래그가 발생할 때 호출되는 핸들러 (MediaPipe 비전 인식 엔진과 연동)
  const handleDrag = useCallback(
    (rowIndex: number, deltaX: number) => {
      const row = rows[rowIndex];
      if (!row) return;

      const raw = dragStartValueRef.current + deltaX / row.dragSensitivity;
      
      // 음정·템포는 0(원음)에 자석처럼 붙게 처리하여 조작 편의성을 극대화
      const snapped =
        row.snapToZero && raw >= -ZERO_SNAP_RANGE && raw <= ZERO_SNAP_RANGE
          ? 0
          : Math.round(raw);
          
      // 최대/최소 한계치 제한
      const next = Math.min(row.max, Math.max(row.min, snapped));

      if (next === row.read(useStageStore.getState().settings)) return;
      
      // Zustand 및 Web Audio API 기반 오디오 엔진으로 설정값(Event) 실시간 발행
      publishSettings(row.write(next));
    },
    [publishSettings, rows]
  );
  // ... 생략 ...
}
```
