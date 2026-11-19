const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('./game-harness.cjs');

test('sekret dodaje 2500 punktów raz na grę, zachowuje bonus po wznowieniu i przechodzi walidację rankingu', () => {
    const game = createGame();
    assert.equal(game.run('awardFarmSecretBonus()'), false);
    game.start();
    const before = game.summary().totalScore;
    assert.equal(game.run('awardFarmSecretBonus()'), true);
    assert.equal(game.summary().totalScore, before + 2500);
    assert.equal(game.run('awardFarmSecretBonus()'), false);
    game.run('var secretSave = exportGameState(); restoreGameState(secretSave, performance.now());');
    assert.equal(game.run('awardFarmSecretBonus()'), false);
    game.advance(1000);
    assert.equal(game.summary().points.secret, 2500);
    game.run("finishScore('lost');");
    assert.equal(game.run('validateScoreSummary(getScoreSummary()).points.secret'), 2500);
    assert.equal(game.run('awardFarmSecretBonus()'), false);
    game.run('resetScore(); startScore();');
    assert.equal(game.run('awardFarmSecretBonus()'), true);
});

test('dotknięcie każdego przedmiotu podświetla wolne pola i pozwala go postawić bez przeciągania', () => {
    const game = createGame({}, { innerWidth: 844, innerHeight: 390,
        matchMedia: query => ({ matches: query === '(any-pointer: coarse)', addEventListener() {} }) });
    game.start();
    game.run(`gameState.tiles.forEach(tile => { tile.object = null; });
        gameState.seedCount = 500; gameState.woodCount = 5000; gameState.stoneCount = 5000; renderGameState();`);
    for (const item of ['seedling', 'cannon', 'woodFence', 'stoneWall', 'quarry']) {
        const button = game.document.getElementById(`${item}Button`);
        assert.equal(button.getAttribute('draggable'), 'false');
        button.onclick();
        assert.equal(button.getAttribute('aria-pressed'), 'true');
        game.run('var tapPlot = gameState.tiles.find(tile => !tile.object);');
        assert.equal(game.run('tileViews[tapPlot.id].element.classList.contains(\'game-tile--can-place\')'), true);
        game.run('handleGridClick({ target: { closest: () => tileViews[tapPlot.id].element } });');
        assert.equal(game.run('tapPlot.object.type'), item);
        assert.equal(game.run('tileViews[tapPlot.id].element.classList.contains(\'game-tile--can-place\')'), false);
        const balance = game.run('gameState.seedCount + gameState.woodCount + gameState.stoneCount');
        game.run('handleGridClick({ target: { closest: () => tileViews[tapPlot.id].element } });');
        assert.equal(game.run('gameState.seedCount + gameState.woodCount + gameState.stoneCount'), balance);
        const saved = JSON.parse(game.storage.get('farmwarsLocalGame'));
        assert.equal(saved.state.tiles[game.run('tapPlot.id')].object.type, item);
        button.onclick();
        assert.equal(button.getAttribute('aria-pressed'), 'false');
        assert.equal(game.run('tileViews.some(view => view.element.classList.contains(\'game-tile--can-place\'))'), false);
    }
});

test('mobilny panel ulepszania pozostaje otwarty po zdarzeniach myszy i zamyka się przy wyborze budowy', () => {
    const game = createGame({}, { innerWidth: 1024, innerHeight: 768,
        matchMedia: query => ({ matches: query === '(any-pointer: coarse)', addEventListener() {} }) });
    game.start();
    game.run(`const touchTree = gameState.tiles.find(tile => !tile.object);
        touchTree.object = createBoardObject('seedling'); growToTree(touchTree, getGameTime());
        gameState.woodCount = 100; gameState.seedCount = 100; renderGameState();
        handleGridClick({ target: { closest: () => tileViews[touchTree.id].element } });`);
    const panel = game.document.getElementById('buildingUpgrade');
    const grid = game.document.getElementById('gameGrid');
    assert.equal(panel.hidden, false);
    panel.onpointerleave({ pointerType: 'mouse' });
    grid.onpointerout({ pointerType: 'mouse' });
    assert.equal(panel.hidden, false);
    game.document.getElementById('upgradeBuildingButton').onclick();
    assert.equal(game.run('touchTree.object.level'), 2);
    assert.equal(panel.hidden, false);
    game.document.getElementById('seedlingButton').onclick();
    assert.equal(panel.hidden, true);
    assert.equal(game.run('selectedItemToPlace'), 'seedling');
});

