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
    hpValues: { tree: 5, woodFence: 8, stoneWall: 15, worm: 10 },
    invasionSize: 5,
    enemySpeed: 0.2 
};

const gameState = {
    level: 1,
    seedCount: 0, stoneCount: 0, woodCount: 0,
    prepTime: 30, 
    gamePaused: true, 
    selectedItemToPlace: null,
    isInvasionActive: false,
    enemiesDefeated: 0,
    activeEnemies: []
};

const shopItems = {
    cannon: { wood: 15, stone: 10 },
    seedling: { seeds: 1 },
    woodFence: { wood: 10 },
    stoneWall: { stone: 25 }
};

const itemImages = {
    cannon: 'assets/images/cannon.png',
    seedling: 'assets/images/seedling.png',
    tree: 'assets/images/tree.png',
    woodFence: 'assets/images/woodFence.png',
    stoneWall: 'assets/images/stoneWall.png',
    worm_full: 'assets/images/worm_full.png'
};

// ------------------------- System Pauzy i ESC -------------------------

function togglePause() {
    const menu = document.getElementById('gameMenu');
    if (!menu) return;
    gameState.gamePaused = !gameState.gamePaused;
    
    if (gameState.gamePaused) {
        menu.classList.remove('is-hidden');
    } else {
        menu.classList.add('is-hidden');
        if (gameState.isInvasionActive) requestAnimationFrame(updateGameLoop);
    }
}

window.addEventListener('keydown', (e) => {
    if (e.key === "Escape") togglePause();
});

// ------------------------- Ekran Przegranej -------------------------

