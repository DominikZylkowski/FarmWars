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
    run('GAME_CONFIG.baseGameSpeed = 1; resetScore();');
    return {
        run,
        save: () => JSON.parse(run('JSON.stringify(exportGameState())')),
        restore: (state, now) => run(`restoreGameState(${JSON.stringify(state)}, ${now})`)
    };
}

const start = `initializeGameModel(123456, 1700000000000);
    gameState.gameStarted = true; startScore('replay-test'); setSimulationPaused(false, 0);`;

test('wersja Netlify rezerwuje miejsce na nakładkę tylko na urządzeniach dotykowych', () => {
    for (const hostname of ['fabulous-medovik-44941b.netlify.app', 'deploy-preview-5--farmwars.netlify.app', 'localhost', 'farmwars.example']) {
        for (const mobile of [false, true]) {
            const game = createGame({}, { location: { hostname, protocol: 'file:' }, matchMedia: () => ({ matches: mobile }) });
            assert.equal(game.document.body.classList.contains('hosting-overlay-space'), mobile && hostname.endsWith('.netlify.app'));
        }
    }
});

test('obrót do poziomu próbuje pełnego ekranu, a odmowa pozwala ponowić dotknięciem', async () => {
    const game = createGame({}, { innerWidth: 390, innerHeight: 844, matchMedia: () => ({ matches: true }) });
    game.document.documentElement = new game.Element('html');
    let attempts = 0;
    game.document.documentElement.requestFullscreen = async () => { attempts++; throw new Error('activation required'); };
    game.run('window.innerWidth = 844; window.innerHeight = 390; syncDeviceLayout()');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(attempts, 1);
    assert.equal(game.document.getElementById('fullscreenPrompt').hidden, false);
    game.run('syncDeviceLayout()');
    assert.equal(attempts, 1);
    game.document.documentElement.requestFullscreen = async () => {
        attempts++;
        game.document.fullscreenElement = game.document.documentElement;
    };
    await game.document.getElementById('fullscreenPrompt').onclick();
    assert.equal(attempts, 2);
    assert.equal(game.document.getElementById('fullscreenPrompt').hidden, true);
});

test('pełny ekran obsługuje wejście, wyjście i odmowę bez zatrzymania gry', async () => {
    const game = createGame();
    game.document.documentElement = new game.Element('html');
    game.document.documentElement.requestFullscreen = async () => {
        game.document.fullscreenElement = game.document.documentElement;
    };
    game.document.exitFullscreen = async () => { game.document.fullscreenElement = null; };
    await game.run('toggleFullscreen()');
    assert.equal(game.document.getElementById('fullscreenButton').getAttribute('aria-pressed'), 'true');
    await game.run('toggleFullscreen()');
    assert.equal(game.document.getElementById('fullscreenButton').getAttribute('aria-pressed'), 'false');
    game.document.documentElement.requestFullscreen = async () => { throw new Error('denied'); };
    await game.run('toggleFullscreen()');
    assert.match(game.document.getElementById('fullscreenStatus').textContent, /Nie udało/);
    game.document.documentElement.requestFullscreen = undefined;
    game.run('syncFullscreenButton()');
    assert.equal(game.document.getElementById('fullscreenButton').hidden, true);
});

test('starszy zapis z małego ekranu zachowuje pozycję i przywraca wspólną prędkość robaków', () => {
    const game = engine();
    game.run(start);
    game.run(`gameState.tiles.forEach(tile => { tile.object = null; });
        gameState.isInvasionActive = true; spawnEnemy(0, 'normal'); spawnEnemy(1, 'boss');
        gameState.geometry = { tileWidth: 48, columnPitch: 48, projectileLimit: 480 };
        gameState.activeEnemies.forEach(enemy => { enemy.offsetX = 12; });`);
    const snapshot = game.save();
    game.restore(snapshot, 0);
    assert.equal(game.run('gameState.activeEnemies[0].offsetX'), 25);
    assert.equal(game.run('gameState.geometry.projectileLimit'), 1000);
    assert.equal(snapshot.state.geometry.tileWidth, 48);
    game.run('advanceGameTo(1000)');
    assert.ok(Math.abs(game.run('gameState.activeEnemies[0].offsetX') - 66.25) < 0.00001);
    assert.ok(Math.abs(game.run('gameState.activeEnemies[1].offsetX') - 58.75) < 0.00001);
});

