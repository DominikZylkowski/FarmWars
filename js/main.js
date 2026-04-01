// ------------------------- Konfiguracja gry -------------------------
const GAME_CONFIG = {
    rows: 5,
    columns: 10,
    tileClassNames: ['game-tile--light', 'game-tile--dark'],
    baseGrassCount: 6,
    baseStoneCount: 4,
    spawnIntervals: {
        grass: 15000, 
        stone: 25000  
    },
    treeGrowthTime: 15000, 
    hpValues: { 
        tree: 5, 
        cannon: 10, 
        woodFence: 8, 
        stoneWall: 15, 
        worm: 10,
        worm_boss: 30 
    },
    waves: {
        1: { normal: 5, boss: 0 },
        2: { normal: 10, boss: 0 },
        3: { normal: 15, boss: 1 },
        4: { normal: 20, boss: 2 },
        5: { normal: 25, boss: 3 },
        6: { normal: 30, boss: 5 },
        7: { normal: 35, boss: 7 },
        8: { normal: 40, boss: 10 },
        9: { normal: 45, boss: 15 },
        10: { normal: 50, boss: 20 }
    },
    enemySpeed: 0.2,
    bossSpeed: 0.15,
    projectileSpeed: 4, 
    cannonDamage: 3      
};

const gameState = {
    level: 1, 
    seedCount: 0, 
    stoneCount: 0, 
    woodCount: 0,
    prepTime: 900, 
    gamePaused: true, 
    selectedItemToPlace: null,
    isInvasionActive: false,
    enemiesDefeated: 0,
    totalEnemiesInWave: 0,
    activeEnemies: [],
    activeProjectiles: [], 
    volume: parseInt(localStorage.getItem('gameVolume')) || 50
};

const shopItems = {
    cannon: { wood: 15, stone: 10 }, 
    seedling: { seeds: 1 },
    woodFence: { wood: 10 },
    stoneWall: { stone: 12 }
};

const itemImages = {
    cannon: 'assets/images/cannon.png',
    seedling: 'assets/images/seedling.png',
    tree: 'assets/images/tree.png',
    woodFence: 'assets/images/woodFence.png',
    stoneWall: 'assets/images/stoneWall.png',
    worm_full: 'assets/images/worm_full.png',
    worm_boss: 'assets/images/worm_boss.png',
    cannonball: 'assets/images/cannonball.png' 
};

// ------------------------- System Menu i Pauzy -------------------------

