const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createGame(storedValues = {}, browser = {}) {
    let now = 0;
    let id = 0;
    const frames = new Map();
    const listeners = new Map();
    const storage = new Map(Object.entries(storedValues));
    let selectorCalls = 0;

    class Element {
        constructor(tag = 'div') {
            this.tagName = tag;
            this.children = [];
            this.dataset = {};
            this.style = { setProperty(name, value) { this[name] = value; } };
            this.className = '';
            this.value = '';
            this.textContent = '';
            this.classList = {
                add: (...names) => { this.className = [...new Set([...this.className.split(' '), ...names])].join(' ').trim(); },
                remove: (...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); },
                contains: name => this.className.split(' ').includes(name)
            };
        }
        get parentElement() { return this.parent; }
        get firstChild() { return this.children[0] || null; }
        get offsetWidth() {
            return this.classList.contains('game-tile') ? browser.tileWidth ?? 100 :
                this.id === 'gameBoard' ? 1250 : 220;
        }
        get clientWidth() { return this.offsetWidth; }
        get clientHeight() { return 500; }
        get innerHTML() { return this.html || ''; }
        set innerHTML(value) { this.html = value; this.replaceChildren(); }
        append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
        appendChild(node) { node.parent = this; this.children.push(node); return node; }
        prepend(node) { node.parent = this; this.children.unshift(node); }
        replaceChildren(...nodes) { this.children.forEach(node => { node.parent = null; }); this.children = []; this.append(...nodes); }
        remove() {
            if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this);
            this.parent = null;
        }
        setAttribute(name, value) { this[name] = String(value); }
        addEventListener(name, handler) { this[`on${name}`] = handler; }
        querySelectorAll(selector) {
            selectorCalls++;
            const matches = node => selector.split(',').some(part => {
                part = part.trim();
                if (part.startsWith('.')) return node.classList.contains(part.slice(1));
                if (part.startsWith('#')) return node.id === part.slice(1);
                const attribute = part.match(/^\[data-([\w-]+)="([^"]+)"\]$/);
                if (attribute) return node.dataset[attribute[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] === attribute[2];
                if (part === '[data-speed-level]') return node.dataset.speedLevel !== undefined;
                return node.tagName === part;
            });
            const found = [];
            const visit = node => node.children.forEach(child => { if (matches(child)) found.push(child); visit(child); });
            visit(this);
            return found;
        }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        getBoundingClientRect() {
            let left = 0;
            let top = 0;
            let width = 100;
            let height = 100;
            if (this.classList.contains('game-tile')) {
                const index = this.parent.children.indexOf(this);
                width = height = this.offsetWidth;
                left = 220 + (index % 10) * width;
                top = 180 + Math.floor(index / 10) * height;
            } else if (this.classList.contains('enemy-worm')) {
                const tile = this.parent.getBoundingClientRect();
                const offset = Number(this.style.transform?.match(/translateX\(-([\d.]+)px\)/)?.[1]) || 0;
                width = height = this.classList.contains('enemy-worm--boss') ? 160 : 120;
                left = tile.left + tile.width / 2 - offset - width / 2;
                top = tile.top + tile.height / 2 - height / 2;
            } else if (this.classList.contains('cannonball')) {
                width = height = 45;
                left = parseFloat(this.style.left) - width / 2;
                top = parseFloat(this.style.top) - height / 2;
            }
            return { left, top, width, height, right: left + width, bottom: top + height };
        }
    }

    const body = new Element('body');
    function add(tag, elementId, parent = body, className = '') {
        const element = new Element(tag);
        element.id = elementId;
        element.className = className;
        parent.appendChild(element);
        return element;
    }
    const root = add('div', 'appScale');
    const board = add('div', 'gameBoard', root);
    add('div', '', board, 'game-board__house-slot');
    add('div', 'gameGrid', board);
    const menu = add('div', 'gameMenu', root);
    add('button', 'startGameButton', menu);
    add('input', 'volumeRange', menu);
    add('output', 'gameSpeedValue', menu);
    add('strong', 'gameDifficultyValue', menu);
    for (const level of ['Easy', 'Normal', 'Hard', 'Very Hard']) {
        const band = add('div', '', menu, 'speed-bands__band');
        band.dataset.speedLevel = level;
    }
    add('button', 'rankingButton', menu);
    add('div', 'tutorialOverlay', root);
    add('div', 'scoreDisplay', root);
    add('div', 'statusContainer', root);
    add('div', 'mainTopBar', root, 'topBar');
    for (const item of ['cannon', 'seedling', 'woodFence', 'stoneWall']) add('button', `${item}Button`, root);
    const document = {
        body, hidden: false,
        createElement: tag => new Element(tag),
        getElementById: elementId => body.querySelector(`#${elementId}`),
        querySelector: selector => body.querySelector(selector),
        querySelectorAll: selector => body.querySelectorAll(selector),
        addEventListener: (name, handler) => listeners.set(name, handler)
    };
    const context = vm.createContext({
        document,
        window: {
            location: browser.location,
            innerWidth: 2000,
            addEventListener: (name, handler) => listeners.set(`window:${name}`, handler),
            localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) }
        },
        fetch: browser.fetch,
        URL,
        URLSearchParams,
        AbortSignal,
        setInterval: browser.setInterval || (() => 1),
        performance: { now: () => now },
        crypto: { randomUUID: () => `test-${++id}` },
        requestAnimationFrame: callback => { const frameId = ++id; frames.set(frameId, callback); return frameId; },
        cancelAnimationFrame: frameId => frames.delete(frameId),
        getComputedStyle: () => ({ columnGap: '16' }),
        location: { reload() {} },
        console
    });
    const run = code => vm.runInContext(code, context);
    for (const file of ['config.js', 'runtime.js', 'score.js', 'ranking.js', 'ranking_ui.js', 'game_model.js', 'war_logic.js', 'game_view.js', 'economy_client.js', 'main.js']) {
        run(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'));
    }
    listeners.get('DOMContentLoaded')();
    // Jednorazowa klatka pomiaru planszy, nie jest to pętla rozgrywki.
    for (const [frameId, callback] of Array.from(frames)) { frames.delete(frameId); callback(now); }
    return {
        run, document, storage, frames, Element,
        start() { run('handleStartButton(); if (gameState.tutorialVisible) finishTutorial();'); },
        summary() { return JSON.parse(run('JSON.stringify(getScoreSummary())')); },
        elapseWithoutFrame(ms) { now += ms; },
        advance(ms, fps = 60) {
            const end = now + ms;
            while (now < end) {
                now = Math.min(end, now + 1000 / fps);
                const pending = Array.from(frames);
                pending.forEach(([frameId]) => frames.delete(frameId));
                pending.forEach(([, callback]) => callback(now));
            }
        },
        hide() { document.hidden = true; listeners.get('visibilitychange')(); },
        show() { document.hidden = false; listeners.get('visibilitychange')(); },
        selectorCalls: () => selectorCalls
    };
}

module.exports = { createGame };
