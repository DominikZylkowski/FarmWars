const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const url = process.env.FARMWARS_TEST_URL;
const failureUrl = process.env.FARMWARS_TEST_FAILURE_URL;

async function call(endpoint, action, { body, cookie, csrf, expected = 200 } = {}) {
    const address = new URL(endpoint);
    address.searchParams.set('action', action);
    const response = await fetch(address, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(cookie ? { Cookie: cookie } : {}),
            ...(csrf ? { 'X-CSRF-Token': csrf } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(5000)
    });
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data));
    return { data, cookies: response.headers.getSetCookie() };
}

async function guest() {
    const { data, cookies } = await call(url, 'session', { body: {} });
    // Po obrocie ID sesji przeglądarka zachowuje ostatnie ciasteczko.
    const setCookie = cookies.filter(cookie => cookie.startsWith('FarmWarsSession=')).at(-1);
    assert.ok(setCookie);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    return { cookie: setCookie.split(';')[0], csrf: data.csrf };
}

test('HTTP/PDO: sesje, CSRF, właściciel, wygrana, przegrana i ponowienia', { skip: !url }, async () => {
    await call(url, 'history', { expected: 401 });
    const owner = await guest();
    const stranger = await guest();
    assert.notEqual(owner.cookie, stranger.cookie);
    assert.equal((await call(url, 'session', { body: {}, cookie: owner.cookie })).data.csrf, owner.csrf);
    for (const status of ['won', 'lost']) {
        const clientRunId = randomUUID();
        const start = { ...owner, body: { clientRunId } };
        await call(url, 'start', { ...start, csrf: null, expected: 403 });
        const { data: { runId } } = await call(url, 'start', start);
        assert.equal((await call(url, 'start', start)).data.runId, runId);
        const summary = {
            schemaVersion: 2, rulesetId: 'farmwars-1', runId: clientRunId, status,
            totalScore: 0, activeTimeSeconds: 0, simulationTimeSeconds: 0,
            initialGameSpeed: 1, gameSpeed: 1,
            speedHistory: [{ atActiveSeconds: 0, atSimulationSeconds: 0, gameSpeed: 1 }],
            itemsCrafted: 0, enemiesDefeated: 0, resourcesCollected: 0,
            itemsByType: {}, enemiesByType: {}, resourcesByType: {},
            points: { time: 0, items: 0, enemies: 0, resources: 0 }
        };
        const body = { nickname: "Żaba ' SQL", runId, summary, is_ranked: 1 };
        await call(url, 'result', { ...stranger, body, expected: 404 });
        await call(url, 'result', { ...owner, body, csrf: 'invalid', expected: 403 });
        await call(url, 'result', { ...owner, body: { ...body, summary: { ...summary, totalScore: 1 } }, expected: 400 });
        await Promise.all([call(url, 'result', { ...owner, body }), call(url, 'result', { ...owner, body })]);
        await call(url, 'result', { ...owner, body: { ...body, nickname: 'Inny nick' }, expected: 409 });
    }
    const { data: { results } } = await call(url, 'history', owner);
    assert.equal(results.length, 2);
    assert.deepEqual(new Set(results.map(result => result.status)), new Set(['won', 'lost']));
    assert.ok(results.every(result => result.nickname === "Żaba ' SQL" && result.totalScore === 0));
    for (const result of results) {
        assert.match(result.finishedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    assert.deepEqual((await call(url, 'history', stranger)).data.results, []);
});

test('HTTP/PDO: błąd bazy ma status 503 i nie ujawnia danych połączenia', { skip: !failureUrl }, async () => {
    const { data } = await call(failureUrl, 'session', { body: {}, expected: 503 });
    assert.deepEqual(data, { error: 'Zapis online jest chwilowo niedostępny. Spróbuj ponownie.' });
});
