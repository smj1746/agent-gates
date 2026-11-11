/** 검사 결과 하나의 심각도. error는 종료 코드 1로 이어지고, warning은 알리기만 한다. */
export type Level = 'error' | 'warning';

/** 모든 검사가 같은 모양으로 돌려주는 결과. */
export interface Finding {
  readonly level: Level;
  /** `gates/missing-field`처럼 `영역/규칙` 형식의 규칙 이름 */
  readonly rule: string;
  readonly message: string;
  /** 저장소 기준 상대 경로(슬래시 구분) */
  readonly file?: string;
  /** 1부터 시작하는 줄 번호 */
  readonly line?: number;
}

/** 명령이 쓰는 입출력. 테스트에서는 문자열을 모으는 가짜로 바꿔 끼운다. */
export interface Io {
  readonly cwd: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

/**
 * 종료 코드
 * - ok: 규칙을 모두 지켰다
 * - failed: 규칙 위반이 있다 (CI를 실패시킨다)
 * - usage: 사용법·설정·실행 환경 문제로 검사를 하지 못했다
 */
export const EXIT = {
  ok: 0,
  failed: 1,
  usage: 2,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export function countLevels(findings: readonly Finding[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const finding of findings) {
    if (finding.level === 'error') errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}