test('telefon i tablet wymagają poziomu, obrót pauzuje grę i nie pozwala wznowić jej w pionie', () => {
    const mobile = { innerWidth: 390, innerHeight: 844,
        matchMedia: query => ({ matches: query === '(any-pointer: coarse)', addEventListener() {} }) };
    const game = createGame({}, mobile);
    const guard = game.document.getElementById('rotationGuard');
    const app = game.document.getElementById('appScale');
    assert.equal(guard.hidden, false);
    assert.equal(app.inert, true);
    game.start();
    assert.equal(game.run('gameState.gameStarted'), false);
    game.run('window.innerWidth = 844; window.innerHeight = 390; syncDeviceLayout();');
    assert.equal(guard.hidden, true);
    assert.equal(app.inert, false);
    game.start();
    game.advance(1000);
    assert.equal(Math.round(game.run('getGameTime()')), 1000);
    game.run('window.innerWidth = 390; window.innerHeight = 844; syncDeviceLayout();');
    assert.equal(game.run('gameState.gamePaused'), true);
    game.advance(5000);
    assert.equal(Math.round(game.run('getGameTime()')), 1000);
    game.run('setGamePaused(false); handleStartButton();');
    assert.equal(game.run('gameState.gamePaused'), true);
    assert.equal(game.run("handlePlayerAction({ type: 'hit', enemyId: 1 })"), false);
    game.run('window.innerWidth = 1024; window.innerHeight = 1366; syncDeviceLayout();');
    assert.equal(guard.hidden, false);
    game.run('window.innerWidth = 1366; window.innerHeight = 1024; syncDeviceLayout();');
    assert.equal(guard.hidden, true);
    assert.equal(game.run('gameState.gamePaused'), true);
    game.run('handleStartButton();');
    game.advance(1000);
    assert.equal(Math.round(game.run('getGameTime()')), 2000);
});

test('wąskie okno komputera z myszą nie jest blokowane jako telefon', () => {
    const game = createGame({}, { innerWidth: 390, innerHeight: 844,
        matchMedia: () => ({ matches: false, addEventListener() {} }) });
    game.start();
    assert.equal(game.document.getElementById('rotationGuard').hidden, true);
    assert.equal(game.run('gameState.gameStarted'), true);
    assert.equal(game.run('gameState.gamePaused'), false);
});

test('dotknięcie budynku wybiera dolny panel, a ulepszenie i zamknięcie działają bez najeżdżania myszą', () => {
    const game = createGame({}, { innerWidth: 390 });
    game.start();
    game.run(`const mobileTree = gameState.tiles.find(tile => !tile.object);
        mobileTree.object = createBoardObject('seedling'); growToTree(mobileTree, getGameTime());
        gameState.woodCount = 25; gameState.seedCount = 4; renderGameState();
        handleGridClick({ target: { closest: () => tileViews[mobileTree.id].element } });`);
    const panel = game.document.getElementById('buildingUpgrade');
    assert.equal(panel.hidden, false);
    assert.equal(panel.style.left, '');
    assert.equal(panel.style.top, '');
    panel.onpointerleave({ pointerType: 'touch' });
    assert.equal(panel.hidden, false);
    game.document.getElementById('upgradeBuildingButton').onclick();
    assert.equal(game.run('mobileTree.object.level'), 2);
    assert.equal(game.run('gameState.woodCount + gameState.seedCount'), 0);
    assert.equal(panel.hidden, false);
    game.run('window.innerWidth = 1200; positionBuildingUpgrade();');
    assert.notEqual(panel.style.top, '');
    game.run('window.innerWidth = 844; window.matchMedia = () => ({ matches: true }); positionBuildingUpgrade();');
    assert.equal(panel.style.top, '');
    assert.equal(panel.style.left, '');
    game.document.getElementById('closeBuildingUpgradeButton').onclick();
    assert.equal(panel.hidden, true);
});

