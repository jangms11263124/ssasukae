# AI 서버 연동 스펙 — 곡 등록/분석

> `song-analysis` 서비스 구현 기준  
> 최종 수정: 2026-08-08

관리자가 곡 정보와 원곡 MP3를 AI 서버에 직접 업로드하면, AI 서버가 요청을 접수한 뒤 백그라운드에서 MIDI 데이터, MR, 난이도, 재생 시간을 생성하고 백엔드 콜백을 통해 Song을 등록합니다.

## 1. 전체 흐름

```text
1. 관리자 브라우저 → 백엔드
   POST /api/admin/songs/upload-ticket
   백엔드가 관리자 권한을 확인하고 단기 업로드 JWT를 발급한다.

2. 관리자 브라우저 → AI 서버
   POST /api/admin/songs
   title, artist, lyrics, albumImg, originalMp3, ticket을
   multipart/form-data로 직접 전송한다.

3. AI 서버
   JWT와 요청값을 검증하고 업로드 파일을 임시 저장한다.

4. AI 서버 → 관리자 브라우저
   파일 접수가 완료되면 즉시 202 Accepted와 jobId를 반환한다.

5. AI 서버
   백그라운드에서 원곡을 분석해 MIDI JSON, MR MP3,
   난이도, 재생 시간을 생성한다.

6. AI 서버 → 백엔드
   POST /internal/api/songs/analysis-result
   곡 정보, 원본 앨범 이미지/가사, 분석 결과를 전달한다.

7. 백엔드
   콜백이 성공적으로 도착한 시점에 Song을 생성하고 songId를 반환한다.

8. AI 서버
   콜백 성공을 로그에 기록하고 임시 파일을 삭제한다.
```

Song은 6~7번 콜백이 성공해야 생성됩니다. 그 전에는 백엔드 DB에 PENDING 레코드가 생기지 않습니다.

현재 프론트 요청은 비동기 접수 방식입니다. 프론트는 `202 Accepted`만 받고 최종 `songId`는 받지 않습니다.

---

## 2. 배포 주소와 CORS

### AI 서버 Base URL

```text
https://<song-analysis-host>
```

Pod가 재생성되거나 마이그레이션되면 Pod ID와 Base URL이 변경될 수 있으므로 프론트 환경변수로 관리합니다.

```env
NEXT_PUBLIC_AI_SERVER_URL=https://<song-analysis-host>
```

### 허용 Origin

```text
https://ssafystar-k.site
http://localhost:3000
```

프론트는 RunPod API Key나 `Authorization` 헤더를 보내지 않습니다. 업로드 JWT가 애플리케이션 인증 역할을 합니다.

브라우저에서 `FormData`를 사용할 때 `Content-Type` 헤더를 직접 지정하지 않습니다. 브라우저가 multipart boundary를 포함한 헤더를 자동 생성해야 합니다.

---

## 3. 업로드 티켓

백엔드가 관리자에게 발급하고 AI 서버가 검증하는 JWT입니다.

### 발급 API

```http
POST /api/admin/songs/upload-ticket
```

발급 API와 관리자 권한 검증은 백엔드 책임입니다.

### JWT 규격

- 서명 알고리즘: `HS256`
- 서명 시크릿: `AI_UPLOAD_TICKET_SECRET`
- 권장 유효시간: 발급 후 10분

| Claim | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `sub` | string | O | 티켓을 발급받은 관리자의 userId |
| `purpose` | string | O | 항상 `SONG_AI_UPLOAD` |
| `iat` | number | O | 발급 시각, epoch seconds |
| `exp` | number | O | 만료 시각, epoch seconds |

### AI 서버 검증 항목

1. 티켓 필드 존재 여부
2. `AI_UPLOAD_TICKET_SECRET`을 이용한 HS256 서명
3. `sub`, `purpose`, `iat`, `exp` 존재 여부
4. `sub`가 비어 있지 않은 문자열인지 여부
5. `exp` 만료 여부
6. `purpose == "SONG_AI_UPLOAD"` 여부

