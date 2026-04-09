// ------------------------- Inwazja i Walka -------------------------

// Zmienna do obsługi płynnego czasu (powinna być zadeklarowana globalnie)
let lastFrameTime = Date.now();

function handleInvasionStart() {
    // Reset stanu najazdu
    gameState.isInvasionActive = true;
    gameState.enemiesDefeated = 0;
    lastFrameTime = Date.now(); // Reset czasu przy starcie inwazji

    // Pobranie aktualnej fali (fallback na 10 poziom)
    const currentWave = GAME_CONFIG.waves[gameState.level] || GAME_CONFIG.waves[10];
    gameState.totalEnemiesInWave = currentWave.normal + currentWave.boss;

    // UI - tryb najazdu
    document.querySelector('.topBar')?.classList.add('is-invasion');

    const menuBtn = document.getElementById('menuGameButton');
    if (menuBtn) {
        menuBtn.style.color = 'black';
    }

    updateTimerUI();

    // Kolejka spawnów
    const spawnQueue = [];

    for (let i = 0; i < currentWave.normal; i++) {
        spawnQueue.push('normal');
    }

    for (let i = 0; i < currentWave.boss; i++) {
        spawnQueue.push('boss');
    }

    // Losowe tasowanie kolejki spawnów
    spawnQueue.sort(() => Math.random() - 0.5);

    let spawned = 0;

    // Im wyższy level, tym szybciej spawn
    const spawnIntervalTime = Math.max(500, 3000 - (gameState.level * 200));

    const spawnTimer = setInterval(() => {
        if (gameState.gamePaused) return;

        if (spawned >= spawnQueue.length) {
            clearInterval(spawnTimer);
            return;
        }

        const randomRow = Math.floor(Math.random() * 5);
        const enemyType = spawnQueue[spawned];

        spawnEnemy(randomRow, enemyType);
        spawned++;
    }, spawnIntervalTime);

    // Start pętli gry
    requestAnimationFrame(updateGameLoop);
}

// ------------------------- Enemy -------------------------

function spawnEnemy(row, type) {
    const tiles = document.querySelectorAll('.game-tile');
    const targetTile = tiles[(row * 10) + 9];

    if (!targetTile) return;

    // Tworzenie elementu przeciwnika
    const enemyEl = document.createElement('div');
    enemyEl.className = `enemy-worm ${type === 'boss' ? 'enemy-worm--boss' : ''}`;

    // Ustalanie grafiki i HP
    const isBoss = type === 'boss';
    const img = isBoss ? itemImages.worm_boss : itemImages.worm_full;
    const hpValue = isBoss ? GAME_CONFIG.hpValues.worm_boss : GAME_CONFIG.hpValues.worm;

    enemyEl.style.backgroundImage = `url('${img}')`;

    // Pasek HP
    const hpFill = document.createElement('div');
    hpFill.className = 'enemy-worm__hp';
    enemyEl.appendChild(hpFill);

    // Dodanie do planszy
    targetTile.appendChild(enemyEl);

    // Obiekt przeciwnika
    const enemyObj = { 
        element: enemyEl, 
        hp: hpValue, 
        maxHp: hpValue, 
        offsetX: 0, 
        row: row, 
        currentCol: 9, 
        isAttacking: false,
        type: type 
    };

    // Obsługa kursora (mousedown / mouseup)
    enemyEl.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        enemyEl.classList.add('used_boardCursor');
    });

    enemyEl.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        enemyEl.classList.remove('used_boardCursor');
    });

    enemyEl.addEventListener('mouseleave', () => {
        enemyEl.classList.remove('used_boardCursor');
    });

    // Kliknięcie = zadanie obrażeń
    enemyEl.addEventListener('click', (e) => {
        e.stopPropagation();
        damageEnemy(enemyObj, 2);
    });

    // Dodanie do stanu gry
    gameState.activeEnemies.push(enemyObj);
}

// ------------------------- Damage -------------------------

function damageEnemy(enemy, amount) {
    enemy.hp -= amount;

    const hpPercent = (enemy.hp / enemy.maxHp) * 100;
    const hpBarFill = enemy.element.firstChild;

    hpBarFill.style.width = `${hpPercent}%`;

    if (hpPercent > 60) {
        hpBarFill.style.background = GAME_CONFIG.hpColors.high;
    } else if (hpPercent > 30) {
        hpBarFill.style.background = GAME_CONFIG.hpColors.medium;
    } else {
        hpBarFill.style.background = GAME_CONFIG.hpColors.low;
    }

    if (enemy.hp <= 0) {
        enemy.element.remove();

        gameState.activeEnemies = gameState.activeEnemies.filter(e => e !== enemy);
        gameState.enemiesDefeated++;

        updateTimerUI();

        if (
            gameState.enemiesDefeated >= gameState.totalEnemiesInWave &&
            gameState.activeEnemies.length === 0
        ) {
            handleLevelComplete();
        }
    }
}

// ------------------------- Cannons -------------------------

function updateCannons() {
    const tiles = document.querySelectorAll('.game-tile');

    tiles.forEach((tile, index) => {
        if (tile.dataset.hasCannon === 'true') {
            const row = Math.floor(index / 10);

            const hasEnemiesInRow = gameState.activeEnemies.some(e => e.row === row);

            if (hasEnemiesInRow) {
                const now = Date.now();
                const lastShot = parseInt(tile.dataset.lastShot) || 0;

                if (now - lastShot >= 1000) {
                    tile.dataset.lastShot = now;
                    fireCannon(tile, row);
                }
            }
        }
    });
}