test('wejście do menu i samouczka nie uruchamia generowania zasobów', () => {
    const game = createGame({}, { baseGameSpeed: 1.1 });
    const initial = game.run('JSON.stringify(gameState.tiles)');
    game.advance(30000);
    assert.equal(game.run('JSON.stringify(gameState.tiles)'), initial);
    assert.equal(game.run('getGameTime()'), 0);
    game.run('handleStartButton()');
    assert.equal(game.run('gameState.tutorialVisible'), true);
    game.advance(30000);
    assert.equal(game.run('JSON.stringify(gameState.tiles)'), initial);
    assert.equal(game.run('getGameTime()'), 0);
    game.run('finishTutorial()');
    game.advance(10000);
    assert.equal(game.run('Math.round(getGameTime())'), 11000);
    assert.equal(game.run('gameState.tiles.filter(tile => tile.object?.type === \'grass\').length'), 9);
});

test('pasek sadzonki ładuje się od zera, zatrzymuje się w pauzie i znika po wzroście', () => {
    const game = createGame();
    game.start();
    game.run(`const seedlingTile = gameState.tiles.find(tile => !tile.object);
        gameState.seedCount = shopItems.seedling.seeds;
        placeItem(seedlingTile.id, 'seedling');
        renderGameState();`);
    const label = () => game.run('tileViews[seedlingTile.id].growthBar.children[1].textContent');
    assert.equal(label(), '15 s');
    assert.equal(game.run('tileViews[seedlingTile.id].growthBar.firstChild.style.width'), '0%');
    game.advance(5000);
    assert.equal(label(), '10 s');
    const width = game.run('tileViews[seedlingTile.id].growthBar.firstChild.style.width');
    assert.ok(parseFloat(width) > 33 && parseFloat(width) < 34);
    assert.equal(game.run('tileViews[seedlingTile.id].growthBar.getAttribute(\'aria-valuenow\')'), '33');
    game.run('togglePause()');
    game.advance(5000);
    assert.equal(label(), '10 s');
    assert.equal(game.run('tileViews[seedlingTile.id].growthBar.firstChild.style.width'), width);
    game.run('togglePause()');
    game.advance(10100);
    assert.equal(game.run('seedlingTile.object.type'), 'tree');
    assert.equal(game.run('tileViews[seedlingTile.id].growthBar'), null);
});

test('nowa gra pokazuje samouczek mimo wcześniejszego ukończenia, a Pomiń uruchamia jedną pętlę', () => {
    const game = createGame({ gameVolume: '0', farmwarsTutorialCompletedV2: '1' });
    game.run('togglePause();');
    assert.equal(game.run('gameState.gamePaused'), true);
    assert.equal(game.frames.size, 0);
    assert.equal(game.document.getElementById('volumeRange').value, '1');
    game.run('handleStartButton();');
    assert.equal(game.run('gameState.tutorialVisible'), true);
    assert.equal(game.run('gameState.gamePaused'), true);
    assert.equal(game.frames.size, 0);
    game.run('skipTutorial()');
    assert.equal(game.run('gameState.tutorialVisible'), false);
    assert.equal(game.run('gameState.gamePaused'), false);
    assert.equal(game.frames.size, 1);
});

test('samouczek nie nalicza czasu, startuje tylko jedna pętla', () => {
    const game = createGame({ farmwarsTutorialCompleted: '1' });
    game.run('handleStartButton(); togglePause();');
    assert.equal(game.run('gameState.tutorialVisible'), true);
    assert.equal(game.document.getElementById('tutorialStepProgress').textContent, '1/6');
    game.run('advanceTutorial(); advanceTutorial(); advanceTutorial();');
    assert.match(game.document.getElementById('tutorialStepText').textContent, /30 kamienia i 50 drewna/);
    game.advance(20000);
    assert.equal(game.summary().totalScore, 0);
    assert.equal(game.run('gameState.gamePaused'), true);
    game.run('finishTutorial(); scheduleGameFrame(); scheduleGameFrame();');
    assert.equal(game.frames.size, 1);
    game.run('handleInvasionStart(); handleInvasionStart();');
    assert.equal(game.run('gameTimers.size'), 5, '4 timery podstawowe i jedna kolejka fali');
    assert.equal(game.frames.size, 1);
});

