# AI 서버 연동 스펙 — 곡 등록/분석

관리자가 곡을 등록하면 원곡 mp3를 분석해서 MIDI/MR/난이도/재생시간을 만들어내는 기능의 연동 스펙입니다. 백엔드와 AI 서버가 각자 무엇을 구현/검증해야 하는지 정리합니다.

## 전체 흐름

```
1. 관리자 브라우저 → 백엔드: POST /api/admin/songs/upload-ticket (관리자 로그인 세션)
   백엔드가 ROLE_ADMIN 검증 후, 단발성 업로드 티켓 발급

2. 관리자 브라우저 → AI 서버: title/artist/lyrics/albumImg/originalMp3 + 위 티켓
   (백엔드는 이 구간에 관여하지 않음 — AI 서버가 직접 받음)

3. AI 서버: 티켓 검증 → mp3 분석 (MIDI/MR 생성, 난이도/재생시간 산출)

4. AI 서버 → 백엔드: POST /internal/api/songs/analysis-result
   title/artist/lyrics/albumImg/midi/mr/difficulty/duration 전부를 콜백으로 전달
   백엔드가 이 시점에 Song을 최초 1회 생성
```

**Song은 4번 콜백이 성공적으로 도착해야만 생성됩니다.** 그 전까지는 DB에 아무 흔적도 남지 않습니다(중간 상태/PENDING 같은 것 없음). 원곡 mp3는 분석 후 폐기하며, 백엔드/S3 어디에도 저장하지 않습니다.

---

## 1. 업로드 티켓 검증 (AI 서버가 구현해야 함)

브라우저가 2번 단계에서 보내는 티켓은 **JWT**입니다. AI 서버는 요청을 받으면 이 티켓을 검증해서, 정말로 우리 백엔드가 관리자에게 발급해준 것인지 확인해야 합니다.

- **서명 방식**: HMAC-SHA256 (`HS256`)
- **시크릿**: `AI_UPLOAD_TICKET_SECRET` (별도 채널로 전달 — 이 문서에는 값을 적지 않습니다)
- **만료**: 발급 시점부터 10분

### Claims

| claim | 타입 | 설명 |
|---|---|---|
| `sub` | string | 티켓을 발급받은 관리자의 userId |
| `purpose` | string | 항상 `"SONG_AI_UPLOAD"` 고정값 |
| `iat` | number (epoch seconds) | 발급 시각 |
| `exp` | number (epoch seconds) | 만료 시각 |

### 검증 절차

1. 요청에 티켓이 없으면 즉시 거부
2. `AI_UPLOAD_TICKET_SECRET`으로 서명 검증 (실패 시 거부)
3. `exp`가 현재 시각보다 이전이면 거부 (만료)
4. `purpose` claim이 `"SONG_AI_UPLOAD"`가 아니면 거부
5. 통과하면 분석 진행

검증 실패 시 401(또는 403)로 응답하면 됩니다 — 이 응답을 백엔드가 받는 게 아니라 브라우저가 직접 받으므로, 응답 형식은 AI 서버 자유입니다.

---

## 2. 브라우저 → AI 서버 요청 (참고용)

이 엔드포인트는 AI 서버가 직접 설계/구현합니다. 프론트엔드가 실어 보내는 데이터는 다음과 같습니다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `title` | text | 곡 제목 |
| `artist` | text | 가수명 |
| `lyrics` | file | 가사 파일 |
| `albumImg` | file | 앨범 커버 이미지 |
| `originalMp3` | file | 분석할 원곡 mp3 |
| `ticket` | text | 위 1번에서 검증할 JWT |

AI 서버는 `title`/`artist`/`lyrics`/`albumImg`를 분석에 쓰지 않더라도, **4번 콜백 때 그대로 다시 돌려줘야 하므로 반드시 보관**하고 있어야 합니다 (백엔드는 이 시점 이전엔 이 값들을 전혀 모릅니다).

---

## 3. 분석 완료 콜백 — AI 서버 → 백엔드 (백엔드가 이미 구현 완료)

```
POST /internal/api/songs/analysis-result
Content-Type: multipart/form-data
X-AI-API-Key: {AI_INTERNAL_API_KEY}
```

### 요청 필드 (multipart)

| 필드 | 타입 | 설명 |
|---|---|---|
| `title` | text | 2번에서 받았던 값 그대로 |
| `artist` | text | 2번에서 받았던 값 그대로 |
| `difficulty` | text (정수) | 산출한 난이도 |
| `duration` | text (정수, 초 단위) | 산출한 재생 시간 |
| `albumImg` | file | 2번에서 받았던 파일 그대로 |
| `lyrics` | file | 2번에서 받았던 파일 그대로 |
| `midi` | file | 분석 결과 MIDI 파일 |
| `mr` | file | 분석 결과 MR 파일 |

### 인증

`X-AI-API-Key` 헤더에 `AI_INTERNAL_API_KEY` 값을 그대로 실어 보내야 합니다. 이 값은 매 요청 고정값이며(발급/만료 개념 없음), 별도 채널로 전달합니다.

### 응답

- 성공: `200 OK`, body `{ "songId": number }`
- `X-AI-API-Key` 누락/불일치: `401 Unauthorized`
- 그 외 실패 시 5xx — 이 경우 Song이 생성되지 않으므로, 재시도하려면 2번 단계부터 다시 진행해야 합니다 (백엔드에 별도 재시도/복구 로직 없음).
