import test from 'node:test';import assert from 'node:assert/strict';
import {findIncident,TITLE,MARKER} from '../scripts/site-health-alert.mjs';
test('deduplicate only an authentic watchdog incident, never arbitrary issues or PRs',()=>{
 const incident={title:TITLE,body:MARKER,user:{login:'github-actions[bot]'},number:42};
 assert.equal(findIncident([{...incident,user:{login:'someone'}},{...incident,pull_request:{}},incident]),incident);
 assert.equal(findIncident([{...incident,body:'unrelated issue'}]),undefined);
});
