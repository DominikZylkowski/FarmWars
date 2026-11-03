// ------------------------- Interfejs zapisu i rankingu -------------------------
function createRankingButton(text, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ranking__button';
    button.textContent = text;
    button.onclick = handler;
    return button;
}

function mountScoreSaveForm(container) {
    const summary = getScoreSummary();
    const form = document.createElement('form');
    form.className = 'score-save';
    const label = document.createElement('label');
    label.htmlFor = 'playerNickname';
    label.textContent = 'Nazwa gracza (3–20 znaków)';
    const input = document.createElement('input');
    input.id = 'playerNickname';
    input.name = 'nickname';
    input.required = true;
    input.autocomplete = 'nickname';
    input.className = 'score-save__input';
    const message = document.createElement('p');
    message.className = 'score-save__message';
    message.setAttribute('role', 'status');
    const saveButton = createRankingButton('ZAPISZ WYNIK');
    saveButton.type = 'submit';
    const openButton = createRankingButton('OTWÓRZ RANKING', showRanking);
    form.append(label, input, saveButton, message, openButton);
    container.appendChild(form);
    let saving = false;
    let saved = false;
    rankingRepository.getLastNickname().then(nickname => {
        if (!input.value) input.value = nickname;
    }).catch(error => { message.textContent = error.message; });
    form.onsubmit = async event => {
        event.preventDefault();
        if (saving || saved) return;
        saving = true;
        saveButton.disabled = true;
        try {
            await rankingRepository.saveResult(input.value, summary);
            saved = true;
            input.disabled = true;
            message.textContent = 'Wynik zapisany! Możesz teraz otworzyć ranking.';
            saveButton.textContent = 'WYNIK ZAPISANY';
        } catch (error) {
            message.textContent = error.message;
        } finally {
            saving = false;
            saveButton.disabled = saved;
        }
    };
}

async function showRanking() {
    if (document.getElementById('rankingDialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'rankingDialog';
    dialog.className = 'ranking';
    dialog.setAttribute('aria-labelledby', 'rankingTitle');
    const title = document.createElement('h2');
    title.id = 'rankingTitle';
    title.textContent = 'Ranking';
    const description = document.createElement('p');
    description.textContent = 'Najlepszy wynik każdego lokalnego profilu. Wygrane i przegrane razem.';
    const content = document.createElement('div');
    content.className = 'ranking__content';
    content.textContent = 'Wczytywanie…';
    const close = createRankingButton('ZAMKNIJ', () => dialog.close());
    dialog.append(title, description, content, close);
    dialog.addEventListener('close', () => dialog.remove());
    dialog.addEventListener('keydown', event => event.stopPropagation());
    document.body.appendChild(dialog);
    dialog.showModal();
    try {
        const results = await rankingRepository.getLeaderboard();
        content.replaceChildren();
        if (!results.length) {
            content.textContent = 'Brak zapisanych wyników. Zapisz wynik po zakończeniu gry.';
            return;
        }
        const table = document.createElement('table');
        const header = document.createElement('tr');
        for (const text of ['Miejsce', 'Gracz', 'Score', 'Wynik gry', 'Data']) {
            const cell = document.createElement('th');
            cell.scope = 'col';
            cell.textContent = text;
            header.appendChild(cell);
        }
        const head = document.createElement('thead');
        head.appendChild(header);
        const body = document.createElement('tbody');
        let previousScore = null;
        let place = 0;
        results.forEach((result, index) => {
            if (result.totalScore !== previousScore) place = index + 1;
            previousScore = result.totalScore;
            const row = document.createElement('tr');
            for (const value of [place, result.nickname, `${formatScore(result.totalScore)} pkt`,
                result.status === 'won' ? 'Wygrana' : 'Przegrana', new Date(result.finishedAt).toLocaleString('pl-PL')]) {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.appendChild(cell);
            }
            body.appendChild(row);
        });
        table.append(head, body);
        content.appendChild(table);
    } catch (error) {
        content.textContent = error.message;
    }
}
