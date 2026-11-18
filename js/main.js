// ------------------------- Skalowanie całej gry -------------------------
function updateAppScale() {
    fitBoardToViewport();
    renderGameState();
    positionBuildingUpgrade();
}

function fitBoardToViewport() {
    const grid = document.getElementById('gameGrid');
    const board = document.getElementById('gameBoard');
    if (!grid || !board) return;

    const house = board.querySelector('.game-board__house-slot');
    if (!house) return;
    const gap = parseFloat(getComputedStyle(board).columnGap) || 0;
    const availableWidth = Math.max(0, board.clientWidth - house.offsetWidth - gap);
    const width = Math.min(availableWidth, board.clientHeight * GAME_CONFIG.columns / GAME_CONFIG.rows);
    grid.style.width = Math.max(0, width) + 'px';
}

let appScaleResizeFrame = 0;
let selectedItemToPlace = null;
let removingBuilding = false;
let draggedItem = null;
let selectedBuilding = null;
const SHOP_SHORTCUTS = ['cannon', 'seedling', 'woodFence', 'stoneWall', 'quarry'];
const LOCAL_GAME_SAVE_KEY = 'farmwarsLocalGame';
let nextLocalSaveAt = 0;

function saveLocalGame() {
    if (serverGame || !gameState.gameStarted) return;
    safeSetStoredValue(LOCAL_GAME_SAVE_KEY, gameState.gameEnded ? '' : JSON.stringify(exportGameState()));
    nextLocalSaveAt = performance.now() + 5000;
}

function showSavedGameChoice(onContinue, onRestart) {
    const menu = document.getElementById('gameMenu');
    const choice = document.getElementById('savedGameChoice');
    const resume = document.getElementById('continueSavedGameButton');
    const restart = document.getElementById('restartSavedGameButton');
    if (!menu || !choice || !resume || !restart) return false;
    function choose(action) {
        choice.hidden = true;
        menu.classList.remove('menu--saved-game');
        action();
    }
    menu.classList.add('menu--saved-game');
    choice.hidden = false;
    resume.onclick = () => choose(onContinue);
    restart.onclick = () => choose(onRestart);
    return true;
}

function offerLocalGameResume() {
    const saved = safeGetStoredValue(LOCAL_GAME_SAVE_KEY);
    if (!saved) return;
    showSavedGameChoice(() => {
        try {
            const snapshot = JSON.parse(saved);
            if (!snapshot.state.gameStarted || snapshot.state.gameEnded) throw new TypeError();
            snapshot.state.gamePaused = true;
            restoreGameView(snapshot);
        } catch {
            safeSetStoredValue(LOCAL_GAME_SAVE_KEY, '');
            handleStartButton();
            return;
        }
        if (!gameState.tutorialVisible) setGamePaused(false);
    }, () => {
        safeSetStoredValue(LOCAL_GAME_SAVE_KEY, '');
        handleStartButton();
    });
}

function scheduleAppScaleUpdate() {
    if (appScaleResizeFrame) cancelAnimationFrame(appScaleResizeFrame);
    appScaleResizeFrame = requestAnimationFrame(() => {
        appScaleResizeFrame = 0;
        updateAppScale();
    });
}

function setGamePaused(shouldPause, options = {}) {
    if (serverGame) return serverGame.pause(shouldPause);
    if (gameState.gameEnded) return;
    if (!shouldPause && (!gameState.gameStarted || gameState.tutorialVisible || document.hidden)) return;
    if (gameState.gamePaused === shouldPause) return;
    setSimulationPaused(shouldPause, performance.now());
    if (gameState.gamePaused) stopGameFrame();
    else scheduleGameFrame();
    renderGameState();
    if (!gameState.gameEnded) syncPauseView(shouldPause, options.showMenu ?? true);
    if (shouldPause) saveLocalGame();
}

