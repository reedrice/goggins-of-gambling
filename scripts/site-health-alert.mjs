// One assigned GitHub incident per unresolved outage. No secrets or private data.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export const TITLE='Site health: automatic recovery needs attention';
export const MARKER='<!-- mib-site-health-incident -->';
export function findIncident(issues){return issues.find(i=>!i.pull_request&&i.title===TITLE&&i.body?.includes(MARKER)&&i.user?.login==='github-actions[bot]');}
function main(){
 const repo='reedrice/goggins-of-gambling',mode=process.argv[2];
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!=='refs/heads/main'||!['failed','healthy'].includes(mode))throw Error('Production health workflow only');
 const gate=JSON.parse(fs.readFileSync('routines/owners.json')).routines['live-feed-update'];
 if(!gate.enabled||gate.owner!=='github-actions')return;
 const api=(path,body,method='POST')=>{const result=execFileSync('gh',['api',path,...(body?['--method',method,'--input','-']:[])],{encoding:'utf8',input:body?JSON.stringify(body):undefined,stdio:['pipe','pipe','pipe']});return result.trim()?JSON.parse(result):null;};
 const issues=[];for(let page=1;page<=10;page++){const rows=api(`repos/${repo}/issues?state=open&per_page=100&page=${page}`);issues.push(...rows);if(rows.length<100)break;if(page===10)throw Error('Too many open issues to safely deduplicate incident');}
 const incident=findIncident(issues);
 if(mode==='healthy'){if(incident){api(`repos/${repo}/issues/${incident.number}`,{state:'closed',state_reason:'completed'},'PATCH');console.log('Closed verified recovered incident: '+incident.html_url);}return;}
 if(incident){console.log('Existing incident remains open; no duplicate notification: '+incident.html_url);return;}
 const run=`https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
 const created=api(`repos/${repo}/issues`,{title:TITLE,assignees:['reedrice'],body:`${MARKER}\n@reedrice The site health check failed and needs attention. Automatic recovery did not restore health within the recovery window, or the checker itself failed.\n\n[Open the failing health run and diagnostic summary](${run}).\n\nNo AI repair or private account access was attempted. Repeated checks will reuse this incident without repeated mentions. A verified healthy check closes it automatically. Enable GitHub email or mobile notifications for mentions and assignments to receive this away from GitHub.`});
 console.log('Reed notified via assigned incident: '+created.html_url);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
