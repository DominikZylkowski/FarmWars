// ------------------------- Konfiguracja gry -------------------------
const GAME_CONFIG = {
  rows: 5,
  columns: 10,
  tileClassNames: ['game-tile--light', 'game-tile--dark'],
  baseGrassCount: 6,
  grassCountPerLevel: 2,
  baseStoneCount: 4,
  stoneCountPerLevel: 1
};

const gameState = {
  level: 1,
  currentGrassCount: 0,
  currentStoneCount: 0
};

// ------------------------- Zasoby -------------------------
let seedCount = 0;
let stoneCount = 0;
let woodCount = 0;
let gamePaused = false;

// ------------------------- Sklep i ceny -------------------------
const shopItems = {
  cannon: { wood: 15, stone: 10 },    
  seedling: { seeds: 5 },             
  woodFence: { wood: 10 },           
  stoneWall: { stone: 25 }           
};

// Funkcja sprawdzająca, czy gracz ma zasoby i aktualizująca przyciski
function updateShopButtons() {
  const buttons = {
    cannon: document.getElementById("cannonButton"),
    seedling: document.getElementById("seedlingButton"),
    woodFence: document.getElementById("woodFenceButton"),
    stoneWall: document.getElementById("stoneWallButton")
  };

  for (let item in buttons) {
    const price = shopItems[item];
    let canBuy = true;

    // <- tutaj sprawdza, czy masz wystarczająco materiałów
    for (let mat in price) {
      if (
        (mat === "wood" && woodCount < price[mat]) ||
        (mat === "stone" && stoneCount < price[mat]) ||
        (mat === "seeds" && seedCount < price[mat])
      ) {
        canBuy = false;
        break;
      }
    }

    // <- tutaj zmienia się kolor przycisku zależnie od dostępności materiałów
    if (canBuy) {
      buttons[item].style.filter = "brightness(1)";
      buttons[item].disabled = false;
    } else {
      buttons[item].style.filter = "brightness(0.5)";
      buttons[item].disabled = true;
    }
  }
}

// Funkcja kupowania przedmiotu
function buyItem(item) {
  const price = shopItems[item];
  let canBuy = true;

  // <- sprawdzenie, czy gracz ma wystarczająco materiałów
  for (let mat in price) {
    if (
      (mat === "wood" && woodCount < price[mat]) ||
      (mat === "stone" && stoneCount < price[mat]) ||
      (mat === "seeds" && seedCount < price[mat])
    ) {
      canBuy = false;
      break;
    }
  }

  if (!canBuy) {
    alert("Nie masz wystarczająco materiałów!");
    return;
  }

  // <- odejmowanie materiałów po zakupie
  for (let mat in price) {
    if (mat === "wood") {
      woodCount -= price[mat]; 
      document.querySelector('.topBar__resource-wood-count').textContent = woodCount;
    }
    if (mat === "stone") {
      stoneCount -= price[mat];
      document.querySelector('.topBar__resource-stone-count').textContent = stoneCount;
    }
    if (mat === "seeds") {
      seedCount -= price[mat];
      document.querySelector('.topBar__resource-seeds-count').textContent = seedCount;
    }
  }

  console.log(`${item} kupione, możesz postawić na planszy`);
  updateShopButtons();
}

// ------------------------- Funkcje losowe -------------------------
function getRandomSeedCount() {
  const random = Math.random();
  if (random < 0.5) return 1;
  else if (random < 0.8) return 2;
  else return 3;
}

function getRandomStoneCount() {
  const random = Math.random();
  if (random < 0.75) return 1;
  else if (random < 0.92) return 2;
  else return 3;
}

// ------------------------- Aktualizacja UI -------------------------
function updateSeedUI() {
  const seedElement = document.querySelector('.topBar__resource-seeds-count');
  if (seedElement) seedElement.textContent = seedCount;
}

function updateStoneUI() {
  const stoneElement = document.querySelector('.topBar__resource-stone-count');
  if (stoneElement) stoneElement.textContent = stoneCount;
}

