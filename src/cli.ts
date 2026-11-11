#!/usr/bin/env node
import { run } from './run.js';

try {
  process.exitCode = await run(process.argv.slice(2), {
    cwd: process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
  });
} catch (error) {
  // 예상하지 못한 오류: 스택을 그대로 보여 주고 사용법 오류와 같은 코드로 끝낸다.
  console.error(error);
  process.exitCode = 2;
}
