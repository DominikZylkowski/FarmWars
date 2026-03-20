const GAME_CONFIG = {
  rows: 5,
  columns: 10,
  tileClassNames: ['game-tile--light', 'game-tile--dark']
};

function createTile(rowIndex, columnIndex) {
  const tile = document.createElement('div');
  const variantIndex = (rowIndex + columnIndex) % GAME_CONFIG.tileClassNames.length;

  tile.className = `game-tile ${GAME_CONFIG.tileClassNames[variantIndex]}`;
  tile.dataset.row = String(rowIndex);
  tile.dataset.column = String(columnIndex);

  return tile;
}

function renderBoard() {
  const gridElement = document.getElementById('gameGrid');

  if (!gridElement) {
    return;
  }

  gridElement.style.gridTemplateColumns = `repeat(${GAME_CONFIG.columns}, minmax(0, 1fr))`;
  gridElement.style.gridTemplateRows = `repeat(${GAME_CONFIG.rows}, minmax(0, 1fr))`;
  gridElement.innerHTML = '';

  for (let rowIndex = 0; rowIndex < GAME_CONFIG.rows; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < GAME_CONFIG.columns; columnIndex += 1) {
      gridElement.appendChild(createTile(rowIndex, columnIndex));
    }
  }
}

function bindMenu() {
  const startButton = document.getElementById('startGameButton');
  const menuElement = document.getElementById('gameMenu');

  if (!startButton || !menuElement) {
    return;
  }

  startButton.addEventListener('click', () => {
    menuElement.classList.add('is-hidden');
    menuElement.hidden = true;
  });
}

function bootstrapGame() {
  renderBoard();
  bindMenu();
}

document.addEventListener('DOMContentLoaded', bootstrapGame);