test('pierwsze przygotowania pozwalają kupić i wyhodować sadzonkę nawet przy minimalnym plonie trawy', () => {
    const { run } = engine();
    run('GAME_CONFIG.freeLocalPurchases = false; gameRandom = () => 0;');
    run(start);
    const collectGrass = 'gameState.tiles.filter(tile => tile.object?.type === \'grass\').forEach(tile => collectResource(tile.id));';
    run(collectGrass);
    assert.equal(run('canAfford(\'seedling\')'), false);
    for (let time = 10000; time <= 50000; time += 10000) {
        run(`advanceGameTo(${time});`);
        run(collectGrass);
    }
    assert.equal(run('gameState.seedCount'), 21);
    run('const seedlingPlot = gameState.tiles.find(tile => !tile.object);');
    assert.equal(run('placeItem(seedlingPlot.id, \'seedling\')'), true);
    assert.equal(run('gameState.seedCount'), 1);
    run('advanceGameTo(65000);');
    assert.equal(run('seedlingPlot.object.type'), 'tree');
    assert.equal(run('gameState.isInvasionActive'), false);
});

test('początkowe złoża, kolejne spawny i limit pierwszego kamienia są zgodne z konfiguracją', () => {
    for (const seed of [1, 2, 3, 7, 42, 99, 123, 456, 2026, 123456]) {
        const { run } = engine();
        run(`initializeGameModel(${seed}, 1700000000000);
            gameState.gameStarted = true; startScore('opening'); setSimulationPaused(false, 0);`);
        assert.equal(run('gameState.tiles.length'), 50);
        assert.equal(run('gameState.tiles.filter(tile => tile.object?.type === \'grass\').length'), 6);
        assert.equal(run('gameState.tiles.filter(tile => tile.object?.type === \'stone\').length'), 11);
        assert.equal(run('gameState.tiles.filter(tile => tile.object?.type === \'grass\').every(tile => [1, 2].includes(tile.object.size))'), true);
        run(`let grassDeposits = 0; let stoneDeposits = 0;
            function collectOpening() {
                for (const tile of gameState.tiles) {
                    if (tile.object?.type === 'grass') { grassDeposits++; collectResource(tile.id); }
                    if (tile.object?.type === 'stone') { stoneDeposits++; collectResource(tile.id); }
                }
            }
            collectOpening();`);
        for (let time = 10000; time < 120000; time += 10000) {
            run(`advanceGameTo(${time}); collectOpening();`);
        }
        assert.equal(run('grassDeposits'), 39);
        assert.equal(run('stoneDeposits'), 15);
        assert.ok(run('gameState.stoneCount') <= 28);
        assert.ok(run('gameState.seedCount') >= 39);
        assert.equal(run('gameState.isInvasionActive'), false);
        run('advanceGameTo(120000);');
        assert.equal(run('gameState.isInvasionActive'), true);
    }
});

test('armata ulepsza się do poziomu 5, zapisuje poziom i przypisuje pociskowi obrażenia oraz wylot', () => {
    const game = createGame();
    game.start();
    game.run(`const cannonTile = gameState.tiles.find(tile => !tile.object);
        gameState.woodCount = shopItems.cannon.wood;
        gameState.stoneCount = shopItems.cannon.stone;
        placeItem(cannonTile.id, 'cannon'); renderGameState();`);
    assert.equal(game.run('upgradeBuilding(cannonTile.id, cannonTile.object.id)'), false);
    game.run('gameState.stoneCount = 500');
    for (let level = 1; level <= 5; level++) {
        if (level > 1) assert.equal(game.run('upgradeBuilding(cannonTile.id, cannonTile.object.id)'), true);
        game.run('renderGameState(); fireCannon(cannonTile); renderGameState();');
        assert.equal(game.run('cannonTile.object.level'), level);
        assert.equal(game.run('tileViews[cannonTile.id].object.style.backgroundImage'),
            `url('assets/images/cannon_lvl_${level}.png')`);
        assert.equal(game.run('inspectBuilding(cannonTile.id)'), true);
        assert.match(game.document.getElementById('buildingUpgradeProduction').textContent, /Obrażenia:/);
        assert.equal(game.run('gameState.activeProjectiles.at(-1).damage'), [3, 4, 5, 6, 8][level - 1]);
        assert.equal(game.run('gameState.activeProjectiles.at(-1).originX'), game.run(`cannonMuzzles[${level - 1}].x`));
        assert.equal(game.run('gameState.activeProjectiles.at(-1).originY'), game.run(`cannonMuzzles[${level - 1}].y`));
    }
    assert.equal(game.run('gameState.stoneCount'), 0);
    assert.equal(game.run('upgradeBuilding(cannonTile.id, cannonTile.object.id)'), false);
    assert.equal(game.document.getElementById('upgradeBuildingButton').disabled, true);
    game.run('const cannonSnapshot = exportGameState();');
    game.run('restoreGameState(cannonSnapshot, performance.now())');
    assert.equal(game.run('gameState.tiles[cannonTile.id].object.level'), 5);
    assert.equal(game.run('gameState.activeProjectiles[0].damage'), 3);
    assert.equal(game.run('gameState.activeProjectiles.at(-1).damage'), 8);
});

