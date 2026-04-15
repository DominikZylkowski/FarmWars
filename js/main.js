// ------------------------- Skalowanie całej gry -------------------------
const APP_SCALE_BASE_WIDTH = 1600;
const APP_SCALE_BASE_HEIGHT = 900;
const APP_MIN_SCALE = 0.6;

function getAppScale() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--app-scale');
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function updateAppScale() {
    const widthScale = window.innerWidth / APP_SCALE_BASE_WIDTH;
    const heightScale = window.innerHeight / APP_SCALE_BASE_HEIGHT;
    const scale = Math.max(APP_MIN_SCALE, Math.min(1, widthScale, heightScale));

    document.documentElement.style.setProperty('--app-scale', scale.toFixed(4));
}

function setGamePaused(shouldPause, options = {}) {
    const { showMenu = true } = options;
    const menu = document.getElementById('gameMenu');

    gameState.gamePaused = shouldPause;

    if (shouldPause) {
        if (menu && showMenu) {
            menu.classList.remove('is-hidden');
            menu.style.zIndex = '10000000';

            const startBtn = document.getElementById('startGameButton');
            if (startBtn) startBtn.textContent = 'WZNÓW GRĘ';

            const controls = menu.querySelectorAll('button, input, select');
            controls.forEach(c => c.style.zIndex = '10000001');
        }

        document.querySelectorAll('[data-is-growing="true"]').forEach(tile => {
            tile.dataset.pausedTime = '0';
        });
        return;
    }

    if (menu) {
        menu.classList.add('is-hidden');
        menu.style.zIndex = '';

        const startBtn = document.getElementById('startGameButton');
        if (startBtn) startBtn.textContent = 'ZAGRAJ';

        const controls = menu.querySelectorAll('button, input, select');
        controls.forEach(c => c.style.zIndex = '');
    }

    lastFrameTime = Date.now();

    if (gameState.isInvasionActive) {
        requestAnimationFrame(updateGameLoop);
    }

    document.querySelectorAll('[data-is-growing="true"]').forEach(tile => {
        const pausedTime = parseInt(tile.dataset.pausedTime || '0');
        tile.dataset.growthStart = parseInt(tile.dataset.growthStart || `${Date.now()}`) + pausedTime;
        tile.dataset.pausedTime = '0';
    });
}

function togglePause() {
    if (gameState.tutorialVisible) return;
    setGamePaused(!gameState.gamePaused);
}

window.addEventListener('resize', updateAppScale);
window.addEventListener('orientationchange', updateAppScale);

// ------------------------- System Przeciągania (Drag & Drop) -------------------------
function handleDragStart(e) {
    const button = e.currentTarget || e.target.closest('button');
    const itemId = button?.id?.replace('Button', '');

    if (!itemId || !canAfford(itemId) || gameState.gamePaused) {
        e.preventDefault();
        return;
    }

    gameState.selectedItemToPlace = itemId;
    e.dataTransfer.setData('text/plain', itemId);
    e.dataTransfer.effectAllowed = 'move';
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
        tile.classList.remove('can-place', 'game-tile--can-place');
    });
}

const RESOURCE_LABELS = {
    wood: 'Drewno',
    stone: 'Kamień',
    seeds: 'Nasiona'
};

