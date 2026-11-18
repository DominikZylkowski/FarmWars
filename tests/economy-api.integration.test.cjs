const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const endpoint = process.env.FARMWARS_TEST_URL;
const secondEndpoint = process.env.FARMWARS_TEST_SECOND_URL || endpoint;
const failureEndpoint = process.env.FARMWARS_TEST_FAILURE_URL;
const prettyEndpoint = process.env.FARMWARS_TEST_PRETTY_URL;

async function call(path, options = {}) {
    const useRewrite = prettyEndpoint && !options.endpoint;
    const url = useRewrite ? new URL(path, prettyEndpoint) : new URL(options.endpoint || endpoint);
    if (!useRewrite) url.searchParams.set('v1', path);
    const response = await fetch(url, {
        method: options.body === undefined ? 'GET' : 'POST',
        headers: {
            ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(options.cookie ? { Cookie: options.cookie } : {}),
            ...(options.csrf ? { 'X-CSRF-Token': options.csrf } : {})
        },
        body: options.body === undefined ? undefined : options.raw ? options.body : JSON.stringify(options.body)
    });
    assert.match(response.headers.get('content-type'), /^application\/json; charset=utf-8$/i);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const envelope = await response.json();
    assert.equal(envelope.ok, response.ok);
    if (response.ok) assert.ok(envelope.data && !envelope.error);
    else assert.equal(typeof envelope.error.message, 'string');
    return { status: response.status, envelope, response };
}

async function guest() {
    const { status, envelope, response } = await call('session', { body: {} });
    assert.equal(status, 200);
    const cookies = response.headers.getSetCookie();
    const session = cookies.filter(cookie => cookie.startsWith('FarmWarsSession=')).at(-1);
    assert.ok(session);
    if (prettyEndpoint) {
        const cookiePath = session.split(';').map(part => part.trim()).find(part => /^path=/i.test(part));
        assert.equal(cookiePath?.slice(5), new URL('../..', prettyEndpoint).pathname);
    }
    return { cookie: session.split(';')[0], csrf: envelope.data.csrf };
}

function assertError(response, status, code) {
    assert.equal(response.status, status, JSON.stringify(response.envelope));
    assert.equal(response.envelope.error.code, code);
}

function command(expectedRevision, type, payload = {}) {
    return { commandId: randomUUID(), expectedRevision, type, payload };
}