test('po przeładowaniu można kontynuować zapis albo zacząć nową grę', () => {
    const game = createGame();
    game.start();
    game.run('gameState.woodCount = 42');
    game.advance(2400);
    game.hide();
    const storage = Object.fromEntries(game.storage);

    const resumed = createGame(storage);
    const continueButton = resumed.document.getElementById('continueSavedGameButton');
    assert.equal(resumed.document.getElementById('savedGameChoice').hidden, false);
    assert.equal(resumed.frames.size, 0);
    continueButton.onclick();
    assert.equal(resumed.document.getElementById('savedGameChoice').hidden, true);
    assert.equal(resumed.run('gameState.woodCount'), 42);
    assert.equal(resumed.run('gameState.prepTime'), 118);
    assert.equal(resumed.run('gameState.gamePaused'), false);
    assert.equal(resumed.run('gameState.tutorialVisible'), false);

    const restarted = createGame(storage);
    restarted.document.getElementById('restartSavedGameButton').onclick();
    assert.equal(restarted.run('gameState.woodCount'), 0);
    assert.equal(restarted.run('gameState.prepTime'), 120);
    assert.equal(restarted.run('gameState.tutorialVisible'), true);
    assert.equal(restarted.document.getElementById('tutorialStepProgress').textContent, '1/6');
    assert.equal(restarted.run('gameState.gamePaused'), true);
    assert.equal(restarted.frames.size, 0);
});

test('kontynuowanie zapisu zachowuje krok rozpoczętego samouczka', () => {
    const game = createGame();
    game.run('handleStartButton(); advanceTutorial(); advanceTutorial(); saveLocalGame();');
    const resumed = createGame(Object.fromEntries(game.storage));
    resumed.document.getElementById('continueSavedGameButton').onclick();
    assert.equal(resumed.run('gameState.tutorialVisible'), true);
    assert.equal(resumed.run('gameState.tutorialStep'), 2);
    assert.equal(resumed.document.getElementById('tutorialStepProgress').textContent, '3/6');
    assert.equal(resumed.run('gameState.gamePaused'), true);
    assert.equal(resumed.frames.size, 0);
});

test('panel przy murku pozwala naprawić obiekt i zamyka się po zjechaniu kursorem', () => {
    const game = createGame();
    game.start();
    game.run(`const tile = gameState.tiles.find(tile => !tile.object);
        tile.object = createBoardObject('stoneWall', { hp: 20 });
        gameState.stoneCount = 30;
        renderGameState();`);
    const tile = game.run('tileViews[tile.id].element');
    const grid = game.document.getElementById('gameGrid');
    const panel = game.document.getElementById('buildingUpgrade');
    const mouse = { pointerType: 'mouse', target: { closest: () => tile } };
    grid.onpointerover(mouse);
    assert.equal(panel.hidden, false);
    assert.equal(panel.style.left, `${tile.getBoundingClientRect().right}px`);
    assert.ok(tile.classList.contains('game-tile--inspected'));
    grid.onpointerout({ ...mouse, relatedTarget: { closest: selector => selector === '#buildingUpgrade' ? panel : null } });
    assert.equal(panel.hidden, false);
    game.document.getElementById('upgradeBuildingButton').onclick();
    assert.equal(game.run('tile.object.hp'), 25);
    assert.equal(game.run('tileViews[tile.id].healthBar'), null);
    panel.onpointerleave({ pointerType: 'mouse', relatedTarget: null });
    assert.equal(panel.hidden, true);
    assert.equal(tile.classList.contains('game-tile--inspected'), false);
});

test('tryb usuwania zwraca ćwierć faktycznej ceny i nie zbiera złóż', () => {
    const game = createGame();
    game.start();
    game.run(`const plot = gameState.tiles.find(tile => !tile.object);
        const deposit = gameState.tiles.find(tile => tile.object?.type === 'stone');
        gameState.woodCount = shopItems.cannon.wood;
        gameState.stoneCount = shopItems.cannon.stone;
        handlePlayerAction({ type: 'place', item: 'cannon', tileId: plot.id });`);
    const button = game.document.getElementById('removeBuildingButton');
    button.onclick();
    game.run('handleGridClick({ target: { closest: () => tileViews[deposit.id].element } });');
    assert.equal(game.run('deposit.object.type'), 'stone');
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    game.run('handleGridClick({ target: { closest: () => tileViews[plot.id].element } });');
    assert.equal(game.run('plot.object'), null);
    assert.equal(game.run('gameState.woodCount'), 25);
    assert.equal(game.run('gameState.stoneCount'), 50);
    assert.equal(button.getAttribute('aria-pressed'), 'false');
});

