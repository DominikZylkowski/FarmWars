// ------------------------- Punktacja i statystyki rozgrywki -------------------------
let scoreState;
let scoreClockStartedAt = null;
let scoreActiveBaselineMs = 0;
let scoreSimulationBaselineMs = 0;
const scoredEvents = { items: new Set(), enemies: new Set(), resources: new Set() };

function resetScore(runId = createLocalId('run')) {
    scoreState = {
        runId,
        rulesetId: GAME_CONFIG.rulesetId,
        finishedAt: null,
        totalScore: 0,
        activeTimeMs: 0,
        simulationTimeMs: 0,
        initialGameSpeed: gameState.gameSpeed,
        gameSpeed: gameState.gameSpeed,
        speedHistory: [{ atActiveSeconds: 0, atSimulationSeconds: 0, gameSpeed: gameState.gameSpeed }],
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
    scoreActiveBaselineMs = 0;
    scoreSimulationBaselineMs = 0;
    for (const ids of Object.values(scoredEvents)) ids.clear();
}

function updateScoreTotal() {
    scoreState.totalScore = Object.values(scoreState.points).reduce((total, points) => total + points, 0);
}

function updateScoreTime(now = performance.now()) {
    if (scoreClockStartedAt === null) return;
    const elapsed = now - scoreClockStartedAt;
    scoreState.activeTimeMs = scoreActiveBaselineMs + elapsed;
    scoreState.simulationTimeMs = scoreSimulationBaselineMs + elapsed * gameState.gameSpeed;
    scoreState.points.time = Math.floor(scoreState.activeTimeMs / 1000) * GAME_CONFIG.scoring.pointsPerSecond;
    updateScoreTotal();
}

function setScoreClockRunning(isRunning, now = performance.now()) {
    updateScoreTime(now);
    scoreActiveBaselineMs = scoreState.activeTimeMs;
    scoreSimulationBaselineMs = scoreState.simulationTimeMs;
    scoreClockStartedAt = isRunning && scoreState.status === 'active' ? now : null;
}

function startScore(runId) {
    if (scoreState.status === 'active') return;
    resetScore(runId);
    scoreState.status = 'active';
}

function recordGameSpeedChange(speed) {
    if (scoreState.status !== 'active' || scoreState.gameSpeed === speed) return;
    scoreState.gameSpeed = speed;
    scoreState.speedHistory.push({
        atActiveSeconds: scoreState.activeTimeMs / 1000,
        atSimulationSeconds: scoreState.simulationTimeMs / 1000,
        gameSpeed: speed
    });
}

function awardScoreForEvent(category, type, eventId) {
    if (scoreState.status !== 'active' || gameState.gamePaused || gameState.gameEnded) return;
    if (!['items', 'enemies', 'resources'].includes(category) ||
        !Object.hasOwn(GAME_CONFIG.scoring[category], type) ||
        !Number.isSafeInteger(eventId) || eventId <= 0) return;
    const events = scoredEvents[category];
    const points = GAME_CONFIG.scoring[category][type];
    if (!eventId || events.has(eventId) || points === undefined) return;
    events.add(eventId);
    const counts = { items: scoreState.itemsByType, enemies: scoreState.enemiesByType, resources: scoreState.resourcesByType }[category];
    counts[type] = (counts[type] || 0) + 1;
    if (category === 'items') scoreState.itemsCrafted++;
    else if (category === 'enemies') scoreState.enemiesDefeated++;
    else scoreState.resourcesCollected++;
    scoreState.points[category] += points;
    updateScoreTotal();
}

function finishScore(status, now = performance.now(), finishedAt = new Date().toISOString()) {
    if (scoreState.status !== 'active' || !['won', 'lost'].includes(status)) return;
    setScoreClockRunning(false, now);
    scoreState.status = status;
    scoreState.finishedAt = finishedAt;
}

// Niezależny obiekt bez elementów DOM, gotowy do JSON.stringify().
function getScoreSummary() {
    updateScoreTime(typeof currentRealTime === 'number' ? currentRealTime : performance.now());
    return {
        schemaVersion: 2,
        runId: scoreState.runId,
        rulesetId: scoreState.rulesetId,
        finishedAt: scoreState.finishedAt,
        totalScore: scoreState.totalScore,
        activeTimeSeconds: scoreState.activeTimeMs / 1000,
        simulationTimeSeconds: scoreState.simulationTimeMs / 1000,
        initialGameSpeed: scoreState.initialGameSpeed,
        gameSpeed: scoreState.gameSpeed,
        speedHistory: scoreState.speedHistory.map(entry => ({ ...entry })),
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
