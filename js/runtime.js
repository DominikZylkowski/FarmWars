const SIMULATION_STEP_MS = 10;
let gameElapsedMs = 0;
let gameResumedAt = null;
let currentRealTime = 0;
let simulatedUntil = 0;
let gameEpochMs = 0;
let nextGameTimerId = 0;
const gameTimers = new Map();

function getGameTime(now = currentRealTime) {
    return gameElapsedMs + (gameResumedAt === null ? 0 : (now - gameResumedAt) * gameState.gameSpeed);
}

function changeGameSpeed(speed, now) {
    if (!GAME_CONFIG.gameSpeeds.includes(speed)) return false;
    if (speed !== gameState.gameSpeed) {
        advanceGameTo(now);
        gameElapsedMs = getGameTime();
        if (gameResumedAt !== null) gameResumedAt = now;
        setScoreClockRunning(scoreClockStartedAt !== null, now);
        gameState.gameSpeed = speed;
        recordGameSpeedChange(speed);
    }
    return true;
}

function scheduleGameTask(type, delay, repeat = false, data = null, from = getGameTime()) {
    const id = ++nextGameTimerId;
    gameTimers.set(id, { type, due: from + delay, interval: repeat ? delay : 0, data });
    return id;
}

function cancelGameTask(id) {
    gameTimers.delete(id);
}

function runGameTimers(now) {
    for (const [id, timer] of gameTimers) {
        if (timer.due > now + 0.000001) continue;
        if (timer.interval) timer.due += timer.interval;
        else gameTimers.delete(id);
        switch (timer.type) {
            case 'growth': updateTreeGrowth(now); break;
            case 'preparation':
                if (!gameState.isInvasionActive && gameState.prepTime > 0 && --gameState.prepTime === 0) {
                    handleInvasionStart(now);
                }
                break;
            case 'grass':
            case 'stone':
                if (!gameState.isInvasionActive) spawnRandomResource(timer.type);
                break;
            case 'wave': {
                const { queue, spawned } = timer.data;
                spawnEnemy(Math.floor(gameRandom() * GAME_CONFIG.rows), queue[spawned]);
                if (++timer.data.spawned >= queue.length) cancelGameTask(id);
                break;
            }
            case 'attack': attackTile(timer.data.enemyId, timer.data.tileId, id, now); break;
        }
    }
}

// Wejście zegara silnika. Wywołujący dostarcza monotoniczny czas w ms.
function advanceGameTo(now) {
    if (!Number.isFinite(now) || now < currentRealTime) throw new RangeError('Nieprawidłowy czas gry.');
    if (gameResumedAt === null) {
        currentRealTime = now;
        return;
    }
    const target = getGameTime(now);
    while (simulatedUntil + SIMULATION_STEP_MS <= target + 0.000001 && !gameState.gamePaused && !gameState.gameEnded) {
        simulatedUntil += SIMULATION_STEP_MS;
        // Moment zdarzenia wynika z kroku, bez względu na częstotliwość renderowania.
        currentRealTime = gameResumedAt + (simulatedUntil - gameElapsedMs) / gameState.gameSpeed;
        runGameTimers(simulatedUntil);
        updateGameLoop(SIMULATION_STEP_MS / 1000, simulatedUntil);
    }
    if (!gameState.gameEnded) currentRealTime = now;
    updateScoreTime(currentRealTime);
}

function setSimulationPaused(shouldPause, now) {
    if (gameState.gameEnded || gameState.gamePaused === shouldPause) return;
    advanceGameTo(now);
    if (gameState.gameEnded) return;
    gameElapsedMs = getGameTime();
    gameResumedAt = shouldPause ? null : now;
    gameState.gamePaused = shouldPause;
    setScoreClockRunning(!shouldPause, now);
}

function stopGameRuntime(now) {
    gameElapsedMs = getGameTime(now);
    gameResumedAt = null;
    gameTimers.clear();
}

function exportGameState() {
    return JSON.parse(JSON.stringify({
        version: 1,
        rulesetId: GAME_CONFIG.rulesetId,
        state: gameState,
        score: scoreState,
        scored: Object.fromEntries(Object.entries(scoredEvents).map(([category, ids]) => [category, [...ids]])),
        clock: { elapsed: getGameTime(), simulatedUntil, wallTime: gameEpochMs + currentRealTime },
        randomState,
        nextEntityId,
        nextGameTimerId,
        timers: [...gameTimers]
    }));
}

