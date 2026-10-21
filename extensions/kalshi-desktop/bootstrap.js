// Runs in an extension tab, never in a website or content script.
window.fetch=KalshiNetwork.reader(window.fetch.bind(window));
window.APP_CONFIG={kalshiRelay:'https://external-api.kalshi.com'};
window.Store={getKalshiVault:()=>{try{return JSON.parse(localStorage.getItem('kalshi_extension_vault'));}catch{return null;}},setKalshiVault:value=>{if(value===null)localStorage.removeItem('kalshi_extension_vault');else localStorage.setItem('kalshi_extension_vault',JSON.stringify(value));}};
Object.assign(window.STR.kalshiSync,{
private:'Read-only tracker on this PC. No Cloudflare, GitHub or shared server.',
setup:'Create a read-only Kalshi key. Keep Read all data enabled and turn off Full access, Trade and Transfers. This extension encrypts the key and cached bets locally with a separate unlock password. Signed requests go directly to Kalshi.',
pending:'Open the installed extension to connect.',
poll:'Open positions refresh every 30 seconds while this tab is visible and unlocked; history refreshes about every five minutes. Hide or close this tab to stop automatic requests. Reloading locks it. No account data is sent to the main site.'
});
try{KalshiSync.mount(document.getElementById('private-account'));}catch{document.getElementById('private-account').textContent='Local browser storage is unavailable. Connection has not been saved.';}
