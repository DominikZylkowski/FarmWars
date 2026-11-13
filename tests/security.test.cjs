const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function repository(storage = new Map(), locks) {
    const context = vm.createContext({
        window: { localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value)
        } },
        navigator: locks ? { locks } : {},
        performance: { now: () => 0 },
        crypto: require('node:crypto').webcrypto
    });
    for (const file of ['config.js', 'score.js', 'ranking.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
    }
    const run = code => vm.runInContext(code, context);
    run(`startScore(); finishScore('lost');`);
    return { run, context, storage };
}

test('nicki: typ, długość Unicode, znaki sterujące i tekst przypominający HTML', () => {
    const { run } = repository();
    for (const expression of ['null', '123', '{}', '"ab"', '"x".repeat(21)', '"abc\\nxyz"', '"abc\\u202exyz"']) {
        assert.throws(() => run(`validateNickname(${expression})`));
    }
    assert.equal(run(`validateNickname('  Żółwik  ')`), 'Żółwik');
    assert.equal(run(`validateNickname('🌱'.repeat(20))`).length, 40);
    assert.equal(run(`validateNickname('<img src=x>')`), '<img src=x>');
});

test('walidacja nowego wyniku odrzuca niespójne dane i klucze prototypu', async () => {
    const { run } = repository();
    for (const mutation of [
        'summary.totalScore = 99', 'summary.totalScore = Infinity',
        'summary.itemsCrafted = -1', 'summary.activeTimeSeconds = NaN',
        'summary.itemsCrafted = 1', 'summary.points.time = 5',
        'summary.rulesetId = "unknown"', 'summary.runId = {}',
        'summary.status = "active"', 'summary.finishedAt = "2026-02-31"',
        'summary.itemsByType = JSON.parse(\'{"__proto__":1}\')',
        'summary.enemiesByType = { constructor: 1 }',
        'summary.itemsByType = new Date()',
        'summary.points = Object.assign(Object.create({time: 0, items: 0, enemies: 0, resources: 0}), {a: 0, b: 0, c: 0, d: 0})',
        'summary.points.extra = 0'
    ]) {
        run(`var summary = getScoreSummary(); ${mutation};`);
        await assert.rejects(run(`rankingRepository.saveResult('Test', summary)`));
    }
    assert.equal((await run('rankingRepository.getHistory()')).length, 0);
});

test('historia sprzed wersjonowania reguł i nowych stawek pozostaje niezmieniona', async () => {
    const storage = new Map();
    const historical = { version: 1, players: [{ playerId: 'player-old', nickname: 'Stary' }],
        results: [{ playerId: 'player-old', nickname: 'Stary', runId: 'run-old', totalScore: 75,
            status: 'lost', finishedAt: '2026-01-01T00:00:00.000Z', points: { enemies: 75 },
            enemiesByType: { boss: 1 } }], lastPlayerId: 'player-old' };
    const original = JSON.stringify(historical);
    storage.set('farmwarsRankingV1', original);
    const { run } = repository(storage);
    assert.equal((await run('rankingRepository.getHistory()'))[0].totalScore, 75);
    assert.equal(storage.get('farmwarsRankingV1'), original);
    await run(`rankingRepository.saveResult('Nowy', getScoreSummary())`);
    assert.deepEqual(JSON.parse(storage.get('farmwarsRankingV1')).results[0], historical.results[0]);
});

test('uszkodzone dane nie są nadpisywane ani usuwane', async () => {
    const originals = ['{broken', 'null', '{}', JSON.stringify({ version: 1, players: [null], results: [] }),
        JSON.stringify({ version: 1, players: [], results: [{ runId: 'missing-player' }] })];
    for (const original of originals) {
        const storage = new Map([['farmwarsRankingV1', original]]);
        const { run } = repository(storage);
        await assert.rejects(run(`rankingRepository.saveResult('Test', getScoreSummary())`));
        assert.equal(storage.get('farmwarsRankingV1'), original);
    }
});

test('równoległe zapisy i Web Locks: jedna partia zostaje zapisana raz', async () => {
    const storage = new Map();
    let queue = Promise.resolve();
    let lockCalls = 0;
    const locks = { request(name, callback) {
        lockCalls++;
        const pending = queue.then(callback);
        queue = pending.catch(() => {});
        return pending;
    } };
    const first = repository(storage, locks);
    const second = repository(storage, locks);
    second.context.summary = JSON.parse(first.run('JSON.stringify(getScoreSummary())'));
    const results = await Promise.allSettled([
        first.run(`rankingRepository.saveResult('Test', getScoreSummary())`),
        second.run(`rankingRepository.saveResult('Test', summary)`)
    ]);
    assert.equal(lockCalls, 2);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await first.run('rankingRepository.getHistory()')).length, 1);
});

test('kopiowanie danych przed kolejką zapisu i reset identyfikatora partii', async () => {
    const { run } = repository();
    const pending = run(`var summary = getScoreSummary(); var pending = rankingRepository.saveResult('Test', summary); summary.totalScore = 999; pending;`);
    assert.equal((await pending).totalScore, 0);
    const firstId = run('scoreState.runId');
    run('startScore();');
    assert.notEqual(run('scoreState.runId'), firstId);
    const activeId = run('scoreState.runId');
    run('startScore();');
    assert.equal(run('scoreState.runId'), activeId, 'Powtórna inicjalizacja nie resetuje aktywnej partii');
});

test('brak dostępu do Web Locks nie blokuje lokalnego zapisu', async () => {
    const locks = { request() { const error = new Error('Brak dostępu'); error.name = 'SecurityError'; return Promise.reject(error); } };
    const { run } = repository(new Map(), locks);
    await run(`rankingRepository.saveResult('Test', getScoreSummary())`);
    assert.equal((await run('rankingRepository.getHistory()')).length, 1);
});

test('nieprawidłowe zdarzenia Score i status nie psują stanu', () => {
    const { run } = repository();
    run(`startScore(); gameState.gamePaused = false;
        awardScoreForEvent('unknown', 'tree', {});
        awardScoreForEvent('items', '__proto__', {});
        awardScoreForEvent('items', 'cannon', 0);
        finishScore('unknown');`);
    assert.equal(run('scoreState.totalScore'), 0);
    assert.equal(run('scoreState.status'), 'active');
});
