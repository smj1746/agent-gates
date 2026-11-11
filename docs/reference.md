# 명령 레퍼런스

모든 명령에 쓸 수 있는 옵션

| 옵션                  | 뜻                                                                               |
| --------------------- | -------------------------------------------------------------------------------- |
| `-c, --config <파일>` | 설정 파일 경로. 주지 않으면 `agent-gates.config.json`을 찾고, 없으면 기본값을 씀 |
| `--json`              | 결과를 JSON으로 출력 (아래 각 명령의 형식)                                       |
| `-h, --help`          | 명령 도움말                                                                      |

종료 코드: `0` 통과 · `1` 규칙 위반 · `2` 사용법·설정·실행 환경 오류

---

## `agent-gates init`

현재 폴더에 아래 파일을 만듭니다. 이미 있는 파일은 건드리지 않습니다.

| 파일                      | 내용                                                     |
| ------------------------- | -------------------------------------------------------- |
| `agent-gates.config.json` | 기본 설정 + `scope` 예시                                 |
| `docs/GATES.md`           | 게이트 형식 안내 (HTML 주석 안)                          |
| `AGENTS.md`               | 확정의 기준 · 멈추는 조건 · 오류 게이트 · 끝내기 전 규칙 |

`AGENTS.md`가 이미 있으면 그대로 두고, 붙여 넣을 규칙을 화면에 보여 줍니다.

`--json` 출력

```json
[
  { "file": "agent-gates.config.json", "status": "created" },
  { "file": "AGENTS.md", "status": "skipped" }
]
```

---

## `agent-gates markers`

| 옵션           | 뜻                                                          |
| -------------- | ----------------------------------------------------------- |
| `--max <개수>` | 이 개수를 넘으면 종료 코드 1. 설정의 `markers.max`보다 우선 |

읽는 파일: `markers.include`에 맞고 `markers.exclude`에 맞지 않는 파일. `.git`, `node_modules`, 설정 파일, 게이트 파일, 1MB 넘는 파일, 바이너리 파일(앞 8000바이트에 NUL)은 늘 뺍니다.

한 줄에 여러 표식이 있으면 표식마다 하나씩 셉니다.

`--json` 출력

```json
{
  "scannedFiles": 2,
  "hits": [
    {
      "file": "lib/policy.ts",
      "line": 1,
      "marker": "backend",
      "label": "백엔드 확정 필요",
      "text": "// [백엔드 확정 필요] 정원이 찼을 때 예비 인원 상한"
    }
  ],
  "max": 2,
  "passed": true
}
```

---

## `agent-gates gates check [파일]`

파일을 주지 않으면 설정의 `gates.file`(기본 `docs/GATES.md`)을 읽습니다.

### 문서 형식

