const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGame } = require('./game-harness.cjs');
const speeds = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
const close = (a, b) => assert.ok(Math.abs(a - b) < 0.0001, `${a} != ${b}`);

test('dokładnie 10 wartości, domyślne 1× i odczyt preferencji', () => {
    const initial = createGame();
    assert.deepEqual(JSON.parse(initial.run('JSON.stringify(GAME_CONFIG.gameSpeeds)')), speeds);
    assert.equal(initial.run('gameState.gameSpeed'), 1);
    for (const speed of speeds) {
        const game = createGame({ gameSpeed: String(speed) });
        assert.equal(game.run('gameState.gameSpeed'), speed);
        const slider = game.document.getElementById('volumeRange');
        assert.equal(slider.value, String(speed));
        assert.match(slider['aria-valuetext'], /×/);
    }
    for (const invalid of ['0', '0.8', '4', 'NaN', '', 'null', '{}']) {
        assert.equal(createGame({ gameSpeed: invalid }).run('gameState.gameSpeed'), 1);
    }
});

test('wszystkie szybkości skalują ruch i zegar, ale nie punkty za czas', () => {
    for (const speed of speeds) {
        const game = createGame({ gameSpeed: String(speed) });
        game.start();
        game.run(`
            gameState.tiles.forEach(tile => { tile.object = null; });
            gameState.isInvasionActive = true; gameState.totalEnemiesInWave = 2;
            spawnEnemy(0, 'normal');
        `);
        game.advance(4000);
        close(game.run('getGameTime()'), 4000 * speed);
        close(game.run('gameState.activeEnemies[0].offsetX'), 0.55 * 60 * 4 * speed);
        close(game.summary().simulationTimeSeconds, 4 * speed);
        close(game.summary().activeTimeSeconds, 4);
        assert.equal(game.summary().points.time, 4);
    }
});

test('60 rzeczywistych sekund przy 3× daje 60 punktów i 180 sekund symulacji', () => {
    const game = createGame({ gameSpeed: '3' });
    game.start();
    game.run('gameState.prepTime = 100000;');
    game.advance(60000, 30);
    close(game.summary().activeTimeSeconds, 60);
    close(game.summary().simulationTimeSeconds, 180);
    assert.equal(game.summary().totalScore, 60);
});

test('delta pocisków działa przy 0,75×, 2× i 3× również przy 10/30/60/144 FPS', () => {
    for (const speed of [0.75, 2, 3]) {
        for (const fps of [10, 30, 60, 144]) {
            const game = createGame({ gameSpeed: String(speed) });
            game.start();
            game.run(`gameState.isInvasionActive = true; fireCannon(gameState.tiles[0]);`);
            game.advance(1000, fps);
            close(game.run('gameState.activeProjectiles[0].xOffset'), 240 * speed);
        }
    }
});

test('zmiana szybkości między klatkami zachowuje poprzedni odcinek ruchu', () => {
    const game = createGame();
    game.start();
    game.run(`
        gameState.tiles.forEach(tile => { tile.object = null; });
        gameState.isInvasionActive = true; spawnEnemy(0, 'normal');
    `);
    game.elapseWithoutFrame(50);
    game.run('setGameSpeed(2);');
    game.advance(50, 20);
    close(game.run('getGameTime()'), 150);
    close(game.run('gameState.activeEnemies[0].offsetX'), 0.55 * 60 * 0.15);
    close(game.summary().activeTimeSeconds, 0.1);
    close(game.summary().simulationTimeSeconds, 0.15);
});

test('zmiana w aktywnej grze jest ciągła, a zmiany w pauzie nie dodają czasu', () => {
    const game = createGame();
    game.start();
    game.advance(2000);
    game.run('setGameSpeed(2);');
    game.advance(3000);
    close(game.run('getGameTime()'), 8000);
    game.run('setGamePaused(true); setGameSpeed(0.75);');
    game.advance(30000);
    game.run('setGameSpeed(3);');
    close(game.run('getGameTime()'), 8000);
    game.run('setGamePaused(false);');
    game.advance(1000);
    const summary = game.summary();
    close(summary.activeTimeSeconds, 6);
    close(summary.simulationTimeSeconds, 11);
    assert.deepEqual(summary.speedHistory.map(entry => entry.gameSpeed), [1, 2, 0.75, 3]);
    assert.deepEqual(summary.speedHistory.map(entry => entry.atActiveSeconds), [0, 2, 5, 5]);
    assert.equal(summary.initialGameSpeed, 1);
    assert.equal(summary.gameSpeed, 3);
    assert.equal(summary.points.time, 6);
    game.run('setGameSpeed(3);');
    assert.equal(game.summary().speedHistory.length, 4, 'input + change nie dublują zdarzeń');
});

