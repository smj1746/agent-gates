# 변경 기록

## 0.1.0 — 2026-11-11

첫 공개.

- `init`: 설정 파일, `docs/GATES.md`, `AGENTS.md` 만들기 (덮어쓰지 않음)
- `markers`: 미정 표식을 파일·줄·종류로 모으기, `--max` 기준
- `gates check`: 오류 게이트 형식 검사 (ID, 필수 칸, 상태 값, 알 수 없는 칸)
- `scope`: `git diff`·`--staged`·`--files`로 바뀐 파일의 담당 범위 검사
- `check`: CI용 묶음 검사
- 모든 명령 `--json` 출력, 종료 코드 0·1·2
