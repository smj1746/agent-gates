# agent-gates

[![CI](https://github.com/smj1746/agent-gates/actions/workflows/ci.yml/badge.svg)](https://github.com/smj1746/agent-gates/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D22.12-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

**AI 코딩 에이전트와 함께 쓰는 저장소의 작업 규칙을 검사하는 CLI**입니다.
`CLAUDE.md`·`AGENTS.md`에 적어 둔 규칙 가운데 기계가 확인할 수 있는 세 가지를 명령으로 만들었습니다.

```bash
npx github:smj1746/agent-gates check
```

## 목차

1. [왜 만들었나](#1-왜-만들었나)
2. [무엇을 검사하나](#2-무엇을-검사하나)
3. [빠른 시작](#3-빠른-시작)
4. [명령](#4-명령)
5. [설정](#5-설정)
6. [CI에서 쓰기](#6-ci에서-쓰기)
7. [구조와 설계 결정](#7-구조와-설계-결정)
8. [알려진 이슈](#8-알려진-이슈)
9. [향후 개발 방향](#9-향후-개발-방향)

---

## 1. 왜 만들었나

명세가 비어 있는 상태에서 AI 코딩 에이전트에게 일을 맡기면, 에이전트는 API 경로나 응답 필드를 그럴듯하게 지어냅니다. 그래서 두 프로젝트에서 에이전트가 따를 규칙을 저장소 문서로 정해 운영했습니다.

| 프로젝트                                  | 운영한 규칙                                                                                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 해커톤 프론트엔드 (1인, Claude Code)      | 확정된 것만 구현하고 미정 값은 `TODO(확인필요)`로 남기기 · 같은 오류를 두 번 못 고치면 멈추고, 해결하면 `GATES.md`에 '금지 경로 / 대신 할 것'으로 등록하기 |
| 팀 프론트엔드 (2인, Claude Code 스킬 9개) | 미정 항목을 `[백엔드 확정 필요]` 등 표식으로 코드에 남기기 · 담당 밖 파일을 고쳐야 하면 멈추고 알리기                                                      |

규칙은 문서에 있었지만, **지켜졌는지는 매번 사람이 눈으로 확인**했습니다. 미정 표식은 `grep`으로 찾고, 게이트에 칸이 빠졌는지는 읽어서 보고, 담당 밖 파일은 PR을 열어 봐야 알았습니다. 이 확인을 사람과 에이전트가 **같은 명령, 같은 기준**으로 하게 만드는 것이 이 도구의 목표입니다.

## 2. 무엇을 검사하나

| 명령          | 검사                                                                                             | 실패 조건 (종료 코드 1)        |
| ------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ |
| `markers`     | 코드에 남은 미정 표식(`TODO(확인필요)`, `[백엔드 확정 필요]`, `[임시]` 등)을 파일·줄·종류로 모음 | 정한 최대 개수를 넘을 때       |
| `gates check` | `GATES.md`의 게이트가 형식을 지켰는지 (ID, 필수 칸, 상태 값)                                     | 형식 오류가 있을 때            |
| `scope`       | 바뀐 파일이 내 담당 범위 안인지 (`git diff` 기준)                                                | 다른 담당자의 파일을 고쳤을 때 |
| `check`       | CI용 묶음: `gates check` + `markers`                                                             | 둘 중 하나라도 실패할 때       |
| `init`        | 설정 파일, `docs/GATES.md`, `AGENTS.md` 만들기 (있으면 덮어쓰지 않음)                            | —                              |

## 3. 빠른 시작

아직 npm에 배포하지 않아 GitHub에서 바로 실행합니다. (Node.js 22.12 이상)

```bash
# 1. 설정 파일 · docs/GATES.md · AGENTS.md 만들기
npx github:smj1746/agent-gates init

# 2. 미정 표식이 몇 개 남았는지 보기
npx github:smj1746/agent-gates markers

# 3. 게이트 형식과 표식 개수를 한 번에 검사
npx github:smj1746/agent-gates check
```

프로젝트 개발 의존성으로 넣어도 됩니다.

```bash
npm install -D github:smj1746/agent-gates
npx agent-gates check
```

## 4. 명령

모든 명령은 `--json`(기계가 읽는 출력), `-c, --config <파일>`, `-h, --help`를 받습니다. 전체 옵션은 [docs/reference.md](docs/reference.md)에 있습니다.

### `markers` — 미정 표식 모으기

```text
$ agent-gates markers --max 2
미정 표식 3개 (파일 2개 / 검사한 파일 2개)

  확인 필요 (1)
    lib/api/booking.ts:2  today: '/api/v1/today', // TODO(확인필요) 백엔드 주소 확정 전

  백엔드 확정 필요 (1)
    lib/policy.ts:1  // [백엔드 확정 필요] 정원이 찼을 때 예비 인원 상한

  임시 (1)
    lib/policy.ts:3  // [임시] 만 14세 기준은 고객사 답을 받으면 바꾼다

기준 최대 2개 → 실패: 1개를 확정하거나 지워 주세요.
```

기준(`--max` 또는 설정의 `markers.max`)이 없으면 개수만 알리고 실패시키지 않습니다. 미정 표식은 '없애야 할 것'이 아니라 '드러나 있어야 할 것'이기 때문입니다.

### `gates check` — 오류 게이트 형식 검사

게이트 하나는 `G-숫자`로 시작하는 제목과, 그 아래 `- 칸 이름: 값` 목록입니다.

```markdown
## G-1 | [스타일] 상태 색은 흑백에서도 구분되게

- 상태: 활성
- 발생 상황: 흑백 캡처에서 완료(회색)와 안정(초록)이 같은 밝기라 구분되지 않음
- 금지 경로: 색만 바꿔서 상태를 구분하기
- 대신 할 것: 밝기나 패턴 차이로 구분하고, 상태 글자를 함께 보임
- 사전 체크: 상태 색을 바꿀 때마다 `/dev`의 책 블록을 `filter: grayscale(1)`로 확인
```

```text
$ agent-gates gates check
docs/GATES.md — 게이트 2개 · 오류 2 · 경고 0
  오류  docs/GATES.md:15  G-2: 필수 칸이 없습니다 — 대신 할 것  [gates/missing-field]
  오류  docs/GATES.md:16  G-2: 쓸 수 없는 상태입니다 — 진행중 (활성 / 해제 중 하나)  [gates/bad-status]
```

| 규칙                                                                    | 심각도 | 내용                                                                        |
| ----------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| `gates/missing-field` · `gates/empty-field`                             | 오류   | 필수 칸(기본: 상태 · 발생 상황 · 금지 경로 · 대신 할 것)이 없거나 비어 있음 |
| `gates/bad-id` · `gates/duplicate-id`                                   | 오류   | ID가 `G-숫자`가 아니거나 겹침                                               |
| `gates/bad-status`                                                      | 오류   | 상태 값이 정한 목록(기본: 활성 · 해제)에 없음                               |
| `gates/file-not-found`                                                  | 오류   | 게이트 파일이 없음                                                          |
| `gates/unknown-field` · `gates/duplicate-field` · `gates/missing-title` | 경고   | 알 수 없는 칸, 같은 칸 두 번, 제목 없음                                     |
| `gates/empty`                                                           | 경고   | 등록된 게이트가 없음                                                        |

HTML 주석(`<!-- -->`)과 코드 블록 안은 읽지 않습니다. 형식 예시를 문서에 남겨 둘 수 있게 하기 위해서입니다. 다른 이름으로 쓴 칸(예: `증상`)은 설정의 `aliases`로 표준 이름에 맞출 수 있습니다.

### `scope` — 담당 범위 검사

```text
$ agent-gates scope --owner FE-A
담당 FE-A · 바뀐 파일 4개 (main...HEAD)
  오류  components/home/Card.tsx  FE-B 담당 파일입니다. 멈추고 담당자에게 알리세요.  [scope/other-owner]
  경고  app/layout.tsx  공유 파일입니다. 화면 PR에 섞지 말고 따로 올리세요.  [scope/shared]
  담당 범위 안: 2개
```

| 판정      | 심각도   | 뜻                                                               |
| --------- | -------- | ---------------------------------------------------------------- |
| 내 담당   | —        | `scope.owners.<나>`에 맞음                                       |
| 공유      | 경고     | `scope.shared`에 맞음. 누구나 고칠 수 있지만 화면 PR과 섞지 않음 |
| 다른 담당 | **오류** | 다른 담당자의 경로에 맞음                                        |
| 미지정    | 경고     | 어디에도 맞지 않음                                               |

바뀐 파일은 `--base <브랜치>`(기본 `main`, `<브랜치>...HEAD` 차이), `--staged`(커밋 전), `--files a,b`(직접 지정) 중 하나로 정합니다. 한글·공백이 든 파일 이름도 읽습니다.

### 종료 코드

| 코드 | 뜻                                           |
| ---- | -------------------------------------------- |
| 0    | 규칙을 모두 지켰다 (경고는 있을 수 있음)     |
| 1    | 규칙 위반이 있다                             |
| 2    | 사용법·설정·실행 환경 문제로 검사하지 못했다 |

## 5. 설정

저장소 루트의 `agent-gates.config.json`을 읽습니다. 없으면 기본값을 쓰고, 빠진 칸도 기본값으로 채웁니다. 잘못된 칸은 한 번에 모아 알려 줍니다.

```jsonc
{
  "markers": {
    "patterns": [
      { "id": "confirm", "text": "TODO(확인필요)", "label": "확인 필요" },
      { "id": "backend", "text": "[백엔드 확정 필요]", "label": "백엔드 확정 필요" },
    ],
    "include": ["app/**", "components/**", "lib/**"],
    "exclude": ["**/*.md"],
    "max": 15,
  },
  "gates": {
    "file": "docs/GATES.md",
    "required": ["상태", "발생 상황", "금지 경로", "대신 할 것"],
    "optional": ["등록", "원인", "사전 체크", "근거"],
    "aliases": { "증상": "발생 상황" },
    "statusField": "상태",
    "statuses": ["활성", "해제"],
  },
  "scope": {
    "owners": {
      "FE-A": ["components/apply/**", "lib/api/booking.ts"],
      "FE-B": ["components/{join,home,my}/**", "lib/api/member.ts"],
    },
    "shared": ["app/layout.tsx", "lib/*.ts", "types/api.ts"],
  },
}
```

- 경로 패턴은 **저장소 기준 경로 전체**와 비교합니다. 어느 폴더에 있든 맞추려면 `**/`를 앞에 붙입니다. 지원: `*`, `?`, `**/`, `{a,b}`
- `.git`, `node_modules`는 늘 건너뜁니다. 표식 검사는 1MB 넘는 파일과 바이너리 파일을 읽지 않습니다.
- 설정 파일과 게이트 파일은 표식 글자를 '정의'로 담고 있으므로 표식 검사에서 늘 뺍니다.
- 두 사람이 나눠 쓰는 프론트엔드 예시: [examples/frontend-two-owners.config.json](examples/frontend-two-owners.config.json)

## 6. CI에서 쓰기

```yaml
# .github/workflows/agent-gates.yml
name: agent-gates
on: pull_request
jobs:
  rules:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # scope가 main과 비교하려면 이력이 필요해요
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx github:smj1746/agent-gates check
      # 담당자마다 브랜치 이름 규칙이 있다면 scope도 함께
      # - run: npx github:smj1746/agent-gates scope --owner FE-A --base origin/main
```

에이전트에게는 `AGENTS.md`(Codex가 자동으로 읽음)나 `CLAUDE.md`에 "끝내기 전에 `npx agent-gates check`를 통과시킨다"고 적어, 사람과 에이전트가 같은 기준으로 '끝났다'를 판단하게 합니다.

## 7. 구조와 설계 결정

```text
src/
├─ cli.ts            실행 파일: run()을 부르고 종료 코드만 정함
├─ run.ts            명령 나누기, 사용법·설정 오류 처리 (process에 직접 닿지 않음 → 테스트에서 그대로 호출)
├─ templates.ts      init이 만드는 파일 내용
├─ commands/         명령 하나에 파일 하나 (검사 함수 · 출력 함수 · 명령 함수)
│  ├─ markers.ts  gates.ts  scope.ts  check.ts  init.ts
└─ core/
   ├─ config.ts      설정 읽기 · 검사 · 기본값
   ├─ glob.ts        글롭 → 정규식 (의존성 없이)
   ├─ walk.ts        파일 순회 (Windows 경로를 슬래시로 통일)
   ├─ git.ts         git diff -z 로 바뀐 파일 읽기
   ├─ report.ts      결과 정렬 · 출력
   └─ types.ts       Finding · Io · 종료 코드
```

모든 검사는 같은 모양의 결과(`Finding`: 심각도 · 규칙 이름 · 메시지 · 파일 · 줄)를 돌려주고, 출력은 사람용 텍스트와 `--json` 두 가지로만 나뉩니다.

주요 결정과 그 이유는 [docs/decisions.md](docs/decisions.md)에 있습니다. 예를 들면:

- **런타임 의존성 0개** — 저장소 규칙을 검사하는 도구가 다른 패키지에 휘둘리지 않게. 인자 처리는 Node 내장 `util.parseArgs`, 글롭은 직접 구현
- **경고와 오류를 나눔** — 공유 파일·미지정 파일은 알리기만 하고, 다른 담당자의 파일만 실패시킴. 막을 것과 알릴 것을 구분해야 규칙이 지켜짐
- **`init`은 덮어쓰지 않음** — 사람이 쓴 규칙 문서를 도구가 지우면 안 되므로

## 8. 알려진 이슈

- `scope`의 담당표는 경로 패턴으로만 판단합니다. 같은 파일 안에서 여러 사람이 맡은 부분을 나누는 경우는 다루지 않습니다.
- 게이트 형식은 `- 칸 이름: 값` 목록 하나만 읽습니다. 표(`| 칸 | 값 |`)로 쓴 게이트는 읽지 않습니다.
- 표식은 글자 그대로 찾습니다(정규식 아님). `TODO (확인필요)`처럼 띄어 쓰면 다른 표식으로 봅니다.
- 이 저장소의 `docs/GATES.md`에는 아직 등록된 게이트가 없어, 자기 검사에서 `gates/empty` 경고가 나옵니다.

## 9. 향후 개발 방향

- `gates`: 오래된 활성 게이트(예: 90일 이상) 알림, 게이트가 가리키는 파일·줄(`근거`)이 아직 있는지 확인
- `markers`: 이전 실행보다 표식이 늘었을 때만 실패시키는 기준선 모드
- `scope`: GitHub PR 작성자·브랜치 이름으로 담당자를 자동으로 고르기
- 여러 저장소가 같은 설정을 쓰도록 원격 설정(`extends`) 지원
- npm 배포

---

## 만든 방법

Claude(Anthropic)와 함께 만들었습니다. 검사 규칙과 명령 범위는 제가 두 프로젝트에서 실제로 운영한 규칙(미정 표식, 오류 게이트, 담당표)에서 가져왔고, 설계 결정과 그 이유는 [docs/decisions.md](docs/decisions.md)에 남겼습니다. 코드는 직접 실행해 확인하고 커밋했습니다. 이 저장소도 같은 방식으로 일합니다: 에이전트 규칙은 [AGENTS.md](AGENTS.md), 끝내기 전 검사는 `npm run check`입니다.

## 라이선스

[MIT](LICENSE)