function svgToDataUri(svg) {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const RESOURCE_ICONS = {
    wood: 'assets/images/tree.png',
    stone: 'assets/images/stone.png',
    seeds: 'assets/images/grass.png'
};

function renderShopCosts() {
    Object.entries(shopItems).forEach(([item, cost]) => {
        const container = document.getElementById(`${item}Costs`);
        if (!container) return;

        container.innerHTML = '';

        Object.entries(cost).forEach(([resource, amount]) => {
            const row = document.createElement('div');
            row.className = 'shop-item__cost';

            const icon = document.createElement('img');
            icon.className = 'shop-item__cost-icon';
            icon.alt = RESOURCE_LABELS[resource] || resource;
            icon.src = RESOURCE_ICONS[resource] || '';

            const value = document.createElement('span');
            value.className = 'shop-item__cost-value';
            value.textContent = `x${amount}`;

            row.append(icon, value);
            container.appendChild(row);
        });
    });
}

const TUTORIAL_STEPS = [
    {
        title: 'Zbieraj surowce',
        text: 'Klikaj na trawę, kamień i inne surowce na planszy, żeby dodać je do swojego ekwipunku.'
    },
    {
        title: 'Buduj z topbaru',
        text: 'Przeciągnij ikonę produktu z górnego paska na wolny kafelek. Obok przycisku od razu widzisz, co jest potrzebne.'
    },
    {
        title: 'Armaty strzelają same',
        text: 'Postaw armatę na swojej stronie planszy, a sama będzie ostrzeliwać robaki, gdy pojawią się w tym rzędzie.'
    },
    {
        title: 'Pauza działa zawsze',
        text: 'Menu i ESC zatrzymują czas. Możesz wrócić do gry bez tracenia postępu i bez rozjeżdżania akcji.'
    }
];

function renderTutorialStep() {
    const title = document.getElementById('tutorialStepTitle');
    const text = document.getElementById('tutorialStepText');
    const progress = document.getElementById('tutorialStepProgress');
    const nextBtn = document.getElementById('tutorialNextButton');

    const total = TUTORIAL_STEPS.length;
    const step = Math.min(gameState.tutorialStep, total - 1);
    const current = TUTORIAL_STEPS[step];

    if (title) title.textContent = current.title;
    if (text) text.textContent = current.text;
    if (progress) progress.textContent = `${step + 1}/${total}`;
    if (nextBtn) nextBtn.textContent = step >= total - 1 ? 'Zakończ' : 'Dalej';
}

function showTutorial() {
    const overlay = document.getElementById('tutorialOverlay');
    if (!overlay) return;

    gameState.tutorialVisible = true;
    gameState.gameStarted = true;
    gameState.tutorialStep = 0;
    setGamePaused(true, { showMenu: false });
    renderTutorialStep();
    overlay.classList.remove('is-hidden');
}

function finishTutorial() {
    const overlay = document.getElementById('tutorialOverlay');
    if (overlay) overlay.classList.add('is-hidden');

    gameState.tutorialVisible = false;
    gameState.tutorialCompleted = true;
    localStorage.setItem('farmwarsTutorialCompleted', '1');
    gameState.tutorialStep = 0;
    setGamePaused(false, { showMenu: false });
}

function advanceTutorial() {
    if (!gameState.tutorialVisible) return;

    if (gameState.tutorialStep >= TUTORIAL_STEPS.length - 1) {
        finishTutorial();
        return;
    }

    gameState.tutorialStep += 1;
    renderTutorialStep();
}

function skipTutorial() {
    if (!gameState.tutorialVisible) return;
    finishTutorial();
}

function handleStartButton() {
    if (!gameState.gameStarted) {
        const menu = document.getElementById('gameMenu');
        if (menu) menu.classList.add('is-hidden');
        showTutorial();
        return;
    }

    togglePause();
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
        } else tile.dataset.hasFence = 'true';
        tile.dataset.hp = GAME_CONFIG.hpValues[item] || 10;
    }

    updateResourcesUI();
}

// ------------------------- Damage (Poprawione o blokadę pauzy) -------------------------
function damageEnemy(enemy, amount) {
    // Blokada zadawania obrażeń podczas pauzy
    if (gameState.gamePaused) return;

    enemy.hp -= amount;

    const hpPercent = (enemy.hp / enemy.maxHp) * 100;
    const hpBarFill = enemy.element.firstChild;

    if (hpBarFill) {
        hpBarFill.style.width = `${hpPercent}%`;
        if (hpPercent > 60) {
            hpBarFill.style.background = GAME_CONFIG.hpColors.high;
        } else if (hpPercent > 30) {
            hpBarFill.style.background = GAME_CONFIG.hpColors.medium;
        } else {
            hpBarFill.style.background = GAME_CONFIG.hpColors.low;
        }
    }

    if (enemy.hp <= 0) {
        enemy.element.remove();
        gameState.activeEnemies = gameState.activeEnemies.filter(e => e !== enemy);
        gameState.enemiesDefeated++;

        updateTimerUI();

        if (
            gameState.enemiesDefeated >= gameState.totalEnemiesInWave &&
            gameState.activeEnemies.length === 0
        ) {
            handleLevelComplete();
        }
    }
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
    for (let i = 0; i < GAME_CONFIG.baseGrassCount; i++) spawnRandomResource('grass');
    for (let i = 0; i < GAME_CONFIG.baseStoneCount; i++) spawnRandomResource('stone');
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
            if (!gameState.isInvasionActive) {
                if (gameState.prepTime > 0) {
                    gameState.prepTime--;
                    updateTimerUI();
                } else handleInvasionStart();
            }
            updateTreeGrowth();
        } else {
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
        if (display) display.textContent = `max: ${calculateMaxCraft(item)}`;
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

    const grid = document.getElementById('gameGrid');
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
            img.alt = item;
            img.className = 'shop-item__product-icon';
            btn.prepend(img);

            btn.setAttribute('draggable', 'true');
            btn.ondragstart = handleDragStart;
        }
    });

    renderShopCosts();

    const menuBtn = document.getElementById('menuGameButton');
    if (menuBtn) menuBtn.onclick = togglePause;

    const startBtn = document.getElementById('startGameButton');
    if (startBtn) startBtn.onclick = handleStartButton;

    const tutorialNext = document.getElementById('tutorialNextButton');
    if (tutorialNext) tutorialNext.onclick = advanceTutorial;

    const tutorialSkip = document.getElementById('tutorialSkipButton');
    if (tutorialSkip) tutorialSkip.onclick = skipTutorial;

    // Obsługa klawisza ESC
    window.onkeydown = (e) => {
        if (e.key === 'Escape' && !gameState.tutorialVisible) togglePause();
    };

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
    gameState.gameStarted = false;
    updateAppScale();
    renderBoard();
    setupInteraction();
    spawnInitialResources();
    updateResourcesUI();
    updateTimerUI();
    startPrepTimer();

    setInterval(() => { if(!gameState.gamePaused && !gameState.isInvasionActive) spawnRandomResource('grass') }, 15000);
    setInterval(() => { if(!gameState.gamePaused && !gameState.isInvasionActive) spawnRandomResource('stone') }, 25000);
});