function updateWoodUI() {
  const woodElement = document.querySelector('.topBar__resource-wood-count');
  if (woodElement) woodElement.textContent = woodCount;
}

// ------------------------- Tworzenie kafelków -------------------------
function createTile(rowIndex, columnIndex) {
  const tile = document.createElement('div');
  const variantIndex = (rowIndex + columnIndex) % GAME_CONFIG.tileClassNames.length;
  tile.className = `game-tile ${GAME_CONFIG.tileClassNames[variantIndex]}`;
  tile.dataset.row = rowIndex;
  tile.dataset.column = columnIndex;
  tile.dataset.hasGrass = 'false';
  tile.dataset.hasStone = 'false';
  return tile;
}

function renderBoard() {
  const grid = document.getElementById('gameGrid');
  if (!grid) return;
  grid.style.gridTemplateColumns = `repeat(${GAME_CONFIG.columns}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${GAME_CONFIG.rows}, 1fr)`;
  grid.innerHTML = '';

  for (let row = 0; row < GAME_CONFIG.rows; row++) {
    for (let col = 0; col < GAME_CONFIG.columns; col++) {
      grid.appendChild(createTile(row, col));
    }
  }

  renderGrass();
  renderStones();
}

// ------------------------- Trawa -------------------------
function createGrassElement() {
  const grass = document.createElement('div');
  grass.className = 'game-tile__grass';
  grass.setAttribute('aria-hidden', 'true');
  grass.style.width = '64px';
  grass.style.height = '64px';
  grass.style.backgroundSize = 'contain';
  grass.style.backgroundRepeat = 'no-repeat';
  grass.style.position = 'absolute';
  grass.style.left = `${Math.random() * 40}%`;
  grass.style.top = `${Math.random() * 40}%`;
  return grass;
}

function addGrassToTile(tile) {
  if (!tile || tile.dataset.hasGrass === 'true' || gamePaused || tile.dataset.hasStone === 'true') return false;
  tile.dataset.hasGrass = 'true';
  tile.classList.add('game-tile--blocked');
  tile.appendChild(createGrassElement());
  return true;
}

function removeGrassFromTile(tile) {
  if (!tile || tile.dataset.hasGrass !== 'true' || gamePaused) return false;
  const grass = tile.querySelector('.game-tile__grass');
  if (grass) grass.remove();
  tile.dataset.hasGrass = 'false';
  tile.classList.remove('game-tile--blocked');

  seedCount += getRandomSeedCount();
  updateSeedUI();
  updateShopButtons(); // <- aktualizacja przycisków sklepu
  return true;
}

function getGrassCountForLevel(level) {
  const tilesCount = GAME_CONFIG.rows * GAME_CONFIG.columns;
  const calculated = GAME_CONFIG.baseGrassCount + (level - 1) * GAME_CONFIG.grassCountPerLevel;
  return Math.min(calculated, tilesCount);
}

// ------------------------- Kamienie -------------------------
function createStoneElement() {
  const stone = document.createElement('div');
  stone.className = 'game-tile__stone';
  stone.setAttribute('aria-hidden', 'true');
  stone.style.width = '64px';
  stone.style.height = '64px';
  stone.style.backgroundSize = 'contain';
  stone.style.backgroundRepeat = 'no-repeat';
  stone.style.position = 'absolute';
  stone.style.left = `${Math.random() * 40}%`;
  stone.style.top = `${Math.random() * 40}%`;
  return stone;
}

function addStoneToTile(tile) {
  if (!tile || tile.dataset.hasStone === 'true' || gamePaused || tile.dataset.hasGrass === 'true') return false;
  tile.dataset.hasStone = 'true';
  tile.classList.add('game-tile--blocked');
  tile.appendChild(createStoneElement());
  return true;
}

function removeStoneFromTile(tile) {
  if (!tile || tile.dataset.hasStone !== 'true' || gamePaused) return false;
  const stone = tile.querySelector('.game-tile__stone');
  if (stone) stone.remove();
  tile.dataset.hasStone = 'false';
  tile.classList.remove('game-tile--blocked');

  stoneCount += getRandomStoneCount();
  updateStoneUI();
  updateShopButtons(); // <- aktualizacja przycisków sklepu
  return true;
}

