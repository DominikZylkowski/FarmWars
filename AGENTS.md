# Repository Guidelines

## Project Structure & Module Organization

FarmWars is a Polish-language browser game built with plain HTML, JavaScript, and SCSS. `index.html` contains the interface and loads the game scripts. `js/config.js` defines shared configuration, state, shop prices, and asset mappings; `js/main.js` handles the board, interface, and game flow; `js/war_logic.js` handles invasions and combat. Keep script loading order intact because these files share globals.

Edit styles in `styles/scss/main.scss` and shared design values in `styles/scss/_variables.scss`. Sass generates browser-ready files in `styles/css/`. Images belong in `assets/images/` and favicons in `assets/favicon/`. There is currently no dedicated test directory.

## Build, Test, and Development Commands

- `npm ci`: install the development dependencies from `package-lock.json`.
- `npm run sass-compile`: compile SCSS into `styles/css/` before opening the game.
- `npm run watch`: recompile styles automatically while editing SCSS.
- Open `index.html` in a browser after compilation to play and check changes. There is no application server or JavaScript bundling step.

## Coding Style & Naming Conventions

Follow existing formatting: four-space indentation in HTML and JavaScript, and two spaces in SCSS. Use semicolons, single-quoted JavaScript strings, `const` by default, and `let` for reassigned values. Use camelCase for functions and state fields, and uppercase names for top-level constants such as `GAME_CONFIG`.

Preserve existing DOM IDs and CSS class conventions, including element and modifier forms such as `.game-tile__placed-item` and `.game-tile--light`. Keep user-facing text in Polish. No formatter or linter is configured; avoid unrelated formatting changes.

## Testing Guidelines

No automated test framework, test script, or coverage threshold is configured. Compile styles and manually verify affected gameplay: starting and resuming, Escape pause, resource collection, shop placement, invasion combat, level progression, and viewport resizing. Check the browser console for errors. For persistence changes, verify tutorial and volume settings after reloading.

## Commit & Pull Request Guidelines

Recent commits use short Polish descriptions such as `Aktualizacja projektu` and `poprawki cz. 5`; no strict convention is established. Prefer concise, descriptive messages identifying the behavior changed. Keep commits focused.

Pull requests should describe the change, include reproduction or verification steps, link a relevant issue when available, and attach screenshots for visible interface changes. Mention gameplay balance changes and any new assets or dependencies explicitly.
