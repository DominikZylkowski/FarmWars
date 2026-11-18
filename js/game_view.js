let gameFrameId = null;
let renderedEnd = null;
let renderedHud = '';
const tileViews = [];
const tileIds = new WeakMap();
const enemyViews = new Map();
const projectileViews = new Map();
const destructibleItems = new Set(['woodFence', 'stoneWall', 'tree', 'cannon', 'quarry']);

function scheduleGameFrame() {
    if (gameFrameId !== null || gameState.gamePaused || gameState.gameEnded || document.hidden) return;
    gameFrameId = requestAnimationFrame(() => {
        gameFrameId = null;
        if (gameState.gamePaused || gameState.gameEnded || document.hidden) return;
        advanceGameTo(performance.now());
        renderGameState();
        if (!gameState.gameEnded && performance.now() >= nextLocalSaveAt) saveLocalGame();
        scheduleGameFrame();
    });
}

function stopGameFrame() {
    if (gameFrameId !== null) cancelAnimationFrame(gameFrameId);
    gameFrameId = null;
}

function captureBoardGeometry() {
    const entry = tileViews[0]?.element;
    if (!entry?.offsetWidth) return;
    const root = document.getElementById('appScale') || document.body;
    const tileWidth = entry.offsetWidth;
    const rect = entry.getBoundingClientRect();
    const left = rect.left - root.getBoundingClientRect().left;
    gameState.geometry = { tileWidth, columnPitch: rect.width || tileWidth, projectileLimit: Math.max(0, window.innerWidth - left) };
}

function renderBoard() {
    const grid = document.getElementById('gameGrid');
    if (!grid) return;
    grid.replaceChildren();
    grid.style.gridTemplateColumns = `repeat(${GAME_CONFIG.columns}, minmax(0, 1fr))`;
    tileViews.length = 0;
    for (const tile of gameState.tiles) {
        const element = document.createElement('div');
        element.className = `game-tile ${GAME_CONFIG.tileClassNames[(tile.row + tile.column) % 2]}`;
        tileIds.set(element, tile.id);
        grid.appendChild(element);
        tileViews.push({ element, object: null, healthBar: null, levelBadge: null, id: null, type: null, lastShot: null });
    }
}

function renderTile(tile) {
    const view = tileViews[tile.id];
    const object = tile.object;
    const id = object?.id ?? null;
    const type = object?.type ?? null;
    if (view.id !== id || view.type !== type) {
        view.object?.remove();
        view.object = null;
        view.levelBadge = null;
        view.healthBar?.remove();
        view.healthBar = null;
        view.id = id;
        view.type = type;
        view.lastShot = object?.lastShot;
        if (object) {
            const element = document.createElement('div');
            if (type === 'grass' || type === 'stone') {
                element.className = `game-tile__${type} game-tile__${type}--size-${object.size}`;
            } else {
                element.className = `game-tile__placed-item game-tile__item--${type}`;
                element.style.backgroundImage = `url('${getBuildingImage(type, object.level)}')`;
                if (type === 'cannon') element.addEventListener('animationend', () => element.classList.remove('is-shooting'));
                if (!serverGame && (type === 'tree' || type === 'quarry')) {
                    const badge = document.createElement('span');
                    badge.className = 'game-tile__level';
                    element.appendChild(badge);
                    view.levelBadge = badge;
                }
            }
            view.element.appendChild(element);
            view.object = element;
        }
    }
    if (view.levelBadge) {
        const label = `Poz. ${object.level ?? 1}`;
        if (view.levelBadge.textContent !== label) {
            view.levelBadge.textContent = label;
            if (type === 'quarry') view.object.style.backgroundImage = `url('${getBuildingImage(type, object.level)}')`;
        }
    }
    const hp = String(object?.hp ?? 0);
    const hpChanged = view.element.dataset.hp !== hp;
    if (hpChanged) view.element.dataset.hp = hp;
    if (destructibleItems.has(type) && object.hp < GAME_CONFIG.hpValues[type]) {
        if (!view.healthBar) {
            const bar = document.createElement('div');
            bar.className = 'game-tile__health';
            bar.appendChild(document.createElement('div'));
            view.element.appendChild(bar);
            view.healthBar = bar;
            renderHealthFill(bar.firstChild, object.hp, GAME_CONFIG.hpValues[type]);
        } else if (hpChanged) {
            renderHealthFill(view.healthBar.firstChild, object.hp, GAME_CONFIG.hpValues[type]);
        }
    } else if (view.healthBar) {
        view.healthBar.remove();
        view.healthBar = null;
    }
    const opacity = object?.lastDamagedAt + 100 > simulatedUntil ? '0.7' : '';
    if (view.element.style.opacity !== opacity) view.element.style.opacity = opacity;
    if (type === 'cannon' && view.lastShot !== object.lastShot) {
        view.lastShot = object.lastShot;
        view.object.classList.add('is-shooting');
    }
}

