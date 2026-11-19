const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const php = process.env.FARMWARS_PHP || 'C:/xampp/php/php.exe';

test('PHP i JS: zgodność silników przy jednakowych historycznych regułach serwera', () => {
    const context = vm.createContext({});
    const run = code => vm.runInContext(code, context);
    for (const file of ['config.js', 'runtime.js', 'score.js', 'game_model.js', 'war_logic.js']) {
        run(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'));
    }
    // Local balance has evolved independently. Compare engines using the same
    // versioned server rules, rather than silently comparing different games.
    const economySql = fs.readFileSync(path.join(__dirname, '../database/003-economy.sql'), 'utf8');
    const economy = JSON.parse(economySql.match(/\n    '(\{[\s\S]*?\})'\n\)/)[1]);
    const combatSql = fs.readFileSync(path.join(__dirname, '../database/004-online.sql'), 'utf8');
    const combat = JSON.parse(combatSql.match(/'\{([\s\S]*?)\}'/)[0].slice(1, -1)).combat;
    run(`GAME_CONFIG.baseGameSpeed = 1;
        GAME_CONFIG.baseGrassCount = ${economy.initialGrass};
        GAME_CONFIG.baseStoneCount = ${economy.initialStone};
        GAME_CONFIG.firstWaveStoneLimit = 100;
        GAME_CONFIG.grassPerSpawn = 1;
        GAME_CONFIG.grassSizeThresholds = [0.5, 0.8];
        GAME_CONFIG.spawnIntervals.grass = ${economy.grassInterval};
        GAME_CONFIG.spawnIntervals.stone = ${economy.stoneInterval};
        GAME_CONFIG.enemySpeed = ${combat.normal.speed};
        GAME_CONFIG.bossSpeed = ${combat.boss.speed};
        cannonMuzzles[0] = { x: 0.5, y: 0.5, diameter: ${combat.projectileSize / combat.tileWidth} };`);
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