- `## G-숫자 | 제목` 또는 `### G-숫자 | 제목`이 게이트 하나를 엽니다. 다른 제목(`#`~`######`)이 나오면 닫힙니다.
- 들여쓰지 않은 `- 칸 이름: 값`(또는 `* `, 전각 콜론 `：`)이 칸입니다. 칸 이름의 `**굵게**`, `` `코드` `` 표시는 지우고 읽습니다.
- 들여쓴 다음 줄들은 바로 앞 칸의 값에 이어 붙습니다. (`대신 할 것:` 아래에 하위 목록을 쓸 수 있음)
- HTML 주석과 ` ``` `·`~~~` 코드 블록 안은 읽지 않습니다. 줄 번호는 원문 그대로 보고합니다.

### 규칙

| 규칙                    | 심각도 | 조건                                                                                        |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------- |
| `gates/file-not-found`  | 오류   | 파일이 없음                                                                                 |
| `gates/bad-id`          | 오류   | ID가 `G-숫자`가 아님 (`G-1`, `G-001` 모두 허용)                                             |
| `gates/duplicate-id`    | 오류   | 같은 ID가 두 번                                                                             |
| `gates/missing-field`   | 오류   | `gates.required`의 칸이 없음                                                                |
| `gates/empty-field`     | 오류   | 필수 칸의 값이 비어 있음                                                                    |
| `gates/bad-status`      | 오류   | `gates.statusField` 칸의 첫 단어가 `gates.statuses`에 없음 (`statuses`를 비우면 검사 안 함) |
| `gates/unknown-field`   | 경고   | `required`·`optional`에 없는 칸 (별칭을 바꾼 뒤 기준)                                       |
| `gates/duplicate-field` | 경고   | 한 게이트에 같은 칸이 두 번                                                                 |
| `gates/missing-title`   | 경고   | ID 뒤에 제목이 없음                                                                         |
| `gates/empty`           | 경고   | 게이트가 하나도 없음                                                                        |

`--json` 출력

```json
{
  "file": "docs/GATES.md",
  "gates": 2,
  "findings": [
    {
      "level": "error",
      "rule": "gates/missing-field",
      "message": "G-2: 필수 칸이 없습니다 — 대신 할 것",
      "file": "docs/GATES.md",
      "line": 15
    }
  ],
  "passed": false
}
```

---

## `agent-gates scope --owner <담당자>`

| 옵션                 | 뜻                                                |
| -------------------- | ------------------------------------------------- |
| `-o, --owner <이름>` | 검사할 담당자. `scope.owners`의 키 중 하나 (필수) |
| `--base <브랜치>`    | `git diff <브랜치>...HEAD`의 파일 (기본 `main`)   |
| `--staged`           | `git diff --cached`의 파일 (커밋 전 점검)         |
| `--files a,b`        | git 대신 쉼표로 나눈 파일 목록                    |

`--base`, `--staged`, `--files`는 하나만 쓸 수 있습니다. git은 `-z`로 읽어 한글·공백이 든 파일 이름도 그대로 받습니다. 삭제한 파일도 포함합니다.

판정 순서: 내 담당 → 공유 → 다른 담당 → 미지정. 내 담당 패턴에 맞으면 공유 패턴에도 맞더라도 내 담당으로 봅니다.

| 규칙                | 심각도 | 조건                      |
| ------------------- | ------ | ------------------------- |
| `scope/other-owner` | 오류   | 다른 담당자의 경로에 맞음 |
| `scope/shared`      | 경고   | `scope.shared`에 맞음     |
| `scope/unowned`     | 경고   | 어디에도 맞지 않음        |

`--json` 출력

```json
{
  "owner": "FE-A",
  "from": "main...HEAD",
  "entries": [{ "file": "components/home/Card.tsx", "verdict": "other", "owners": ["FE-B"] }],
  "findings": [
    {
      "level": "error",
      "rule": "scope/other-owner",
      "message": "…",
      "file": "components/home/Card.tsx"
    }
  ],
  "passed": false
}
```

---

## `agent-gates check`

`gates check`와 `markers`를 차례로 돌립니다. `--max`를 받습니다. 담당 범위 검사는 담당자마다 다르므로 포함하지 않습니다.

`--json` 출력: `{ "passed": boolean, "gates": <gates check 형식>, "markers": <markers 형식> }`

---

## 설정 파일 (`agent-gates.config.json`)

| 칸                  | 형식                                                               | 기본값                                                                             |
| ------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `markers.patterns`  | `{ id, text, label? }[]` (하나 이상, id는 겹치면 안 됨)            | 확인 필요 · 백엔드 확정 필요 · 임시                                                |
| `markers.include`   | 글롭 배열                                                          | `["**/*"]`                                                                         |
| `markers.exclude`   | 글롭 배열                                                          | `dist`, `build`, `out`, `coverage`, `.next`, `*.md`, `*.lock`, `package-lock.json` |
| `markers.max`       | 0 이상 정수 또는 `null`                                            | `null` (실패시키지 않음)                                                           |
| `gates.file`        | 문자열                                                             | `docs/GATES.md`                                                                    |
| `gates.required`    | 문자열 배열 (하나 이상)                                            | 상태 · 발생 상황 · 금지 경로 · 대신 할 것                                          |
| `gates.optional`    | 문자열 배열                                                        | 등록 · 원인 · 사전 체크 · 근거                                                     |
| `gates.aliases`     | `{ 다른 이름: 표준 이름 }` (표준 이름은 required·optional 중 하나) | `{ "증상": "발생 상황" }`                                                          |
| `gates.statusField` | 문자열                                                             | `상태`                                                                             |
| `gates.statuses`    | 문자열 배열 (비우면 검사 안 함)                                    | 활성 · 해제                                                                        |
| `scope.owners`      | `{ 담당자: 글롭 배열 }`                                            | `{}`                                                                               |
| `scope.shared`      | 글롭 배열                                                          | `[]`                                                                               |

알 수 없는 칸이 있으면 오타일 가능성이 커서 오류로 알립니다.

### 글롭

| 패턴      | 뜻                         |
| --------- | -------------------------- |
| `*`       | 슬래시를 뺀 0자 이상       |
| `?`       | 슬래시를 뺀 1자            |
| `**/`     | 폴더 0개 이상              |
| `**` (끝) | 그 아래 전부               |
| `{a,b}`   | a 또는 b (겹쳐 쓸 수 없음) |

패턴은 저장소 기준 경로 **전체**와 비교합니다. `*.md`는 루트의 파일만, `**/*.md`는 모든 폴더의 파일과 맞습니다.
