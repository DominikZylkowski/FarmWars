const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createGame } = require('./game-harness.cjs');

const scripts = ['config.js', 'score.js', 'runtime.js', 'game_model.js', 'war_logic.js'].map(file =>
    fs.readFileSync(path.join(__dirname, '../js', file), 'utf8')
);

function engine() {
    const context = vm.createContext({});
    const run = code => vm.runInContext(code, context);
    for (const script of scripts) run(script);
    return {
        run,
        save: () => JSON.parse(run('JSON.stringify(exportGameState())')),
        restore: (state, now) => run(`restoreGameState(${JSON.stringify(state)}, ${now})`)
    };
}

const start = `initializeGameModel(123456, 1700000000000);
    gameState.gameStarted = true; startScore('replay-test'); setSimulationPaused(false, 0);`;

test('silnik bez DOM zbiera zasoby, sprawdza ceny, zachowuje ID sadzonki i rozlicza drzewo raz', () => {
    const { run, save } = engine();
    run(start);
    const initial = save();
    assert.equal(initial.state.tiles.filter(tile => tile.object?.type === 'grass').length, 6);
    assert.equal(initial.state.tiles.filter(tile => tile.object?.type === 'stone').length, 4);
    run(`const grass = gameState.tiles.find(tile => tile.object?.type === 'grass');
        const size = grass.object.size;`);
    assert.equal(run(`applyGameAction({ type: 'place', item: 'seedling', tileId: grass.id })`), false);
    assert.equal(run(`applyGameAction({ type: 'collect', tileId: grass.id })`), true);
    assert.equal(run('gameState.seedCount'), run('size'));
    assert.equal(run(`applyGameAction({ type: 'collect', tileId: grass.id })`), false);
    assert.equal(run(`applyGameAction({ type: 'place', item: 'seedling', tileId: grass.id })`), true);
    assert.equal(run(`applyGameAction({ type: 'place', item: 'seedling', tileId: grass.id })`), false);
    assert.equal(run('gameState.seedCount'), run('size - 1'));
    const id = run('grass.object.id');
    run('advanceGameTo(14990);');
    assert.equal(run('grass.object.type'), 'seedling');
    run('advanceGameTo(15000);');
    assert.equal(run('grass.object.type'), 'tree');
    assert.equal(run('grass.object.id'), id);
    assert.equal(run('collectResource(grass.id)'), true);
    assert.equal(run('collectResource(grass.id)'), false);
    assert.equal(run('gameState.woodCount'), 2);
    assert.equal(save().score.points.resources, 12);
});

test('geometria logiczna odpowiada dawnemu testowi prostokątów i progowi kontaktu', () => {
    const { run } = engine();
    run(start);
    for (const width of [48, 100, 135]) {
        run(`gameState.geometry.tileWidth = ${width}; gameState.activeEnemies = [];
            gameState.tiles.forEach(tile => { tile.object = null; });
            gameState.isInvasionActive = true; spawnEnemy(0, 'normal');`);
        const boundary = width - Math.min(55, width / 2);
        for (const [offset, column] of [[boundary - 0.01, 9], [boundary + 0.01, 8]]) {
            run(`gameState.activeEnemies[0].offsetX = ${offset}; updateGameLoop(0);`);
            assert.equal(run('gameState.activeEnemies[0].currentCol'), column);
        }
        for (const type of ['normal', 'boss']) {
            for (const offset of [0, 10, 28, 30, 45, 91, 140, 200]) {
                const enemyWidth = type === 'boss' ? 160 : 120;
                const center = 9.5 * width - 3;
                const rotatedHalfWidth = 22.5 * Math.SQRT2 *
                    Math.cos((offset * 2 % 90 - 45) * Math.PI / 180);
                const bullet = 8.5 * width + offset;
                const expected = bullet + rotatedHalfWidth >= center - enemyWidth / 2 + 20 &&
                    bullet - rotatedHalfWidth <= center + enemyWidth / 2;
                assert.equal(run(`projectileHitsEnemy({ column: 8, xOffset: ${offset} },
                    { type: '${type}', offsetX: 3 }, ${width})`), expected);
            }
        }
    }
});

