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
        woodFence: 8, 
        stoneWall: 15, 
        worm: 10,
        worm_boss: 30 
    },
    waves: {
        1: { normal: 15, boss: 0 },
        2: { normal: 25, boss: 1 },
        3: { normal: 30, boss: 3 },
        4: { normal: 35, boss: 3 },
        5: { normal: 35, boss: 5 },
        6: { normal: 40, boss: 7 },
        7: { normal: 45, boss: 10 },
        8: { normal: 45, boss: 13 },
        9: { normal: 40, boss: 17 },
        10: { normal: 50, boss: 25 }
    },
    enemySpeed: 0.2,
    bossSpeed: 0.15 
};

const gameState = {
    level: 1,
    seedCount: 0, stoneCount: 0, woodCount: 0,
    prepTime: 900, 
    gamePaused: true, 
    selectedItemToPlace: null,
    isInvasionActive: false,
    enemiesDefeated: 0,
    totalEnemiesInWave: 0,
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
    worm_full: 'assets/images/worm_full.png',
    worm_boss: 'assets/images/worm_boss.png'
};

function getRandomResourceSize() {
    const rand = Math.random();
    if (rand < 0.5) return 1;
    if (rand < 0.8) return 2;
    return 3;
}

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

// ------------------------- Ekran Przegranej / Wygranej -------------------------

function gameOver() {
    gameState.gamePaused = true;
    showEndScreen("KONIEC GRY!", "Robaki dostały się do domu!", "#ff4444", "SPRÓBUJ PONOWNIE");
}

function gameWin() {
    gameState.gamePaused = true;
    showEndScreen(
        "ZWYCIĘSTWO!", 
        "Obroniłeś ogród przed inwazją!<br><br>Dziękuję za zagranie w moją grę!<br><strong>Twórca: Dominik Żyłkowski</strong>", 
        "#2ecc71", 
        "ZAGRAJ JESZCZE RAZ"
    );
}

function showEndScreen(title, text, color, btnText) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.9); z-index: 99999;
        display: flex; flex-direction: column; justify-content: center; align-items: center;
        color: white; font-family: 'Arial', sans-serif; text-align: center; padding: 20px;
    `;

    overlay.innerHTML = `
        <h1 style="font-size: 60px; color: ${color}; margin-bottom: 10px;">${title}</h1>
        <p style="font-size: 24px; margin-bottom: 30px; line-height: 1.5;">${text}</p>
        <button id="restartBtn" style="padding: 15px 40px; font-size: 20px; cursor: pointer; background: #2ecc71; color: white; border: none; border-radius: 5px; font-weight: bold;">${btnText}</button>
    `;

    document.body.appendChild(overlay);
    document.getElementById('restartBtn').onclick = () => location.reload();
}

// ------------------------- Zasoby i Timer -------------------------

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

// ------------------------- System Zasobów -------------------------

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

function startResourceSpawning() {
    setInterval(() => { if (!gameState.gamePaused && !gameState.isInvasionActive) spawnRandomResource('grass'); }, GAME_CONFIG.spawnIntervals.grass);
    setInterval(() => { if (!gameState.gamePaused && !gameState.isInvasionActive) spawnRandomResource('stone'); }, GAME_CONFIG.spawnIntervals.stone);
}

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
        const resourceValue = parseInt(tile.dataset.size) || 1;

        if (tile.dataset.hasGrass === 'true') {
            tile.querySelector('.game-tile__grass')?.remove();
            tile.dataset.hasGrass = 'false';
            gameState.seedCount += resourceValue;
        } else if (tile.dataset.hasStone === 'true') {
            tile.querySelector('.game-tile__stone')?.remove();
            tile.dataset.hasStone = 'false';
            gameState.stoneCount += resourceValue;
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
    
    const currentWave = GAME_CONFIG.waves[gameState.level];
    gameState.totalEnemiesInWave = currentWave.normal + currentWave.boss;
    
    document.querySelector('.topBar')?.classList.add('is-invasion');
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
    const grid = document.getElementById('gameGrid');
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

function handleLevelComplete() {
    gameState.isInvasionActive = false;
    if (gameState.level >= 10) {
        gameWin();
    } else {
        gameState.level++;
        gameState.prepTime = Math.max(40, 900 - (gameState.level - 1) * 40);
        document.querySelector('.topBar')?.classList.remove('is-invasion');
        updateTimerUI();
    }
}

function updateGameLoop() {
    if (gameState.gamePaused || !gameState.isInvasionActive) return;
    const tiles = document.querySelectorAll('.game-tile');

    gameState.activeEnemies.forEach(enemy => {
        if (enemy.isAttacking) return;
        
        const speed = enemy.type === 'boss' ? GAME_CONFIG.enemySpeed * 0.8 : GAME_CONFIG.enemySpeed;
        enemy.offsetX += speed;
        enemy.element.style.transform = `translate(-50%, -50%) translateX(-${enemy.offsetX}px)`;

        const colShift = Math.floor((enemy.offsetX + 55) / enemy.element.parentElement.offsetWidth);
        const newCol = 9 - colShift;

        if (newCol !== enemy.currentCol) {
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
        if (newCol < 0) gameOver();
    });
    requestAnimationFrame(updateGameLoop);
}

// ------------------------- UI i Inicjalizacja -------------------------

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
    tile.dataset.isGrowing = 'false'; tile.dataset.hp = '0'; tile.dataset.size = '0';
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
        const size = getRandomResourceSize();
        t.dataset.hasGrass = 'true';
        t.dataset.size = size;
        const g = document.createElement('div'); 
        g.className = `game-tile__grass game-tile__grass--size-${size}`; 
        t.appendChild(g); 
    });
    
    all.slice(6, 10).forEach(t => { 
        const size = getRandomResourceSize();
        t.dataset.hasStone = 'true';
        t.dataset.size = size;
        const s = document.createElement('div'); 
        s.className = `game-tile__stone game-tile__stone--size-${size}`; 
        t.appendChild(s); 
    });
}

function setupInteraction() {
    const grid = document.getElementById("gameGrid");
    grid.addEventListener('click', handleGridClick);

    // Dynamiczne przypisanie eventów dla każdego kafelka po wyrenderowaniu
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
                setTimeout(() => { 
                    gameState.selectedItemToPlace = null; 
                    updateVisualHighlights(); 
                }, 100);
            });
            btn.onclick = (e) => { 
                e.stopPropagation(); 
                if (!gameState.gamePaused) setSelectedItem(item); 
            };
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