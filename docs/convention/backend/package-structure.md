# Backend 패키지 구조 (Spring Boot 기준)

## 예시 (도메인 기준 구조)

```
com.example.project
├── domain/
│   ├── user/
│   │   ├── controller/
│   │   ├── service/
│   │   ├── repository/
│   │   ├── entity/
│   │   └── dto/
│   │       ├── request/
│   │       └── response/
│   └── board/
│       └── ...
├── global/
│   ├── config/          # Security, CORS, Swagger 등 설정
│   ├── exception/       # 공통 예외 처리 (@ControllerAdvice)
│   ├── common/          # 공통 응답 포맷, 유틸
│   └── security/
└── ProjectApplication.java
```

> 프로젝트 규모가 작다면 도메인 기준 대신 계층(layer) 기준(`controller/`, `service/`, `repository/`를 최상위에 두는 방식)도 무방합니다. 팀 규모/도메인 복잡도에 맞춰 선택하세요.

## 네이밍 규칙

| 대상 | 규칙 | 예시 |
|---|---|---|
| 클래스 | PascalCase | `UserService` |
| 메서드/변수 | camelCase | `findUserById` |
| 상수 | SNAKE_CASE (대문자) | `MAX_LOGIN_ATTEMPT` |
| Controller | `~Controller` 접미사 | `UserController` |
| Service | `~Service` (구현체는 `~ServiceImpl`) | `UserService`, `UserServiceImpl` |
| Repository | `~Repository` 접미사 | `UserRepository` |
| Request DTO | `~Request` 접미사 | `UserCreateRequest` |
| Response DTO | `~Response` 접미사 | `UserResponse` |

## 원칙

- Controller는 요청/응답 변환과 검증만 담당, 비즈니스 로직은 Service에 위임
- Entity를 API 응답에 직접 노출하지 않고 반드시 DTO로 변환하여 반환