test('2× skaluje przygotowanie, wzrost, zasoby, spawn, ostrzał i pociski', () => {
    const prep = createGame({ gameSpeed: '2' });
    prep.start();
    prep.advance(2000);
    assert.equal(prep.run('gameState.prepTime'), 116);

    const growth = createGame({ gameSpeed: '2' });
    growth.start();
    growth.run(`
        const tile = gameState.tiles.find(tile => !isTileOccupied(tile));
        gameState.seedCount = 1; placeItem(tile.id, 'seedling');
    `);
    growth.advance(7400);
    assert.equal(growth.run('tile.object.type'), 'seedling');
    growth.advance(120);
    assert.equal(growth.run('tile.object.type'), 'tree');
    assert.equal(growth.summary().points.items, 10);

    const resources = createGame({ gameSpeed: '2' });
    resources.start();
    resources.run(`gameState.tiles.forEach(tile => { tile.object = null; });`);
    resources.advance(7520);
    assert.equal(resources.run("gameState.tiles.filter(tile => tile.object?.type === 'grass').length"), 1);
    resources.advance(5000);
    assert.equal(resources.run("gameState.tiles.filter(tile => tile.object?.type === 'stone').length"), 1);

    const combat = createGame({ gameSpeed: '2' });
    combat.start();
    combat.run(`
        gameState.tiles.forEach(tile => { tile.object = null; });
        handleInvasionStart();
    `);
    combat.advance(1390);
    assert.equal(combat.run('gameState.activeEnemies.length'), 0);
    combat.advance(30);
    assert.equal(combat.run('gameState.activeEnemies.length'), 1);
    combat.run(`
        const tile = gameState.tiles[0];
        gameState.woodCount = 20; gameState.stoneCount = 15;
        placeItem(tile.id, 'cannon');
        gameState.activeEnemies[0].row = 0;
        var shots = 0; fireCannon = () => { shots++; };
        updateCannons();
    `);
    combat.advance(480);
    assert.equal(combat.run('shots'), 1);
    combat.advance(40);
    assert.equal(combat.run('shots'), 2);

    const projectiles = createGame({ gameSpeed: '2' });
    projectiles.start();
    projectiles.run(`gameState.isInvasionActive = true; fireCannon(gameState.tiles[0]);`);
    projectiles.advance(1000);
    close(projectiles.run('gameState.activeProjectiles[0].xOffset'), 480);
});

test('suwak aktualizuje opis, przedział, topbar, CSS i zapis preferencji', () => {
    const game = createGame();
    const slider = game.document.getElementById('volumeRange');
    const levels = ['Easy', 'Normal', 'Normal', 'Normal', 'Hard', 'Hard', 'Hard', 'Very Hard', 'Very Hard', 'Very Hard'];
    for (let i = 0; i < speeds.length; i++) {
        slider.oninput({ target: { value: String(speeds[i]) } });
        slider.onchange({ target: { value: String(speeds[i]) } });
        const display = speeds[i].toFixed(2).replace('.', ',') + '×';
        assert.equal(game.document.getElementById('gameSpeedValue').textContent, display);
        assert.equal(game.document.getElementById('gameDifficultyValue').textContent, levels[i]);
        assert.ok(game.document.getElementById('statusContainer').innerHTML.includes(display));
        assert.equal(game.document.querySelectorAll('[data-speed-level]').filter(band => band.classList.contains('is-active')).length, 1);
        assert.equal(game.document.getElementById('appScale').style['--game-speed'], String(speeds[i]));
        assert.equal(createGame(Object.fromEntries(game.storage)).run('gameState.gameSpeed'), speeds[i]);
    }
    for (const invalid of [0, 0.8, 4, NaN, '2']) assert.equal(game.run(`setGameSpeed(${typeof invalid === 'string' ? "'2'" : invalid})`), false);
});

test('koniec gry zamraża oba czasy i historię, a zapis zachowuje pełne statystyki', async () => {
    for (const ending of ['gameOver', 'gameWin']) {
        const game = createGame();
        game.start();
        game.advance(1000);
        game.run('setGameSpeed(2);');
        game.advance(2000);
        game.run(`${ending}(); renderGameState();`);
        const summary = game.summary();
        const simulationTime = game.run('getGameTime()');
        await game.run(`rankingRepository.saveResult('Tempo', getScoreSummary())`);
        const saved = (await game.run('rankingRepository.getHistory()'))[0];
        assert.deepEqual(JSON.parse(JSON.stringify(saved.speedHistory)), summary.speedHistory);
        assert.equal(saved.gameSpeed, 2);
        game.run('setGameSpeed(0.75);');
        game.advance(60000);
        assert.deepEqual(game.summary(), summary);
        close(game.run('getGameTime()'), simulationTime);
    }
});

test('walidacja odrzuca historię niezgodną z czasem i końcowym mnożnikiem', async () => {
    const game = createGame();
    game.start();
    game.advance(1000);
    game.run('gameOver();');
    for (const mutation of [
        'summary.gameSpeed = 3', 'summary.speedHistory = []', 'summary.simulationTimeSeconds = 100',
        'summary.speedHistory[0].atActiveSeconds = 1', 'summary.initialGameSpeed = 0.8'
    ]) {
        game.run(`var summary = getScoreSummary(); ${mutation};`);
        await assert.rejects(game.run(`rankingRepository.saveResult('Tempo', summary)`));
    }
});

test('natywny pojedynczy suwak ma skok 0,25 i responsywne style dotyku oraz klawiatury', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const styles = fs.readFileSync(path.join(__dirname, '../styles/scss/main.scss'), 'utf8');
    assert.equal((html.match(/type="range"/g) || []).length, 1);
    assert.match(html, /for="volumeRange">Szybkość rozgrywki/);
    assert.match(html, /min="0\.75" max="3" step="0\.25" value="1"/);
    assert.match(styles, /touch-action: pan-y/);
    assert.match(styles, /focus-visible/);
    assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});
