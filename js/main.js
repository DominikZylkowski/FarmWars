// ------------------------- System Menu i Pauzy -------------------------

function togglePause() {
    const menu = document.getElementById('gameMenu');
    if (!menu) return;
    
    gameState.gamePaused = !gameState.gamePaused;
    
    if (gameState.gamePaused) {
        menu.classList.remove('is-hidden');
        menu.style.zIndex = "10000000"; 
        
        const startBtn = document.getElementById('startGameButton');
        if (startBtn) startBtn.textContent = "WZNÓW GRĘ";
        
        const controls = menu.querySelectorAll('button, input, select');
        controls.forEach(c => c.style.zIndex = "10000001");
        
    } else {
        menu.classList.add('is-hidden');
        if (gameState.isInvasionActive) requestAnimationFrame(updateGameLoop);
    }
}

// ------------------------- System Przeciągania (Drag & Drop) -------------------------

function handleDragStart(e) {
    const itemId = e.target.id.replace('Button', '');
    if (!canAfford(itemId) || gameState.gamePaused) {
        e.preventDefault();
        return;
    }
    gameState.selectedItemToPlace = itemId;
    e.dataTransfer.setData('text/plain', itemId);
    updateVisualHighlights();
}

function handleDragOver(e) {
    e.preventDefault(); 
}

function handleDrop(e) {
    e.preventDefault();
    const tile = e.target.closest('.game-tile');
    if (tile && gameState.selectedItemToPlace) {
        placeSelectedItemOnTile(tile);
    }
    gameState.selectedItemToPlace = null;
    updateVisualHighlights();
}

function updateVisualHighlights() {
    document.querySelectorAll('.game-tile').forEach(tile => {
        tile.classList.remove('game-tile--can-place');
        if (gameState.selectedItemToPlace && !isTileOccupied(tile)) {
            tile.classList.add('game-tile--can-place');
        }
    });
}

function canAfford(item) {
    const p = shopItems[item];
    if (!p) return false;
    return !((p.seeds && gameState.seedCount < p.seeds) || 
             (p.wood && gameState.woodCount < p.wood) || 
             (p.stone && gameState.stoneCount < p.stone));
}

function placeSelectedItemOnTile(tile) {
    const item = gameState.selectedItemToPlace;
    if (!item || isTileOccupied(tile) || !canAfford(item)) return;

    const price = shopItems[item];
    if (price.wood) gameState.woodCount -= price.wood;
    if (price.stone) gameState.stoneCount -= price.stone;
    if (price.seeds) gameState.seedCount -= price.seeds;

    const el = document.createElement('div');
    el.className = `game-tile__placed-item game-tile__item--${item}`;
    el.style.backgroundImage = `url('${itemImages[item]}')`;
    tile.appendChild(el);

    if (item === 'seedling') {
        tile.dataset.isGrowing = 'true';
        tile.dataset.hp = "2";
        tile.dataset.growthStart = Date.now();
        tile.dataset.growthDuration = GAME_CONFIG.treeGrowthTime;
        tile.dataset.pausedTime = "0";
    } else {
        if (item === 'cannon') {
            tile.dataset.hasCannon = 'true';
            tile.dataset.lastShot = "0"; 
        }
        else tile.dataset.hasFence = 'true';
        tile.dataset.hp = GAME_CONFIG.hpValues[item] || 10;
    }

    updateResourcesUI();
}

// NOWA FUNKCJA: Kontrola wzrostu drzew
function updateTreeGrowth() {
    if (gameState.gamePaused) return;

    document.querySelectorAll('[data-is-growing="true"]').forEach(tile => {
        const growthStart = parseInt(tile.dataset.growthStart);
        const duration = parseInt(tile.dataset.growthDuration);
        const now = Date.now();

        if (now - growthStart >= duration) {
            growToTree(tile);
        }
    });
}

function growToTree(tile) {
    if (tile.dataset.isGrowing === 'true') {
        tile.innerHTML = '';
        const tree = document.createElement('div');
        tree.className = `game-tile__placed-item game-tile__item--tree`;
        tree.style.backgroundImage = `url('${itemImages.tree}')`;
        tile.appendChild(tree);
        // POPRAWKA: isGrowing musi być false, żeby przestało sprawdzać czas
        tile.dataset.isGrowing = 'false'; 
        tile.dataset.hasTree = 'true';
        tile.dataset.hp = GAME_CONFIG.hpValues.tree;
    }
}

// ------------------------- Zasoby i Timer -------------------------

function getRandomResourceSize() {
    const rand = Math.random();
    if (rand < 0.5) return 1;
    if (rand < 0.8) return 2;
    return 3;
}