test('pauza i ukrycie karty zatrzymują czas i fazę timerów', () => {
    const game = createGame();
    game.start();
    game.advance(450);
    game.run('togglePause();');
    const score = game.summary();
    game.advance(30000);
    assert.deepEqual(game.summary(), score);
    assert.equal(game.frames.size, 0);
    game.run('togglePause();');
    game.advance(500);
    assert.equal(game.run('gameState.prepTime'), 120);
    game.advance(60);
    assert.equal(game.run('gameState.prepTime'), 119);
    game.hide();
    const hiddenScore = game.summary();
    game.advance(60000);
    assert.deepEqual(game.summary(), hiddenScore);
    game.show();
    assert.equal(game.run('gameState.gamePaused'), true, 'Powrót wymaga świadomego wznowienia');
});

test('100 cykli pauzy nie zmienia identyfikatora i nie tworzy kolejnych pętli', () => {
    const game = createGame();
    game.start();
    const runId = game.summary().runId;
    for (let i = 0; i < 100; i++) {
        game.run('togglePause();');
        assert.equal(game.frames.size, 0);
        game.advance(1000);
        game.run('togglePause();');
        assert.equal(game.frames.size, 1);
    }
    assert.equal(game.summary().runId, runId);
    assert.equal(game.summary().totalScore, 0);
    assert.equal(game.run('gameTimers.size'), 4);
});

test('wzrost drzewa i cooldown armaty zachowują czas po pauzie', () => {
    const game = createGame();
    game.start();
    game.run(`
        const tile = gameState.tiles.find(tile => !isTileOccupied(tile));
        gameState.seedCount = shopItems.seedling.seeds;
        placeItem(tile.id, 'seedling');
    `);
    game.advance(7000);
    game.run('setGamePaused(true);');
    game.advance(60000);
    game.run('setGamePaused(false);');
    game.advance(7990);
    assert.equal(game.run('tile.object.type'), 'seedling');
    game.advance(30);
    assert.equal(game.run('tile.object.type'), 'tree');
    assert.equal(game.summary().itemsCrafted, 1);
    game.run(`
        tile.object = null;
        gameState.woodCount = shopItems.cannon.wood; gameState.stoneCount = shopItems.cannon.stone;
        placeItem(tile.id, 'cannon');
        gameState.isInvasionActive = true;
        const index = tile.id;
        spawnEnemy(Math.floor(index / GAME_CONFIG.columns), 'normal');
        updateCannons();
    `);
    assert.equal(game.run('gameState.activeProjectiles.length'), 1);
    game.advance(450);
    const lastShot = game.run('tile.object.lastShot');
    game.run('setGamePaused(true);');
    game.advance(30000);
    game.run('setGamePaused(false); updateCannons();');
    assert.equal(game.run('tile.object.lastShot'), lastShot);
});

test('generowanie całej fali i przejście poziomu nie dodaje RAF ani timerów', () => {
    const game = createGame();
    game.start();
    game.run('handleInvasionStart();');
    for (let i = 0; i < 5; i++) {
        game.advance(2810);
        game.run('for (const enemy of [...gameState.activeEnemies]) damageEnemy(enemy, 100); renderGameState();');
    }
    assert.equal(game.summary().enemiesDefeated, 5);
    assert.equal(game.run('gameState.level'), 2);
    assert.equal(game.run('gameTimers.size'), 4);
    assert.equal(game.frames.size, 1);
    game.run('handleInvasionStart();');
    assert.equal(game.frames.size, 1);
});