test('migawka odtwarza generator, wzrost, kolejkę fali, trwający atak, pocisk i punktację', () => {
    const original = engine();
    original.run(start);
    original.run(`gameState.tiles.forEach(tile => { tile.object = null; });
        gameState.seedCount = 1; gameState.woodCount = 10;
        placeItem(2, 'seedling'); placeItem(9, 'woodFence');
        handleInvasionStart(); spawnEnemy(0, 'normal'); advanceGameTo(500);
        fireCannon(gameState.tiles[0]); advanceGameTo(755); setSimulationPaused(true, 755);
        changeGameSpeed(2, 755);`);
    const saved = original.save();
    assert.equal(saved.state.activeEnemies.length, 1);
    assert.equal(saved.state.activeProjectiles.length, 1);
    assert.ok(saved.timers.some(([, task]) => task.type === 'attack'));
    assert.ok(saved.timers.some(([, task]) => task.type === 'wave'));
    assert.equal(saved.state.tiles[2].object.type, 'seedling');
    const restored = engine();
    restored.restore(saved, 0);
    assert.deepEqual(restored.save(), saved);
    assert.throws(() => restored.restore({ ...saved, version: 2 }, 0), /wersja zapisu/);
    const invalid = JSON.parse(JSON.stringify(saved));
    invalid.timers.find(([, task]) => task.type === 'attack')[1].data.tileId = 500;
    assert.throws(() => restored.restore(invalid, 0), /Nieprawidłowy zapis/);
    assert.deepEqual(restored.save(), saved, 'odrzucenie zapisu nie zmienia stanu');
    original.run('setSimulationPaused(false, 755); advanceGameTo(8755);');
    restored.run('setSimulationPaused(false, 0);');
    for (let now = 32; now <= 8000; now += 32) restored.run(`advanceGameTo(${now});`);
    assert.deepEqual(restored.save(), original.save());

    const active = engine();
    active.restore(original.save(), 0);
    active.run('advanceGameTo(1000);');
    original.run('advanceGameTo(9755);');
    assert.deepEqual(active.save(), original.save());
});

test('projekcja DOM po przywróceniu pokazuje model, a dane wizualne nie sterują akcjami', () => {
    const game = createGame();
    game.start();
    game.run(`var resource = gameState.tiles.find(tile => tile.object?.type === 'grass');
        var checkpoint = exportGameState();
        var tileElement = tileViews[resource.id].element;
        tileElement.dataset.hp = '999';
        tileElement.dataset.size = '999';
        handleGridClick({ target: { closest: () => tileElement } });`);
    assert.equal(game.run('gameState.seedCount'), game.run('checkpoint.state.tiles[resource.id].object.size'));
    game.run('restoreGameView(checkpoint);');
    assert.equal(game.run('gameState.seedCount'), 0);
    assert.equal(game.run('tileViews[resource.id].object.classList.contains("game-tile__grass")'), true);
    assert.equal(game.frames.size, 1);
});

test('formularz końcowy przekazuje do PHP dotychczasowe podsumowanie v2 i identyfikator partii', async () => {
    const calls = [];
    const responses = { session: { csrf: 'token' }, start: { runId: 'server-id' }, result: { saved: true },
        history: { results: [], nextOffset: null } };
    const game = createGame({}, {
        location: new URL('http://localhost/farmwars/'),
        fetch: async (url, options) => {
            const action = url.searchParams.get('action');
            calls.push({ action, options });
            return { ok: true, json: async () => responses[action] };
        }
    });
    game.start();
    game.advance(1020);
    game.run('gameOver(); renderGameState();');
    const form = game.document.getElementById('endScreen').querySelector('form');
    form.querySelector('input').value = 'Ogrodnik';
    await form.onsubmit({ preventDefault() {} });
    assert.equal(calls.filter(call => call.action === 'start').length, 1);
    const result = calls.find(call => call.action === 'result');
    assert.ok(result);
    assert.equal(result.options.headers['X-CSRF-Token'], 'token');
    assert.deepEqual(JSON.parse(result.options.body), {
        runId: 'server-id', nickname: 'Ogrodnik', summary: game.summary()
    });
});

test('zmiana szerokości okna skaluje rysowanie wroga bez zmiany geometrii partii', () => {
    const browser = { tileWidth: 100 };
    const game = createGame({}, browser);
    game.start();
    game.run(`gameState.tiles.forEach(tile => { tile.object = null; });
        gameState.isInvasionActive = true; spawnEnemy(0, 'normal');
        gameState.activeEnemies[0].offsetX = 40;
        renderGameState();`);
    assert.match(game.run('enemyViews.values().next().value.style.transform'), /translateX\(-40px\)/);
    browser.tileWidth = 48;
    game.run('updateGameLoop(0); renderGameState();');
    assert.equal(game.run('gameState.geometry.tileWidth'), 100);
    assert.equal(game.run('gameState.activeEnemies[0].currentCol'), 9);
    assert.match(game.run('enemyViews.values().next().value.style.transform'), /translateX\(-19\.2px\)/);
});