test('trafienia armat wszystkich poziomów odbierają właściwe HP', () => {
    for (let level = 1; level <= 5; level++) {
        const { run } = engine();
        run(start);
        run(`gameState.tiles.forEach(tile => { tile.object = null; });
            gameState.isInvasionActive = true; gameState.totalEnemiesInWave = 2;
            const tile = gameState.tiles[8];
            tile.object = createBoardObject('cannon', { level: ${level}, hp: 10, lastShot: 0 });
            spawnEnemy(0, 'normal'); fireCannon(tile);
            const shot = gameState.activeProjectiles[0];
            shot.xOffset = (9.5 - 8 - shot.originX) * gameState.geometry.columnPitch;
            updateProjectiles(0);`);
        assert.equal(run('gameState.activeEnemies[0].hp'), 10 - [3, 4, 5, 6, 8][level - 1]);
        assert.equal(run('gameState.activeProjectiles.length'), 0);
    }
});

test('silnik bez DOM zbiera zasoby, sprawdza ceny i nalicza drewno po wyrośnięciu sadzonki', () => {
    const { run, save } = engine();
    run('GAME_CONFIG.freeLocalPurchases = false');
    run(start);
    const initial = save();
    assert.equal(initial.state.tiles.filter(tile => tile.object?.type === 'grass').length, 6);
    assert.equal(initial.state.tiles.filter(tile => tile.object?.type === 'stone').length, 11);
    run(`const grass = gameState.tiles.find(tile => tile.object?.type === 'grass');
        const size = grass.object.size;`);
    assert.equal(run(`applyGameAction({ type: 'place', item: 'seedling', tileId: grass.id })`), false);
    assert.equal(run(`applyGameAction({ type: 'collect', tileId: grass.id })`), true);
    assert.equal(run('gameState.seedCount'), run('size'));
    assert.equal(run(`applyGameAction({ type: 'collect', tileId: grass.id })`), false);
    assert.equal(run(`applyGameAction({ type: 'place', item: 'seedling', tileId: grass.id })`), false);
    run('gameState.seedCount = shopItems.seedling.seeds');
    assert.equal(run(`applyGameAction({ type: 'place', item: 'seedling', tileId: grass.id })`), true);
    assert.equal(run(`applyGameAction({ type: 'place', item: 'seedling', tileId: grass.id })`), false);
    assert.equal(run('gameState.seedCount'), 0);
    const id = run('grass.object.id');
    run('advanceGameTo(14990);');
    assert.equal(run('grass.object.type'), 'seedling');
    run('advanceGameTo(15000);');
    assert.equal(run('grass.object.type'), 'tree');
    assert.equal(run('grass.object.id'), id);
    assert.equal(run('collectResource(grass.id)'), false);
    run('advanceGameTo(29990)');
    assert.equal(run('gameState.woodCount'), 0);
    run('advanceGameTo(30000)');
    assert.equal(run('gameState.woodCount'), 6);
    run('grass.object.level = 5; advanceGameTo(45000)');
    assert.equal(run('gameState.woodCount'), 21);
    assert.equal(save().score.points.resources, 12);
});

