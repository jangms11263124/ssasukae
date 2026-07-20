# Issue 101 specification conflicts

TODO(SPEC-CONFLICT)

- The plan names `develop` as the integration branch, while this repository uses `development` locally, remotely, and in GitLab CI. This branch was created from `development`.
- The example package root is `com.ssasukae.backend`, while the existing application root is `com.ssafy.ssasukae`. The existing package root is preserved to avoid an out-of-scope refactor.
- The plan's example error response differs from the existing `ErrorResponse` contract. Issue 101 explicitly says to reuse an existing error structure, so this branch tests and preserves the current contract.
