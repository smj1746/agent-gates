import { describe, expect, it } from 'vitest';
import { checkGates, parseGates } from '../src/commands/gates.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { REAL_GATE } from './helpers.js';

const config = DEFAULT_CONFIG.gates;
const rulesOf = (text: string) => checkGates(text, config, 'docs/GATES.md').map((f) => f.rule);

describe('parseGates', () => {
  it('실제 게이트(피뢰침 G-1)를 칸별로 읽는다', () => {
    const [gate] = parseGates(REAL_GATE);
    expect(gate?.id).toBe('G-1');
    expect(gate?.title).toBe('[스타일] 상태 색은 흑백에서도 구분되게');
    expect(gate?.fields.map((field) => field.key)).toEqual([
      '상태',
      '등록',
      '발생 상황',
      '원인',
      '금지 경로',
      '대신 할 것',
      '사전 체크',
    ]);
  });

  it('값 안의 콜론은 값으로 남긴다', () => {
    const [gate] = parseGates(REAL_GATE);
    const check = gate?.fields.find((field) => field.key === '사전 체크');
    expect(check?.value).toContain('filter: grayscale(1)');
  });

  it('들여쓴 줄은 앞 칸의 값에 이어 붙인다', () => {
    const [gate] = parseGates(`## G-2 | 제목
- 대신 할 것:
  - 서버 값만 쓴다
  - 목업도 같이 고친다
`);
    expect(gate?.fields[0]?.value).toBe('- 서버 값만 쓴다 - 목업도 같이 고친다');
  });

  it('HTML 주석과 코드 블록 안의 예시는 읽지 않고, 줄 번호는 원문과 같다', () => {
    const text = `# 오류 게이트
<!--
## G-0 | 예시
- 상태: 활성
-->
\`\`\`md
## G-99 | 코드 블록 예시
\`\`\`
## G-1 | 진짜
- 상태: 활성
`;
    const gates = parseGates(text);
    expect(gates.map((gate) => gate.id)).toEqual(['G-1']);
    expect(gates[0]?.line).toBe(9);
  });

  it('다른 제목이 나오면 게이트가 닫힌다', () => {
    const [gate] = parseGates(`## G-1 | 제목
- 상태: 활성
## 쓰는 법
- 상태: 이건 게이트 칸이 아님
`);
    expect(gate?.fields).toHaveLength(1);
  });

  it('별칭을 표준 이름으로 바꾸고, 굵은 글씨 칸 이름도 읽는다', () => {
    const [gate] = parseGates('## G-1 | 제목\n- **증상**: 화면이 깨짐\n', { 증상: '발생 상황' });
    expect(gate?.fields[0]).toMatchObject({ key: '발생 상황', rawKey: '증상' });
  });
});

describe('checkGates', () => {
  it('실제 게이트(피뢰침 G-1)는 통과한다', () => {
    expect(checkGates(REAL_GATE, config, 'docs/GATES.md')).toEqual([]);
  });

  it('게이트가 없으면 경고', () => {
    expect(rulesOf('# 오류 게이트\n')).toEqual(['gates/empty']);
  });

  it('필수 칸이 없거나 비면 오류', () => {
    const findings = checkGates(
      '## G-1 | 제목\n- 상태: 활성\n- 발생 상황: 깨짐\n- 금지 경로:\n',
      config,
      'docs/GATES.md',
    );
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'gates/empty-field', line: 4 }),
        expect.objectContaining({
          rule: 'gates/missing-field',
          message: expect.stringContaining('대신 할 것') as unknown,
          line: 1,
        }),
      ]),
    );
  });

  it('ID 형식과 중복을 검사한다', () => {
    const full = (id: string) =>
      `## ${id} | 제목\n- 상태: 활성\n- 발생 상황: a\n- 금지 경로: b\n- 대신 할 것: c\n`;
    expect(rulesOf(full('G-a'))).toEqual(['gates/bad-id']);
    expect(rulesOf(full('G-1') + full('G-1'))).toEqual(['gates/duplicate-id']);
    expect(rulesOf(full('G-001') + full('G-2'))).toEqual([]);
  });

  it('상태 값과 알 수 없는 칸을 검사한다', () => {
    const text =
      '## G-1 | 제목\n- 상태: 진행중\n- 발생 상황: a\n- 금지 경로: b\n- 대신 할 것: c\n- 메모: d\n';
    expect(rulesOf(text)).toEqual(['gates/unknown-field', 'gates/bad-status']);
  });

  it('제목이 없으면 경고', () => {
    const text = '## G-1\n- 상태: 활성\n- 발생 상황: a\n- 금지 경로: b\n- 대신 할 것: c\n';
    expect(rulesOf(text)).toEqual(['gates/missing-title']);
  });
});
