const RESOURCE_BALANCES = { seeds: 'seedCount', stone: 'stoneCount', wood: 'woodCount' };
let nextEntityId = 0;
let randomState = 1;

function seedGameRandom(seed) {
    randomState = (seed >>> 0) || 1;
}

function gameRandom() {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    randomState >>>= 0;
    return randomState / 4294967296;
}

function createBoardModel() {
    return Array.from({ length: GAME_CONFIG.rows * GAME_CONFIG.columns }, (_, index) => ({
        id: index,
        row: Math.floor(index / GAME_CONFIG.columns),
        column: index % GAME_CONFIG.columns,
        object: null
    }));
}

function createBoardObject(type, properties = {}) {
    return { id: ++nextEntityId, type, ...properties };
}

function isTileOccupied(tile, includeEnemies = true) {
    return Boolean(tile && (tile.object || (includeEnemies && gameState.activeEnemies.some(
        enemy => enemy.row === tile.row && enemy.currentCol === tile.column
    ))));
}

function canAfford(item) {
    return Object.hasOwn(shopItems, item) && Object.entries(shopItems[item]).every(
        ([resource, price]) => gameState[RESOURCE_BALANCES[resource]] >= price
    );
}

function placeItem(tileId, item) {
    const tile = Number.isInteger(tileId) ? gameState.tiles[tileId] : null;
    if (gameState.gamePaused || gameState.gameEnded || !tile || isTileOccupied(tile) || !canAfford(item)) return false;

    for (const [resource, price] of Object.entries(shopItems[item])) {
        gameState[RESOURCE_BALANCES[resource]] -= price;
    }
    const now = getGameTime();
    tile.object = createBoardObject(item, { hp: item === 'seedling' ? 2 : GAME_CONFIG.hpValues[item] });
    if (item === 'seedling') tile.object.growthAt = Math.floor(now) + GAME_CONFIG.treeGrowthTime;
    if (item === 'cannon') tile.object.lastShot = now - 1000;
    awardScoreForEvent('items', item, tile.object.id);
    return true;
}

function collectResource(tileId) {
    const tile = Number.isInteger(tileId) ? gameState.tiles[tileId] : null;
    const object = tile?.object;
    if (gameState.gamePaused || gameState.gameEnded || !object) return false;
    switch (object.type) {
        case 'grass': gameState.seedCount += object.size; break;
        case 'stone': gameState.stoneCount += object.size; break;
        case 'tree':
            gameState.woodCount += 2;
            awardScoreForEvent('resources', 'tree', object.id);
            break;
        default: return false;
    }
    tile.object = null;
    return true;
}

function growToTree(tile) {
    if (tile.object?.type !== 'seedling') return;
    tile.object = { id: tile.object.id, type: 'tree', hp: GAME_CONFIG.hpValues.tree };
}

function updateTreeGrowth(now) {
    for (const tile of gameState.tiles) {
        if (tile.object?.type === 'seedling' && now >= tile.object.growthAt) growToTree(tile);
    }
}

function spawnRandomResource(type) {
    const freeTiles = gameState.tiles.filter(tile => !isTileOccupied(tile));
    if (!freeTiles.length) return;
    const tile = freeTiles[Math.floor(gameRandom() * freeTiles.length)];
    const roll = gameRandom();
    const size = roll < 0.5 ? 1 : roll < 0.8 ? 2 : 3;
    tile.object = createBoardObject(type, { size, hp: 0 });
}

function spawnInitialResources() {
    for (let i = 0; i < GAME_CONFIG.baseGrassCount; i++) spawnRandomResource('grass');
    for (let i = 0; i < GAME_CONFIG.baseStoneCount; i++) spawnRandomResource('stone');
}

function initializeGameModel(seed, epochMs, preferences = {}) {
    Object.assign(gameState, createGameState(), {
        gameSpeed: GAME_CONFIG.gameSpeeds.includes(preferences.gameSpeed) ? preferences.gameSpeed : 1,
        tutorialCompleted: preferences.tutorialCompleted === true
    });
    gameElapsedMs = 0;
    gameResumedAt = null;
    currentRealTime = 0;
    simulatedUntil = 0;
    nextGameTimerId = 0;
    nextEntityId = 0;
    gameTimers.clear();
    resetScore();
    seedGameRandom(seed);
    gameEpochMs = epochMs;
    gameState.tiles = createBoardModel();
    spawnInitialResources();
    scheduleGameTask('growth', 100, true);
    scheduleGameTask('preparation', 1000, true);
    scheduleGameTask('grass', GAME_CONFIG.spawnIntervals.grass, true);
    scheduleGameTask('stone', GAME_CONFIG.spawnIntervals.stone, true);
}

function applyGameAction(action) {
    switch (action?.type) {
        case 'collect': return collectResource(action.tileId);
        case 'place': return placeItem(action.tileId, action.item);
        case 'hit': return damageEnemy(gameState.activeEnemies.find(enemy => enemy.id === action.enemyId), 2);
        default: return false;
    }
}

function endGame(status) {
    if (gameState.gameEnded) return;
    const now = currentRealTime;
    finishScore(status, now, new Date(gameEpochMs + now).toISOString());
    gameState.gameEnded = true;
    gameState.gamePaused = true;
    gameState.isInvasionActive = false;
    stopGameRuntime(now);
    clearProjectiles();
}

function gameOver() {
    endGame('lost');
}

function gameWin() {
    endGame('won');
}