function getStoneCountForLevel(level) {
  const tilesCount = GAME_CONFIG.rows * GAME_CONFIG.columns;
  const calculated = GAME_CONFIG.baseStoneCount + (level - 1) * GAME_CONFIG.stoneCountPerLevel;
  return Math.min(calculated, tilesCount);
}

// ------------------------- Renderowanie -------------------------
function getGridTiles() {
  return Array.from(document.querySelectorAll('.game-tile'));
}

function getRandomTiles(tileElements, tileCount) {
  const shuffled = [...tileElements].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, tileCount);
}

function renderGrass() {
  const tiles = getGridTiles();
  if (!tiles.length) return;
  const count = getGrassCountForLevel(gameState.level);
  const randomTiles = getRandomTiles(tiles, count);
  randomTiles.forEach(tile => addGrassToTile(tile));
}

function renderStones() {
  const tiles = getGridTiles().filter(t => t.dataset.hasGrass !== 'true' && t.dataset.hasStone !== 'true');
  if (!tiles.length) return;
  const count = getStoneCountForLevel(gameState.level);
  const randomTiles = getRandomTiles(tiles, count);
  randomTiles.forEach(tile => addStoneToTile(tile));
}

// ------------------------- Klikanie kafelków -------------------------
function handleGridClick(event) {
  if (gamePaused) return;
  const tile = event.target.closest('.game-tile');
  if (!tile) return;

  if (tile.dataset.hasGrass === 'true') removeGrassFromTile(tile);
  else if (tile.dataset.hasStone === 'true') removeStoneFromTile(tile);
}

// ------------------------- Odnawianie losowe -------------------------
function spawnGrassRandomly() {
  if (gamePaused) return;
  const tiles = getGridTiles().filter(t => t.dataset.hasGrass !== 'true' && t.dataset.hasStone !== 'true');
  if (!tiles.length) return;
  addGrassToTile(tiles[Math.floor(Math.random() * tiles.length)]);
}

function spawnStonesRandomly() {
  if (gamePaused) return;
  const tiles = getGridTiles().filter(t => t.dataset.hasGrass !== 'true' && t.dataset.hasStone !== 'true');
  if (!tiles.length) return;
  addStoneToTile(tiles[Math.floor(Math.random() * tiles.length)]);
}

setInterval(spawnGrassRandomly, 15000);
setInterval(spawnStonesRandomly, 30000);

// ------------------------- Akcje -------------------------
function bindGridActions() {
  const grid = document.getElementById('gameGrid');
  if (!grid || grid.dataset.isBound === 'true') return;
  grid.dataset.isBound = 'true';
  grid.addEventListener('click', handleGridClick);
}

function bindMenu() {
  const startButton = document.getElementById('startGameButton');
  const menu = document.getElementById('gameMenu');
  if (!startButton || !menu) return;

  startButton.addEventListener('click', () => {
    menu.classList.add('is-hidden');
    menu.hidden = true;
    gamePaused = false;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      gamePaused = !gamePaused;
      if (gamePaused) {
        menu.classList.remove('is-hidden');
        menu.hidden = false;
      } else {
        menu.classList.add('is-hidden');
        menu.hidden = true;
      }
    }
  });
}

// ------------------------- Podłączenie przycisków sklepu -------------------------
document.getElementById("cannonButton").addEventListener("click", () => buyItem("cannon"));
document.getElementById("seedlingButton").addEventListener("click", () => buyItem("seedling"));
document.getElementById("woodFenceButton").addEventListener("click", () => buyItem("woodFence"));
document.getElementById("stoneWallButton").addEventListener("click", () => buyItem("stoneWall"));

// ------------------------- Start -------------------------
function bootstrapGame() {
  renderBoard();
  bindGridActions();
  bindMenu();
  updateSeedUI();
  updateStoneUI();
  updateWoodUI();
  updateShopButtons(); // <- aktualizacja przycisków przy starcie gry
}

document.addEventListener('DOMContentLoaded', bootstrapGame);