test('kontrakt v1: sesja, prywatność, start, pełny stan, komendy, rewizje i odzyskanie po retry', { skip: !endpoint }, async () => {
    assertError(await call('runs', { body: { requestId: randomUUID() } }), 401, 'UNAUTHENTICATED');
    assertError(await call('session', { body: '{', raw: true }), 400, 'BAD_REQUEST');
    assertError(await call('session', { body: ' '.repeat(4097), raw: true }), 413, 'BAD_REQUEST');
    const owner = await guest();
    const stranger = await guest();
    const startBody = { requestId: randomUUID() };
    assertError(await call('runs', { cookie: owner.cookie, body: startBody }), 403, 'INVALID_CSRF');
    assertError(await call('runs', { ...owner, body: { ...startBody, resources: {} } }), 400, 'BAD_REQUEST');
    const created = await call('runs', { ...owner, body: startBody });
    assert.equal(created.status, 201);
    const { runId, mode, revision, rulesetId, state } = created.envelope.data;
    assert.equal(mode, 'economy_preview');
    assert.equal(rulesetId, 'farmwars-economy-1');
    assert.equal(revision, 0);
    assert.equal(state.paused, true);
    assert.deepEqual(state.resources, { seeds: 0, stones: 0, wood: 0 });
    assert.equal(state.tiles.length, 50);
    assert.equal(state.tiles.filter(tile => tile.resource?.kind === 'grass').length, 6);
    assert.equal(state.tiles.filter(tile => tile.resource?.kind === 'stone').length, 4);
    assert.match(state.serverTime, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    const statePath = `runs/${runId}/state`;
    const commandsPath = `runs/${runId}/commands`;
    const submit = (body, options) => call(commandsPath, { ...owner, ...options, body });
    const grass = state.tiles.find(tile => tile.resource?.kind === 'grass');
    const free = state.tiles.find(tile => !tile.resource);
    assertError(await call(statePath, stranger), 404, 'RUN_NOT_FOUND');
    assertError(await call(commandsPath, { ...stranger, body: command(0, 'resume') }), 404, 'RUN_NOT_FOUND');
    assertError(await submit(command(0, 'resume'), { csrf: 'wrong' }), 403, 'INVALID_CSRF');
    assertError(await submit(command(0, 'finish_wave')), 422, 'INVALID_ACTION');
    assertError(await submit(command(0, 'collect', { tileId: grass.id, amount: 500 })), 400, 'BAD_REQUEST');
    assertError(await submit(command(0, 'collect', { tileId: grass.id })), 422, 'INVALID_ACTION');
    assertError(await submit(command(0, 'set_speed', { speed: 9 })), 422, 'INVALID_ACTION');
    const resume = await submit(command(0, 'resume'));
    assert.equal(resume.envelope.data.revision, 1);
    assert.equal(resume.envelope.data.changes.paused, false);
    assertError(await submit(command(1, 'place', { tileId: free.id, itemType: 'cannon' })), 409, 'INSUFFICIENT_RESOURCES');
    assertError(await submit(command(1, 'place', { tileId: grass.id, itemType: 'seedling' })), 409, 'TILE_OCCUPIED');
    const collect = command(1, 'collect', { tileId: grass.id });
    const first = await submit(collect);
    assert.equal(first.status, 200);
    const data = first.envelope.data;
    assert.deepEqual([data.previousRevision, data.revision, data.applied], [1, 2, true]);
    assert.equal(data.commandId, collect.commandId);
    assert.equal(data.changes.resources.seeds, grass.resource.size);
    assert.deepEqual(data.changes.tiles, [{ ...grass, resource: null }]);
    const place = await submit(command(2, 'place', { tileId: free.id, itemType: 'seedling' }));
    assert.equal(place.status, 200);
    const planted = place.envelope.data.changes.tiles[0].object;
    assert.equal(planted.kind, 'seedling');
    assert.equal(planted.hp, 2);
    assert.ok(planted.growthAtMs >= 15000);
    assert.notEqual(planted.id, grass.resource.id);
    assert.deepEqual((await submit(collect)).envelope, first.envelope);
    assertError(await submit({ ...collect, expectedRevision: 3 }), 409, 'IDEMPOTENCY_CONFLICT');
    const stale = await submit(command(2, 'pause'));
    assertError(stale, 409, 'REVISION_CONFLICT');
    assert.equal(stale.envelope.data.currentRevision, 3);
    assert.deepEqual((await call('runs', { ...owner, body: startBody })).envelope, created.envelope);

    const [left, right] = await Promise.all([
        submit(command(3, 'pause')),
        submit(command(3, 'set_speed', { speed: 1.5 }), { endpoint: secondEndpoint })
    ]);
    assert.deepEqual([left.status, right.status].sort(), [200, 409]);
    const latest = (await call(statePath, owner)).envelope.data;
    assert.equal(latest.revision, 4);
    assert.equal(latest.resources.seeds, grass.resource.size - 1);
    assert.deepEqual(latest.tiles.find(tile => tile.id === free.id).object, planted);
});

test('kontrakt v1: limit tworzenia partii zwraca 429 i Retry-After', { skip: !endpoint }, async () => {
    const owner = await guest();
    const body = { requestId: randomUUID() };
    for (let i = 0; i < 10; i++) {
        assert.equal((await call('runs', { ...owner, body })).status, 201);
    }
    const limited = await call('runs', { ...owner, body });
    assertError(limited, 429, 'RATE_LIMITED');
    assert.ok(Number(limited.response.headers.get('retry-after')) > 0);
});

test('kontrakt v1: niedostępna baza ma osobny kod 503', { skip: !failureEndpoint }, async () => {
    const response = await call('session', { body: {}, endpoint: failureEndpoint });
    assertError(response, 503, 'DATABASE_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(response.envelope), /SQLSTATE|PDO|farmwars_missing/);
});

test('pełny tryb online: walidacja komend, współbieżność, walka i zapis po rozłączeniu', { skip: !endpoint }, async () => {
    const owner = await guest();
    const stranger = await guest();
    const startBody = { requestId: randomUUID(), mode: 'online' };
    const created = await call('runs', { ...owner, body: startBody });
    assert.equal(created.status, 201);
    const { runId, state } = created.envelope.data;
    assert.equal(state.mode, 'online');
    assert.equal(state.rulesetId, 'farmwars-online-1');
    assert.equal(state.level, 1);
    assert.equal(state.summary, null);
    assert.equal(state.score.totalScore, 0);
    assert.equal(state.simulationMs, 0);
    assert.ok(!('seed' in state) && !('tasks' in state));
    assertError(await call('runs', { ...owner, body: { requestId: startBody.requestId } }), 409, 'IDEMPOTENCY_CONFLICT');
    const statePath = `runs/${runId}/state`;
    const commandsPath = `runs/${runId}/commands`;
    const submit = (body, options) => call(commandsPath, { ...owner, ...options, body });
    assertError(await call(statePath, stranger), 404, 'RUN_NOT_FOUND');
    assertError(await submit(command(0, 'hit_enemy', { enemyId: 1, damage: 300 })), 400, 'BAD_REQUEST');
    assertError(await submit(command(0, 'hit_enemy', { enemyId: 1, hp: 0 })), 400, 'BAD_REQUEST');
    assertError(await submit(command(0, 'resume', { simulationMs: 500000, totalScore: 9999 })), 400, 'BAD_REQUEST');
    assertError(await submit(command(0, 'resume'), { csrf: 'invalid' }), 403, 'INVALID_CSRF');
    assertError(await submit(command(0, 'finish_wave')), 422, 'INVALID_ACTION');
    const setSpeed = command(0, 'set_speed', { speed: 2.5 });
    const otherSpeed = command(0, 'set_speed', { speed: 3 });
    const [a, b] = await Promise.all([
        submit(setSpeed), submit(otherSpeed, { endpoint: secondEndpoint })
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    assert.deepEqual((await submit(setSpeed)).envelope, a.envelope);
    assert.deepEqual((await submit(otherSpeed)).envelope, b.envelope);
    const paused = (await call(statePath, owner)).envelope.data;
    assert.equal(paused.revision, 1);
    assert.equal(paused.simulationMs, 0);

    if (process.env.FARMWARS_ONLINE_FIXTURE !== '1') return;
    const { execFileSync } = require('node:child_process');
    const path = require('node:path');
    const php = process.env.FARMWARS_PHP || 'C:/xampp/php/php.exe';
    const fixture = scenario => execFileSync(php, [path.join(__dirname, 'online-fixture.php'), runId, scenario]);
    fixture('combat');
    let current = (await call(statePath, owner)).envelope.data;
    assert.equal(current.phase, 'combat');
    const enemy = current.enemies[0];
    const hit = await submit(command(current.revision, 'hit_enemy', { enemyId: enemy.id }));
    assert.equal(hit.status, 200);
    assert.equal(hit.envelope.data.changes.enemies.find(item => item.id === enemy.id).hp, enemy.hp - 2);
    const grass = current.tiles.find(tile => tile.resource?.kind === 'grass');
    const free = current.tiles.find(tile => !tile.resource && !tile.object &&
        !current.enemies.some(other => other.row === tile.row && other.currentCol === tile.column));
    const collected = await submit(command(hit.envelope.data.revision, 'collect', { tileId: grass.id }));
    assert.equal(collected.status, 200);
    assert.equal(collected.envelope.data.changes.resources.seeds, grass.resource.size);
    const placed = await submit(command(collected.envelope.data.revision, 'place', { tileId: free.id, itemType: 'seedling' }));
    assert.equal(placed.status, 200);
    assert.equal(placed.envelope.data.changes.score.points.items, 10);

    fixture('disconnect');
    current = (await call(statePath, owner)).envelope.data;
    assert.equal(current.catchingUp, true);
    const stale = await submit(command(current.revision, 'pause'));
    assertError(stale, 409, 'SIMULATION_CATCH_UP');
    for (let i = 0; i < 100 && !current.summary; i++) {
        const next = (await call(statePath, owner)).envelope.data;
        assert.ok(next.simulationMs - current.simulationMs <= 6000);
        current = next;
    }
    assert.equal(current.summary.status, 'lost');
    assert.equal(current.summary.validationLevel, 'server_simulated');
    assert.equal(current.summary.isRanked, false);
    assert.equal(current.summary.points.items, 10);
    assert.equal(current.summary.points.time, Math.floor(current.simulationMs / 1000));
    const frozen = (await call(statePath, owner)).envelope.data;
    assert.equal(frozen.revision, current.revision);
    assert.deepEqual(frozen.summary, current.summary);
    const historyUrl = new URL(endpoint);
    historyUrl.searchParams.set('action', 'history');
    const history = await fetch(historyUrl, { headers: { Cookie: owner.cookie } }).then(r => r.json());
    assert.equal(history.results.filter(result => result.runId === runId).length, 1);
    assert.equal(history.results.find(result => result.runId === runId).totalScore, current.score.totalScore);
    assert.equal(history.results.find(result => result.runId === runId).validationLevel, 'server_simulated');
    const resultUrl = new URL(endpoint);
    resultUrl.searchParams.set('action', 'result');
    const forbiddenResult = await fetch(resultUrl, { method: 'POST',
        headers: { Cookie: owner.cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': owner.csrf },
        body: JSON.stringify({ runId, nickname: 'Fałszerz', summary: { totalScore: 9000 } })
    });
    assert.equal(forbiddenResult.status, 404);
});