test('ulepszanie producentów pobiera odpowiedni surowiec i zwiększa następną wypłatę', () => {
    const { run, save, restore } = engine();
    run('GAME_CONFIG.freeLocalPurchases = false');
    run(start);
    run(`const [tree, quarry] = gameState.tiles.filter(tile => !tile.object);
        tree.object = createBoardObject('seedling');
        growToTree(tree, 0);
        gameState.stoneCount = shopItems.quarry.stone;
        gameState.woodCount = shopItems.quarry.wood;
        placeItem(quarry.id, 'quarry');`);
    assert.equal(run("applyGameAction({ type: 'upgrade', tileId: tree.id, objectId: tree.object.id })"), false);
    assert.equal(run("applyGameAction({ type: 'upgrade', tileId: quarry.id, objectId: quarry.object.id })"), false);
    run('gameState.woodCount = 250; gameState.stoneCount = 25; gameState.seedCount = 40;');
    assert.equal(run('upgradeBuilding(tree.id, quarry.object.id)'), false);
    assert.equal(run('upgradeBuilding(quarry.id, quarry.object.id)'), true);
    for (let level = 2; level <= 5; level++) {
        assert.equal(run('upgradeBuilding(tree.id, tree.object.id)'), true);
        assert.equal(run('tree.object.level'), level);
    }
    assert.equal(run('upgradeBuilding(tree.id, tree.object.id)'), false);
    assert.equal(run('gameState.woodCount + gameState.stoneCount'), 0);
    restore(save(), 0);
    run('advanceGameTo(14990);');
    assert.equal(run('gameState.woodCount + gameState.stoneCount'), 0);
    run('advanceGameTo(15000);');
    assert.equal(run('gameState.woodCount'), 15);
    assert.equal(run('gameState.stoneCount'), 11);
});

test('ulepszenie drzewa pobiera drewno i nasiona razem, a brak jednego zasobu blokuje całą operację', () => {
    const game = createGame();
    game.start();
    game.run(`const upgradedTree = gameState.tiles.find(tile => !tile.object);
        upgradedTree.object = createBoardObject('seedling');
        growToTree(upgradedTree, getGameTime());
        gameState.woodCount = 250; gameState.seedCount = 3;
        renderGameState(); inspectBuilding(upgradedTree.id);`);
    const button = game.document.getElementById('upgradeBuildingButton');
    assert.match(button.textContent, /25 drewna \+ 4 nasion/);
    assert.equal(button.disabled, true);
    assert.equal(game.run('upgradeBuilding(upgradedTree.id, upgradedTree.object.id)'), false);
    assert.equal(game.run('gameState.woodCount'), 250);
    assert.equal(game.run('gameState.seedCount'), 3);
    game.run('gameState.woodCount = 24; gameState.seedCount = 40;');
    assert.equal(game.run('upgradeBuilding(upgradedTree.id, upgradedTree.object.id)'), false);
    assert.equal(game.run('gameState.seedCount'), 40);
    game.run('gameState.woodCount = 250; updateBuildingUpgrade();');
    assert.equal(button.disabled, false);
    for (let level = 2; level <= 5; level++) {
        assert.equal(game.run('upgradeBuilding(upgradedTree.id, upgradedTree.object.id)'), true);
        game.run('renderGameState();');
        assert.equal(game.run('upgradedTree.object.level'), level);
        assert.equal(game.run('tileViews[upgradedTree.id].object.style.backgroundImage'),
            `url('assets/images/tree_lvl_${level}.png')`);
    }
    assert.equal(game.run('gameState.woodCount + gameState.seedCount'), 0);
    assert.equal(button.disabled, true);
    assert.equal(game.run('upgradeBuilding(upgradedTree.id, upgradedTree.object.id)'), false);
    game.run('const treeUpgradeSave = exportGameState(); restoreGameState(treeUpgradeSave, performance.now());');
    assert.equal(game.run('gameState.tiles[upgradedTree.id].object.level'), 5);
    assert.equal(game.run('gameState.seedCount'), 0);
});

