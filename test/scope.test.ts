import { describe, expect, it } from 'vitest';
import { classifyFiles, scopeFindings } from '../src/commands/scope.js';
import { parseConfig } from '../src/core/config.js';

// 그웰프 프론트의 담당표를 줄인 예
const { scope } = parseConfig({
  scope: {
    owners: {
      'FE-A': ['components/apply/**', 'app/(tabs)/calendar/**', 'lib/api/booking.ts'],
      'FE-B': ['components/home/**', 'app/(tabs)/home/**', 'lib/api/member.ts'],
    },
    shared: ['app/layout.tsx', 'lib/*.ts', 'types/api.ts'],
  },
});

describe('classifyFiles', () => {
  it('내 담당 · 공유 · 다른 담당 · 미지정으로 나눈다', () => {
    const entries = classifyFiles(
      [
        'components/apply/Sheet.tsx',
        'lib/api/booking.ts',
        'app/layout.tsx',
        'components/home/Card.tsx',
        'scripts/seed.ts',
      ],
      'FE-A',
      scope,
    );
    expect(entries.map((entry) => entry.verdict)).toEqual([
      'owned',
      'owned',
      'shared',
      'other',
      'unowned',
    ]);
    expect(entries[3]?.owners).toEqual(['FE-B']);
  });

  it('내 담당이면 공유 패턴에도 맞아도 내 담당으로 본다', () => {
    const [entry] = classifyFiles(['lib/api/booking.ts'], 'FE-A', scope);
    expect(entry?.verdict).toBe('owned');
  });

  it('없는 담당자는 사용법 오류', () => {
    expect(() => classifyFiles([], 'FE-C', scope)).toThrow('있는 담당자: FE-A, FE-B');
  });
});

describe('scopeFindings', () => {
  it('다른 담당은 오류, 공유·미지정은 경고', () => {
    const findings = scopeFindings(
      classifyFiles(['components/home/Card.tsx', 'app/layout.tsx', 'x.ts'], 'FE-A', scope),
    );
    expect(findings.map((finding) => [finding.level, finding.rule])).toEqual([
      ['error', 'scope/other-owner'],
      ['warning', 'scope/shared'],
      ['warning', 'scope/unowned'],
    ]);
  });
});
