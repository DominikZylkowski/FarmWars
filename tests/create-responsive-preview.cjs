const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const base = process.argv[2] || pathToFileURL(root + path.sep).href;
const sizes = [[320, 568], [360, 640], [390, 844], [667, 375], [768, 1024],
    [1024, 768], [1280, 720], [1366, 768], [1920, 1080], [2560, 1440]];
const fixture = String.raw`
const qaStorage = new Map();
Object.defineProperty(window, 'localStorage', { value: {
    getItem: key => qaStorage.get(key) ?? null,
    setItem: (key, value) => qaStorage.set(key, String(value)),
    removeItem: key => qaStorage.delete(key)
} });
const qaErrors = [];
window.addEventListener('error', event => qaErrors.push(event.message));
window.addEventListener('unhandledrejection', event => qaErrors.push(String(event.reason)));
window.addEventListener('load', async () => {
    await document.fonts.ready;
    function audit(mode) {
        const issues = [...qaErrors];
        const w = innerWidth;
        for (const selector of ['.topBar__status', '.topBar__right-side', '.topBar__actions',
            '.topBar__resource', '.shop-item__cost', '#gameGrid', '#gameMenu:not(.is-hidden)',
            '#tutorialOverlay:not(.is-hidden)', '#buildingUpgrade:not([hidden])', '#rankingDialog']) {
            for (const element of document.querySelectorAll(selector)) {
                const r = element.getBoundingClientRect();
                if (!r.width || !r.height) continue;
                if (r.left < -1 || r.right > w + 1) issues.push(selector + ' poza szerokością');
                if (selector !== '#gameGrid' && element.scrollWidth > element.clientWidth + 2 &&
                    !['auto', 'scroll'].includes(getComputedStyle(element).overflowX)) issues.push(selector + ' przepełnienie');
            }
        }
        const top = document.querySelector('.topBar').getBoundingClientRect();
        const grid = document.getElementById('gameGrid').getBoundingClientRect();
        if (grid.height < 100) issues.push('plansza za mała: ' + Math.round(grid.height));
        const result = { size: innerWidth + 'x' + innerHeight, mode, issues: [...new Set(issues)],
            top: Math.round(top.height), tile: tileViews[0].element.offsetWidth,
            board: Math.round(grid.width) + 'x' + Math.round(grid.height) };
        parent.postMessage({ farmwarsQA: result }, '*');
    }
    async function apply(mode) {
        document.querySelectorAll('dialog, .end-screen').forEach(element => element.remove());
        stopGameFrame();
        initializeGameModel(123456, 0, { tutorialCompleted: true });
        gameState.gameStarted = true;
        gameState.gamePaused = true;
        gameState.seedCount = 1250; gameState.woodCount = 12500; gameState.stoneCount = 12500;
        startScore('responsive');
        renderBoard();
        document.getElementById('gameMenu').classList.toggle('is-hidden', mode !== 'menu');
        document.getElementById('tutorialOverlay').classList.add('is-hidden');
        closeBuildingUpgrade();
        if (mode !== 'menu') {
            for (const tile of gameState.tiles) tile.object = null;
            for (let row = 0; row < 5; row++) {
                gameState.tiles[row * 10].object = createBoardObject('tree', { level: 5, hp: 5, nextWoodAt: 15000 });
                gameState.tiles[row * 10 + 1].object = createBoardObject('quarry', { level: 5, hp: 25, nextStoneAt: 15000 });
                gameState.tiles[row * 10 + 2].object = createBoardObject('cannon', { level: 5, hp: 10, lastShot: 0 });
            }
        }
        fitBoardToViewport(); captureBoardGeometry(); renderGameState();
        if (mode === 'combat') {
            gameState.gamePaused = false; gameState.isInvasionActive = true; gameState.totalEnemiesInWave = 77;
            for (const [row, type] of ['normal', 'boss', 'master'].entries()) {
                spawnEnemy(row, type); gameState.activeEnemies.at(-1).offsetX = 250;
            }
            fireCannon(gameState.tiles[2]); gameState.activeProjectiles[0].xOffset = 250;
            renderGameState(); gameState.gamePaused = true;
        }
        if (mode === 'tutorial') { gameState.tutorialCompleted = false; showTutorial(); stopGameFrame(); }
        if (mode === 'upgrade') { gameState.gamePaused = false; inspectBuilding(42); }
        if (mode === 'ranking') {
            rankingRepository.getLeaderboard = async () => Array.from({ length: 8 }, (_, i) => ({
                totalScore: 12500 - i * 100, nickname: i ? 'BardzoDługiNickGracza' : 'Farmer',
                status: i % 2 ? 'lost' : 'won', finishedAt: '2026-11-19T12:00:00Z'
            }));
            await showRanking();
        }
        if (mode === 'end') {
            gameState.gamePaused = false; gameState.gameEnded = false;
            gameOver(); renderGameState();
        }
        requestAnimationFrame(() => requestAnimationFrame(() => audit(mode)));
    }
    window.addEventListener('message', event => { if (event.data.qaMode) apply(event.data.qaMode); });
    apply('play');
});`;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('<head>', `<head><base href="${base}"><meta name="farmwars-local-only" content="true">`)
    .replace('</head>', `<script>${fixture}</script></head>`);