function spawnRandomResource(type) {
    const allTiles = Array.from(document.querySelectorAll('.game-tile'));
    const freeTiles = allTiles.filter(tile => !isTileOccupied(tile));

    if (freeTiles.length > 0) {
        const randomTile = freeTiles[Math.floor(Math.random() * freeTiles.length)];
        const size = getRandomResourceSize();
        randomTile.dataset.size = size;

        if (type === 'grass') {
            randomTile.dataset.hasGrass = 'true';
            const g = document.createElement('div'); 
            g.className = `game-tile__grass game-tile__grass--size-${size}`;
            randomTile.appendChild(g);
        } else {
            randomTile.dataset.hasStone = 'true';
            const s = document.createElement('div'); 
            s.className = `game-tile__stone game-tile__stone--size-${size}`;
            randomTile.appendChild(s);
        }
    }
}

function spawnInitialResources() {
    for (let i = 0; i < GAME_CONFIG.baseGrassCount; i++) {
        spawnRandomResource('grass');
    }
    for (let i = 0; i < GAME_CONFIG.baseStoneCount; i++) {
        spawnRandomResource('stone');
    }
}

function isTileOccupied(tile) {
    return tile.dataset.hasGrass === 'true' || tile.dataset.hasStone === 'true' || 
           tile.dataset.hasTree === 'true' || tile.dataset.isGrowing === 'true' ||
           tile.dataset.hasFence === 'true' || tile.dataset.hasCannon === 'true';
}

function updateTimerUI() {
    const statusBox = document.getElementById('statusContainer');
    if (!statusBox) return;

    if (gameState.isInvasionActive) {
        statusBox.innerHTML = `POKONANO: <span id="defeatedCount">${gameState.enemiesDefeated}</span> / ${gameState.totalEnemiesInWave} <span style="margin-left:20px; color:#ffd700;">POZIOM: ${gameState.level}</span>`;
    } else {
        const min = Math.floor(gameState.prepTime / 60);
        const sec = gameState.prepTime % 60;
        statusBox.innerHTML = `
            <span class="topBar__timer-label">ATAK ZA: <strong id="prepTimer">${min}:${sec < 10 ? '0' : ''}${sec}</strong></span>
            <span style="margin-left:20px; color:#ffd700; font-size: 1.6rem;">POZIOM: ${gameState.level}</span>
        `;
    }
}

function startPrepTimer() {
    setInterval(() => {
        if (!gameState.gamePaused) {
            // Logika przygotowań
            if (!gameState.isInvasionActive) {
                if (gameState.prepTime > 0) {
                    gameState.prepTime--;
                    updateTimerUI();
                } else {
                    handleInvasionStart();
                }
            }
            
            // POPRAWKA: updateTreeGrowth musi być wywoływane tutaj, żeby drzewa rosły zawsze
            updateTreeGrowth();

        } else if (gameState.gamePaused) {
            document.querySelectorAll('[data-is-growing="true"]').forEach(tile => {
                tile.dataset.growthStart = parseInt(tile.dataset.growthStart) + 1000;
            });
        }
    }, 1000);
}

// ------------------------- UI i Interakcja -------------------------

function handleGridClick(event) {
    if (gameState.gamePaused) return;
    const tile = event.target.closest('.game-tile');
    if (!tile) return;

    const size = parseInt(tile.dataset.size) || 1;
    if (tile.dataset.hasGrass === 'true') {
        tile.innerHTML = ''; tile.dataset.hasGrass = 'false';
        gameState.seedCount += size;
    } else if (tile.dataset.hasStone === 'true') {
        tile.innerHTML = ''; tile.dataset.hasStone = 'false';
        gameState.stoneCount += size;
    } else if (tile.dataset.hasTree === 'true') {
        tile.innerHTML = ''; tile.dataset.hasTree = 'false';
        gameState.woodCount += 2;
    }
    updateResourcesUI();
}

function updateShopButtons() {
    Object.keys(shopItems).forEach(id => {
        const btn = document.getElementById(`${id}Button`);
        if (btn) {
            const affordable = canAfford(id);
            btn.disabled = !affordable;
            btn.style.opacity = affordable ? "1" : "0.5";
            btn.setAttribute('draggable', affordable);
        }
    });
    updateMaxCraftUI();
    updateCostPanel();
}

function updateResourcesUI() {
    const sC = document.querySelector('.topBar__resource-seeds-count');
    const stC = document.querySelector('.topBar__resource-stone-count');
    const wC = document.querySelector('.topBar__resource-wood-count');
    if(sC) sC.textContent = gameState.seedCount;
    if(stC) stC.textContent = gameState.stoneCount;
    if(wC) wC.textContent = gameState.woodCount;
    updateShopButtons();
}

function updateCostPanel() {
    const panel = document.getElementById('costDetails');
    if (panel) panel.innerHTML = ""; 
}

function updateMaxCraftUI() {
    Object.keys(shopItems).forEach(item => {
        const display = document.getElementById(`${item}Max`);
        if (display) {
            const max = calculateMaxCraft(item);
            display.textContent = `max: ${max}`;
        }
    });
}