function gameOver() {
    gameState.gamePaused = true;
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.9); z-index: 99999;
        display: flex; flex-direction: column; justify-content: center; align-items: center;
        color: white; font-family: 'Arial', sans-serif; text-align: center;
    `;

    overlay.innerHTML = `
        <h1 style="font-size: 60px; color: #ff4444; margin-bottom: 10px;">KONIEC GRY!</h1>
        <p style="font-size: 24px; margin-bottom: 30px;">Robaki dostały się do domu!</p>
        <button id="restartBtn" style="padding: 15px 40px; font-size: 20px; cursor: pointer; background: #2ecc71; color: white; border: none; border-radius: 5px; font-weight: bold;">SPRÓBUJ PONOWNIE</button>
    `;

    document.body.appendChild(overlay);
    document.getElementById('restartBtn').onclick = () => location.reload();
}

// ------------------------- Zasoby i Timer -------------------------

function updateTimerUI() {
    const statusBox = document.querySelector('.topBar__status');
    if (!statusBox) return;

    if (gameState.isInvasionActive) {
        statusBox.innerHTML = `POKONANO: <span id="defeatedCount">${gameState.enemiesDefeated}</span> / ${GAME_CONFIG.invasionSize}`;
    } else {
        const min = Math.floor(gameState.prepTime / 60);
        const sec = gameState.prepTime % 60;
        statusBox.innerHTML = `<span class="topBar__timer-label">ATAK ZA: <strong id="prepTimer">${min}:${sec < 10 ? '0' : ''}${sec}</strong></span>`;
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

function spawnRandomResource(type) {
    const allTiles = Array.from(document.querySelectorAll('.game-tile'));
    const freeTiles = allTiles.filter(tile => !isTileOccupied(tile));

    if (freeTiles.length > 0) {
        const randomTile = freeTiles[Math.floor(Math.random() * freeTiles.length)];
        if (type === 'grass') {
            randomTile.dataset.hasGrass = 'true';
            const g = document.createElement('div'); g.className = 'game-tile__grass';
            randomTile.appendChild(g);
        } else {
            randomTile.dataset.hasStone = 'true';
            const s = document.createElement('div'); s.className = 'game-tile__stone';
            randomTile.appendChild(s);
        }
    }
}

function startResourceSpawning() {
    setInterval(() => { if (!gameState.gamePaused && !gameState.isInvasionActive) spawnRandomResource('grass'); }, GAME_CONFIG.spawnIntervals.grass);
    setInterval(() => { if (!gameState.gamePaused && !gameState.isInvasionActive) spawnRandomResource('stone'); }, GAME_CONFIG.spawnIntervals.stone);
}

// ------------------------- Mechanika Przeciągania i Klikania -------------------------

function isTileOccupied(tile) {
    return tile.dataset.hasGrass === 'true' || tile.dataset.hasStone === 'true' || 
           tile.dataset.hasTree === 'true' || tile.dataset.isGrowing === 'true' ||
           tile.dataset.hasFence === 'true';
}

function setSelectedItem(item) {
    gameState.selectedItemToPlace = (gameState.selectedItemToPlace === item) ? null : item;
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
        tile.dataset.hp = "2"; tile.dataset.maxHp = "2";
        setTimeout(() => {
            if (tile.dataset.isGrowing === 'true') {
                tile.querySelector('.game-tile__item--seedling')?.remove();
                const tree = document.createElement('div');
                tree.className = `game-tile__placed-item game-tile__item--tree`;
                tree.style.backgroundImage = `url('${itemImages.tree}')`;
                tile.appendChild(tree);
                tile.dataset.isGrowing = 'false'; tile.dataset.hasTree = 'true';
                tile.dataset.hp = GAME_CONFIG.hpValues.tree; tile.dataset.maxHp = GAME_CONFIG.hpValues.tree;
            }
        }, GAME_CONFIG.treeGrowthTime);
    } else {
        tile.dataset.hasFence = 'true';
        tile.dataset.hp = GAME_CONFIG.hpValues[item] || 10;
        tile.dataset.maxHp = GAME_CONFIG.hpValues[item] || 10;
    }

    gameState.selectedItemToPlace = null;
    updateVisualHighlights();
    updateResourcesUI();
    updateShopButtons();
}

function handleGridClick(event) {
    const tile = event.target.closest('.game-tile');
    if (!tile || gameState.gamePaused) return;

    if (gameState.selectedItemToPlace) {
        placeSelectedItemOnTile(tile);
    } else {
        if (tile.dataset.hasGrass === 'true') {
            tile.querySelector('.game-tile__grass')?.remove();
            tile.dataset.hasGrass = 'false';
            gameState.seedCount++;
        } else if (tile.dataset.hasStone === 'true') {
            tile.querySelector('.game-tile__stone')?.remove();
            tile.dataset.hasStone = 'false';
            gameState.stoneCount++;
        } else if (tile.dataset.hasTree === 'true' && tile.dataset.isGrowing !== 'true') {
            tile.querySelector('.game-tile__placed-item')?.remove();
            tile.dataset.hasTree = 'false';
            gameState.woodCount += 2;
        }
        updateResourcesUI();
        updateShopButtons();
    }
}

// ------------------------- Inwazja i Walka -------------------------

function handleInvasionStart() {
    gameState.isInvasionActive = true;
    gameState.enemiesDefeated = 0;
    document.querySelector('.topBar')?.classList.add('is-invasion');
    updateTimerUI();

    let rows = [];
    for(let i=0; i < GAME_CONFIG.invasionSize; i++) rows.push(i < 5 ? i : Math.floor(Math.random() * 5));
    rows.sort(() => Math.random() - 0.5);

    let spawned = 0;
    const spawnTimer = setInterval(() => {
        if (gameState.gamePaused) return; 
        if (spawned < rows.length) {
            spawnEnemy(rows[spawned]);
            spawned++;
        } else { clearInterval(spawnTimer); }
    }, 4000);

    requestAnimationFrame(updateGameLoop);
}

function spawnEnemy(row) {
    const tiles = document.querySelectorAll('.game-tile');
    const targetTile = tiles[(row * 10) + 9];
    if (!targetTile) return;

    const enemyEl = document.createElement('div');
    enemyEl.className = 'enemy-worm';
    enemyEl.style.cssText = `width:120px; height:120px; position:absolute; z-index:1000; top:50%; left:50%; transform:translate(-50%, -50%); background:url('${itemImages.worm_full}') no-repeat center/contain;`;
    
    const hpFill = document.createElement('div');
    hpFill.style.cssText = `width:100%; height:8px; background:red; position:absolute; top:-10px; border:2px solid black;`;
    enemyEl.appendChild(hpFill);
    targetTile.appendChild(enemyEl);

    const enemyObj = { element: enemyEl, hp: 10, maxHp: 10, offsetX: 0, row: row, currentCol: 9, isAttacking: false };
    enemyEl.onclick = (e) => { e.stopPropagation(); damageEnemy(enemyObj, 2); };
    gameState.activeEnemies.push(enemyObj);
}

function damageEnemy(enemy, amount) {
    enemy.hp -= amount;
    enemy.element.firstChild.style.width = `${(enemy.hp/enemy.maxHp)*100}%`;
    if (enemy.hp <= 0) {
        enemy.element.remove();
        gameState.activeEnemies = gameState.activeEnemies.filter(e => e !== enemy);
        gameState.enemiesDefeated++;
        updateTimerUI();
        if (gameState.enemiesDefeated >= GAME_CONFIG.invasionSize && gameState.activeEnemies.length === 0) {
            gameState.isInvasionActive = false;
            gameState.level++;
            gameState.prepTime = 40;
            document.querySelector('.topBar')?.classList.remove('is-invasion');
            updateTimerUI();
        }
    }
}

function updateGameLoop() {
    if (gameState.gamePaused || !gameState.isInvasionActive) return;
    const tiles = document.querySelectorAll('.game-tile');

    gameState.activeEnemies.forEach(enemy => {
        if (enemy.isAttacking) return;
        enemy.offsetX += GAME_CONFIG.enemySpeed;
        enemy.element.style.transform = `translate(-50%, -50%) translateX(-${enemy.offsetX}px)`;

        const colShift = Math.floor((enemy.offsetX + 55) / enemy.element.parentElement.offsetWidth);
        const newCol = 9 - colShift;

        if (newCol !== enemy.currentCol) {
            const targetTile = tiles[(enemy.row * 10) + newCol];
            if (targetTile && isTileOccupied(targetTile)) {
                enemy.isAttacking = true;
                const attackInt = setInterval(() => {
                    if (gameState.gamePaused || !gameState.activeEnemies.includes(enemy)) { clearInterval(attackInt); return; }
                    let hp = parseInt(targetTile.dataset.hp) || 0;
                    if (hp > 0) targetTile.dataset.hp = --hp;
                    else {
                        targetTile.innerHTML = '';
                        clearTileData(targetTile);
                        enemy.isAttacking = false;
                        clearInterval(attackInt);
                    }
                }, 1200);
            }
            enemy.currentCol = newCol;
        }
        if (newCol < 0) gameOver();
    });
    requestAnimationFrame(updateGameLoop);
}

// ------------------------- Inicjalizacja i UI -------------------------

function canAfford(item) {
    const p = shopItems[item];
    if (!p) return false;
    return !((p.seeds && gameState.seedCount < p.seeds) || (p.wood && gameState.woodCount < p.wood) || (p.stone && gameState.stoneCount < p.stone));
}

function updateShopButtons() {
    Object.keys(shopItems).forEach(id => {
        const btn = document.getElementById(`${id}Button`);
        if (btn) btn.disabled = !canAfford(id);
    });
}

function updateResourcesUI() {
    document.querySelector('.topBar__resource-seeds-count').textContent = gameState.seedCount;
    document.querySelector('.topBar__resource-stone-count').textContent = gameState.stoneCount;
    document.querySelector('.topBar__resource-wood-count').textContent = gameState.woodCount;
}

function clearTileData(tile) {
    tile.dataset.hasGrass = 'false'; tile.dataset.hasStone = 'false';
    tile.dataset.hasTree = 'false'; tile.dataset.hasFence = 'false';
    tile.dataset.isGrowing = 'false'; tile.dataset.hp = '0';
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
    const all = Array.from(document.querySelectorAll('.game-tile')).sort(() => 0.5 - Math.random());
    all.slice(0, 6).forEach(t => { 
        t.dataset.hasGrass = 'true';
        const g = document.createElement('div'); g.className = 'game-tile__grass'; t.appendChild(g); 
    });
    all.slice(6, 10).forEach(t => { 
        t.dataset.hasStone = 'true';
        const s = document.createElement('div'); s.className = 'game-tile__stone'; t.appendChild(s); 
    });
}

function setupInteraction() {
    const grid = document.getElementById("gameGrid");
    grid.addEventListener('click', handleGridClick);

    // DRAG OVER / DROP
    document.querySelectorAll('.game-tile').forEach(tile => {
        tile.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (gameState.selectedItemToPlace && !isTileOccupied(tile)) tile.classList.add('game-tile--can-place');
        });
        tile.addEventListener('dragleave', () => tile.classList.remove('game-tile--can-place'));
        tile.addEventListener('drop', (e) => {
            e.preventDefault();
            tile.classList.remove('game-tile--can-place');
            if (gameState.selectedItemToPlace) placeSelectedItemOnTile(tile);
        });
    });

    Object.keys(shopItems).forEach(item => {
        const btn = document.getElementById(`${item}Button`);
        if (btn) {
            btn.setAttribute('draggable', 'true');
            btn.addEventListener('dragstart', () => {
                if (!gameState.gamePaused && canAfford(item)) {
                    gameState.selectedItemToPlace = item;
                    updateVisualHighlights();
                }
            });
            btn.addEventListener('dragend', () => {
                setTimeout(() => { gameState.selectedItemToPlace = null; updateVisualHighlights(); }, 100);
            });
            btn.onclick = (e) => { e.stopPropagation(); if (!gameState.gamePaused) setSelectedItem(item); };
        }
    });

    document.getElementById('startGameButton').onclick = togglePause;
}

document.addEventListener('DOMContentLoaded', () => {
    renderBoard();
    setupInteraction();
    startPrepTimer();
    startResourceSpawning();
    updateResourcesUI();
    updateShopButtons();
    updateTimerUI();
});