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

function getShopCost(item) {
    if (typeof serverGame !== 'undefined' && serverGame) {
        return Object.hasOwn(serverShopItems, item) ? serverShopItems[item] : null;
    }
    if (!Object.hasOwn(shopItems, item)) return null;
    return GAME_CONFIG.freeLocalPurchases ? {} : shopItems[item];
}

function canAfford(item) {
    const cost = getShopCost(item);
    return cost !== null && Object.entries(cost).every(
        ([resource, price]) => gameState[RESOURCE_BALANCES[resource]] >= price
    );
}

function placeItem(tileId, item) {
    const tile = Number.isInteger(tileId) ? gameState.tiles[tileId] : null;
    if (gameState.gamePaused || gameState.gameEnded || !tile || isTileOccupied(tile) || !canAfford(item)) return false;

    for (const [resource, price] of Object.entries(getShopCost(item))) {
        gameState[RESOURCE_BALANCES[resource]] -= price;
    }
    const now = getGameTime();
    tile.object = createBoardObject(item, { hp: item === 'seedling' ? 2 : GAME_CONFIG.hpValues[item] });
    if (item === 'seedling') tile.object.growthAt = Math.floor(now) + GAME_CONFIG.treeGrowthTime;
    if (item === 'cannon') tile.object.lastShot = now - 1000;
    if (item === 'quarry') {
        tile.object.level = 1;
        tile.object.nextStoneAt = now + GAME_CONFIG.quarryProductionInterval;
    }
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
        default: return false;
    }
    tile.object = null;
    return true;
}

function growToTree(tile, now = getGameTime()) {
    if (tile.object?.type !== 'seedling') return;
    tile.object = {
        id: tile.object.id, type: 'tree', hp: GAME_CONFIG.hpValues.tree,
        level: 1, nextWoodAt: now + GAME_CONFIG.treeProductionInterval
    };
}

function updateTreeGrowth(now) {
    for (const tile of gameState.tiles) {
        const object = tile.object;
        if (object?.type === 'quarry' && now >= object.nextStoneAt) {
            object.nextStoneAt += GAME_CONFIG.quarryProductionInterval;
            gameState.stoneCount += GAME_CONFIG.quarryStonePerLevel[(object.level ?? 1) - 1];
        }
        if (object?.type === 'seedling' && now >= object.growthAt) growToTree(tile, now);
        if (object?.type !== 'tree') continue;
        object.nextWoodAt ??= now + GAME_CONFIG.treeProductionInterval;
        if (now < object.nextWoodAt) continue;
        object.nextWoodAt += GAME_CONFIG.treeProductionInterval;
        gameState.woodCount += GAME_CONFIG.treeWoodPerLevel[(object.level ?? 1) - 1];
        awardScoreForEvent('resources', 'tree', object.id);
    }
}

function spawnRandomResource(type) {
    const freeTiles = gameState.tiles.filter(tile => !isTileOccupied(tile));
    if (!freeTiles.length) return;
    const tile = freeTiles[Math.floor(gameRandom() * freeTiles.length)];
    const roll = gameRandom();
    let size = roll < 0.5 ? 1 : roll < 0.8 ? 2 : 3;
    if (type === 'stone' && gameState.level === 1 && !gameState.isInvasionActive) {
        const bonus = Math.min(size - 1, gameState.firstWaveStoneBonus ?? 0);
        gameState.firstWaveStoneBonus = (gameState.firstWaveStoneBonus ?? 0) - bonus;
        size = 1 + bonus;
    }
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

function getProducerUpgrade(object) {
    if (!object || (object.type !== 'tree' && object.type !== 'quarry')) return null;
    const tree = object.type === 'tree';
    const level = object.level ?? 1;
    const cost = GAME_CONFIG.producerUpgradeCosts[level - 1];
    const production = tree ? GAME_CONFIG.treeWoodPerLevel : GAME_CONFIG.quarryStonePerLevel;
    return {
        level,
        resource: tree ? 'wood' : 'stone',
        production: production[level - 1],
        nextProduction: production[level],
        interval: tree ? GAME_CONFIG.treeProductionInterval : GAME_CONFIG.quarryProductionInterval,
        cost: cost !== undefined && GAME_CONFIG.freeLocalPurchases ? 0 : cost
    };
}

function upgradeBuilding(tileId, objectId) {
    const object = gameState.tiles[tileId]?.object;
    if (gameState.gamePaused || gameState.gameEnded || !object || object.id !== objectId) return false;
    const upgrade = getProducerUpgrade(object);
    if (upgrade?.cost === undefined) return false;
    const balance = RESOURCE_BALANCES[upgrade.resource];
    if (gameState[balance] < upgrade.cost) return false;
    gameState[balance] -= upgrade.cost;
    object.level = upgrade.level + 1;
    return true;
}

function getFenceRepair(object) {
    if (!object || (object.type !== 'woodFence' && object.type !== 'stoneWall')) return null;
    const resource = object.type === 'woodFence' ? 'wood' : 'stone';
    const maxHp = GAME_CONFIG.hpValues[object.type];
    return {
        resource,
        cost: (getShopCost(object.type)[resource] ?? 0) / 4,
        maxHp,
        repairedHp: Math.min(maxHp, object.hp + maxHp / 2)
    };
}

function repairBuilding(tileId, objectId) {
    const object = gameState.tiles[tileId]?.object;
    if (gameState.gamePaused || gameState.gameEnded || !object || object.id !== objectId) return false;
    const repair = getFenceRepair(object);
    if (!repair || object.hp >= repair.maxHp) return false;
    const balance = RESOURCE_BALANCES[repair.resource];
    if (gameState[balance] < repair.cost) return false;
    gameState[balance] -= repair.cost;
    object.hp = repair.repairedHp;
    return true;
}

function applyGameAction(action) {
    switch (action?.type) {
        case 'collect': return collectResource(action.tileId);
        case 'place': return placeItem(action.tileId, action.item);
        case 'upgrade': return upgradeBuilding(action.tileId, action.objectId);
        case 'repair': return repairBuilding(action.tileId, action.objectId);
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