function isSnapshotBoardValid(state) {
    if (!Array.isArray(state?.tiles) || state.tiles.length !== GAME_CONFIG.rows * GAME_CONFIG.columns ||
        !Array.isArray(state.activeEnemies) || !Array.isArray(state.activeProjectiles) ||
        !Number.isInteger(state.level) || !Object.hasOwn(GAME_CONFIG.waves, state.level)) return false;

    const ids = new Set();
    function hasUniqueId(entity) {
        if (!Number.isSafeInteger(entity?.id) || entity.id <= 0 || ids.has(entity.id)) return false;
        ids.add(entity.id);
        return true;
    }
    function inRow(entity) {
        return Number.isInteger(entity.row) && entity.row >= 0 && entity.row < GAME_CONFIG.rows;
    }
    function inColumn(column) {
        return Number.isInteger(column) && column >= 0 && column < GAME_CONFIG.columns;
    }

    return state.tiles.every((tile, index) => {
        if (tile?.id !== index || tile.row !== Math.floor(index / GAME_CONFIG.columns) ||
            tile.column !== index % GAME_CONFIG.columns) return false;
        const object = tile.object;
        if (object === null) return true;
        if (!hasUniqueId(object) || !Number.isFinite(object.hp)) return false;
        if (object.type === 'grass' || object.type === 'stone') return [1, 2, 3].includes(object.size);
        if (object.type === 'seedling') return Number.isFinite(object.growthAt);
        if (object.type === 'cannon') return Number.isFinite(object.lastShot);
        if (object.type === 'tree' || object.type === 'quarry') {
            if (object.level !== undefined &&
                (!Number.isInteger(object.level) || object.level < 1 || object.level > GAME_CONFIG.producerUpgradeCosts.length + 1)) return false;
            if (object.type === 'quarry') return Number.isFinite(object.nextStoneAt);
            if (object.nextWoodAt !== undefined && !Number.isFinite(object.nextWoodAt)) return false;
        }
        return ['tree', 'woodFence', 'stoneWall'].includes(object.type);
    }) && state.activeEnemies.every(enemy => hasUniqueId(enemy) && inRow(enemy) &&
        inColumn(enemy.currentCol) && ['normal', 'boss'].includes(enemy.type) &&
        [enemy.hp, enemy.maxHp, enemy.offsetX].every(Number.isFinite)) &&
        state.activeProjectiles.every(projectile => hasUniqueId(projectile) && inRow(projectile) &&
            inColumn(projectile.column) && Number.isFinite(projectile.xOffset));
}

function isSnapshotTaskValid(entry) {
    if (!Array.isArray(entry) || !Number.isSafeInteger(entry[0]) || !entry[1]) return false;
    const { type, due, interval, data } = entry[1];
    if (!Number.isFinite(due) || !Number.isFinite(interval) || interval < 0) return false;
    if (type === 'attack') {
        return Number.isSafeInteger(data?.enemyId) && Number.isInteger(data.tileId) &&
            data.tileId >= 0 && data.tileId < GAME_CONFIG.rows * GAME_CONFIG.columns;
    }
    if (type === 'wave') {
        return Array.isArray(data?.queue) && data.queue.every(enemy => ['normal', 'boss'].includes(enemy)) &&
            Number.isInteger(data.spawned) && data.spawned >= 0 && data.spawned < data.queue.length;
    }
    return ['growth', 'preparation', 'grass', 'stone'].includes(type);
}

function restoreGameState(snapshot, now = 0) {
    if (!snapshot || snapshot.version !== 1 || snapshot.rulesetId !== GAME_CONFIG.rulesetId) {
        throw new TypeError('Nieobsługiwana wersja zapisu gry.');
    }
    const copy = JSON.parse(JSON.stringify(snapshot));
    const { state, score, scored, clock, timers } = copy;
    if (!Number.isFinite(now) || !isSnapshotBoardValid(state) ||
        !GAME_CONFIG.gameSpeeds.includes(state.gameSpeed) || !Number.isFinite(state.geometry?.tileWidth) ||
        state.geometry.tileWidth <= 0 || !Number.isFinite(state.geometry.columnPitch) ||
        state.geometry.columnPitch <= 0 || !Number.isFinite(state.geometry.projectileLimit) ||
        !score || score.rulesetId !== GAME_CONFIG.rulesetId ||
        !['not_started', 'active', 'won', 'lost'].includes(score.status) ||
        ![score.activeTimeMs, score.simulationTimeMs, score.totalScore].every(Number.isFinite) ||
        !Array.isArray(score.speedHistory) || !score.points || !Array.isArray(timers) ||
        !scored || !['items', 'enemies', 'resources'].every(category => Array.isArray(scored[category])) ||
        !Number.isFinite(clock?.elapsed) || !Number.isFinite(clock?.simulatedUntil) ||
        clock.simulatedUntil < 0 || clock.elapsed + 0.000001 < clock.simulatedUntil || !Number.isFinite(clock.wallTime) ||
        !Number.isSafeInteger(copy.randomState) || copy.randomState < 1 || copy.randomState > 4294967295 ||
        !Number.isSafeInteger(copy.nextEntityId) || !Number.isSafeInteger(copy.nextGameTimerId) ||
        !timers.every(isSnapshotTaskValid)) {
        throw new TypeError('Nieprawidłowy zapis gry.');
    }

    for (const key of Object.keys(gameState)) {
        if (Object.hasOwn(state, key)) gameState[key] = state[key];
    }
    scoreState = score;
    scoreState.points.time = Math.floor(scoreState.simulationTimeMs / 1000) * GAME_CONFIG.scoring.pointsPerSecond;
    updateScoreTotal();
    for (const category of Object.keys(scoredEvents)) scoredEvents[category] = new Set(scored[category]);
    scoreActiveBaselineMs = score.activeTimeMs;
    scoreSimulationBaselineMs = score.simulationTimeMs;
    scoreClockStartedAt = gameState.gamePaused || gameState.gameEnded || score.status !== 'active' ? null : now;
    gameElapsedMs = clock.elapsed;
    simulatedUntil = clock.simulatedUntil;
    currentRealTime = now;
    gameEpochMs = clock.wallTime - now;
    gameResumedAt = gameState.gamePaused || gameState.gameEnded ? null : now;
    randomState = copy.randomState;
    nextEntityId = copy.nextEntityId;
    nextGameTimerId = copy.nextGameTimerId;
    gameTimers.clear();
    for (const [id, timer] of timers) gameTimers.set(id, timer);
}
