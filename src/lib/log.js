// 로그 — 접속 주소·쿠키·코드·본문·성명을 남기지 않는다 (NFR-08).
// stdout/stderr 는 NSSM 이 out.log / err.log 로 보낸다.
let sink = {
  out: (line) => process.stdout.write(line + '\n'),
  err: (line) => process.stderr.write(line + '\n'),
};

export function setLogSink(s) { sink = s; }

const fmt = (level, msg, meta) => {
  const safe = meta ? ' ' + JSON.stringify(meta) : '';
  return `${new Date().toISOString()} ${level} ${msg}${safe}`;
};

export const log = {
  info: (msg, meta) => sink.out(fmt('INFO', msg, meta)),
  warn: (msg, meta) => sink.err(fmt('WARN', msg, meta)),
  error: (msg, meta) => sink.err(fmt('ERROR', msg, meta)),
  fatal: (msg, meta) => sink.err(fmt('FATAL', msg, meta)),
};
