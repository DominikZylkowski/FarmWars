const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const php = process.env.FARMWARS_PHP || 'C:/xampp/php/php.exe';

test('PHP i JS: zgodność losowania, pierwszej fali, ruchu, armaty i punktacji', () => {
    const context = vm.createContext({});
    const run = code => vm.runInContext(code, context);
    for (const file of ['config.js', 'runtime.js', 'score.js', 'game_model.js', 'war_logic.js']) {
        run(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'));
    }
    run('GAME_CONFIG.baseStoneCount = 4; GAME_CONFIG.firstWaveStoneLimit = 100;');
    const initial = `initializeGameModel(123456, 0); gameState.gameStarted = true;
        startScore('parity'); setSimulationPaused(false, 0);`;
    run(initial);
    const trace = [];
    const enemies = 'gameState.activeEnemies.map(e => [e.id, e.type, e.row, e.hp, e.currentCol, +e.offsetX.toFixed(6)])';
    for (const now of [0, 15000, 25000, 120000, 122800, 123300, 125600, 128400]) {
        trace.push(JSON.parse(run(`advanceGameTo(${now}); JSON.stringify({
            tiles: gameState.tiles.map(t => t.object ? [t.object.id, t.object.type, t.object.size] : null),
            enemies: ${enemies}, seed: randomState, total: gameState.totalEnemiesInWave, sim: simulatedUntil,
            points: scoreState.totalScore
        });`)));
    }
    run(`${initial} gameState.tiles.forEach(t => { t.object = null; });
        handleInvasionStart(); spawnEnemy(0, 'boss');
        gameState.woodCount = shopItems.cannon.wood; gameState.stoneCount = shopItems.cannon.stone;
        placeItem(8, 'cannon');`);
    for (const now of [10, 100, 300, 1000, 1400, 2800]) {
        trace.push(JSON.parse(run(`advanceGameTo(${now}); JSON.stringify({
            enemies: ${enemies},
            projectiles: gameState.activeProjectiles.map(p => [p.id, p.row, p.column, +p.xOffset.toFixed(6)]),
            hp: gameState.tiles[8].object?.hp ?? null, points: scoreState.totalScore
        });`)));
    }
    const actual = JSON.parse(execFileSync(php, [path.join(__dirname, 'online-engine.php'), '--trace'], { encoding: 'utf8' }));
    assert.deepEqual(actual, trace);
});