function fireCannon(tile, row) {
    const cannonEl = tile.querySelector('.game-tile__item--cannon');

    if (cannonEl) {
        cannonEl.classList.remove('is-shooting');
        void cannonEl.offsetWidth;
        cannonEl.classList.add('is-shooting');
    }

    const rect = tile.getBoundingClientRect();

    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;

    const projEl = document.createElement('div');
    projEl.className = 'cannonball';

    projEl.style.left = `${startX}px`;
    projEl.style.top = `${startY}px`;
    projEl.style.backgroundImage = `url('${itemImages.cannonball}')`;

    document.body.appendChild(projEl);

    gameState.activeProjectiles.push({
        element: projEl,
        currentX: startX,
        currentY: startY,
        xOffset: 0,
        row: row
    });
}

// ------------------------- Projectiles -------------------------

function updateProjectiles() {
    for (let i = gameState.activeProjectiles.length - 1; i >= 0; i--) {
        const p = gameState.activeProjectiles[i];

        p.xOffset += GAME_CONFIG.projectileSpeed;

        const drawX = p.currentX + p.xOffset;

        p.element.style.left = `${drawX}px`;
        p.element.style.transform = `translate(-50%, -50%) rotate(${p.xOffset * 2}deg)`;

        const pRect = p.element.getBoundingClientRect();

        let hit = false;

        const enemiesInRow = gameState.activeEnemies.filter(e => e.row === p.row);

        for (let e of enemiesInRow) {
            const eRect = e.element.getBoundingClientRect();

            if (
                pRect.right >= eRect.left + 20 &&
                pRect.left <= eRect.right &&
                pRect.bottom >= eRect.top &&
                pRect.top <= eRect.bottom
            ) {
                damageEnemy(e, GAME_CONFIG.cannonDamage);
                hit = true;
                break;
            }
        }

        if (hit || drawX > window.innerWidth) {
            p.element.remove();
            gameState.activeProjectiles.splice(i, 1);
        }
    }
}

function clearProjectiles() {
    gameState.activeProjectiles.forEach(p => p.element.remove());
    gameState.activeProjectiles = [];
}

// ------------------------- Game Loop -------------------------

function updateGameLoop() {
    const now = Date.now();
    let delta = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    // Zabezpieczenie przed teleportacją (maksymalna delta 0.1s)
    if (delta > 0.1) delta = 0.1;

    if (gameState.gamePaused) {
        requestAnimationFrame(updateGameLoop);
        return;
    }

    if (gameState.isInvasionActive) {
        const tiles = document.querySelectorAll('.game-tile');

        gameState.activeEnemies.forEach(enemy => {
            // Reset ataku jeśli tile jest wolny
            const targetTile = tiles[(enemy.row * 10) + enemy.currentCol];
            if (enemy.isAttacking && targetTile && !isTileOccupied(targetTile)) {
                enemy.isAttacking = false;
            }

            if (enemy.isAttacking) return;

            const speed = (enemy.type === 'boss'
                ? GAME_CONFIG.enemySpeed * 0.8
                : GAME_CONFIG.enemySpeed);

            // Przeliczenie ruchu względem deltaTime
            enemy.offsetX += speed * delta * 60;

            enemy.element.style.transform =
                `translate(-50%, -50%) translateX(-${enemy.offsetX}px)`;

            const colShift = Math.floor(
                (enemy.offsetX + 55) / enemy.element.parentElement.offsetWidth
            );

            const newCol = 9 - colShift;

            if (newCol < 0) {
                gameOver();
                return;
            }

            if (newCol !== enemy.currentCol) {
                const nextTile = tiles[(enemy.row * 10) + newCol];

                if (nextTile && isTileOccupied(nextTile)) {
                    enemy.isAttacking = true;

                    const attackInterval = enemy.type === 'boss' ? 2500 : 1200;
                    const attackDamage = enemy.type === 'boss' ? 2.5 : 1;

                    const attackInt = setInterval(() => {
                        if (
                            gameState.gamePaused ||
                            !gameState.activeEnemies.includes(enemy)
                        ) {
                            clearInterval(attackInt);
                            enemy.isAttacking = false;
                            return;
                        }

                        let hp = parseFloat(nextTile.dataset.hp) || 0;

                        if (hp > 0) {
                            hp -= attackDamage;
                            nextTile.dataset.hp = hp;

                            nextTile.style.opacity = "0.7";
                            setTimeout(() => nextTile.style.opacity = "1", 100);
                        }

                        if (hp <= 0) {
                            nextTile.innerHTML = '';
                            clearTileData(nextTile);

                            enemy.isAttacking = false;
                            clearInterval(attackInt);
                        }
                    }, attackInterval);
                }

                enemy.currentCol = newCol;
            }
        });

        updateCannons();
        updateProjectiles();
    }

    updateTreeGrowth();
    requestAnimationFrame(updateGameLoop);
}

// ------------------------- Level -------------------------

function handleLevelComplete() {
    gameState.isInvasionActive = false;
    clearProjectiles();

    const menuBtn = document.getElementById('menuGameButton');
    if (menuBtn) menuBtn.style.color = '';

    if (gameState.level >= 10) {
        gameWin();
    } else {
        gameState.level++;

        gameState.prepTime = 60;

        document.querySelector('.topBar')?.classList.remove('is-invasion');

        updateTimerUI();
        updateShopButtons();
    }
}

// ------------------------- Helpers -------------------------

function isTileOccupied(tile) {
    // Tolerancyjna kolizja: ignoruj elementy dekoracyjne
    const children = Array.from(tile.children);
    return children.some(c => c.classList.contains('enemy-worm') || c.classList.contains('game-tile__item--cannon'));
}