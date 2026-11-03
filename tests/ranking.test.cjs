const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let stored = null;
let blocked = false;
let writeBlocked = false;
const context = vm.createContext({
    window: { localStorage: {
        getItem() { if (blocked) throw new Error(); return stored; },
        setItem(key, value) { if (blocked || writeBlocked) throw new Error(); stored = value; }
    } }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/ranking.js'), 'utf8'), context);
const run = code => vm.runInContext(code, context);

(async () => {
    assert.equal(await run('rankingRepository.getLastNickname()'), '');
    run(`const result = { runId: 'run-1', totalScore: 0, status: 'lost', finishedAt: new Date().toISOString(), points: { time: 0 } };`);
    await assert.rejects(run(`rankingRepository.saveResult('ab', result)`));
    await assert.rejects(run(`rankingRepository.saveResult('x'.repeat(21), result)`));
    await assert.rejects(run(`rankingRepository.saveResult('Test', { ...result, status: 'active' })`));
    const first = await run(`rankingRepository.saveResult('  Gracz  ', result)`);
    assert.equal(first.nickname, 'Gracz');
    assert.equal(first.totalScore, 0, 'Przegrana z zerowym wynikiem może być zapisana');
    assert.ok(first.playerId);
    await assert.rejects(run(`rankingRepository.saveResult('Inny', result)`), /już zapisany/);
    const second = await run(`rankingRepository.saveResult('Gracz', { ...result, runId: 'run-2', status: 'won', totalScore: 50 })`);
    assert.equal(first.playerId, second.playerId);
    await run(`rankingRepository.saveResult('<img src=x>', { ...result, runId: 'run-3', totalScore: 100 })`);
    await run(`rankingRepository.saveResult('Remis', { ...result, runId: 'run-4', totalScore: 50 })`);
    const history = await run('rankingRepository.getHistory()');
    assert.equal(history.length, 4);
    assert.equal(new Set(history.map(result => result.playerId)).size, 3);
    const leaderboard = await run('rankingRepository.getLeaderboard()');
    assert.deepEqual(Array.from(leaderboard, result => result.totalScore), [100, 50, 50]);
    assert.equal(leaderboard[0].status, 'lost', 'O pozycji decyduje Score');
    assert.equal(await run('rankingRepository.getLastNickname()'), 'Remis');
    // Ponowne wczytanie modułu zachowuje historię i blokadę duplikatów.
    const reloaded = vm.createContext({ window: context.window });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/ranking.js'), 'utf8'), reloaded);
    assert.equal((await vm.runInContext('rankingRepository.getHistory()', reloaded)).length, 4);
    reloaded.result = first;
    await assert.rejects(vm.runInContext(`rankingRepository.saveResult('Inny', result)`, reloaded), /już zapisany/);
    writeBlocked = true;
    await assert.rejects(run(`rankingRepository.saveResult('Test', { ...result, runId: 'retry' })`), /zapisać/);
    writeBlocked = false;
    await run(`rankingRepository.saveResult('Test', { ...result, runId: 'retry' })`);
    assert.equal((await run('rankingRepository.getHistory()')).length, 5, 'Nieudany zapis pozwala spróbować ponownie');
    blocked = true;
    await assert.rejects(run('rankingRepository.getLeaderboard()'), /odczytać/);
    blocked = false;
    stored = '{broken';
    await assert.rejects(run(`rankingRepository.saveResult('Test', { ...result, runId: 'run-5' })`));
    assert.equal(stored, '{broken', 'Uszkodzona historia nie zostaje nadpisana');
    // Integracja formularza i tabeli z adapterem (minimalny DOM).
    stored = null;
    class Element {
        constructor(tag) {
            this.tagName = tag;
            this.children = [];
            this.value = '';
            this.events = {};
            this.style = {};
        }
        set innerHTML(value) { throw new Error('Interfejs nie powinien wstawiać HTML'); }
        setAttribute() {}
        append(...children) { children.forEach(child => this.appendChild(child)); }
        appendChild(child) { child.parent = this; this.children.push(child); }
        replaceChildren() { this.children = []; }
        addEventListener(name, handler) { this.events[name] = handler; }
        showModal() { this.open = true; }
        close() { this.events.close?.(); }
        remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
    }
    const body = new Element('body');
    const find = (element, id) => element.id === id ? element : element.children.map(child => find(child, id)).find(Boolean);
    context.document = { body, createElement: tag => new Element(tag), getElementById: id => find(body, id) };
    context.getScoreSummary = () => ({ ...first, runId: 'ui-run' });
    context.formatScore = value => String(value);
    context.container = new Element('div');
    run(fs.readFileSync(path.join(__dirname, '../js/ranking_ui.js'), 'utf8'));
    run('mountScoreSaveForm(container)');
    const form = context.container.children[0];
    const input = form.children[1];
    const saveButton = form.children[2];
    const message = form.children[3];
    const submit = () => form.onsubmit({ preventDefault() {} });
    input.value = 'ab';
    await submit();
    assert.match(message.textContent, /3 do 20/);
    assert.equal(saveButton.disabled, false);
    input.value = '<img src=x>';
    await Promise.all([submit(), submit()]);
    assert.equal((await run('rankingRepository.getHistory()')).length, 1);
    assert.equal(saveButton.disabled, true);
    assert.equal(input.disabled, true);
    assert.match(message.textContent, /Wynik zapisany/);
    await run('showRanking()');
    const dialog = find(body, 'rankingDialog');
    const table = dialog.children[2].children[0];
    assert.equal(table.children[1].children[0].children[1].textContent, '<img src=x>');
    assert.equal(table.children[1].children[0].children[3].textContent, 'Przegrana');
    dialog.close();
    assert.equal(find(body, 'rankingDialog'), undefined);
    // Pełna ścieżka porażki: prawdziwe gameOver(), podsumowanie i formularz.
    context.window.addEventListener = () => {};
    context.document.addEventListener = () => {};
    context.document.querySelector = () => null;
    context.document.querySelectorAll = () => [];
    context.performance = { now: () => 0 };
    for (const file of ['config.js', 'score.js', 'war_logic.js', 'main.js']) {
        run(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'));
    }
    for (const endGame of ['gameOver', 'gameWin']) {
        run(`gameState.gameEnded = false; gameState.gameStarted = true; startScore(); setGamePaused(false); ${endGame}();`);
        const endScreen = find(body, 'endScreen');
        assert.ok(endScreen, 'Ekran końcowy został wyrenderowany');
        const endForm = endScreen.children.find(child => child.tagName === 'form');
        endForm.children[1].value = 'Integracja';
        await endForm.onsubmit({ preventDefault() {} });
        assert.match(endForm.children[3].textContent, /Wynik zapisany/);
        const saved = (await run('rankingRepository.getHistory()')).at(-1);
        assert.equal(saved.status, endGame === 'gameOver' ? 'lost' : 'won');
        assert.equal(saved.totalScore, 0);
    }
    console.log('OK: zapis, nazwy, profile, duplikaty, historia, ranking, przegrane, odczyt i błędy pamięci.');
})().catch(error => { console.error(error); process.exitCode = 1; });