test('zasoby i wzrost nie usuwają elementów przeciwników', () => {
    const game = createGame();
    game.start();
    game.run(`
        gameState.isInvasionActive = true; spawnEnemy(0, 'normal');
        const enemy = gameState.activeEnemies[0];
        const tile = gameState.tiles[9];
        tile.object = createBoardObject('grass', { size: 1, hp: 0 });
        renderGameState();
        const enemyElement = enemyViews.get(enemy.id);
        handleGridClick({ target: { closest: () => tileViews[tile.id].element } });
    `);
    assert.equal(game.run('enemyElement.parentElement === tileViews[tile.id].element'), true);
    assert.equal(game.run('isTileOccupied(tile)'), true);
    assert.equal(game.run('isTileOccupied(tile, false)'), false);
    game.run(`
        tile.object = createBoardObject('seedling', { hp: 2 }); growToTree(tile); renderGameState();
    `);
    assert.equal(game.run('enemyElement.parentElement === tileViews[tile.id].element'), true);
});

test('zajętość pola śledzi przeciwnika, a nie jego pierwotnego rodzica DOM', () => {
    const game = createGame();
    game.start();
    game.run(`
        gameState.tiles.forEach(tile => { tile.object = null; });
        gameState.isInvasionActive = true; spawnEnemy(0, 'normal');
        const enemy = gameState.activeEnemies[0];
        enemy.offsetX = 300;
        updateGameLoop(1 / 60);
        const tiles = gameState.tiles;
    `);
    assert.equal(game.run('isTileOccupied(tiles[enemy.currentCol])'), true);
    assert.equal(game.run('isTileOccupied(tiles[9])'), false);
});

test('atak traci timer po śmierci i zachowuje fazę po pauzie', () => {
    const game = createGame();
    game.start();
    game.run(`
        const tile = gameState.tiles[9];
        tile.object = null;
        tile.object = createBoardObject('woodFence', { hp: 8 });
        gameState.isInvasionActive = true; gameState.totalEnemiesInWave = 2;
        spawnEnemy(0, 'normal'); updateGameLoop(1 / 60);
        const enemy = gameState.activeEnemies[0];
    `);
    game.advance(600);
    game.run('setGamePaused(true);');
    game.advance(20000);
    game.run('setGamePaused(false);');
    game.advance(550);
    assert.equal(game.run('tile.object.hp'), 8);
    game.advance(100);
    assert.equal(game.run('tile.object.hp'), 7);
    game.run('damageEnemy(enemy, 100); renderGameState();');
    assert.equal(game.run('gameTimers.has(enemy.attackTimer)'), false);
});

test('pociski pokonują ten sam dystans przy 30, 60 i 144 FPS', () => {
    for (const fps of [30, 60, 144]) {
        const game = createGame();
        game.start();
        game.run(`
            gameState.isInvasionActive = true;
            const tile = gameState.tiles[0];
            fireCannon(tile);
        `);
        for (let i = 0; i < fps; i++) game.run(`updateProjectiles(${1 / fps});`);
        assert.ok(Math.abs(game.run('gameState.activeProjectiles[0].xOffset') - 240) < 0.00001);
    }
});

test('ostatnie trafienie czyści wszystkie pociski bez błędu pętli', () => {
    const game = createGame();
    game.start();
    game.run(`
        gameState.isInvasionActive = true; gameState.totalEnemiesInWave = 1;
        spawnEnemy(0, 'normal');
        gameState.activeEnemies[0].hp = 1;
        const tile = gameState.tiles[9];
        fireCannon(tile); fireCannon(tile);
        updateProjectiles(1 / 60);
    `);
    assert.equal(game.run('gameState.level'), 2);
    assert.equal(game.run('gameState.activeProjectiles.length'), 0);
    assert.equal(game.document.querySelectorAll('.cannonball').length, 0);
});

test('zakończenie usuwa timery, blokuje punkty i wznowienie; nowa instancja resetuje statystyki', () => {
    for (const ending of ['gameOver', 'gameWin']) {
        const game = createGame();
        game.start();
        game.advance(1234);
        game.run(`${ending}(); renderGameState(); togglePause();`);
        const result = game.summary();
        game.advance(60000);
        assert.deepEqual(game.summary(), result);
        assert.equal(game.frames.size, 0);
        assert.equal(game.run('gameTimers.size'), 0);
        assert.equal(createGame().summary().totalScore, 0);
    }
});

test('godzina przygotowania utrzymuje stałą liczbę timerów i pętli', () => {
    const game = createGame();
    game.start();
    game.run('gameState.prepTime = 100000;');
    game.advance(3600000, 10);
    assert.equal(game.summary().totalScore, 3600);
    assert.equal(game.frames.size, 1);
    assert.equal(game.run('gameTimers.size'), 4);
    assert.equal(game.document.querySelectorAll('.game-tile').length, 50);
});