function togglePause() {
    const menu = document.getElementById('gameMenu');
    if (!menu) return;
    
    gameState.gamePaused = !gameState.gamePaused;
    
    if (gameState.gamePaused) {
        menu.classList.remove('is-hidden');
        // WYSOKI Z-INDEX DLA MENU (wyższy niż kule)
        menu.style.zIndex = "10000000"; 
        
        const startBtn = document.getElementById('startGameButton');
        if (startBtn) startBtn.textContent = "WZNÓW GRĘ";
        
        // Zapewnienie, że kontrolki w menu też są na wierzchu
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
        setTimeout(() => growToTree(tile), GAME_CONFIG.treeGrowthTime);
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

function growToTree(tile) {
    if (tile.dataset.isGrowing === 'true') {
        tile.innerHTML = '';
        const tree = document.createElement('div');
        tree.className = `game-tile__placed-item game-tile__item--tree`;
        tree.style.backgroundImage = `url('${itemImages.tree}')`;
        tile.appendChild(tree);
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
        if (!gameState.gamePaused && !gameState.isInvasionActive) {
            if (gameState.prepTime > 0) {
                gameState.prepTime--;
                updateTimerUI();
            } else {
                handleInvasionStart();
            }
        }
    }, 1000);
}

// ------------------------- Inwazja i Walka -------------------------

function handleInvasionStart() {
    gameState.isInvasionActive = true;
    gameState.enemiesDefeated = 0;
    const currentWave = GAME_CONFIG.waves[gameState.level] || GAME_CONFIG.waves[10];
    gameState.totalEnemiesInWave = currentWave.normal + currentWave.boss;
    
    document.querySelector('.topBar')?.classList.add('is-invasion');
    const menuBtn = document.getElementById('menuGameButton');
    if (menuBtn) menuBtn.style.color = 'black';

    updateTimerUI();

    let spawnQueue = [];
    for(let i=0; i < currentWave.normal; i++) spawnQueue.push('normal');
    for(let i=0; i < currentWave.boss; i++) spawnQueue.push('boss');
    spawnQueue.sort(() => Math.random() - 0.5);

    let spawned = 0;
    const spawnIntervalTime = Math.max(500, 3000 - (gameState.level * 200));

    const spawnTimer = setInterval(() => {
        if (gameState.gamePaused) return; 
        if (spawned < spawnQueue.length) {
            const randomRow = Math.floor(Math.random() * 5);
            spawnEnemy(randomRow, spawnQueue[spawned]);
            spawned++;
        } else { clearInterval(spawnTimer); }
    }, spawnIntervalTime);

    requestAnimationFrame(updateGameLoop);
}

function spawnEnemy(row, type) {
    const tiles = document.querySelectorAll('.game-tile');
    const targetTile = tiles[(row * 10) + 9];
    if (!targetTile) return;

    const enemyEl = document.createElement('div');
    enemyEl.className = `enemy-worm ${type === 'boss' ? 'enemy-worm--boss' : ''}`;
    
    const size = type === 'boss' ? 160 : 120;
    const img = type === 'boss' ? itemImages.worm_boss : itemImages.worm_full;
    const hpValue = type === 'boss' ? GAME_CONFIG.hpValues.worm_boss : GAME_CONFIG.hpValues.worm;

    enemyEl.style.cssText = `width:${size}px; height:${size}px; position:absolute; z-index:1000; top:50%; left:50%; transform:translate(-50%, -50%); background:url('${img}') no-repeat center/contain; pointer-events: auto;`;
    
    const hpFill = document.createElement('div');
    hpFill.style.cssText = `width:100%; height:8px; background:#2ecc71; position:absolute; top:-10px; border:2px solid black; transition: width 0.2s, background 0.2s;`;
    enemyEl.appendChild(hpFill);
    targetTile.appendChild(enemyEl);

    const enemyObj = { 
        element: enemyEl, 
        hp: hpValue, 
        maxHp: hpValue, 
        offsetX: 0, 
        row: row, 
        currentCol: 9, 
        isAttacking: false,
        type: type 
    };

    enemyEl.onclick = (e) => { e.stopPropagation(); damageEnemy(enemyObj, 2); };
    gameState.activeEnemies.push(enemyObj);
}

function damageEnemy(enemy, amount) {
    enemy.hp -= amount;
    const hpPercent = (enemy.hp / enemy.maxHp) * 100;
    const hpBarFill = enemy.element.firstChild;
    hpBarFill.style.width = `${hpPercent}%`;

    if (hpPercent > 60) hpBarFill.style.background = '#2ecc71';
    else if (hpPercent > 30) hpBarFill.style.background = '#f1c40f';
    else hpBarFill.style.background = '#e74c3c';

    if (enemy.hp <= 0) {
        enemy.element.remove();
        gameState.activeEnemies = gameState.activeEnemies.filter(e => e !== enemy);
        gameState.enemiesDefeated++;
        updateTimerUI();
        if (gameState.enemiesDefeated >= gameState.totalEnemiesInWave && gameState.activeEnemies.length === 0) {
            handleLevelComplete();
        }
    }
}

function updateCannons() {
    const tiles = document.querySelectorAll('.game-tile');
    tiles.forEach((tile, index) => {
        if (tile.dataset.hasCannon === 'true') {
            const row = Math.floor(index / 10);
            const hasEnemiesInRow = gameState.activeEnemies.some(e => e.row === row);
            
            if (hasEnemiesInRow) {
                const now = Date.now();
                const lastShot = parseInt(tile.dataset.lastShot) || 0;
                if (now - lastShot >= 1000) {
                    tile.dataset.lastShot = now;
                    fireCannon(tile, row);
                }
            }
        }
    });
}

function fireCannon(tile, row) {
    const cannonEl = tile.querySelector('.game-tile__item--cannon');
    if (cannonEl) {
        cannonEl.classList.remove('is-shooting');
        void cannonEl.offsetWidth; 
        cannonEl.classList.add('is-shooting');
    }

    const rect = tile.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;

    const projEl = document.createElement('div');
    projEl.className = 'cannonball';
    
    // Kula ma z-index 9999999
    projEl.style.cssText = `
        width: 45px; 
        height: 45px; 
        position: fixed; 
        z-index: 9999999; 
        top: ${startY}px;
        left: ${startX}px;
        transform: translate(-50%, -50%);
        background: url('${itemImages.cannonball}') no-repeat center/contain;
        pointer-events: none;
    `;
    
    document.body.appendChild(projEl);

    gameState.activeProjectiles.push({
        element: projEl,
        currentX: startX,
        currentY: startY,
        xOffset: 0,
        row: row
    });
}

function updateProjectiles() {
    for (let i = gameState.activeProjectiles.length - 1; i >= 0; i--) {
        const p = gameState.activeProjectiles[i];
        p.xOffset += GAME_CONFIG.projectileSpeed;
        
        const drawX = p.currentX + p.xOffset;
        p.element.style.left = `${drawX}px`;
        p.element.style.transform = `translate(-50%, -50%) rotate(${p.xOffset * 2}deg)`;

        const pRect = p.element.getBoundingClientRect();
        let hit = false;

        const enemiesInRow = gameState.activeEnemies.filter(e => e.row === p.row);
        for (let e of enemiesInRow) {
            const eRect = e.element.getBoundingClientRect();
            if (
                pRect.right >= eRect.left + 20 &&
                pRect.left <= eRect.right &&
                pRect.bottom >= eRect.top &&
                pRect.top <= eRect.bottom
            ) {
                damageEnemy(e, GAME_CONFIG.cannonDamage);
                hit = true;
                break;
            }
        }

        if (hit || drawX > window.innerWidth) {
            p.element.remove();
            gameState.activeProjectiles.splice(i, 1);
        }
    }
}

function clearProjectiles() {
    gameState.activeProjectiles.forEach(p => p.element.remove());
    gameState.activeProjectiles = [];
}

function updateGameLoop() {
    if (gameState.gamePaused || !gameState.isInvasionActive) return;

    gameState.activeEnemies.forEach(enemy => {
        if (enemy.isAttacking) return;
        const speed = enemy.type === 'boss' ? GAME_CONFIG.enemySpeed * 0.8 : GAME_CONFIG.enemySpeed;
        enemy.offsetX += speed;
        enemy.element.style.transform = `translate(-50%, -50%) translateX(-${enemy.offsetX}px)`;

        const colShift = Math.floor((enemy.offsetX + 55) / enemy.element.parentElement.offsetWidth);
        const newCol = 9 - colShift;

        if (newCol < 0) {
            gameOver();
            return;
        }

        if (newCol !== enemy.currentCol) {
            const tiles = document.querySelectorAll('.game-tile');
            const targetTile = tiles[(enemy.row * 10) + newCol];
            if (targetTile && isTileOccupied(targetTile)) {
                enemy.isAttacking = true;
                const attackInterval = enemy.type === 'boss' ? 2500 : 1200; 
                const attackDamage = enemy.type === 'boss' ? 2.5 : 1; 

                const attackInt = setInterval(() => {
                    if (gameState.gamePaused || !gameState.activeEnemies.includes(enemy)) { clearInterval(attackInt); return; }
                    let hp = parseFloat(targetTile.dataset.hp) || 0;
                    if (hp > 0) {
                        hp -= attackDamage;
                        targetTile.dataset.hp = hp;
                        targetTile.style.opacity = "0.7";
                        setTimeout(() => targetTile.style.opacity = "1", 100);
                    }
                    if (hp <= 0) {
                        targetTile.innerHTML = '';
                        clearTileData(targetTile);
                        enemy.isAttacking = false;
                        clearInterval(attackInt);
                    }
                }, attackInterval);
            }
            enemy.currentCol = newCol;
        }
    });

    updateCannons();
    updateProjectiles();

    requestAnimationFrame(updateGameLoop);
}

function handleLevelComplete() {
    gameState.isInvasionActive = false;
    clearProjectiles(); 
    
    const menuBtn = document.getElementById('menuGameButton');
    if (menuBtn) menuBtn.style.color = '';

    if (gameState.level >= 10) {
        gameWin();
    } else {
        gameState.level++;
        gameState.prepTime = Math.max(60, 900 - (gameState.level - 1) * 90);
        document.querySelector('.topBar')?.classList.remove('is-invasion');
        updateTimerUI();
        updateShopButtons(); 
    }
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
    // EKRAN KOŃCOWY TEŻ MUSI MIEĆ NAJWYŻSZY Z-INDEX
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
    const grid = document.getElementById("gameGrid");
    if (grid) {
        grid.onclick = handleGridClick;
        grid.ondragover = handleDragOver;
        grid.ondrop = handleDrop;
    }

    Object.keys(shopItems).forEach(item => {
        const btn = document.getElementById(`${item}Button`);
        if (btn) {
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