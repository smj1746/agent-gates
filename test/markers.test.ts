import { describe, expect, it } from 'vitest';
import { buildMarkerReport, scanMarkers } from '../src/commands/markers.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { makeTempDir, writeFiles } from './helpers.js';

const config = DEFAULT_CONFIG.markers;

describe('scanMarkers', () => {
  it('표식을 파일·줄·종류로 모은다', async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      'src/api/today.ts': [
        'export const EP = {',
        "  today: '/today', // TODO(확인필요) 백엔드 주소",
        '};',
      ].join('\n'),
      'src/lib/policy.ts': '// [백엔드 확정 필요] 정원\n// [임시] 만 14세 기준\n',
      'src/clean.ts': 'export const ok = true;\n',
    });

    const { hits, scannedFiles } = await scanMarkers(root, config);
    expect(scannedFiles).toBe(3);
    expect(hits).toEqual([
      {
        file: 'src/api/today.ts',
        line: 2,
        marker: 'confirm',
        label: '확인 필요',
        text: "today: '/today', // TODO(확인필요) 백엔드 주소",
      },
      expect.objectContaining({ file: 'src/lib/policy.ts', line: 1, marker: 'backend' }),
      expect.objectContaining({ file: 'src/lib/policy.ts', line: 2, marker: 'temporary' }),
    ]);
  });

  it('기본 제외 경로, 문서, 건너뛸 파일, 바이너리는 읽지 않는다', async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      'AGENTS.md': '미정 값은 TODO(확인필요)로 남긴다',
      'dist/cli.js': '// TODO(확인필요)',
      'node_modules/x/index.js': '// TODO(확인필요)',
      'custom.json': '{ "text": "TODO(확인필요)" }',
      'image.png': new Uint8Array([0, 1, 2, ...Buffer.from('TODO(확인필요)')]),
      'src/a.ts': '// TODO(확인필요)',
    });

    const { hits } = await scanMarkers(root, config, new Set(['custom.json']));
    expect(hits.map((hit) => hit.file)).toEqual(['src/a.ts']);
  });

  it('Windows 줄바꿈(CRLF)도 줄 번호가 맞는다', async () => {
    const root = await makeTempDir();
    await writeFiles(root, { 'a.ts': 'one\r\ntwo\r\n// [임시] three\r\n' });
    const { hits } = await scanMarkers(root, config);
    expect(hits[0]?.line).toBe(3);
  });
});

describe('buildMarkerReport', () => {
  const scan = { scannedFiles: 1, hits: [] as never[] };

  it('기준이 없으면 늘 통과', () => {
    expect(
      buildMarkerReport({ ...scan, hits: new Array(9).fill(null) as never[] }, null).passed,
    ).toBe(true);
  });

  it('기준을 넘으면 실패, 같으면 통과', () => {
    const two = new Array(2).fill(null) as never[];
    expect(buildMarkerReport({ ...scan, hits: two }, 2).passed).toBe(true);
    expect(buildMarkerReport({ ...scan, hits: two }, 1).passed).toBe(false);
  });
});
