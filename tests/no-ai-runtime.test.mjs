import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
test('production runtime and workflows do not invoke model providers or agent CLIs',()=>{
 const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(p=>/^(scripts|js|workers|extensions|kalshi-private-relay|\.github)\//.test(p)&&/\.(?:mjs|js|ts|ya?ml)$/.test(p));
 const patterns=[/https?:\/\/(?:api\.openai\.com|api\.anthropic\.com|api\.x\.ai|generativelanguage\.googleapis\.com)\b/i,/(?:from\s*|require\s*\()\s*['"](?:openai|@anthropic-ai\/sdk|@google\/generative-ai)['"]/i,/\b(?:codex\s+exec|claude\s+-p)\b/i,/uses:\s*[^\n]*(?:openai|anthropic|codex)/i];
 const violations=files.filter(p=>patterns.some(re=>re.test(fs.readFileSync(p,'utf8'))));
 assert.deepEqual(violations,[],'Recurring/native runtime must not call an LLM; explicit approval and policy update required.');
});