function renderHealthFill(fill, hp, maxHp) {
    const percent = Math.max(0, hp / maxHp * 100);
    const colors = GAME_CONFIG.hpColors;
    fill.style.width = `${percent}%`;
    fill.style.background = percent > 60 ? colors.high : percent > 30 ? colors.medium : colors.low;
}

function syncEntities(views, entities, create, update) {
    const live = new Set();
    for (const entity of entities) {
        live.add(entity.id);
        if (!views.has(entity.id)) views.set(entity.id, create(entity));
        update(views.get(entity.id), entity);
    }
    for (const [id, element] of views) {
        if (!live.has(id)) {
            element.remove();
            views.delete(id);
        }
    }
}

function createEnemyView(enemy) {
    const element = document.createElement('div');
    element.className = `enemy-worm${enemy.type === 'normal' ? '' : ' enemy-worm--boss'}`;
    element.style.backgroundImage = `url('${getEnemyImage(enemy)}')`;
    const hp = document.createElement('div');
    hp.className = 'enemy-worm__hp';
    const fill = document.createElement('div');
    fill.className = 'enemy-worm__hp-fill';
    const label = document.createElement('span');
    label.className = 'enemy-worm__hp-label';
    hp.append(fill, label);
    element.appendChild(hp);
    const entry = tileViews[(enemy.row + 1) * GAME_CONFIG.columns - 1].element;
    entry.appendChild(element);
    element.addEventListener('mousedown', event => {
        event.stopPropagation();
        element.classList.add('used_boardCursor');
    });
    element.addEventListener('mouseup', event => {
        event.stopPropagation();
        element.classList.remove('used_boardCursor');
    });
    element.addEventListener('mouseleave', () => element.classList.remove('used_boardCursor'));
    element.addEventListener('click', event => {
        event.stopPropagation();
        handlePlayerAction({ type: 'hit', enemyId: enemy.id });
    });
    return element;
}

function createProjectileView() {
    const element = document.createElement('div');
    element.className = 'cannonball';
    element.style.backgroundImage = `url('${itemImages.cannonball}')`;
    (document.getElementById('appScale') || document.body).appendChild(element);
    return element;
}

