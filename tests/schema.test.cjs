const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'database/farmwars.sql'), 'utf8');

test('statyczny audyt SQL: tabele, FK, bezpieczne domyślne wartości i unikalna partia', () => {
    const tables = [...sql.matchAll(/^CREATE TABLE (\w+)/gm)].map(match => match[1]);
    assert.equal(new Set(tables).size, 9);
    for (const reference of sql.matchAll(/REFERENCES (\w+)/g)) assert.ok(tables.includes(reference[1]));
    assert.match(sql, /CREATE TABLE run_scores \([\s\S]*?PRIMARY KEY \(run_id\)/);
    assert.match(sql, /REFERENCES run_statistics \(run_id\) ON DELETE RESTRICT/);
    assert.match(sql, /DEFAULT 'client_reported'/);
    assert.match(sql, /is_ranked TINYINT UNSIGNED NOT NULL DEFAULT 0/);
    assert.match(sql, /FOREIGN KEY \(player_id, identity_id\)/);
    assert.doesNotMatch(sql, /^\s*(DROP|TRUNCATE|DELETE|UPDATE)\s/im);
    assert.match(fs.readFileSync(path.join(root, 'database/.htaccess'), 'utf8'), /Require all denied/);
});

test('reguły SQL zgadzają się z JavaScript; nie zmieniono stawek ani cen', () => {
    const rules = JSON.parse(sql.match(/\n    '(\{[\s\S]*?\})'\n\);/)[1]);
    const context = vm.createContext({ window: { localStorage: { getItem: () => null } } });
    vm.runInContext(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'), context);
    const config = JSON.parse(vm.runInContext('JSON.stringify(GAME_CONFIG)', context));
    assert.deepEqual(rules.scoring, config.scoring);
    assert.deepEqual(rules.waves, config.waves);
    assert.deepEqual(rules.shopItems, JSON.parse(vm.runInContext('JSON.stringify(shopItems)', context)));
    assert.equal(config.scoring.enemies.normal, 20);
    assert.equal(config.scoring.enemies.boss, 35);
    assert.equal(config.scoring.resources.tree, 12);
    const images = JSON.parse(vm.runInContext('JSON.stringify(itemImages)', context));
    for (const image of Object.values(images)) assert.ok(fs.existsSync(path.join(root, image)), image);
});