현재 AI 서버는 `jti` 또는 별도 사용 이력을 저장하지 않습니다. 따라서 티켓은 만료 전까지 기술적으로 재사용될 수 있습니다. 엄격한 일회성 티켓이 필요하면 백엔드 또는 공유 저장소를 이용한 replay 방지 기능이 별도로 필요합니다.

---

## 4. 곡 분석 접수 API

### 요청

```http
POST /api/admin/songs
Content-Type: multipart/form-data
```

RunPod `Authorization` 헤더는 사용하지 않습니다.

### multipart 필드

| 필드 | 타입 | 필수 | 허용 형식 | 최대 크기 | 설명 |
| --- | --- | --- | --- | --- | --- |
| `title` | text | O | 비어 있지 않은 문자열 | - | 곡 제목 |
| `artist` | text | O | 비어 있지 않은 문자열 | - | 가수명 |
| `ticket` | text | O | JWT | - | 백엔드가 발급한 업로드 티켓 |
| `originalMp3` | file | O | `.mp3` | 200MB | 분석할 원곡 |
| `albumImg` | file | O | `.jpg`, `.jpeg`, `.png`, `.webp` | 20MB | 앨범 이미지 |
| `lyrics` | file | O | `.txt`, `.lrc`, `.json` | 5MB | 가사 파일 |

현재 파일 형식 검사는 파일명 확장자를 기준으로 합니다. MP3 파일의 실제 디코딩 가능 여부는 백그라운드 분석 과정에서 확인됩니다.

`title`, `artist`, `albumImg`, `lyrics`는 분석 완료 후 백엔드 콜백에 다시 사용하므로 작업 디렉터리에 임시 보관합니다.

### cURL 예시

`curl -F`가 multipart boundary를 자동 생성하므로 `Content-Type` 헤더를 직접 추가하지 않습니다.

```bash
SONG_ANALYSIS_BASE_URL="https://<song-analysis-host>"

curl -X POST \
  "${SONG_ANALYSIS_BASE_URL}/api/admin/songs" \
  -F "title=밤양갱" \
  -F "artist=비비" \
  -F "originalMp3=@original.mp3" \
  -F "albumImg=@album.jpg" \
  -F "lyrics=@lyrics.txt" \
  -F "ticket={UPLOAD_TICKET}"
```

### 프론트엔드 예시

```javascript
const formData = new FormData();
formData.append("title", title);
formData.append("artist", artist);
formData.append("ticket", uploadTicket);
formData.append("originalMp3", originalMp3);
formData.append("albumImg", albumImg);
formData.append("lyrics", lyrics);

const response = await fetch(
  `${process.env.NEXT_PUBLIC_AI_SERVER_URL}/api/admin/songs`,
  {
    method: "POST",
    body: formData,
  },
);
```

---

## 5. 접수 성공 응답

파일 전송과 AI 서버의 임시 저장이 완료되고 백그라운드 분석 작업이 등록된 경우입니다.

```http
202 Accepted
Content-Type: application/json
```

```json
{
  "jobId": "3de22506-5d90-4fd0-b439-3fd6003bf842",
  "status": "accepted"
}
```

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `jobId` | string(UUID) | AI 서버 내부 작업 식별자 |
| `status` | string | 항상 `accepted` |

`202`는 분석 성공이나 Song 생성을 의미하지 않습니다. 업로드 파일이 접수되어 분석이 시작된다는 의미입니다.

---

## 6. 접수 단계 에러 응답

접수 완료 전에 발생한 오류만 원 요청에 HTTP 에러로 반환됩니다.

현재 공통 에러 형식은 FastAPI 기본 형식입니다.

```json
{
  "detail": "Invalid upload ticket."
}
```

필수 필드가 누락된 경우 `detail`은 문자열이 아니라 validation error 배열입니다.

