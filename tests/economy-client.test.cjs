const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createGame } = require('./game-harness.cjs');

function createClient(handler) {
    const context = vm.createContext({ URL, URLSearchParams, AbortSignal, window: {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/economy_client.js'), 'utf8'), context);
    return vm.runInContext('createEconomyClient', context)(new URL('http://localhost/farmwars/api/v1/'), handler);
}

function response(data, status = 200) {
    return { status, ok: status < 400, json: async () => status < 400 ? { ok: true, data } : { ok: false, error: data } };
}

test('utrata odpowiedzi: retry zachowuje komendę, zasoby zmienia dopiero stan potwierdzony przez GET', async () => {
    const initial = { runId: 'abc', revision: 1, resources: { seeds: 0 }, tiles: [{ id: 'tile_0_0' }] };
    let current = initial;
    const sent = [];
    const client = createClient(async (url, options) => {
        if (url.pathname.endsWith('/session')) return response({ csrf: 'token' });
        if (url.pathname.endsWith('/state')) return response(current);
        assert.equal(options.headers['X-CSRF-Token'], 'token');
        sent.push(JSON.parse(options.body));
        if (sent.length === 1) {
            current = { ...initial, revision: 3, resources: { seeds: 2 } };
            throw new Error('lost acknowledgement');
        }
        return response({ previousRevision: 1, revision: 2, changes: { resources: { seeds: 1 }, tiles: [] } });
    });
    await client.open({ runId: 'abc' });
    await assert.rejects(client.command('collect', { tileId: 'tile_0_0' }, 'command-1'), /Brak odpowiedzi/);
    assert.equal(client.state.resources.seeds, 0);
    assert.equal(client.pending, true);
    assert.equal(client.command('pause', {}, 'command-2'), undefined);
    await client.retry();
    assert.deepEqual(sent[1], sent[0]);
    assert.equal(client.state.revision, 3);
    assert.equal(client.state.resources.seeds, 2);
});

test('konflikt odświeża stan, serializuje transport i nie ponawia komendy na nowej rewizji', async () => {
    let revision = 0;
    let finish;
    let attempts = 0;
    const client = createClient(async url => {
        if (url.pathname.endsWith('/session')) return response({ csrf: 'token' });
        if (url.pathname.endsWith('/runs')) return response({ runId: 'abc' }, 201);
        if (url.pathname.endsWith('/state')) return response({ runId: 'abc', revision, tiles: [] });
        attempts++;
        return new Promise(resolve => { finish = resolve; });
    });
    const pointer = { requestId: 'new' };
    await client.open(pointer);
    assert.equal(pointer.runId, 'abc');
    const command = client.command('resume', {}, 'command-1');
    await client.refresh();
    await client.command('pause', {}, 'command-2');
    revision = 3;
    finish(response({ code: 'REVISION_CONFLICT', message: 'Konflikt.' }, 409));
    await assert.rejects(command, error => error.code === 'REVISION_CONFLICT');
    assert.equal(client.state.revision, 3);
    assert.equal(client.pending, false);
    assert.equal(attempts, 1);
});

test('projekcja kontraktu v1 odwzorowuje współrzędne, ID, kosztorys i harmonogram wzrostu', () => {
    const game = createGame();
    game.run(`projectEconomyState({
        resources: { seeds: 5, stones: 8, wood: 21 }, gameSpeed: 1.5, paused: false,
        preparationMs: 120000, simulationMs: 30450,
        tiles: [
            { id: 'tile_0_1', row: 0, column: 1, resource: { id: 51, kind: 'stone', size: 2 }, object: null },
            { id: 'tile_2_4', row: 2, column: 4, resource: null,
              object: { id: 52, kind: 'seedling', hp: 2, growthAtMs: 45450 } }
        ]
    });`);
    assert.equal(game.run('gameState.stoneCount'), 8);
    assert.equal(game.run('gameState.prepTime'), 90);
    assert.equal(game.run('economyTileId(24)'), 'tile_2_4');
    assert.deepEqual(JSON.parse(game.run('JSON.stringify(gameState.tiles[1].object)')),
        { id: 51, type: 'stone', size: 2, hp: 0 });
    assert.deepEqual(JSON.parse(game.run('JSON.stringify(gameState.tiles[24].object)')),
        { id: 52, type: 'seedling', hp: 2, growthAt: 45450 });
});

test('tryb podglądu korzysta z widoku gry bez uruchamiania lokalnego zegara', async () => {
    const tiles = Array.from({ length: 50 }, (_, index) => ({
        id: `tile_${Math.floor(index / 10)}_${index % 10}`, row: Math.floor(index / 10), column: index % 10,
        resource: index === 0 ? { id: 1, kind: 'grass', size: 2 } : null, object: null
    }));
    const state = { runId: 'abc', revision: 0, phase: 'preparation', paused: true,
        gameSpeed: 1, simulationMs: 0, preparationMs: 120000, resources: { seeds: 0, stones: 0, wood: 0 }, tiles };
    let confirmCollect;
    const game = createGame({}, {
        location: new URL('http://localhost/farmwars/?mode=economy'),
        fetch: async (url, options) => {
            if (url.pathname.endsWith('/session')) return response({ csrf: 'token' });
            if (url.pathname.endsWith('/runs')) return response({ runId: 'abc' }, 201);
            if (url.pathname.endsWith('/state')) return response(state);
            const command = JSON.parse(options.body);
            if (command.type === 'resume') {
                assert.equal(command.expectedRevision, 0);
                return response({ previousRevision: 0, revision: 1, changes: { paused: false, tiles: [] } });
            }
            assert.equal(command.type, 'collect');
            assert.equal(command.expectedRevision, 1);
            return new Promise(resolve => { confirmCollect = resolve; });
        }
    });
    await new Promise(setImmediate);
    assert.equal(game.run('gameState.tiles[0].object.type'), 'grass');
    assert.equal(game.run('gameTimers.size'), 0);
    await game.document.getElementById('startGameButton').onclick();
    assert.equal(game.frames.size, 0);
    game.run(`handleGridClick({ target: { closest: () => tileViews[0].element } });`);
    assert.equal(game.run('gameState.seedCount'), 0);
    confirmCollect(response({ previousRevision: 1, revision: 2, changes: {
        resources: { seeds: 2, stones: 0, wood: 0 }, tiles: [{ ...tiles[0], resource: null }]
    } }));
    await new Promise(setImmediate);
    assert.equal(game.run('gameState.seedCount'), 2);
    assert.equal(game.run('gameState.tiles[0].object'), null);
});

test('serwerowy zestaw reguł odpowiada obecnym kosztom, szybkościom, HP i zegarowi ekonomii', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../database/003-economy.sql'), 'utf8');
    const rules = JSON.parse(sql.match(/\n    '(\{[\s\S]*?\})'\n\)/)[1]);
    const game = createGame();
    const config = JSON.parse(game.run('JSON.stringify(GAME_CONFIG)'));
    const shop = JSON.parse(game.run('JSON.stringify(shopItems)'));
    for (const price of Object.values(shop)) {
        if ('stone' in price) {
            price.stones = price.stone;
            delete price.stone;
        }
    }
    assert.deepEqual(rules.shop, shop);
    assert.deepEqual(rules.speeds, config.gameSpeeds);
    assert.equal(rules.growthMs, config.treeGrowthTime);
    assert.equal(rules.grassInterval, config.spawnIntervals.grass);
    assert.equal(rules.stoneInterval, config.spawnIntervals.stone);
    for (const item of ['cannon', 'tree', 'woodFence', 'stoneWall']) {
        assert.equal(rules.hp[item], config.hpValues[item]);
    }
    assert.equal(rules.hp.seedling, 2);
});

test('pełna gra online wyświetla serwerową walkę, kolejkuje trafienia i pokazuje zapisany wynik', async () => {
    const tiles = Array.from({ length: 50 }, (_, index) => ({
        id: `tile_${Math.floor(index / 10)}_${index % 10}`, row: Math.floor(index / 10), column: index % 10,
        resource: null, object: null
    }));
    const enemy = { id: 11, type: 'normal', hp: 10, maxHp: 10, row: 0, currentCol: 9, offsetX: 4 };
    const state = { runId: 'abc', revision: 1, mode: 'online', phase: 'combat', paused: false,
        gameSpeed: 3, simulationMs: 123000, preparationMs: 120000, preparationRemainingMs: 0,
        resources: { seeds: 0, stones: 0, wood: 0 }, tiles, enemies: [enemy], projectiles: [],
        level: 1, defeated: 0, waveTotal: 5, score: { totalScore: 41 }, summary: null };
    const sent = [];
    let firstHit;
    const game = createGame({ farmwarsTutorialCompleted: '1' }, {
        location: new URL('http://localhost/farmwars/?mode=online'),
        fetch: async (url, options) => {
            if (url.pathname.endsWith('/session')) return response({ csrf: 'token' });
            if (url.pathname.endsWith('/runs')) {
                assert.equal(JSON.parse(options.body).mode, 'online');
                return response({ runId: 'abc' }, 201);
            }
            if (url.pathname.endsWith('/state')) return response(state);
            const body = JSON.parse(options.body);
            sent.push(body);
            if (sent.length === 1) return new Promise(resolve => { firstHit = resolve; });
            return response({ previousRevision: 2, revision: 3, changes: {
                phase: 'lost', paused: true, summary: { status: 'lost' }, score: { totalScore: 50 }, tiles: []
            } });
        }
    });
    await new Promise(setImmediate);
    assert.equal(game.run('gameState.isInvasionActive'), true);
    assert.equal(game.run('gameState.gameSpeed'), 3);
    assert.equal(game.frames.size, 0);
    game.run("handlePlayerAction({ type: 'hit', enemyId: 11 }); handlePlayerAction({ type: 'hit', enemyId: 11 });");
    assert.equal(sent.length, 1);
    assert.equal(game.run('gameState.activeEnemies[0].hp'), 10);
    firstHit(response({ previousRevision: 1, revision: 2, changes: {
        tiles: [], enemies: [{ ...enemy, hp: 8 }]
    } }));
    await new Promise(setImmediate);
    assert.deepEqual(sent.map(body => [body.expectedRevision, body.type, body.payload]),
        [[1, 'hit_enemy', { enemyId: 11 }], [2, 'hit_enemy', { enemyId: 11 }]]);
    assert.equal(game.run('gameState.activeEnemies[0].hp'), 8);
    assert.equal(game.run('scoreState.totalScore'), 50);
    const end = game.document.getElementById('endScreen');
    assert.ok(end);
    assert.equal(end.querySelector('form'), null);
});
