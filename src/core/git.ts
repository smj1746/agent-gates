import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { UsageError, messageOf } from './errors.js';

const execFileAsync = promisify(execFile);

export type ChangeSource =
  { readonly kind: 'base'; readonly base: string } | { readonly kind: 'staged' };

export function describeSource(source: ChangeSource): string {
  return source.kind === 'staged' ? '스테이징된 변경' : `${source.base}...HEAD`;
}

/**
 * git이 알려주는 바뀐 파일 목록 (저장소 기준 상대 경로).
 * `-z`로 받아서 한글·공백이 든 파일 이름도 따옴표나 이스케이프 없이 읽는다.
 */
export async function changedFiles(cwd: string, source: ChangeSource): Promise<string[]> {
  const args =
    source.kind === 'staged'
      ? ['diff', '--name-only', '-z', '--cached']
      : ['diff', '--name-only', '-z', `${source.base}...HEAD`];

  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    return stdout.split('\0').filter((name) => name !== '');
  } catch (error) {
    const detail = stderrOf(error) ?? messageOf(error);
    throw new UsageError(`git으로 바뀐 파일을 읽지 못했습니다 (git ${args.join(' ')}): ${detail}`);
  }
}

function stderrOf(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    const { stderr } = error;
    if (typeof stderr === 'string' && stderr.trim() !== '') return stderr.trim();
  }
  return null;
}
