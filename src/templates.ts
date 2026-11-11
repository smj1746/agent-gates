import { DEFAULT_CONFIG } from './core/config.js';

/** init이 만드는 설정 파일. scope는 저장소에 맞게 고쳐 쓰라는 예시다. */
export function configTemplate(): string {
  const config = {
    markers: DEFAULT_CONFIG.markers,
    gates: DEFAULT_CONFIG.gates,
    scope: {
      owners: {
        'FE-A': ['src/features/apply/**'],
        'FE-B': ['src/features/home/**'],
      },
      shared: ['src/shared/**', 'package.json'],
    },
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

export const GATES_TEMPLATE = `# 오류 게이트

같은 오류를 두 번 고쳐도 남으면 작업을 멈추고, 해결한 뒤 아래 형식으로 등록합니다.
에이전트는 초안만 쓰고, 사람이 승인한 것만 이 파일에 올립니다.
작업을 시작할 때 '상태: 활성'인 게이트를 먼저 읽습니다.

<!--
형식 (이 주석 안은 검사하지 않습니다)

## G-1 | [분류] 한 줄 제목
- 상태: 활성
- 등록: YYYY-MM-DD / 어떤 작업 중에
- 발생 상황: 무엇이 어떻게 잘못됐는지
- 원인: (선택) 왜 그랬는지
- 금지 경로: 다시 하면 안 되는 방법
- 대신 할 것: 이렇게 한다
- 사전 체크: (선택) 다음 작업 전에 확인하는 방법
- 근거: (선택) 파일·문서 위치
-->
`;

export const AGENTS_TEMPLATE = `# 에이전트 작업 규칙

## 확정의 기준
- 사람이 결정한 것, 저장소에 이미 있는 것, 이 문서의 규칙만 구현한다.
- 정해지지 않은 값은 지어내지 말고 코드에 \`TODO(확인필요)\`로 남긴다.

## 멈추는 조건
- 해석이 둘 이상이거나 필요한 정보가 없으면 작업을 멈추고, A안·B안과 추천을 붙여 한 번에 묻는다.
- 담당 밖 파일을 고쳐야 하면 멈추고 알린다. (\`npx agent-gates scope --owner <담당자>\`)

## 오류 게이트
- 같은 오류를 두 번 고쳐도 남으면 멈추고 시도한 것과 원인 가설을 보고한다.
- 해결되면 \`docs/GATES.md\` 형식으로 초안을 쓰고, 사람이 승인한 것만 등록한다.
- 작업을 시작할 때 \`docs/GATES.md\`의 활성 게이트를 먼저 읽는다.

## 끝내기 전
- \`npx agent-gates check\`를 통과시킨다.
- 커밋과 푸시는 사람이 한다.
`;