| HTTP Status | 발생 조건 | 현재 `detail` 예시 |
| --- | --- | --- |
| `400` | `title`이 빈 문자열 | `title must not be empty.` |
| `400` | `artist`가 빈 문자열 | `artist must not be empty.` |
| `400` | 원곡 확장자가 `.mp3`가 아님 | `originalMp3 must be an .mp3 file.` |
| `400` | 지원하지 않는 이미지 확장자 | `Unsupported albumImg file type.` |
| `400` | 지원하지 않는 가사 확장자 | `Unsupported lyrics file type.` |
| `401` | JWT 서명 또는 형식이 유효하지 않음 | `Invalid upload ticket.` |
| `401` | JWT 만료 | `Upload ticket has expired.` |
| `401` | `sub`가 유효하지 않음 | `Invalid upload ticket subject.` |
| `403` | purpose 불일치 | `Invalid upload ticket purpose.` |
| `413` | 파일 크기 제한 초과 | `File size limit is {N}MB.` |
| `422` | 필수 multipart 필드 누락 또는 타입 오류 | FastAPI validation error 배열 |
| `500` | 업로드 티켓 시크릿 미설정 | `AI_UPLOAD_TICKET_SECRET is not configured.` |

---

## 7. 백그라운드 분석

AI 서버는 `202 Accepted` 반환 후 다음 작업을 수행합니다.

1. 원곡에서 보컬과 반주 분리
2. 보컬 기준 음정/타이밍 분석
3. MIDI 역할의 reference JSON 생성
4. 보컬이 제거된 MR을 MP3로 인코딩
5. 난이도 계산
6. 재생 시간을 초 단위 정수로 계산
7. 백엔드 콜백 호출

### 결과물

| 결과 | 형식 | 설명 |
| --- | --- | --- |
| `midi` | JSON file, `application/json` | 음정과 타이밍이 포함된 reference 데이터 |
| `mr` | MP3 file, `audio/mpeg` | 보컬이 제거된 MR, 기본 192kbps |
| `difficulty` | integer | 1~10 범위 |
| `duration` | integer | 초 단위, 반올림 |

현재 `midi` 필드는 표준 `.mid` 바이너리가 아니라 JSON 파일입니다. 백엔드는 이 형식을 수용해야 합니다.

---

## 8. 분석 완료 콜백

### 요청

```http
POST /internal/api/songs/analysis-result
Content-Type: multipart/form-data
X-AI-API-Key: {AI_INTERNAL_API_KEY}
```

실제 전체 URL은 AI 서버 환경변수로 설정합니다.

```text
BACKEND_ANALYSIS_RESULT_URL=https://api.ssafystar-k.site/internal/api/songs/analysis-result
```

### multipart 필드

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `title` | text | 업로드 요청에서 받은 값 |
| `artist` | text | 업로드 요청에서 받은 값 |
| `difficulty` | text(integer) | 1~10 범위의 난이도 |
| `duration` | text(integer) | 초 단위 재생 시간 |
| `albumImg` | file | 업로드 요청에서 받은 원본 파일 |
| `lyrics` | file | 업로드 요청에서 받은 원본 파일 |
| `midi` | file(JSON) | 분석 결과 reference JSON |
| `mr` | file(MP3) | 분석 결과 MR MP3 |

### 인증

```http
X-AI-API-Key: {AI_INTERNAL_API_KEY}
```

`AI_INTERNAL_API_KEY`는 AI 서버와 백엔드만 알고 있어야 하며 프론트에 전달하지 않습니다.

### 백엔드 성공 응답

백엔드는 반드시 `200 OK`와 숫자 `songId`를 반환해야 합니다.

```http
200 OK
Content-Type: application/json
```

```json
{
  "songId": 1
}
```

AI 서버는 다음 경우 콜백 실패로 처리합니다.

- 연결 실패
- 기본 120초 안에 응답하지 않음
- HTTP Status가 정확히 `200`이 아님
- 응답이 JSON이 아님
- `songId`가 숫자가 아님

현재 자동 재시도는 없습니다.

---

## 9. 202 응답 이후 실패 처리

분석 또는 콜백 오류는 이미 `202` 응답을 받은 브라우저 요청에 다시 반환할 수 없습니다.

현재 동작은 다음과 같습니다.

- AI 서버 로그에 실패 원인과 stack trace 기록
- `PRESERVE_FAILED_JOBS=0`인 운영 환경에서는 임시 파일 삭제
- 백엔드에는 Song이나 PENDING 레코드가 생성되지 않음
- 프론트에는 별도 실패 알림 없음
- 재시도하려면 새 업로드 티켓을 발급받고 업로드 단계부터 다시 수행

