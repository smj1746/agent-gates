import type { Finding } from './types.js';

const LEVEL_LABEL = { error: '오류', warning: '경고' } as const;

/** 결과 한 줄: `  오류  docs/GATES.md:12  메시지  [규칙]` */
export function formatFinding(finding: Finding): string {
  const where =
    finding.file === undefined
      ? ''
      : finding.line === undefined
        ? `${finding.file}  `
        : `${finding.file}:${String(finding.line)}  `;
  return `  ${LEVEL_LABEL[finding.level]}  ${where}${finding.message}  [${finding.rule}]`;
}

/** 오류를 먼저, 같은 심각도 안에서는 파일·줄 순서로 */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    if (a.level !== b.level) return a.level === 'error' ? -1 : 1;
    const fileOrder = (a.file ?? '').localeCompare(b.file ?? '', 'en');
    if (fileOrder !== 0) return fileOrder;
    return (a.line ?? 0) - (b.line ?? 0);
  });
}

export function writeJson(write: (chunk: string) => unknown, value: unknown): void {
  write(`${JSON.stringify(value, null, 2)}\n`);
}