function renderGameState() {
    if (tileViews.length !== gameState.tiles.length || !tileViews.length) return;
    for (const tile of gameState.tiles) renderTile(tile);
    const tileWidth = tileViews[0].element.offsetWidth;
    const scale = tileWidth / gameState.geometry.tileWidth;
    syncEntities(enemyViews, gameState.activeEnemies, createEnemyView, (element, enemy) => {
        element.style.transform = `translate(-50%, -50%) translateX(-${enemy.offsetX * scale}px)`;
        const hp = element.firstChild;
        const laneHeight = `${tileWidth}px`;
        if (hp.dataset.laneHeight !== laneHeight) {
            hp.dataset.laneHeight = laneHeight;
            hp.style.setProperty('--lane-height', laneHeight);
        }
        renderHealthFill(hp.firstChild, enemy.hp, enemy.maxHp);
        const label = hp.children[1];
        const value = `${enemy.hp} / ${enemy.maxHp} HP`;
        if (label.textContent !== value) label.textContent = value;
    });
    if (projectileViews.size || gameState.activeProjectiles.length) {
        const root = (document.getElementById('appScale') || document.body).getBoundingClientRect();
        const origins = new Map();
        syncEntities(projectileViews, gameState.activeProjectiles, createProjectileView, (element, projectile) => {
            const index = projectile.row * GAME_CONFIG.columns + projectile.column;
            if (!origins.has(index)) origins.set(index, tileViews[index].element.getBoundingClientRect());
            const rect = origins.get(index);
            element.style.left = `${rect.left - root.left + rect.width / 2 + projectile.xOffset * scale}px`;
            element.style.top = `${rect.top - root.top + rect.height / 2}px`;
            element.style.transform = `translate(-50%, -50%) rotate(${projectile.xOffset * 2}deg)`;
        });
    }
    const hud = [gameState.level, gameState.prepTime, gameState.isInvasionActive, gameState.enemiesDefeated,
        gameState.totalEnemiesInWave, gameState.seedCount, gameState.stoneCount, gameState.woodCount,
        gameState.gameSpeed, scoreState.totalScore].join(',');
    if (hud !== renderedHud) {
        renderedHud = hud;
        document.querySelector('.topBar')?.classList[gameState.isInvasionActive ? 'add' : 'remove']('is-invasion');
        updateTimerUI();
        updateResourcesUI();
        updateScoreUI();
    }
    updateVisualHighlights();
    updateBuildingUpgrade();
    renderEndScreenIfNeeded();
}

function renderEndScreenIfNeeded() {
    if (gameState.gameEnded && renderedEnd !== scoreState.runId) {
        renderedEnd = scoreState.runId;
        saveLocalGame();
        stopGameFrame();
        document.getElementById('appScale')?.classList.add('app-scale--paused');
        if (scoreState.status === 'won') {
            showEndScreen('ZWYCIĘSTWO!', 'Obroniłeś ogród przed inwazją!', '#2ecc71', 'ZAGRAJ JESZCZE RAZ');
        } else {
            showEndScreen('KONIEC GRY!', 'Robaki dostały się do Twojego domu!', '#ff4444', 'SPRÓBUJ PONOWNIE');
        }
    }
}

function handlePlayerAction(action) {
    if (serverGame) return serverGame.action(action);
    advanceGameTo(performance.now());
    const applied = applyGameAction(action);
    renderGameState();
    return applied;
}

function restoreGameView(snapshot) {
    const now = performance.now();
    restoreGameState(snapshot, now);
    if (document.hidden) setSimulationPaused(true, now);
    stopGameFrame();
    selectedItemToPlace = null;
    removingBuilding = false;
    closeBuildingUpgrade();
    document.getElementById('endScreen')?.remove();
    for (const element of [...enemyViews.values(), ...projectileViews.values()]) element.remove();
    enemyViews.clear();
    projectileViews.clear();
    renderedEnd = null;
    renderedHud = '';
    renderBoard();
    syncPauseView(gameState.gamePaused, !gameState.tutorialVisible && !gameState.gameEnded);
    const tutorial = document.getElementById('tutorialOverlay');
    tutorial?.classList[gameState.tutorialVisible ? 'remove' : 'add']('is-hidden');
    const menu = document.getElementById('gameMenu');
    if (gameState.tutorialVisible || gameState.gameEnded) menu?.classList.add('is-hidden');
    if (!gameState.gameStarted) {
        const button = document.getElementById('startGameButton');
        if (button) button.textContent = 'ZAGRAJ';
    }
    if (gameState.tutorialVisible) renderTutorialStep();
    updateGameSpeedUI();
    renderGameState();
    scheduleGameFrame();
}
