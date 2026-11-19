const test = require('node:test');
const assert = require('node:assert/strict');
const { simulateBalance } = require('./balance-simulation.cjs');

const seeds = [1, 2, 3, 7, 42, 99, 123, 456, 2026, 123456];
let plannedResults;
const planned = () => plannedResults ??= seeds.map(seed => simulateBalance(seed));

test('rozwinięta gospodarka umożliwia pełne ulepszenie przed ostatnią walką', t => {
    const results = planned();
    const completed = results.filter(result => result.lastPreparation?.maxed);
    assert.ok(completed.length >= 7, 'Przemyślana strategia powinna zwykle umożliwiać pełny rozwój.');
    assert.ok(results.every(result => !result.firstMax || result.firstMax.wave >= 8),
        'Pełny rozwój powinien nadal wymagać przejścia większości fal.');
    assert.ok(results.every(result => result.status === 'won'));
    for (const result of results) {
        assert.equal(result.initialResources.grass, 6);
        assert.equal(result.initialResources.stone, 11);
        assert.equal(result.milestones.seedling.wave, 1);
        assert.equal(result.milestones.tree.wave, 1);
        assert.ok(result.milestones.quarry.wave <= 3);
        assert.ok(result.milestones.cannon.wave <= 6);
        assert.equal(result.preparations.length, 10);
    }
    t.diagnostic(`Pełny układ przed 10. falą: ${completed.length}/${seeds.length}; bez przetrzymywania przeciwników.`);
});

test('odkładanie inwestycji w produkcję do 3. fali nadal opóźnia pełny rozwój', t => {
    const results = seeds.map(seed => simulateBalance(seed, { economyDelayWave: 3 }));
    const completed = results.filter(result => result.lastPreparation?.maxed);
    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const earlyTime = median(planned().map(result => result.firstMax?.realSeconds ?? Infinity));
    const delayedTime = median(results.map(result => result.firstMax?.realSeconds ?? Infinity));
    assert.ok(Number.isFinite(earlyTime));
    assert.ok(delayedTime >= earlyTime + 60, 'Wczesne inwestowanie powinno oszczędzać przynajmniej minutę.');
    t.diagnostic(`Pełny układ przy opóźnionej gospodarce: ${completed.length}/${seeds.length}.`);
    t.diagnostic(`Mediana czasu pełnego rozwoju: ${earlyTime} s przy wczesnych inwestycjach, ${delayedTime} s przy opóźnionych.`);
});