test('darmowy tryb nadal pomija oba koszty ulepszania drzew', () => {
    const { run } = engine();
    run(start);
    run(`GAME_CONFIG.freeLocalPurchases = true;
        const freeTree = gameState.tiles.find(tile => !tile.object);
        placeItem(freeTree.id, 'seedling'); growToTree(freeTree, 0);`);
    for (let level = 2; level <= 5; level++) assert.equal(run('upgradeBuilding(freeTree.id, freeTree.object.id)'), true);
    assert.equal(run('gameState.woodCount + gameState.seedCount'), 0);
});

test('naprawa kosztuje ćwierć ceny i przywraca połowę maksymalnego życia', () => {
    const { run } = engine();
    run(start);
    run(`const [fence, wall] = gameState.tiles.filter(tile => !tile.object);
        fence.object = createBoardObject('woodFence', { hp: 2 });
        wall.object = createBoardObject('stoneWall', { hp: 5 });
        gameState.woodCount = 24;
        gameState.stoneCount = 60;`);
    assert.equal(run('repairBuilding(fence.id, fence.object.id)'), false);
    assert.equal(run("gameState.woodCount = 25; applyGameAction({ type: 'repair', tileId: fence.id, objectId: fence.object.id })"), true);
    assert.equal(run('fence.object.hp'), 6);
    assert.equal(run('gameState.woodCount'), 0);
    assert.equal(run('repairBuilding(wall.id, wall.object.id)'), true);
    assert.equal(run('wall.object.hp'), 17.5);
    assert.equal(run('repairBuilding(wall.id, wall.object.id)'), true);
    assert.equal(run('wall.object.hp'), 25);
    assert.equal(run('repairBuilding(wall.id, wall.object.id)'), false);
    assert.equal(run('gameState.stoneCount'), 0);
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
        gameState.seedCount = shopItems.seedling.seeds; gameState.woodCount = shopItems.woodFence.wood;
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

test('formularz końcowy przekazuje do PHP podsumowanie v3 i identyfikator partii', async () => {
    const calls = [];
    const responses = { session: { csrf: 'token' }, start: { runId: 'server-id' }, result: { saved: true },
        history: { results: [], nextOffset: null } };
    const game = createGame({ gameSpeed: '1.5' }, {
        location: new URL('http://localhost/farmwars/'),
        fetch: async (url, options) => {
            const action = url.searchParams.get('action');
            calls.push({ action, options });
            return { ok: true, json: async () => responses[action] };
        }
    });
    game.start();
    game.advance(2000);
    game.run('gameOver(); renderGameState();');
    const form = game.document.getElementById('endScreen').querySelector('form');
    form.querySelector('input').value = 'Ogrodnik';
    await form.onsubmit({ preventDefault() {} });
    assert.equal(calls.filter(call => call.action === 'start').length, 1);
    const result = calls.find(call => call.action === 'result');
    assert.ok(result);
    assert.equal(result.options.headers['X-CSRF-Token'], 'token');
    assert.equal(game.summary().schemaVersion, 3);
    assert.equal(game.summary().points.time, 3);
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
    assert.ok(Math.abs(parseFloat(game.run('enemyViews.values().next().value.style.width')) - 57.6) < 0.00001);
});

test('start na małym i dużym ekranie zachowuje tę samą geometrię oraz proporcje walki', () => {
    for (const width of [25, 48, 100, 164]) {
        const browser = { tileWidth: width };
        const game = createGame({}, browser);
        game.start();
        game.run(`gameState.tiles.forEach(tile => { tile.object = null; });
            gameState.isInvasionActive = true; spawnEnemy(0, 'normal'); spawnEnemy(1, 'boss');
            fireCannon(gameState.tiles[0]); renderGameState();`);
        assert.equal(game.run('gameState.geometry.tileWidth'), 100);
        assert.equal(game.run('gameState.geometry.columnPitch'), 100);
        const drawnWidth = parseFloat(game.run('enemyViews.values().next().value.style.width'));
        assert.ok(Math.abs(drawnWidth - width * 1.2) < 0.00001);
        game.advance(1000);
        assert.ok(Math.abs(game.run('gameState.activeEnemies[0].offsetX') - 41.25) < 0.00001);
        assert.ok(Math.abs(game.run('gameState.activeEnemies[1].offsetX') - 33.75) < 0.00001);
    }
});
