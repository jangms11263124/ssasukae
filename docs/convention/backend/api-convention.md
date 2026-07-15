# API 컨벤션 (REST)

## URL 규칙

- 리소스는 복수형 명사 사용: `/users`, `/boards`
- 경로는 kebab-case: `/user-profiles`
- 동사 사용 금지, HTTP 메서드로 행위 표현

| 행위 | Method | URL 예시 |
|---|---|---|
| 목록 조회 | GET | `/users` |
| 단건 조회 | GET | `/users/{id}` |
| 생성 | POST | `/users` |
| 전체 수정 | PUT | `/users/{id}` |
| 부분 수정 | PATCH | `/users/{id}` |
| 삭제 | DELETE | `/users/{id}` |

## 공통 응답 포맷

```json
{
  "success": true,
  "data": { },
  "error": null
}
```

에러 응답:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "해당 유저를 찾을 수 없습니다."
  }
}
```

## HTTP 상태 코드 원칙

| 코드 | 의미 |
|---|---|
| 200 | 조회/수정 성공 |
| 201 | 생성 성공 |
| 204 | 성공했으나 응답 바디 없음 (삭제 등) |
| 400 | 잘못된 요청 (유효성 검증 실패 등) |
| 401 | 인증 실패 |
| 403 | 권한 없음 |
| 404 | 리소스 없음 |
| 500 | 서버 내부 오류 |

## 예외 처리

- `@RestControllerAdvice`로 전역 예외 처리, 컨트롤러마다 try-catch 반복 금지
- 비즈니스 예외는 커스텀 Exception 클래스로 정의 (예: `UserNotFoundException`)
