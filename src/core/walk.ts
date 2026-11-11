import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { matchesAny } from './glob.js';

/** 설정과 상관없이 늘 들어가지 않는 폴더. 크기가 크고 검사 대상이 아니다. */
const ALWAYS_SKIPPED_DIRS = new Set(['.git', 'node_modules']);

export interface WalkOptions {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  /** 패턴과 상관없이 뺄 파일(저장소 기준 상대 경로). 설정 파일 자신 등. */
  readonly skip?: ReadonlySet<string>;
}

/** Windows 경로 구분자를 슬래시로 바꾼다. 모든 패턴 비교는 슬래시 기준이다. */
export function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

/**
 * root 아래 파일을 저장소 기준 상대 경로로 모은다.
 * 심볼릭 링크는 따라가지 않는다. 결과는 늘 같은 순서로 정렬한다.
 */
export async function listFiles(root: string, options: WalkOptions): Promise<string[]> {
  const found: string[] = [];

  async function visit(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ALWAYS_SKIPPED_DIRS.has(entry.name)) await visit(absolute);
        continue;
      }
      if (!entry.isFile()) continue;

      const relative = toPosix(path.relative(root, absolute));
      if (options.skip?.has(relative) === true) continue;
      if (!matchesAny(relative, options.include)) continue;
      if (matchesAny(relative, options.exclude)) continue;
      found.push(relative);
    }
  }

  await visit(root);
  return found.sort(compareStrings);
}

export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