현재 별도의 작업 상태 조회 API와 실패 콜백 API는 구현되어 있지 않습니다. 프론트에서 최종 성공/실패를 명확히 표시해야 한다면 다음 중 하나를 추가해야 합니다.

1. `GET /api/admin/songs/jobs/{jobId}` 상태 조회 API
2. AI 서버 → 백엔드 실패 콜백
3. 백엔드 PENDING 상태 및 jobId 저장

---

## 10. 파일 보관 및 삭제 정책

- 업로드 파일은 Pod의 작업 디렉터리에만 임시 저장합니다.
- 원곡 MP3는 백엔드 또는 S3에 전달하거나 영구 저장하지 않습니다.
- 분석 성공 및 백엔드 콜백 성공 후 작업 디렉터리를 삭제합니다.
- 운영 환경에서 `PRESERVE_FAILED_JOBS=0`이면 실패한 작업의 파일도 삭제합니다.
- Pod가 중지되거나 재시작되면 볼륨에 저장되지 않은 진행 중 파일과 작업은 소실됩니다.

---

## 11. 운영 환경변수

| 환경변수 | 필수 | 설명 |
| --- | --- | --- |
| `PORT` | O | FastAPI 포트, 현재 `8000` |
| `AI_UPLOAD_TICKET_SECRET` | O | 업로드 JWT 검증 시크릿 |
| `AI_INTERNAL_API_KEY` | O | 백엔드 콜백 인증 키 |
| `BACKEND_ANALYSIS_RESULT_URL` | O | 백엔드 콜백 전체 URL |
| `CORS_ALLOW_ORIGINS` | O | 쉼표로 구분한 허용 Origin 목록 |
| `PRESERVE_FAILED_JOBS` | 권장 | 운영값 `0` |
| `BACKEND_CALLBACK_TIMEOUT_SECONDS` | 선택 | 콜백 제한 시간, 기본 120초 |
| `BACKEND_CALLBACK_MP3_BITRATE` | 선택 | MR MP3 비트레이트, 기본 `192k` |
| `AUDIO_SEPARATOR_CHUNK_DURATION_SECONDS` | 선택 | 음원 분리 chunk 길이, 기본 30초 |

현재 운영 권장값:

```env
PORT=8000
BACKEND_ANALYSIS_RESULT_URL=https://api.ssafystar-k.site/internal/api/songs/analysis-result
CORS_ALLOW_ORIGINS=https://ssafystar-k.site,http://localhost:3000
PRESERVE_FAILED_JOBS=0
BACKEND_CALLBACK_TIMEOUT_SECONDS=120
BACKEND_CALLBACK_MP3_BITRATE=192k
AUDIO_SEPARATOR_CHUNK_DURATION_SECONDS=30
```

비밀값인 `AI_UPLOAD_TICKET_SECRET`과 `AI_INTERNAL_API_KEY`는 문서나 프론트 코드에 기록하지 않습니다.

---

## 12. 현재 지원 및 비지원 사항

### 지원

- 공개 Pod URL을 통한 브라우저 직접 업로드
- 업로드 JWT 검증
- MP3, 이미지, 가사 파일 크기 제한
- 백그라운드 음원 분석
- MIDI JSON 및 MR MP3 생성
- 백엔드 multipart 콜백
- 분석 완료 후 원곡 및 임시 파일 삭제

### 미지원

- RunPod API Key를 이용한 브라우저 호출
- 업로드 티켓 replay 방지
- 분석 진행률 조회
- jobId 상태 조회
- 분석 실패 콜백
- 콜백 자동 재시도
- Pod 재시작 후 진행 중 작업 복구

---

## 13. 레거시 경로

다음 경로는 기존 호출 호환을 위해 남아 있지만 OpenAPI 문서에서는 숨겨져 있습니다.

```http
POST /api/v1/admin/songs/analyze
```

신규 프론트 및 문서에서는 반드시 다음 경로를 사용합니다.

```http
POST /api/admin/songs
```