test('70 przeciwników, 50 armat i wiele pocisków: sprzątanie po końcu gry', () => {
    const game = createGame();
    game.start();
    game.run(`
        const tiles = gameState.tiles;
        tiles.forEach(tile => {
            tile.object = createBoardObject('cannon', { hp: 10, lastShot: -1000 });
        });
        gameState.isInvasionActive = true; gameState.totalEnemiesInWave = 70;
        for (let i = 0; i < 70; i++) {
            spawnEnemy(i % GAME_CONFIG.rows, i % 3 === 0 ? 'boss' : 'normal');
            gameState.activeEnemies.at(-1).hp = 1000000;
        }
    `);
    game.advance(5000);
    assert.equal(game.run('gameState.activeEnemies.length'), 70);
    assert.ok(game.run('gameState.activeProjectiles.length') < 300);
    assert.equal(game.frames.size, 1);
    game.run('gameOver(); renderGameState();');
    assert.equal(game.run('gameTimers.size'), 0);
    assert.equal(game.document.querySelectorAll('.cannonball').length, 0);
    assert.equal(game.frames.size, 0);
});

test('dotarcie przeciwnika do domu kończy grę i pozwala zapisać porażkę', async () => {
    const game = createGame();
    game.start();
    game.run(`
        gameState.tiles.forEach(tile => { tile.object = null; });
        gameState.isInvasionActive = true; gameState.totalEnemiesInWave = 1;
        spawnEnemy(0, 'normal');
    `);
    game.advance(35000, 10);
    assert.equal(game.summary().status, 'lost');
    const form = game.document.getElementById('endScreen').querySelector('form');
    form.querySelector('input').value = 'Porażka';
    await form.onsubmit({ preventDefault() {} });
    assert.equal((await game.run('rankingRepository.getHistory()'))[0].status, 'lost');
});

test('wszystkie 10 fal zachowuje zwykłych bossów i dodaje rosnącą liczbę Masterów', () => {
    const game = createGame();
    game.start();
    for (let level = 1; level <= 10; level++) {
        game.run('handleInvasionStart();');
        const queue = JSON.parse(game.run("JSON.stringify([...gameTimers.values()].find(task => task.type === 'wave').data.queue)"));
        assert.equal(queue.filter(type => type === 'boss').length, game.run('GAME_CONFIG.waves[gameState.level].boss'));
        assert.equal(queue.filter(type => type === 'master').length, Math.max(0, level - 3));
        const count = game.run('gameState.totalEnemiesInWave');
        const interval = Math.max(500, 3000 - level * 200);
        for (let i = 0; i < count; i++) {
            game.advance(interval + 1, 10);
            game.run('for (const enemy of [...gameState.activeEnemies]) damageEnemy(enemy, 100); renderGameState();');
        }
    }
    const summary = game.summary();
    assert.equal(summary.status, 'won');
    assert.equal(summary.enemiesByType.normal, 275);
    assert.equal(summary.enemiesByType.boss, 91);
    assert.equal(summary.points.enemies, 8685);
    assert.equal(game.run('gameTimers.size'), 0);
    assert.equal(game.frames.size, 0);
});

test('geometria logiczna: kontakt zależy od szerokości pola, a strzał od rozmiaru celu', () => {
    const game = createGame();
    game.start();
    game.run(`
        gameState.tiles.forEach(tile => { tile.object = null; });
        gameState.isInvasionActive = true;
        spawnEnemy(0, 'normal');
        const enemy = gameState.activeEnemies[0];
        enemy.offsetX = 49;
        updateGameLoop(0);
    `);
    assert.equal(game.run('enemy.currentCol'), 9);
    game.run('enemy.offsetX = 50; updateGameLoop(0);');
    assert.equal(game.run('enemy.currentCol'), 8);
    game.run(`
        enemy.offsetX = 0; enemy.currentCol = 9;
        fireCannon(gameState.tiles[8]);
        updateProjectiles(32 / 240);
    `);
    assert.equal(game.run('enemy.hp'), 10);
    game.run('updateProjectiles(2 / 240);');
    assert.equal(game.run('enemy.hp'), 7);
});