function calculateMaxCraft(item) {
    const p = shopItems[item];
    let limits = [];
    if (p.wood) limits.push(Math.floor(gameState.woodCount / p.wood));
    if (p.stone) limits.push(Math.floor(gameState.stoneCount / p.stone));
    if (p.seeds) limits.push(Math.floor(gameState.seedCount / p.seeds));
    return limits.length > 0 ? Math.min(...limits) : 0;
}

function clearTileData(tile) {
    tile.dataset.hasGrass = 'false'; tile.dataset.hasStone = 'false';
    tile.dataset.hasTree = 'false'; tile.dataset.hasFence = 'false';
    tile.dataset.hasCannon = 'false'; tile.dataset.isGrowing = 'false'; 
    tile.dataset.hp = '0'; tile.dataset.size = '0';
    tile.dataset.lastShot = '0'; 
}

function gameOver() {
    gameState.gamePaused = true;
    gameState.isInvasionActive = false;
    clearProjectiles(); 
    document.querySelector('.topBar')?.classList.remove('is-invasion');
    showEndScreen("KONIEC GRY!", "Robaki dostały się do Twojego domu!", "#ff4444", "SPRÓBUJ PONOWNIE");
}

function gameWin() {
    gameState.gamePaused = true;
    gameState.isInvasionActive = false;
    clearProjectiles(); 
    document.querySelector('.topBar')?.classList.remove('is-invasion');
    showEndScreen("ZWYCIĘSTWO!", "Obroniłeś ogród przed inwazją!", "#2ecc71", "ZAGRAJ JESZCZE RAZ");
}

function showEndScreen(title, text, color, btnText) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.9); z-index: 20000000;
        display: flex; flex-direction: column; justify-content: center;
        align-items: center; color: white; text-align: center; font-family: sans-serif;
    `;

    overlay.innerHTML = `
        <h1 style="color: ${color}; font-size: 4rem; margin-bottom: 20px;">${title}</h1>
        <p style="font-size: 1.5rem; margin-bottom: 40px;">${text}</p>
        <div style="margin-bottom: 40px;">
            <p>Twórca: Dominik Żyłkowski</p>
        </div>
        <button id="restartBtn" style="background: ${color}; color: white; border: none; padding: 15px 40px; font-size: 1.2rem; cursor: pointer; border-radius: 5px; font-weight: bold;">${btnText}</button>
    `;

    document.body.appendChild(overlay);
    document.getElementById('restartBtn').onclick = () => location.reload();
}

// ------------------------- Inicjalizacja i Eventy -------------------------

function setupInteraction() {
    const style = document.createElement('style');
    style.innerHTML = `
        body, .mainCursor { cursor: url('../assets/images/mainCursor.png'), auto !important; }
        .boardCursor { cursor: url('../assets/images/boardCursor.png'), pointer !important; }
        .used_boardCursor { cursor: url('../assets/images/used_boardCursor.png'), pointer !important; }
        button, .game-tile, #gameGrid { cursor: url('../assets/images/mainCursor.png'), auto; }
    `;
    document.head.appendChild(style);

    document.body.classList.add('mainCursor');

    const grid = document.getElementById("gameGrid");
    if (grid) {
        grid.onclick = handleGridClick;
        grid.ondragover = handleDragOver;
        grid.ondrop = handleDrop;
    }

    Object.keys(shopItems).forEach(item => {
        const btn = document.getElementById(`${item}Button`);
        if (btn) {
            const img = document.createElement('img');
            img.src = itemImages[item];
            img.style.cssText = "width: 30px; height: 30px; vertical-align: middle; margin-right: 10px;";
            btn.prepend(img);

            btn.setAttribute('draggable', 'true');
            btn.ondragstart = handleDragStart;
        }
    });

    const menuBtn = document.getElementById('menuGameButton');
    if (menuBtn) menuBtn.onclick = togglePause;

    const startBtn = document.getElementById('startGameButton');
    if (startBtn) startBtn.onclick = togglePause;

    window.onkeydown = (e) => { if (e.key === "Escape") togglePause(); };
    
    const volSlider = document.getElementById('volumeRange');
    if (volSlider) {
        volSlider.oninput = (e) => {
            gameState.volume = e.target.value * 100;
            localStorage.setItem('gameVolume', gameState.volume);
        };
    }
}

function renderBoard() {
    const grid = document.getElementById('gameGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < 50; i++) {
        const tile = document.createElement('div');
        tile.className = `game-tile ${GAME_CONFIG.tileClassNames[(Math.floor(i/10) + (i%10)) % 2]}`;
        clearTileData(tile);
        grid.appendChild(tile);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderBoard();
    setupInteraction();
    spawnInitialResources();
    updateResourcesUI();
    updateTimerUI();
    startPrepTimer();
    
    setInterval(() => { if(!gameState.gamePaused && !gameState.isInvasionActive) spawnRandomResource('grass') }, 15000);
    setInterval(() => { if(!gameState.gamePaused && !gameState.isInvasionActive) spawnRandomResource('stone') }, 25000);
});