function syncPauseView(shouldPause, showMenu) {
    const menu = document.getElementById('gameMenu');
    const app = document.getElementById('appScale');
    app?.classList[shouldPause ? 'add' : 'remove']('app-scale--paused');
    updateScoreUI();

    if (shouldPause) {
        if (menu && showMenu) {
            menu.classList.remove('is-hidden');
            menu.style.zIndex = '10000000';

            const startBtn = document.getElementById('startGameButton');
            if (startBtn) startBtn.textContent = 'WZNÓW GRĘ';

            const controls = menu.querySelectorAll('button, input, select');
            controls.forEach(c => c.style.zIndex = '10000001');
        }

        selectedItemToPlace = null;
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
}

function togglePause() {
    if (!gameState.gameStarted || gameState.gameEnded || gameState.tutorialVisible) return;
    setGamePaused(!gameState.gamePaused);
}

window.addEventListener('resize', scheduleAppScaleUpdate);
window.addEventListener('orientationchange', scheduleAppScaleUpdate);
window.addEventListener('scroll', positionBuildingUpgrade, { capture: true, passive: true });
window.visualViewport?.addEventListener('resize', scheduleAppScaleUpdate);
window.visualViewport?.addEventListener('scroll', positionBuildingUpgrade);
document.addEventListener('visibilitychange', () => {
    if (!serverGame && document.hidden && gameState.gameStarted && !gameState.gamePaused) setGamePaused(true);
    if (document.hidden) saveLocalGame();
});
window.addEventListener('pagehide', () => {
    if (!serverGame && gameState.gameStarted && !gameState.gamePaused) setGamePaused(true);
    saveLocalGame();
});

// ------------------------- System Przeciągania (Drag & Drop) -------------------------
function handleDragStart(e) {
    const button = e.currentTarget || e.target.closest('button');
    const itemId = button?.id?.replace('Button', '');

    if (!itemId || !canAfford(itemId) || gameState.gamePaused) {
        e.preventDefault();
        return;
    }

    draggedItem = itemId;
    removingBuilding = false;
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
    if (tile && draggedItem) {
        handlePlayerAction({ type: 'place', tileId: tileIds.get(tile), item: draggedItem });
    }
    draggedItem = null;
    updateVisualHighlights();
}

function updateVisualHighlights() {
    const playing = gameState.gameStarted && !gameState.gamePaused &&
        !gameState.gameEnded && !gameState.tutorialVisible;
    if (!playing) removingBuilding = false;
    const removeButton = document.getElementById('removeBuildingButton');
    if (removeButton) {
        removeButton.disabled = !playing;
        if (removeButton.getAttribute('aria-pressed') !== String(removingBuilding)) {
            removeButton.setAttribute('aria-pressed', String(removingBuilding));
        }
        const hint = document.getElementById('demolitionHint');
        const text = removingBuilding ? 'Wybierz obiekt' : `Zwrot ${GAME_CONFIG.removalRefundRate * 100}%`;
        if (hint && hint.textContent !== text) hint.textContent = text;
    }
    if (!playing || (selectedItemToPlace && !canAfford(selectedItemToPlace))) {
        selectedItemToPlace = null;
    }
    const item = draggedItem || selectedItemToPlace;
    const canPlace = playing && item && canAfford(item);
    for (const id of SHOP_SHORTCUTS) {
        const button = document.getElementById(`${id}Button`);
        const pressed = Boolean(canPlace && item === id);
        if (button && button.getAttribute('aria-pressed') !== String(pressed)) {
            button.setAttribute('aria-pressed', String(pressed));
        }
    }
    for (const tile of gameState.tiles) {
        tileViews[tile.id]?.element.classList.toggle('game-tile--can-place',
            Boolean(canPlace && !isTileOccupied(tile)));
        tileViews[tile.id]?.element.classList.toggle('game-tile--can-remove',
            removingBuilding && canRemoveBuilding(tile.object));
    }
}

const RESOURCE_LABELS = {
    wood: 'Drewno',
    stone: 'Kamień',
    seeds: 'Nasiona'
};

const RESOURCE_ICONS = {
    wood: 'assets/images/Tree.png',
    stone: 'assets/images/stone.png',
    seeds: 'assets/images/grass.png'
};

function renderShopCosts() {
    Object.keys(shopItems).forEach(item => {
        const container = document.getElementById(`${item}Costs`);
        if (!container) return;

        container.innerHTML = '';
        const cost = getShopCost(item);
        if (!cost) {
            const entry = container.closest('.shop-item');
            if (entry) entry.hidden = true;
            return;
        }
        if (Object.keys(cost).length === 0) {
            const label = document.createElement('div');
            label.className = 'shop-item__cost';
            label.textContent = 'Za darmo';
            container.appendChild(label);
            return;
        }

        Object.entries(cost).forEach(([resource, amount]) => {
            const row = document.createElement('div');
            row.className = 'shop-item__cost';
            row.dataset.resource = resource;

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

const TUTORIAL_STORAGE_KEY = serverGame ? 'farmwarsTutorialCompleted' : 'farmwarsTutorialCompletedV2';
const TUTORIAL_STEPS = [
    {
        title: 'Zbieraj surowce',
        text: 'Klikaj kępki trawy, żeby zbierać nasiona, i złoża kamienia, żeby zdobywać kamień.'
    },
    {
        title: 'Buduj z topbaru',
        text: `Przeciągnij przedmiot ze sklepu na wolne pole albo wybierz go klawiszem ${serverGame ? '1–4' : '1–5'} i kliknij pole. Ceny są pod przyciskami. Przedmioty można wybrać, gdy masz dość surowców.`
    },
    ...(serverGame ? [{
        title: 'Zbieraj drewno',
        text: 'Posadź sadzonkę i poczekaj, aż wyrośnie. Kliknij dojrzałe drzewo, żeby zebrać drewno.'
    }] : [{
        title: 'Posadź drzewo',
        text: `${GAME_CONFIG.freeLocalPurchases ? 'Sadzonka jest darmowa.' : `Sadzonka kosztuje ${shopItems.seedling.seeds} nasion.`} Wyrasta po ${GAME_CONFIG.treeGrowthTime / 1000} sekundach czasu gry. Dojrzałe drzewo samo dodaje ${GAME_CONFIG.treeWoodPerLevel[0]} drewna co ${GAME_CONFIG.treeProductionInterval / 1000} sekund.`
    }, {
        title: 'Postaw kamieniołom',
        text: `${GAME_CONFIG.freeLocalPurchases ? 'Kamieniołom jest darmowy.' : `Kamieniołom kosztuje ${shopItems.quarry.stone} kamienia i ${shopItems.quarry.wood} drewna.`} Na poziomie 1 daje ${GAME_CONFIG.quarryStonePerLevel[0]} kamienia co ${GAME_CONFIG.quarryProductionInterval / 1000} sekund. Kliknij kamieniołom lub dojrzałe drzewo, aby je ulepszyć.`
    }]),
    {
        title: 'Armaty strzelają same',
        text: 'Armata strzela do robaków w swoim rzędzie. Płoty i murki je zatrzymują, a po pierwszym trafieniu potwora zobaczysz pasek życia zaatakowanego obiektu.'
    },
    {
        title: 'Wstrzymaj grę',
        text: 'Menu i Esc wstrzymują grę. Jeśli masz wybrany przedmiot, Esc najpierw anuluje wybór.'
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
    safeSetStoredValue(TUTORIAL_STORAGE_KEY, '1');
    gameState.tutorialStep = 0;
    setGamePaused(false, { showMenu: false });
    saveLocalGame();
}

function advanceTutorial() {
    if (!gameState.tutorialVisible) return;

    if (gameState.tutorialStep >= TUTORIAL_STEPS.length - 1) {
        finishTutorial();
        return;
    }

    gameState.tutorialStep += 1;
    renderTutorialStep();
    saveLocalGame();
}

function skipTutorial() {
    if (!gameState.tutorialVisible) return;
    finishTutorial();
}

function handleStartButton() {
    if (!gameState.gameStarted) {
        if (gameState.gameEnded || document.hidden) return;
        captureBoardGeometry();
        startScore();
        rankingRepository.startRun(scoreState.runId)?.catch(() => {
            // Formularz końcowy ponawia rejestrację i pokazuje ewentualny błąd.
        });
        gameState.gameStarted = true;
        updateScoreUI();
        const menu = document.getElementById('gameMenu');
        if (menu) menu.classList.add('is-hidden');
        if (gameState.tutorialCompleted) setGamePaused(false);
        else showTutorial();
        saveLocalGame();
        return;
    }

    togglePause();
}

function updateTimerUI() {
    const statusBox = document.getElementById('statusContainer');
    if (!statusBox) return;
    const speed = `<span class="topBar__speed" id="gameSpeedStatus">${formatGameSpeed(gameState.gameSpeed)}</span>`;
    const wave = `<span class="topBar__level">Fala <strong id="levelDisplay">${gameState.level}</strong></span>`;

    if (gameState.isInvasionActive) {
        statusBox.innerHTML = `${wave}
            <span class="topBar__combat-count">
                <span>Pokonano</span>
                <span class="topBar__combat-value"><strong id="defeatedCount">${gameState.enemiesDefeated}</strong><span> / ${gameState.totalEnemiesInWave}</span></span>
            </span>
            ${speed}
            <progress class="topBar__countdown topBar__countdown--combat" value="${gameState.enemiesDefeated}" max="${Math.max(1, gameState.totalEnemiesInWave)}" aria-label="Pokonani przeciwnicy"></progress>`;
    } else {
        const min = Math.floor(gameState.prepTime / 60);
        const sec = gameState.prepTime % 60;
        statusBox.innerHTML = `
            ${wave}
            <span class="topBar__timer-label">Atak za <strong id="prepTimer">${min}:${String(sec).padStart(2, '0')}</strong></span>
            ${speed}
            <progress class="topBar__countdown" value="${gameState.prepTime}" max="${GAME_CONFIG.preparationSeconds}" aria-label="Czas do ataku"></progress>
        `;
    }
}

function formatGameSpeed(speed) {
    return speed.toFixed(2).replace('.', ',') + '×';
}

function updateGameSpeedUI() {
    const value = formatGameSpeed(gameState.gameSpeed);
    const difficulty = getGameDifficulty();
    const slider = document.getElementById('volumeRange');
    if (slider) {
        slider.value = String(gameState.gameSpeed);
        slider.setAttribute('aria-valuetext', `${value} — ${difficulty}`);
    }
    const output = document.getElementById('gameSpeedValue');
    if (output) output.textContent = value;
    const level = document.getElementById('gameDifficultyValue');
    if (level) level.textContent = difficulty;
    document.querySelectorAll('[data-speed-level]').forEach(band => {
        band.classList[band.dataset.speedLevel === difficulty ? 'add' : 'remove']('is-active');
    });
    const app = document.getElementById('appScale');
    app?.style.setProperty('--game-speed', String(gameState.gameSpeed));
    updateTimerUI();
}

function positionBuildingUpgrade() {
    if (!selectedBuilding) return;
    const panel = document.getElementById('buildingUpgrade');
    const tile = tileViews[selectedBuilding.tileId]?.element;
    if (!panel || panel.hidden || !tile) return;

    const anchor = tile.getBoundingClientRect();
    const { width, height } = panel.getBoundingClientRect();
    const gap = 8;
    const viewport = window.visualViewport;
    const leftEdge = viewport?.offsetLeft ?? 0;
    const topEdge = viewport?.offsetTop ?? 0;
    const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth);
    const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight);
    let left = anchor.right;
    let top = anchor.top;

    if (left + width > rightEdge - gap) {
        left = anchor.left - width;
        if (left < leftEdge + gap) {
            left = anchor.left + (anchor.width - width) / 2;
            top = anchor.bottom;
            if (top + height > bottomEdge - gap) top = anchor.top - height;
        }
    }

    panel.style.left = `${Math.max(leftEdge + gap, Math.min(left, rightEdge - width - gap))}px`;
    panel.style.top = `${Math.max(topEdge + gap, Math.min(top, bottomEdge - height - gap))}px`;
}

function updateBuildingUpgrade() {
    const panel = document.getElementById('buildingUpgrade');
    if (!panel || (panel.hidden && !selectedBuilding)) return;
    const object = gameState.tiles[selectedBuilding?.tileId]?.object;
    const selected = object && object.id === selectedBuilding.objectId ? object : null;
    const repair = getFenceRepair(selected);
    const info = repair || getProducerUpgrade(selected);
    if (!info || gameState.gamePaused || gameState.gameEnded) {
        closeBuildingUpgrade();
        return;
    }
    const unit = info.resource === 'wood' ? 'drewna' : 'kamienia';
    const names = { tree: 'Drzewo', quarry: 'Kamieniołom', woodFence: 'Płot', stoneWall: 'Murek' };
    const name = names[object.type];
    const button = document.getElementById('upgradeBuildingButton');
    const title = document.getElementById('buildingUpgradeTitle');
    const level = document.getElementById('buildingUpgradeLevel');
    const icon = document.getElementById('buildingUpgradeIcon');
    const production = document.getElementById('buildingUpgradeProduction');
    const costText = info.cost === 0 ? 'za darmo' : `${info.cost} ${unit}`;
    const fullHealth = repair && object.hp >= repair.maxHp;
    const levelText = repair ? '' : `Poziom ${info.level}/${GAME_CONFIG.producerUpgradeCosts.length + 1}`;
    let productionText;
    let buttonText;
    if (repair) {
        const health = fullHealth ? object.hp : `${object.hp} → ${repair.repairedHp}`;
        productionText = `Życie: ${health} / ${repair.maxHp}`;
        buttonText = fullHealth ? 'Pełne życie' : `Napraw · ${costText}`;
    } else {
        const amount = info.nextProduction === undefined ? info.production : `${info.production} → ${info.nextProduction}`;
        productionText = `Produkcja: ${amount} ${unit} co ${info.interval / 1000} s`;
        buttonText = info.cost === undefined ? 'Maksymalny poziom' : `Ulepsz na poziom ${info.level + 1} · ${costText}`;
    }
    if (title.textContent !== name) title.textContent = name;
    const iconPath = getBuildingImage(object.type, object.level);
    if (icon && icon.getAttribute('src') !== iconPath) icon.setAttribute('src', iconPath);
    const reposition = panel.hidden || level.textContent !== levelText || button.textContent !== buttonText;
    if (level.textContent !== levelText) level.textContent = levelText;
    level.hidden = Boolean(repair);
    if (production.textContent !== productionText) production.textContent = productionText;
    if (button.textContent !== buttonText) button.textContent = buttonText;
    button.disabled = Boolean(fullHealth) || info.cost === undefined || gameState[RESOURCE_BALANCES[info.resource]] < info.cost;
    panel.hidden = false;
    if (reposition) positionBuildingUpgrade();
}

function closeBuildingUpgrade() {
    tileViews[selectedBuilding?.tileId]?.element.classList.remove('game-tile--inspected');
    selectedBuilding = null;
    const panel = document.getElementById('buildingUpgrade');
    if (panel) panel.hidden = true;
}

function inspectBuilding(tileId) {
    if (serverGame || gameState.gamePaused || gameState.gameEnded) return false;
    const object = gameState.tiles[tileId]?.object;
    if (!getProducerUpgrade(object) && !getFenceRepair(object)) return false;
    if (selectedBuilding?.tileId === tileId && selectedBuilding.objectId === object.id) return true;
    closeBuildingUpgrade();
    selectedBuilding = { tileId, objectId: object.id };
    tileViews[tileId].element.classList.add('game-tile--inspected');
    updateBuildingUpgrade();
    return true;
}

function handleGridClick(event) {
    const tile = event.target.closest('.game-tile');
    if (!tile) return;
    const tileId = tileIds.get(tile);
    if (removingBuilding) {
        if (handlePlayerAction({ type: 'remove', tileId })) {
            removingBuilding = false;
            updateVisualHighlights();
            saveLocalGame();
        }
        return;
    }
    if (inspectBuilding(tileId)) return;
    closeBuildingUpgrade();
    if (selectedItemToPlace && tile.classList.contains('game-tile--can-place')) {
        handlePlayerAction({ type: 'place', tileId, item: selectedItemToPlace });
        return;
    }
    handlePlayerAction({ type: 'collect', tileId });
}

function setGameSpeed(speed) {
    if (serverGame) return serverGame.speed(speed);
    if (!changeGameSpeed(speed, performance.now())) return false;
    safeSetStoredValue('gameSpeed', speed);
    updateGameSpeedUI();
    renderGameState();
    return true;
}

function updateShopButtons() {
    Object.keys(shopItems).forEach(id => {
        const btn = document.getElementById(`${id}Button`);
        if (btn) {
            const affordable = canAfford(id);
            btn.disabled = !affordable;
            btn.setAttribute('draggable', affordable);
            const costs = document.getElementById(`${id}Costs`);
            const price = getShopCost(id);
            for (const row of costs?.children ?? []) {
                const resource = row.dataset.resource;
                if (resource && price) {
                    row.classList.toggle('shop-item__cost--missing', gameState[RESOURCE_BALANCES[resource]] < price[resource]);
                }
            }
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
    for (const [resource, counter] of [['wood', wC], ['stone', stC]]) {
        const amount = pendingProduction[resource];
        pendingProduction[resource] = 0;
        if (!amount || !counter?.parentElement) continue;
        const parent = counter.parentElement;
        parent.querySelector('.topBar__resource-gain')?.remove();
        const gain = document.createElement('span');
        gain.className = 'topBar__resource-gain';
        gain.textContent = `+${amount}`;
        gain.setAttribute('aria-hidden', 'true');
        gain.addEventListener('animationend', () => gain.remove(), { once: true });
        parent.appendChild(gain);
    }
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
    const p = getShopCost(item);
    if (!p) return 0;
    let limits = [];
    if (p.wood) limits.push(Math.floor(gameState.woodCount / p.wood));
    if (p.stone) limits.push(Math.floor(gameState.stoneCount / p.stone));
    if (p.seeds) limits.push(Math.floor(gameState.seedCount / p.seeds));
    return limits.length > 0 ? Math.min(...limits) : gameState.tiles.filter(tile => !isTileOccupied(tile)).length;
}

function showEndScreen(title, text, color, btnText) {
    document.getElementById('endScreen')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'endScreen';
    overlay.className = 'end-screen';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.9); z-index: 20000000;
        display: flex; flex-direction: column; justify-content: center;
        align-items: center; color: white; text-align: center; font-family: sans-serif;
    `;
    const heading = document.createElement('h1');
    heading.textContent = title;
    heading.style.cssText = `color: ${color}; font-size: 4rem; margin-bottom: 20px;`;
    const message = document.createElement('p');
    message.textContent = text;
    message.style.cssText = 'font-size: 1.5rem; margin-bottom: 40px;';
    const creator = document.createElement('p');
    creator.textContent = 'Twórca: Dominik Żyłkowski';
    creator.style.marginBottom = '40px';
    const restartBtn = document.createElement('button');
    restartBtn.id = 'restartBtn';
    restartBtn.textContent = btnText;
    restartBtn.style.cssText = `background: ${color}; color: white; border: none; padding: 15px 40px; font-size: 1.2rem; cursor: pointer; border-radius: 5px; font-weight: bold;`;
    const score = document.createElement('p');
    score.className = 'end-screen__score';
    score.textContent = `Score: ${formatScore(scoreState.totalScore)} pkt`;
    overlay.append(heading, message, score);
    if (serverGame?.isOnline) {
        const saved = document.createElement('p');
        saved.textContent = 'Wynik zapisany przez serwer w prywatnej historii.';
        overlay.append(saved, createRankingButton('OTWÓRZ RANKING', showRanking));
    } else {
        mountScoreSaveForm(overlay);
    }
    overlay.append(creator, restartBtn);
    document.body.appendChild(overlay);
    restartBtn.onclick = serverGame?.isOnline ? serverGame.restart : () => location.reload();
}

// ------------------------- Inicjalizacja i Eventy -------------------------
function formatScore(value) {
    return value.toLocaleString('pl-PL');
}

function updateScoreUI() {
    const display = document.getElementById('scoreDisplay');
    if (display) {
        const score = formatScore(scoreState.totalScore);
        if (display.textContent !== score) display.textContent = score;
    }
}

function setupInteraction() {
    const removeButton = document.getElementById('removeBuildingButton');
    if (removeButton) {
        removeButton.hidden = Boolean(serverGame);
        const demolitionControl = document.getElementById('demolitionControl');
        if (demolitionControl) demolitionControl.hidden = Boolean(serverGame);
        removeButton.onclick = () => {
            if (removeButton.disabled || draggedItem) return;
            removingBuilding = !removingBuilding;
            selectedItemToPlace = null;
            closeBuildingUpgrade();
            updateVisualHighlights();
        };
    }
    const upgrade = document.getElementById('upgradeBuildingButton');
    const closeUpgrade = document.getElementById('closeBuildingUpgradeButton');
    const upgradePanel = document.getElementById('buildingUpgrade');
    if (upgrade) upgrade.onclick = () => {
        if (!selectedBuilding) return;
        const object = gameState.tiles[selectedBuilding.tileId]?.object;
        const type = getFenceRepair(object) ? 'repair' : 'upgrade';
        if (handlePlayerAction({ type, ...selectedBuilding })) saveLocalGame();
    };
    if (closeUpgrade) closeUpgrade.onclick = closeBuildingUpgrade;
    upgradePanel?.addEventListener('pointerleave', event => {
        if (event.pointerType !== 'mouse' || !selectedBuilding) return;
        const tile = tileViews[selectedBuilding.tileId]?.element;
        if (event.relatedTarget?.closest?.('.game-tile') !== tile) closeBuildingUpgrade();
    });
    const rankingButton = document.getElementById('rankingButton');
    if (rankingButton) rankingButton.onclick = showRanking;
    const grid = document.getElementById('gameGrid');
    if (grid) {
        grid.onclick = handleGridClick;
        grid.addEventListener('pointerover', event => {
            if (event.pointerType !== 'mouse' || draggedItem || selectedItemToPlace || removingBuilding) return;
            inspectBuilding(tileIds.get(event.target.closest('.game-tile')));
        });
        grid.addEventListener('pointerout', event => {
            if (event.pointerType !== 'mouse' || !selectedBuilding) return;
            const tile = tileViews[selectedBuilding.tileId]?.element;
            if (event.target.closest('.game-tile') !== tile) return;
            if (event.relatedTarget?.closest?.('.game-tile') === tile ||
                event.relatedTarget?.closest?.('#buildingUpgrade') === upgradePanel) return;
            closeBuildingUpgrade();
        });
        grid.ondragover = handleDragOver;
        grid.ondrop = handleDrop;
    }

    SHOP_SHORTCUTS.forEach((item, index) => {
        const btn = document.getElementById(`${item}Button`);
        if (btn) {
            const img = document.createElement('img');
            img.src = itemImages[item];
            img.alt = item;
            img.className = 'shop-item__product-icon';
            btn.prepend(img);
            const shortcut = document.createElement('kbd');
            shortcut.className = 'shop-item__shortcut';
            shortcut.textContent = String(index + 1);
            shortcut.setAttribute('aria-hidden', 'true');
            btn.appendChild(shortcut);
            btn.setAttribute('aria-keyshortcuts', String(index + 1));

            btn.setAttribute('draggable', 'true');
            btn.ondragstart = handleDragStart;
            btn.ondragend = () => {
                draggedItem = null;
                updateVisualHighlights();
            };
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
        if (e.repeat) return;
        if (e.key === 'Escape' && !gameState.tutorialVisible) {
            if (removingBuilding) {
                removingBuilding = false;
                updateVisualHighlights();
            } else if (selectedBuilding) {
                closeBuildingUpgrade();
            } else if (selectedItemToPlace) {
                selectedItemToPlace = null;
                updateVisualHighlights();
            } else {
                togglePause();
            }
            return;
        }
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey ||
            e.target?.closest?.('input, textarea, select, [contenteditable]')) return;
        const index = ['1', '2', '3', '4', '5'].indexOf(e.key);
        if (index === -1 || !gameState.gameStarted || gameState.gamePaused ||
            gameState.gameEnded || gameState.tutorialVisible || draggedItem) return;
        e.preventDefault();
        const item = SHOP_SHORTCUTS[index];
        if (!canAfford(item)) return;
        removingBuilding = false;
        selectedItemToPlace = selectedItemToPlace === item ? null : item;
        updateVisualHighlights();
    };

    const speedSlider = document.getElementById('volumeRange');
    if (speedSlider) {
        const onSpeedChange = event => setGameSpeed(Number(event.target.value));
        speedSlider.oninput = onSpeedChange;
        speedSlider.onchange = onSpeedChange;
    }
    updateGameSpeedUI();
}

document.addEventListener('DOMContentLoaded', () => {
    initializeGameModel(Math.floor(Math.random() * 4294967296), Date.now() - performance.now(), {
        gameSpeed: getStoredGameSpeed(),
        tutorialCompleted: safeGetStoredValue(TUTORIAL_STORAGE_KEY) === '1'
    });
    renderBoard();
    fitBoardToViewport();
    setupInteraction();
    if (serverGame) serverGame.setup();
    else {
        showServerGameLinks();
        offerLocalGameResume();
    }
    renderGameState();
    scheduleAppScaleUpdate();
    document.fonts?.ready.then(scheduleAppScaleUpdate);
    if (typeof ResizeObserver !== 'undefined') {
        const boardResizeObserver = new ResizeObserver(scheduleAppScaleUpdate);
        boardResizeObserver.observe(document.getElementById('gameBoard'));
    }
});
