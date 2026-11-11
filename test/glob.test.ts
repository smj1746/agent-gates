import { describe, expect, it } from 'vitest';
import { globToRegExp, matchesAny } from '../src/core/glob.js';

const matches = (glob: string, file: string) => globToRegExp(glob).test(file);

describe('globToRegExp', () => {
  it('*는 폴더 경계를 넘지 않는다', () => {
    expect(matches('*.ts', 'cli.ts')).toBe(true);
    expect(matches('*.ts', 'src/cli.ts')).toBe(false);
    expect(matches('src/*.ts', 'src/cli.ts')).toBe(true);
    expect(matches('src/*.ts', 'src/core/glob.ts')).toBe(false);
  });

  it('**/는 폴더 0개 이상과 맞는다', () => {
    expect(matches('**/*.md', 'README.md')).toBe(true);
    expect(matches('**/*.md', 'docs/a/b.md')).toBe(true);
    expect(matches('src/**/*.ts', 'src/cli.ts')).toBe(true);
    expect(matches('src/**/*.ts', 'src/core/glob.ts')).toBe(true);
  });

  it('끝의 **는 그 아래 전부와 맞는다', () => {
    expect(matches('src/**', 'src/a/b/c.tsx')).toBe(true);
    expect(matches('src/**', 'lib/a.ts')).toBe(false);
    expect(matches('**/node_modules/**', 'a/node_modules/x/index.js')).toBe(true);
  });

  it('?는 한 글자, {a,b}는 둘 중 하나', () => {
    expect(matches('file?.ts', 'file1.ts')).toBe(true);
    expect(matches('file?.ts', 'file10.ts')).toBe(false);
    expect(matches('**/*.{ts,tsx}', 'src/App.tsx')).toBe(true);
    expect(matches('**/*.{ts,tsx}', 'src/App.jsx')).toBe(false);
  });

  it('정규식 특수문자는 글자 그대로 본다', () => {
    expect(matches('app/(tabs)/home/page.tsx', 'app/(tabs)/home/page.tsx')).toBe(true);
    expect(matches('a.b', 'axb')).toBe(false);
    expect(matches('[id].tsx', '[id].tsx')).toBe(true);
  });

  it('한글 경로도 맞춘다', () => {
    expect(matches('문서/**', '문서/규칙.md')).toBe(true);
  });

  it('잘못된 중괄호는 오류', () => {
    expect(() => globToRegExp('{a,b')).toThrow('닫히지 않았습니다');
    expect(() => globToRegExp('{a,{b}}')).toThrow('겹쳐 쓸 수 없습니다');
  });
});

describe('matchesAny', () => {
  it('하나라도 맞으면 true', () => {
    expect(matchesAny('src/a.ts', ['lib/**', 'src/**'])).toBe(true);
    expect(matchesAny('src/a.ts', [])).toBe(false);
  });
});
