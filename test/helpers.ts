import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Io } from '../src/core/types.js';

/** 문자열을 모으는 가짜 입출력 */
export function captureIo(cwd: string): { io: Io; out: () => string; err: () => string } {
  let out = '';
  let err = '';
  return {
    io: {
      cwd,
      stdout: {
        write: (chunk: string) => {
          out += chunk;
          return true;
        },
      },
      stderr: {
        write: (chunk: string) => {
          err += chunk;
          return true;
        },
      },
    },
    out: () => out,
    err: () => err,
  };
}

export async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'agent-gates-'));
}

/** { '상대 경로': 내용 } 그대로 파일을 만든다. */
export async function writeFiles(
  root: string,
  files: Readonly<Record<string, string | Uint8Array>>,
): Promise<void> {
  for (const [file, content] of Object.entries(files)) {
    const absolute = path.join(root, file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
}

/** 테스트용 git 저장소에서 명령 실행 (사용자 설정 없이도 커밋되게) */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, encoding: 'utf8' },
  );
}

/** 피뢰침 저장소에 실제로 등록된 게이트 (main 48f601e) */
export const REAL_GATE = `# 오류 게이트

## G-1 | [스타일] 상태 색은 흑백에서도 구분되게

- 상태: 활성
- 등록: 2026-11-10 / 피뢰침 프론트 (지시문 2 다크 서재)
- 발생 상황: 책 블록을 다크 서재 재질로 바꾼 뒤 흑백 캡처에서 완료(회색 #94A3B8)와 안정(초록 #10B981)이 같은 밝기라 구분되지 않음
- 원인: 두 색의 밝기가 거의 같고, 정의서 4-5에서 둘 다 '꽉 채움'이라 패턴 차이도 없음
- 금지 경로: 색만 바꿔서 상태를 구분하기. 밝기가 비슷한 두 상태에 같은 패턴·같은 장식(금장 띠 등)을 주기
- 대신 할 것: 밝기 차이나 패턴·장식 차이로 구분을 보장하고, 책 위에 상태 글자를 함께 보임 (NF-06)
- 사전 체크: 상태를 추가하거나 상태 색·책 재질을 바꿀 때마다 \`/dev\`의 책 블록 6개를 \`filter: grayscale(1)\`로 확인
`;
