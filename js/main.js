// ------------------------- Skalowanie całej gry -------------------------
function updateAppScale() {
    fitBoardToViewport();
    renderGameState();
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
window.visualViewport?.addEventListener('resize', scheduleAppScaleUpdate);
document.addEventListener('visibilitychange', () => {
    if (!serverGame && document.hidden && gameState.gameStarted && !gameState.gamePaused) setGamePaused(true);
});
window.addEventListener('pagehide', () => {
    if (!serverGame && gameState.gameStarted && !gameState.gamePaused) setGamePaused(true);
});

// ------------------------- System Przeciągania (Drag & Drop) -------------------------
function handleDragStart(e) {
    const button = e.currentTarget || e.target.closest('button');
    const itemId = button?.id?.replace('Button', '');

    if (!itemId || !canAfford(itemId) || gameState.gamePaused) {
        e.preventDefault();
        return;
    }

    selectedItemToPlace = itemId;
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
    if (tile && selectedItemToPlace) {
        handlePlayerAction({ type: 'place', tileId: tileIds.get(tile), item: selectedItemToPlace });
    }
    selectedItemToPlace = null;
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

const RESOURCE_ICONS = {
    wood: 'assets/images/Tree.png',
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
    safeSetStoredValue('farmwarsTutorialCompleted', '1');
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
        return;
    }

    togglePause();
}

function updateTimerUI() {
    const statusBox = document.getElementById('statusContainer');
    if (!statusBox) return;
    const speed = `<span class="topBar__speed" id="gameSpeedStatus">Speed: ${formatGameSpeed(gameState.gameSpeed)}</span>`;

    if (gameState.isInvasionActive) {
        statusBox.innerHTML = `POKONANO: <span id="defeatedCount">${gameState.enemiesDefeated}</span> / ${gameState.totalEnemiesInWave} <span style="margin-left:20px; color:#ffd700;">POZIOM: ${gameState.level}</span>${speed}`;
    } else {
        const min = Math.floor(gameState.prepTime / 60);
        const sec = gameState.prepTime % 60;
        statusBox.innerHTML = `
            <span class="topBar__timer-label">ATAK ZA: <strong id="prepTimer">${min}:${sec < 10 ? '0' : ''}${sec}</strong></span>
            <span style="margin-left:20px; color:#ffd700; font-size: 1.6rem;">POZIOM: ${gameState.level}</span>
            ${speed}
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

function handleGridClick(event) {
    const tile = event.target.closest('.game-tile');
    if (tile) handlePlayerAction({ type: 'collect', tileId: tileIds.get(tile) });
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
    const rankingButton = document.getElementById('rankingButton');
    if (rankingButton) rankingButton.onclick = showRanking;
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
            btn.ondragend = () => { selectedItemToPlace = null; };
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
        if (e.key === 'Escape' && !e.repeat && !gameState.tutorialVisible) togglePause();
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
        tutorialCompleted: safeGetStoredValue('farmwarsTutorialCompleted') === '1'
    });
    renderBoard();
    fitBoardToViewport();
    setupInteraction();
    if (serverGame) serverGame.setup();
    else showServerGameLinks();
    renderGameState();
    scheduleAppScaleUpdate();
    document.fonts?.ready.then(scheduleAppScaleUpdate);
    if (typeof ResizeObserver !== 'undefined') {
        const boardResizeObserver = new ResizeObserver(scheduleAppScaleUpdate);
        boardResizeObserver.observe(document.getElementById('gameBoard'));
    }
});
