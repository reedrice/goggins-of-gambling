// Runs only inside the user's personal Worker origin. No parent messages.
window.APP_CONFIG={kalshiRelay:location.origin};
window.Store={getKalshiVault:()=>{try{return JSON.parse(localStorage.getItem('kalshi_private_vault'));}catch{return null;}},setKalshiVault:value=>{if(value===null)localStorage.removeItem('kalshi_private_vault');else localStorage.setItem('kalshi_private_vault',JSON.stringify(value));}};
try{KalshiSync.mount(document.getElementById('private-account'));}catch{document.getElementById('private-account').textContent='Private browser storage is unavailable here. Open your personal panel in its own tab.';}
