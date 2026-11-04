// Bounded fast-forward publication for generated public snapshots.
export function publicationDiagnostic(error, secrets = []) {
 let text = String(error?.stderr || error?.stdout || error?.message || 'Unknown Git error');
 for (const secret of secrets.filter(Boolean)) text = text.split(secret).join('[redacted]');
 return text.replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, 'https://[redacted]@')
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, '[redacted]')
  .replace(/(authorization\s*[:=]\s*)(?:basic|bearer)\s+\S+/gi, '$1[redacted]')
  .trim().slice(-3000);
}

export async function publishGeneratedCommit({git, sleep = ms => new Promise(r => setTimeout(r, ms)), log = console.log, secrets = []}) {
 for (let attempt = 0; attempt < 2; attempt++) {
  try { git('push', 'origin', 'HEAD:main'); return 'published'; }
  catch (error) {
   const detail = publicationDiagnostic(error, secrets);
   git('fetch', 'origin', 'main');
   const head = git('rev-parse', 'HEAD'), remote = git('rev-parse', 'origin/main');
   // A server can accept a push before the client loses its acknowledgement.
   if (remote === head) return 'published';
   if (remote !== git('rev-parse', 'HEAD^')) return 'regenerate';
   const transient = /HTTP\s*(?:error:?\s*)?(?:429|500|502|503|504)|internal server error|service unavailable|bad gateway|timed? out|connection reset|could not resolve host|remote end hung up|unexpected disconnect/i.test(detail);
   if (!attempt && transient) {
    log('Temporary publication transport failure; retrying the same commit once.');
    await sleep(3000);
    continue;
   }
   throw Error('Feed publication failed without a main race: ' + detail);
  }
 }
}
