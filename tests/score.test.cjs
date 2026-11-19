const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let now = 0;
const context = vm.createContext({
    performance: { now: () => now },
    window: { localStorage: { getItem: () => null } }
});
for (const file of ['config.js', 'score.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
}
const run = code => vm.runInContext(code, context);
run('GAME_CONFIG.baseGameSpeed = 1; resetScore();');
const summary = () => JSON.parse(run('JSON.stringify(getScoreSummary())'));

now = 5000;
assert.equal(summary().totalScore, 0, 'Menu nie nalicza czasu');
run('startScore(); gameState.gamePaused = false; setScoreClockRunning(true);');
now += 650;
run('setScoreClockRunning(false); gameState.gamePaused = true;');
now += 10000;
assert.equal(summary().activeTimeSeconds, 0.65);
assert.equal(summary().points.time, 0);
run('gameState.gamePaused = false; setScoreClockRunning(true);');
now += 1350;
assert.equal(summary().points.time, 2, 'Niepełne sekundy sumują się między pauzami');
run(`
    const item = 1;
    const enemy = 2;
    awardScoreForEvent('items', 'cannon', item);
    awardScoreForEvent('items', 'cannon', item);
    awardScoreForEvent('enemies', 'normal', enemy);
    awardScoreForEvent('enemies', 'normal', enemy);
    awardScoreForEvent('enemies', 'boss', 3);
`);
assert.equal(summary().totalScore, 67);
assert.equal(summary().itemsCrafted, 1);
assert.equal(summary().enemiesDefeated, 2);
run(`gameState.gamePaused = true; awardScoreForEvent('items', 'seedling', 4);`);
assert.equal(summary().itemsCrafted, 1);
run(`gameState.gamePaused = false; finishScore('won');`);
const final = summary();
now += 100000;
run(`setScoreClockRunning(true); awardScoreForEvent('enemies', 'boss', 3); finishScore('lost');`);
assert.deepEqual(summary(), final, 'Koniec gry zamraża wynik i status');
run('const snapshot = getScoreSummary(); snapshot.points.items = 999; snapshot.itemsByType.cannon = 999;');
assert.equal(summary().points.items, 10, 'Eksport nie udostępnia stanu przez referencję');
run('startScore(); setScoreClockRunning(true);');
assert.equal(summary().totalScore, 0);
assert.equal(summary().activeTimeSeconds, 0);
assert.deepEqual(summary().itemsByType, {});
assert.deepEqual(summary().enemiesByType, {});
now += 1250;
run(`finishScore('lost');`);
now += 10000;
assert.equal(summary().totalScore, 1);
assert.equal(summary().status, 'lost');
// Sprawdzenie rzeczywistych punktów wejścia gry bez uruchamiania timerów DOMContentLoaded.
context.window.addEventListener = () => {};
context.requestAnimationFrame = () => 1;
context.cancelAnimationFrame = () => {};
context.document = {
    addEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {} })
};
for (const file of ['runtime.js', 'game_model.js', 'war_logic.js', 'game_view.js', 'economy_client.js', 'main.js']) {
    run(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'));
}
run(`
    startScore();
    gameState.gameStarted = true;
    gameState.gameEnded = false;
    setGamePaused(false);
    gameState.seedCount = shopItems.seedling.seeds;
    gameState.tiles = createBoardModel();
    placeItem(0, 'seedling');
    placeItem(0, 'seedling');
    placeItem(1, 'seedling');
`);
assert.equal(summary().itemsCrafted, 1, 'Zajęte pole i brak surowców nie przyznają punktów');
run(`
    gameState.tiles[0].object = null;
    const treeTile = gameState.tiles[1];
    treeTile.object = createBoardObject('tree', { hp: 5 });
    updateTreeGrowth(0);
    updateTreeGrowth(GAME_CONFIG.treeProductionInterval);
    updateTreeGrowth(2 * GAME_CONFIG.treeProductionInterval);
`);
assert.equal(summary().points.resources, 12, 'Produkcja drzewa daje punkty tylko raz');
assert.equal(summary().resourcesCollected, 1);
assert.equal(summary().resourcesByType.tree, 1);
run(`
    treeTile.object = createBoardObject('tree', { hp: 5 });
    updateTreeGrowth(0);
    updateTreeGrowth(GAME_CONFIG.treeProductionInterval);
`);
assert.equal(summary().points.resources, 24, 'Nowe drzewo na tym samym polu także daje punkty');
run(`
    const victim = { id: ++nextEntityId, hp: 2, maxHp: 10, type: 'normal' };
    gameState.activeEnemies = [victim];
    gameState.totalEnemiesInWave = 10;
    damageEnemy(victim, 1);
`);
assert.equal(summary().enemiesDefeated, 0, 'Samo trafienie nie przyznaje punktów');
run('damageEnemy(victim, 1); damageEnemy(victim, 2);');
assert.equal(summary().enemiesDefeated, 1);
now += 750;
run('setGamePaused(true);');
const paused = summary();
now += 20000;
assert.deepEqual(summary(), paused);
run('setGamePaused(false); showEndScreen = () => {};');
now += 250;
run('advanceGameTo(performance.now()); gameOver(); togglePause();');
assert.equal(summary().status, 'lost');
assert.equal(run('gameState.gamePaused'), true);
const lost = summary();
now += 5000;
assert.deepEqual(summary(), lost);
run('gameState.gameEnded = false; startScore(); setGamePaused(false); gameWin();');
assert.equal(summary().status, 'won');
console.log('OK: czas, pauza, kategorie, duplikaty, zakończenia, eksport, reset i integracja z grą.');
