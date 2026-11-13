const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/ranking.js'), 'utf8');

function createAdapter(href, fetch) {
    const context = vm.createContext({ window: { location: new URL(href) }, URL, URLSearchParams, AbortSignal, fetch });
    vm.runInContext(source, context);
    return vm.runInContext('rankingRepository', context);
}

test('adapter HTTP rejestruje partię raz i odczytuje wszystkie strony prywatnej historii', async () => {
    const calls = [];
    const ranking = createAdapter('http://localhost/farmwars/', async (url, options) => {
        const action = url.searchParams.get('action');
        calls.push(action);
        assert.equal(url.pathname, '/farmwars/api/index.php');
        assert.equal(options.credentials, 'same-origin');
        if (action === 'session') return { ok: true, json: async () => ({ csrf: 'token' }) };
        if (action === 'start') {
            assert.equal(options.headers['X-CSRF-Token'], 'token');
            assert.deepEqual(JSON.parse(options.body), { clientRunId: 'client' });
            return { ok: true, json: async () => ({ runId: 'server' }) };
        }
        const offset = Number(url.searchParams.get('offset'));
        return { ok: true, json: async () => ({ results: [offset], nextOffset: offset ? null : 100 }) };
    });
    const start = ranking.startRun('client');
    assert.equal(ranking.startRun('client'), start);
    assert.equal((await start).runId, 'server');
    assert.deepEqual(Array.from(await ranking.getHistory()), [0, 100]);
    assert.deepEqual(calls, ['session', 'start', 'history', 'history']);
});

test('adapter ponawia połączenie po awarii i pomija API w trybie lokalnym', async () => {
    let attempts = 0;
    const ranking = createAdapter('http://localhost/farmwars/', async url => {
        if (++attempts === 1) throw new Error('offline');
        return { ok: true, json: async () => url.searchParams.get('action') === 'session'
            ? { csrf: 'token' } : { runId: 'server' } };
    });
    await assert.rejects(ranking.startRun('client'), /Zapis online jest niedostępny/);
    assert.equal((await ranking.startRun('client')).runId, 'server');
    for (const url of ['http://localhost/farmwars/?mode=local', 'file:///farmwars/index.html']) {
        const local = createAdapter(url, () => assert.fail('Tryb lokalny wywołał API'));
        assert.equal(local.startRun('client'), undefined);
    }
});