const page = `<!doctype html><html lang="pl"><meta charset="utf-8"><title>FarmWars — test rozdzielczości</title>
<style>body{background:#202a22;color:#fff;font:14px Arial;margin:12px}header{position:sticky;top:0;background:#202a22;padding:8px;z-index:2}button{padding:8px 16px;margin:4px}main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.card{background:#344a35;padding:8px}.view{overflow:hidden;position:relative;background:#000}iframe{border:0;transform-origin:top left}.result{white-space:pre-wrap;font-size:12px;color:#f9dc83}h3{margin:4px 0}</style>
<header><b>FarmWars — rzeczywiste viewporty iframe; oddzielna pamięć testowa</b><br>
${['play','combat','menu','tutorial','upgrade','ranking','end'].map(mode => `<button onclick="mode('${mode}')">${mode}</button>`).join('')}
<span id="summary"></span></header><main></main><script>
const source=${JSON.stringify(html).replaceAll('<', '\\u003c')};
const sizes=${JSON.stringify(sizes)};
for(const [w,h] of sizes){const card=document.createElement('section');card.className='card';card.innerHTML='<h3>'+w+' × '+h+'</h3><div class="view"></div><pre class="result">Wczytywanie…</pre>';const frame=document.createElement('iframe');frame.width=w;frame.height=h;frame.srcdoc=source;card.querySelector('.view').append(frame);document.querySelector('main').append(card);}
function fit(){document.querySelectorAll('.view').forEach(view=>{const frame=view.firstChild;const scale=view.clientWidth/frame.width;frame.style.transform='scale('+scale+')';view.style.height=Math.min(320,frame.height*scale)+'px';});}addEventListener('resize',fit);fit();
function mode(value){document.querySelectorAll('iframe').forEach(frame=>frame.contentWindow.postMessage({qaMode:value},'*'));}
const results=new Map(),history=new Map();addEventListener('message',event=>{if(!event.data.farmwarsQA)return;const r=event.data.farmwarsQA;results.set(r.size,r);history.set(r.size+'/'+r.mode,r);const card=[...document.querySelectorAll('.card')].find(card=>card.querySelector('h3').textContent.replaceAll(' ','').replace('×','x')===r.size);card.querySelector('.result').textContent=(r.issues.length?'BŁĘDY: '+r.issues.join('; '):'OK')+' | pasek '+r.top+' | pole '+r.tile+' | plansza '+r.board;document.getElementById('summary').textContent=[...results.values()].filter(r=>r.issues.length).length+' / '+results.size+' z problemami';});
const run=document.createElement('button');run.textContent='Wszystkie scenariusze';run.onclick=async()=>{history.clear();for(const value of ['play','combat','menu','tutorial','upgrade','ranking','end']){mode(value);await new Promise(resolve=>setTimeout(resolve,1800));}const report=document.createElement('pre');report.id='audit-report';report.textContent='RAPORT '+history.size+' prób\\n'+[...history.values()].map(r=>r.size+' '+r.mode+': '+(r.issues.length?r.issues.join('; '):'OK')).join('\\n');const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='RAPORT '+history.size+' prób, błędów: '+[...history.values()].filter(r=>r.issues.length).length;details.append(summary,report);document.querySelector('header').after(details);mode('menu');};document.querySelector('header').append(run);
</script></html>`;
const output = path.join(__dirname, 'responsive-preview.html');
fs.writeFileSync(output, page);
console.log(pathToFileURL(output).href);
