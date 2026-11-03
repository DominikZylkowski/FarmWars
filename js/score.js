// ------------------------- Punktacja i statystyki rozgrywki -------------------------
let scoreState;
let scoreClockStartedAt = null;
let scoredItems = new WeakSet();
let scoredEnemies = new WeakSet();
let scoredResources = new WeakSet();

function resetScore() {
    scoreState = {
        runId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `run-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        finishedAt: null,
        totalScore: 0,
        activeTimeMs: 0,
        itemsCrafted: 0,
        enemiesDefeated: 0,
        resourcesCollected: 0,
        itemsByType: {},
        enemiesByType: {},
        resourcesByType: {},
        points: { time: 0, items: 0, enemies: 0, resources: 0 },
        status: 'not_started'
    };
    scoreClockStartedAt = null;
    scoredItems = new WeakSet();
    scoredEnemies = new WeakSet();
    scoredResources = new WeakSet();
}

function updateScoreTotal() {
    scoreState.totalScore = Object.values(scoreState.points).reduce((total, points) => total + points, 0);
}

function updateScoreTime() {
    if (scoreClockStartedAt === null) return;
    const now = performance.now();
    scoreState.activeTimeMs += now - scoreClockStartedAt;
    scoreClockStartedAt = now;
    scoreState.points.time = Math.floor(scoreState.activeTimeMs / 1000) * GAME_CONFIG.scoring.pointsPerSecond;
    updateScoreTotal();
}

function setScoreClockRunning(isRunning) {
    updateScoreTime();
    scoreClockStartedAt = isRunning && scoreState.status === 'active' ? performance.now() : null;
}

function startScore() {
    resetScore();
    scoreState.status = 'active';
}

function awardScoreForEvent(category, type, eventObject) {
    if (scoreState.status !== 'active' || gameState.gamePaused || gameState.gameEnded) return;
    const events = { items: scoredItems, enemies: scoredEnemies, resources: scoredResources }[category];
    const points = GAME_CONFIG.scoring[category][type];
    if (!eventObject || events.has(eventObject) || points === undefined) return;
    events.add(eventObject);
    const counts = { items: scoreState.itemsByType, enemies: scoreState.enemiesByType, resources: scoreState.resourcesByType }[category];
    counts[type] = (counts[type] || 0) + 1;
    if (category === 'items') scoreState.itemsCrafted++;
    else if (category === 'enemies') scoreState.enemiesDefeated++;
    else scoreState.resourcesCollected++;
    scoreState.points[category] += points;
    updateScoreTotal();
}

function finishScore(status) {
    if (scoreState.status !== 'active') return;
    setScoreClockRunning(false);
    scoreState.status = status;
    scoreState.finishedAt = new Date().toISOString();
}

// Niezależny obiekt bez elementów DOM, gotowy do JSON.stringify().
function getScoreSummary() {
    updateScoreTime();
    return {
        schemaVersion: 1,
        runId: scoreState.runId,
        finishedAt: scoreState.finishedAt,
        totalScore: scoreState.totalScore,
        activeTimeSeconds: scoreState.activeTimeMs / 1000,
        itemsCrafted: scoreState.itemsCrafted,
        enemiesDefeated: scoreState.enemiesDefeated,
        resourcesCollected: scoreState.resourcesCollected,
        itemsByType: { ...scoreState.itemsByType },
        enemiesByType: { ...scoreState.enemiesByType },
        resourcesByType: { ...scoreState.resourcesByType },
        points: { ...scoreState.points },
        status: scoreState.status
    };
}

resetScore();
