const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- БАЗОВЫЕ НАСТРОЙКИ ---
const TILE_SIZE = 64; 
const WORLD_SIZE = 31; 
let worldMap = [];
let gameState = "MENU"; 
let lastTime = Date.now();

let floatingMessage = { text: "", timer: 0, opacity: 0 };
let respawnQueue = [];

// Эффекты
let particles = [];
let ambientParticles = []; 
let footprints = []; // Следы игрока
let screenShake = 0;
let hitFlashTimer = 0; // Белая вспышка при ударе
let aberration = 0;    // Хроматическая аберрация экрана

let MOUSE = { x: 0, y: 0, hover: false };

window.addEventListener('mousemove', (e) => {
    MOUSE.x = e.clientX;
    MOUSE.y = e.clientY;
});

const PLAYER = {
    x: 0, y: 0, 
    targetX: 0, targetY: 0,
    radius: TILE_SIZE / 4,
    tool: "Изначальный",
    moving: false, speed: 250, 
    mining: null, targetMine: null,
    bobbing: 0,
    lastFootprint: 0
};

let INVENTORY = { slots: 26, items: {}, isOpen: false };
let itemToDiscardName = null; 
let globalTimerMult = 1.0; 

// --- АУДИО ---
const AUDIO = {
    musicVol: 0.5, sfxVol: 0.5, currentMusic: null,
    bgm: {
        "Плотный": new Audio('music/plotniy.mp3'),
        "Горнило": new Audio('music/gornilo.mp3'),
        "Мерзлота": new Audio('music/merzlota.mp3'),
        "Филара": new Audio('music/filara.mp3')
    },
    sfx: {
        mine: new Audio('sounds/mine.mp3'),
        click: new Audio('sounds/click.mp3'),
        upgrade: new Audio('sounds/upgrade.mp3')
    }
};

for(let key in AUDIO.bgm) { AUDIO.bgm[key].loop = true; AUDIO.bgm[key].volume = 0; }

function playSFX(name) {
    let sound = AUDIO.sfx[name];
    if(sound) { sound.volume = AUDIO.sfxVol; sound.currentTime = 0; sound.play().catch(e => {}); }
    if (name === 'mine') screenShake = 12; 
}

function updateMusicBiome() {
    let pGridX = Math.floor((PLAYER.x + TILE_SIZE / 2) / TILE_SIZE);
    let pGridY = Math.floor((PLAYER.y + TILE_SIZE / 2) / TILE_SIZE);
    if(pGridX < 0 || pGridX >= WORLD_SIZE || pGridY < 0 || pGridY >= WORLD_SIZE) return;
    AUDIO.currentMusic = AUDIO.bgm[worldMap[pGridY][pGridX].biome];
}

function createParticles(x, y, color) {
    for (let i = 0; i < 10; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300,
            life: 0.8, color: color, size: Math.random() * 5 + 2
        });
    }
}

// --- БАЗА ДАННЫХ ---
const TOOLS = {
    "Изначальный": { pp: 1.5 }, "Древесный": { pp: 2.6 }, "Плотная Древесина": { pp: 3.0 },
    "Минеральный": { pp: 4.0 }, "Металический": { pp: 5.0 }, "Укреплённый метал": { pp: 8.0 },
    "КрустаКварцовый": { pp: 11.0 }, "МеталоОбсидиановый": { pp: 13.0 }, 
    "СаДиАл": { pp: 15.0 }, "Медитрит": { pp: 15.6 }, "МедитритОрах": { pp: 16.5 }
};

const RESOURCES = {
    "Камень": { pl: 3.0, time: 180, biome: "Плотный", color: "#7f8c8d" },
    "Минерал": { pl: 2.5, time: 90, biome: "Плотный", color: "#3498db" },
    "Метал": { pl: 4.0, time: 210, biome: "Плотный", color: "#95a5a6" },
    "Золото": { pl: 3.1, time: 120, biome: "Плотный", color: "#f1c40f", glow: true },
    "Кварц": { pl: 4.0, time: 75, biome: "Горнило", color: "#ecf0f1", glow: true },
    "Обсидиан": { pl: 10.0, time: 270, biome: "Горнило", color: "#2c3e50" },
    "Крустал": { pl: 5.0, time: 60, biome: "Горнило", color: "#9b59b6", glow: true },
    "Сатурат": { pl: 4.0, time: 60, biome: "Горнило", color: "#e74c3c", glow: true },
    "Лёд": { pl: 2.3, time: 70, biome: "Мерзлота", color: "#aaddff" },
    "Мистрит": { pl: 15.0, time: 245, biome: "Мерзлота", color: "#00ced1", glow: true },
    "Орах": { pl: 4.0, time: 130, biome: "Мерзлота", color: "#48d1cc" },
    "Финол": { pl: 16.0, time: 330, biome: "Мерзлота", color: "#1e90ff", glow: true },
    "Волокна": { pl: 1.0, time: 60, biome: "Филара", color: "#2ecc71" },
    "Древесина": { pl: 1.5, time: 85, biome: "Филара", color: "#8b4513" },
    "Органика": { pl: 0.5, time: 30, biome: "Филара", color: "#aed581" },
    "Вода": { pl: 0.5, time: 0, biome: "Филара", color: "#3498db" }
};

const UPGRADES = {
    tools: {
        "Древесный": { pp: 2.6, req: {"Древесина":5, "Волокна":5}, isBought: false },
        "Плотная Древесина": { pp: 3.0, req: {"Лёд":1, "Минерал":2, "Древесина":10}, isBought: false },
        "Минеральный": { pp: 4.0, req: {"Камень":3, "Минерал":15, "Органика":25, "Волокна":15}, isBought: false },
        "Металический": { pp: 5.0, req: {"Метал":6, "Кварц":2, "Сатурат":5, "Золото":3}, isBought: false },
        "Укреплённый метал": { pp: 8.0, req: {"Орах":1, "Крустал":2, "Метал":15, "Кварц":1, "Сатурат":2}, isBought: false },
        "КрустаКварцовый": { pp: 11.0, req: {"Крустал":10, "Кварц":25, "Сатурат":15, "Орах":10, "Лёд":50, "Минерал":5}, isBought: false },
        "МеталоОбсидиановый": { pp: 13.0, req: {"Метал":15, "Обсидиан":5, "Золото":15, "Орах":25, "Кварц":30, "Сатурат":35, "Лёд":50, "Вода":15}, isBought: false },
        "СаДиАл": { pp: 15.0, req: {"Метал":30, "Обсидиан":25, "Сатурат":60, "Вода":120, "Лёд":60, "Древесина":100, "Волокна":50, "Крустал":10, "Золото":15}, isBought: false },
        "Медитрит": { pp: 15.6, req: {"Мистрит":10, "Вода":100, "Лёд":70, "Минерал":10, "Метал":25, "Обсидиан":5, "Кварц":50, "Сатурат":60, "Камень":100, "Золото":100}, isBought: false },
        "МедитритОрах": { pp: 16.5, req: {"Мистрит":25, "Вода":150, "Лёд":150, "Минерал":15, "Метал":40, "Золото":120, "Обсидиан":25, "Кварц":55, "Сатурат":100, "Камень":100}, isBought: false }
    },
    bags: {
        "Мешок 30 ячеек": { type: "slot", req: {"Органика":80, "Крустал":5, "Сатурат":5}, isBought: false },
        "Резистент 1": { type: "timer", val: 0.15, req: {"Золото":10, "Кварц":15, "Метал":25, "Вода":30}, isBought: false },
        "Резистент 2": { type: "timer", val: 0.15, req: {"Золото":30, "Кварц":15, "Метал":40, "Вода":40, "Обсидиан":3}, isBought: false },
        "Резистент 3": { type: "timer", val: 0.25, req: {"Золото":52, "Кварц":30, "Метал":60, "Вода":100, "Обсидиан":10, "Мистрит":2, "Крустал":14}, isBought: false }
    }
};

function showMessage(text) { floatingMessage.text = text; floatingMessage.timer = 2.0; floatingMessage.opacity = 1.0; }
function shuffle(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } }

function getBiomeFloorColor(biome) {
    if(biome === "Плотный") return "#4e342e";
    if(biome === "Мерзлота") return "#0277bd";
    if(biome === "Филара") return "#2e7d32";
    if(biome === "Горнило") return "#241111";
    return "#000";
}

function getBiomeWallColor(biome) {
    if(biome === "Плотный") return "#2a2a2a";
    if(biome === "Мерзлота") return "#01579b";
    if(biome === "Филара") return "#3e2723";
    if(biome === "Горнило") return "#1a0f14";
    return "#000";
}

// --- ГЕНЕРАЦИЯ МИРА ---
function generateWorld() {
    worldMap = [];
    let biomesOrder = ["Плотный", "Горнило", "Мерзлота", "Филара"];
    shuffle(biomesOrder); 

    for (let y = 0; y < WORLD_SIZE; y++) {
        worldMap[y] = [];
        for (let x = 0; x < WORLD_SIZE; x++) {
            let biomeX = x <= 15 ? 0 : 1; let biomeY = y <= 15 ? 0 : 1;
            let biomeIndex = biomeY * 2 + biomeX;
            let isWall = (x % 5 === 0 || y % 5 === 0);
            worldMap[y][x] = { type: isWall ? 'wall' : 'floor', biome: biomesOrder[biomeIndex], resource: null };
        }
    }

    for (let y = 0; y < WORLD_SIZE; y += 5) {
        for (let x = 0; x < WORLD_SIZE; x += 5) {
            if (y > 0 && y < WORLD_SIZE - 1 && x + 2 < WORLD_SIZE) worldMap[y][x + 2].type = 'floor';
            if (x > 0 && x < WORLD_SIZE - 1 && y + 2 < WORLD_SIZE) worldMap[y + 2][x].type = 'floor';
        }
    }

    const biomeResList = {
        "Плотный": ["Камень", "Минерал", "Метал", "Золото"],
        "Горнило": ["Кварц", "Обсидиан", "Крустал", "Сатурат"],
        "Мерзлота": ["Лёд", "Мистрит", "Орах", "Финол"],
        "Филара": ["Волокна", "Древесина", "Органика", "Вода"]
    };

    biomesOrder.forEach((biomeName) => {
        let freeTiles = [];
        for (let y = 0; y < WORLD_SIZE; y++) {
            for (let x = 0; x < WORLD_SIZE; x++) {
                if (worldMap[y][x].biome === biomeName && worldMap[y][x].type === 'floor') freeTiles.push({x, y});
            }
        }
        shuffle(freeTiles); 
        
        biomeResList[biomeName].forEach(res => {
            for (let i = 0; i < 5; i++) { if (freeTiles.length > 0) { let t = freeTiles.pop(); worldMap[t.y][t.x].resource = res; } }
        });

        let extraSpawns = Math.floor(Math.random() * 10) + 3; 
        for (let i = 0; i < extraSpawns; i++) {
            if (freeTiles.length > 0) { let t = freeTiles.pop(); worldMap[t.y][t.x].resource = biomeResList[biomeName][Math.floor(Math.random() * 4)]; }
        }
    });
}

// --- ИНВЕНТАРЬ ---
function updateInventoryUI() {
    const grid = document.getElementById('inventoryGrid');
    grid.innerHTML = ''; 
    let itemNames = Object.keys(INVENTORY.items);
    
    for (let i = 0; i < INVENTORY.slots; i++) {
        let slot = document.createElement('div');
        slot.className = 'inv-slot';
        
        if (i < itemNames.length) {
            let resName = itemNames[i];
            let count = INVENTORY.items[resName];
            slot.style.backgroundColor = RESOURCES[resName].color;
            slot.title = resName;
            slot.innerHTML = `<span>${resName.charAt(0)}</span><div class="item-count">x${count}</div>`;
            
            slot.onmousedown = (e) => {
                if (e.button === 1) { 
                    e.preventDefault();
                    itemToDiscardName = resName;
                    document.getElementById('confirmWindow').classList.remove('hidden');
                }
            };
        }
        grid.appendChild(slot);
    }
}

// --- КРАФТ И УЛУЧШЕНИЯ ---
let currentTab = "tools";
let selectedUpgrade = null;

function loadCraftList() {
    const list = document.getElementById('craftList');
    list.innerHTML = '';
    selectedUpgrade = null;
    document.getElementById('craftTitle').innerText = "Выберите улучшение";
    document.getElementById('craftDesc').innerText = "";
    document.getElementById('craftRecipe').innerHTML = "";
    document.getElementById('btnUpgrade').classList.add('hidden');

    let items = currentTab === "tools" ? UPGRADES.tools : UPGRADES.bags;
    
    for (let name in items) {
        let btn = document.createElement('button');
        btn.className = 'craft-item-btn';
        btn.innerText = name;
        
        if (items[name].isBought) {
            btn.style.opacity = '0.4';
            btn.style.cursor = 'not-allowed';
            btn.innerText += " (Куплено)";
        } else {
            btn.onclick = () => {
                playSFX('click');
                document.querySelectorAll('.craft-item-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                showCraftDetails(name, items[name]);
            };
        }
        
        list.appendChild(btn);
    }
}

function showCraftDetails(name, data) {
    selectedUpgrade = { name, data };
    document.getElementById('craftTitle').innerText = name;
    
    if (currentTab === "tools") document.getElementById('craftDesc').innerText = `ПП: ${data.pp}`;
    else if (data.type === "slot") document.getElementById('craftDesc').innerText = `Увеличивает мешок до 30 ячеек`;
    else document.getElementById('craftDesc').innerText = `Ускоряет добычу на ${data.val * 100}%`;

    let recipeUI = document.getElementById('craftRecipe');
    recipeUI.innerHTML = '';
    
    let canCraft = true;
    for (let res in data.req) {
        let needed = data.req[res];
        let have = INVENTORY.items[res] || 0;
        let li = document.createElement('li');
        li.innerText = `${res}: ${have} / ${needed}`;
        if (have >= needed) {
            li.className = 'req-ok';
        } else { 
            li.className = 'req-fail'; 
            canCraft = false; 
        }
        recipeUI.appendChild(li);
    }

    let btnUp = document.getElementById('btnUpgrade');
    btnUp.classList.remove('hidden');
    btnUp.disabled = !canCraft;
    btnUp.style.opacity = canCraft ? 1 : 0.5;
}

// --- СОХРАНЕНИЯ ---
function saveGame() {
    let saveData = { 
        player: PLAYER, 
        inventory: INVENTORY, 
        upgrades: UPGRADES, 
        map: worldMap, 
        respawn: respawnQueue, 
        timerMult: globalTimerMult 
    };
    localStorage.setItem('dobythchikSave', JSON.stringify(saveData));
    showMessage("Игра сохранена!");
}

// --- СОБЫТИЯ ИНТЕРФЕЙСА ---
document.getElementById('btnStart').addEventListener('click', () => {
    playSFX('click');
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    generateWorld();
    let spawned = false;
    while (!spawned) {
        let rx = Math.floor(Math.random() * WORLD_SIZE);
        let ry = Math.floor(Math.random() * WORLD_SIZE);
        if (worldMap[ry][rx].type === 'floor' && worldMap[ry][rx].resource === null) {
            PLAYER.x = rx * TILE_SIZE; 
            PLAYER.y = ry * TILE_SIZE;
            PLAYER.targetX = PLAYER.x; 
            PLAYER.targetY = PLAYER.y; 
            spawned = true;
        }
    }
    gameState = "PLAYING"; 
    lastTime = Date.now();
    updateInventoryUI(); 
    updateMusicBiome();
});

document.getElementById('btnContinue').addEventListener('click', () => {
    playSFX('click');
    let data = localStorage.getItem('dobythchikSave');
    if(data) {
        let parsed = JSON.parse(data);
        Object.assign(PLAYER, parsed.player); 
        Object.assign(INVENTORY, parsed.inventory); 
        Object.assign(UPGRADES, parsed.upgrades);
        worldMap = parsed.map; 
        respawnQueue = parsed.respawn; 
        globalTimerMult = parsed.timerMult;

        document.getElementById('mainMenu').classList.add('hidden'); 
        document.getElementById('hud').classList.remove('hidden');
        gameState = "PLAYING"; 
        lastTime = Date.now();
        updateInventoryUI(); 
        updateMusicBiome(); 
        showMessage("Игра загружена!");
    } else {
        alert("Нет сохранений!");
    }
});

document.getElementById('btnExit').addEventListener('click', () => { window.close(); alert("Вкладку нужно закрыть вручную"); });

document.getElementById('btnBag').addEventListener('click', () => { playSFX('click'); document.getElementById('inventoryWindow').classList.toggle('hidden'); });
document.getElementById('closeInv').addEventListener('click', () => { playSFX('click'); document.getElementById('inventoryWindow').classList.add('hidden'); });

document.getElementById('confirmYes')?.addEventListener('click', () => { 
    playSFX('click'); 
    if (itemToDiscardName) { delete INVENTORY.items[itemToDiscardName]; updateInventoryUI(); } 
    document.getElementById('confirmWindow').classList.add('hidden'); itemToDiscardName = null; 
});
document.getElementById('confirmNo')?.addEventListener('click', () => { 
    playSFX('click'); document.getElementById('confirmWindow').classList.add('hidden'); itemToDiscardName = null; 
});

document.getElementById('btnTools').addEventListener('click', () => { playSFX('click'); document.getElementById('craftWindow').classList.remove('hidden'); loadCraftList(); });
document.getElementById('closeCraft').addEventListener('click', () => { playSFX('click'); document.getElementById('craftWindow').classList.add('hidden'); });

document.getElementById('tabTool')?.addEventListener('click', () => { 
    playSFX('click'); currentTab = "tools"; 
    document.getElementById('tabTool').classList.add('active'); document.getElementById('tabBag').classList.remove('active'); loadCraftList(); 
});
document.getElementById('tabBag')?.addEventListener('click', () => { 
    playSFX('click'); currentTab = "bags"; 
    document.getElementById('tabBag').classList.add('active'); document.getElementById('tabTool').classList.remove('active'); loadCraftList(); 
});

document.getElementById('btnUpgrade').addEventListener('click', () => {
    if (!selectedUpgrade) return;
    let data = selectedUpgrade.data;

    for (let res in data.req) { 
        INVENTORY.items[res] -= data.req[res]; 
        if (INVENTORY.items[res] === 0) delete INVENTORY.items[res]; 
    }

    data.isBought = true;

    if (currentTab === "tools") { 
        PLAYER.tool = selectedUpgrade.name; TOOLS[PLAYER.tool] = { pp: data.pp }; showMessage("Новый инструмент: " + PLAYER.tool); 
    } else {
        if (data.type === "slot") { INVENTORY.slots = 30; showMessage("Мешок расширен!"); }
        if (data.type === "timer") { globalTimerMult -= data.val; showMessage("Резистент изучен!"); }
    }

    playSFX('upgrade'); updateInventoryUI(); loadCraftList(); 
});

const openSettings = () => { document.getElementById('settingsWindow').classList.remove('hidden'); };
document.getElementById('btnSettingsMenu').addEventListener('click', () => { playSFX('click'); openSettings(); });
document.getElementById('btnGear').addEventListener('click', () => { playSFX('click'); openSettings(); });
document.getElementById('closeSettings').addEventListener('click', () => { playSFX('click'); document.getElementById('settingsWindow').classList.add('hidden'); });
document.getElementById('btnSaveGame')?.addEventListener('click', () => { playSFX('click'); saveGame(); });

document.getElementById('musicVolume').addEventListener('input', (e) => { AUDIO.musicVol = e.target.value / 100; document.getElementById('musicVolLabel').innerText = e.target.value + '%'; });
document.getElementById('sfxVolume').addEventListener('input', (e) => { AUDIO.sfxVol = e.target.value / 100; document.getElementById('sfxVolLabel').innerText = e.target.value + '%'; });
document.getElementById('brightness').addEventListener('input', (e) => { document.getElementById('brightLabel').innerText = e.target.value + '%'; canvas.style.filter = `brightness(${e.target.value}%)`; });

window.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }, { passive: false });

// --- УПРАВЛЕНИЕ ---
canvas.addEventListener('mousedown', (e) => {
    if (gameState !== "PLAYING") return;
    let clickX = e.clientX - (canvas.width / 2 - PLAYER.x - TILE_SIZE / 2);
    let clickY = e.clientY - (canvas.height / 2 - PLAYER.y - TILE_SIZE / 2);
    let gridX = Math.floor(clickX / TILE_SIZE); let gridY = Math.floor(clickY / TILE_SIZE);
    
    if (gridX < 0 || gridX >= WORLD_SIZE || gridY < 0 || gridY >= WORLD_SIZE) return;

    let tile = worldMap[gridY][gridX];
    if (tile.type === 'wall') { showMessage("Туда не пройти!"); return; }

    if (tile.resource) {
        PLAYER.targetMine = { x: gridX, y: gridY }; PLAYER.targetX = gridX * TILE_SIZE; PLAYER.targetY = gridY * TILE_SIZE; PLAYER.moving = true; PLAYER.mining = null; 
    } else {
        PLAYER.targetX = gridX * TILE_SIZE; PLAYER.targetY = gridY * TILE_SIZE; PLAYER.targetMine = null; PLAYER.mining = null; PLAYER.moving = true;
    }
});

// --- ИГРОВОЙ ЦИКЛ ---
function gameLoop() {
    if (gameState === "PLAYING") {
        let now = Date.now(); let dt = (now - lastTime) / 1000; 
        update(dt); draw(); 
        lastTime = now;
    } else { lastTime = Date.now(); }
    requestAnimationFrame(gameLoop);
}

function update(dt) {
    if (floatingMessage.timer > 0) { floatingMessage.timer -= dt; floatingMessage.opacity = Math.min(floatingMessage.timer, 1.0); }
    if (hitFlashTimer > 0) hitFlashTimer -= dt;
    if (aberration > 0) aberration -= dt * 10; 

    let hoverX = MOUSE.x - (canvas.width/2 - PLAYER.x - TILE_SIZE/2);
    let hoverY = MOUSE.y - (canvas.height/2 - PLAYER.y - TILE_SIZE/2);
    let gridX = Math.floor(hoverX / TILE_SIZE);
    let gridY = Math.floor(hoverY / TILE_SIZE);
    MOUSE.hover = false;
    if (gridX >= 0 && gridX < WORLD_SIZE && gridY >= 0 && gridY < WORLD_SIZE) {
        if (worldMap[gridY][gridX].resource) MOUSE.hover = true;
    }

    particles.forEach((p, i) => { p.vx -= p.vx * 4 * dt; p.vy -= p.vy * 4 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.life <= 0) particles.splice(i, 1); });

    // Следы
    if (PLAYER.moving && !PLAYER.mining) {
        if (Date.now() - PLAYER.lastFootprint > 250) {
            footprints.push({ x: PLAYER.x + TILE_SIZE/2, y: PLAYER.y + TILE_SIZE/2 + 15, life: 2.0 });
            PLAYER.lastFootprint = Date.now();
        }
    }
    footprints.forEach(f => f.life -= dt);
    footprints = footprints.filter(f => f.life > 0);

    // Фоновые частицы (снег, искры)
    if (Math.random() < 0.2) {
        let pGridX = Math.floor((PLAYER.x + TILE_SIZE / 2) / TILE_SIZE); let pGridY = Math.floor((PLAYER.y + TILE_SIZE / 2) / TILE_SIZE);
        if(pGridX >= 0 && pGridX < WORLD_SIZE && pGridY >= 0 && pGridY < WORLD_SIZE) {
            let biome = worldMap[pGridY][pGridX].biome;
            if (biome === "Мерзлота" || biome === "Горнило") {
                let color = biome === "Мерзлота" ? "#aaddff" : "#ff5500";
                let speedMult = biome === "Мерзлота" ? 0.5 : 1.5;
                ambientParticles.push({
                    x: PLAYER.x + (Math.random() - 0.5) * canvas.width * 1.5 + TILE_SIZE/2, y: PLAYER.y - canvas.height / 2 - 50 + TILE_SIZE/2,
                    vx: (Math.random() - 0.5) * 50 * speedMult, vy: (Math.random() * 50 + 20) * speedMult, life: 5 + Math.random() * 5, size: (Math.random() * 3 + 1) * speedMult, color: color
                });
            }
        }
    }
    ambientParticles.forEach((p, i) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx += (Math.random() - 0.5) * 5; p.life -= dt; if (p.life <= 0) ambientParticles.splice(i, 1); });

    PLAYER.bobbing = (PLAYER.moving || PLAYER.mining) ? Math.sin(Date.now() * 0.01) * 4 : 0;

    // --- ПЛАВНОЕ ПЕРЕКЛЮЧЕНИЕ МУЗЫКИ ---
    let fadeSpeed = 0.5; 
    for (let key in AUDIO.bgm) {
        let track = AUDIO.bgm[key];
        let targetVol = (track === AUDIO.currentMusic) ? AUDIO.musicVol : 0;
        
        if (Math.abs(track.volume - targetVol) > 0.01) {
            if (track.volume < targetVol) {
                track.volume = Math.min(targetVol, track.volume + fadeSpeed * dt);
                if (track.paused) track.play().catch(e => {}); 
            } else if (track.volume > targetVol) {
                track.volume = Math.max(0, track.volume - fadeSpeed * dt);
                if (track.volume <= 0.01 && !track.paused) {
                    track.pause(); 
                    track.volume = 0;
                }
            }
        } else {
            track.volume = targetVol;
            if (targetVol === 0 && !track.paused) track.pause();
        }
    }

    if (PLAYER.targetMine) {
        let pGridX = Math.floor((PLAYER.x + TILE_SIZE / 2) / TILE_SIZE); let pGridY = Math.floor((PLAYER.y + TILE_SIZE / 2) / TILE_SIZE);
        let dist = Math.abs(pGridX - PLAYER.targetMine.x) + Math.abs(pGridY - PLAYER.targetMine.y);
        if (dist <= 1) {
            PLAYER.moving = false; 
            if (!PLAYER.mining) {
                let resName = worldMap[PLAYER.targetMine.y][PLAYER.targetMine.x].resource;
                if (!resName) { PLAYER.targetMine = null; return; }
                
                let resData = RESOURCES[resName];
                if (TOOLS[PLAYER.tool].pp >= resData.pl) {
                    if (!INVENTORY.items[resName] && Object.keys(INVENTORY.items).length >= INVENTORY.slots) {
                        showMessage("Мешок полон!"); PLAYER.targetMine = null; return;
                    }
                    let mineTime = 5 * globalTimerMult; 
                    PLAYER.mining = { x: PLAYER.targetMine.x, y: PLAYER.targetMine.y, timeLeft: mineTime, totalTime: mineTime };
                } else { 
                    showMessage("Нужен инструмент получше! (ПП < ПЛ)"); PLAYER.targetMine = null; 
                }
            }
        }
    }

    if (PLAYER.moving && !PLAYER.mining) {
        let step = PLAYER.speed * dt;
        let nextX = PLAYER.x; let nextY = PLAYER.y;
        if (PLAYER.x < PLAYER.targetX) nextX = Math.min(PLAYER.x + step, PLAYER.targetX);
        if (PLAYER.x > PLAYER.targetX) nextX = Math.max(PLAYER.x - step, PLAYER.targetX);
        if (PLAYER.y < PLAYER.targetY) nextY = Math.min(PLAYER.y + step, PLAYER.targetY);
        if (PLAYER.y > PLAYER.targetY) nextY = Math.max(PLAYER.y - step, PLAYER.targetY);

        let gridX = Math.floor((nextX + TILE_SIZE / 2) / TILE_SIZE); let gridY = Math.floor((nextY + TILE_SIZE / 2) / TILE_SIZE);
        if (worldMap[gridY][gridX].type !== 'wall' && worldMap[gridY][gridX].resource === null) {
            PLAYER.x = nextX; PLAYER.y = nextY; updateMusicBiome(); 
        } else { PLAYER.moving = false; }
        if (PLAYER.x === PLAYER.targetX && PLAYER.y === PLAYER.targetY) PLAYER.moving = false;
    }

    if (PLAYER.mining) {
        if (PLAYER.mining.timeLeft > 0) {
            PLAYER.mining.timeLeft -= dt;
            if (Math.random() > 0.8) {
                hitFlashTimer = 0.05; 
                aberration = 3;
                let rName = worldMap[PLAYER.mining.y][PLAYER.mining.x].resource;
                if(rName) createParticles(PLAYER.mining.x * TILE_SIZE + TILE_SIZE/2, PLAYER.mining.y * TILE_SIZE + TILE_SIZE/2, RESOURCES[rName].color);
            }
        } else {
            let minedResName = worldMap[PLAYER.mining.y][PLAYER.mining.x].resource;
            INVENTORY.items[minedResName] = (INVENTORY.items[minedResName] || 0) + 1;
            updateInventoryUI();
            playSFX('mine');
            createParticles(PLAYER.mining.x * TILE_SIZE + TILE_SIZE/2, PLAYER.mining.y * TILE_SIZE + TILE_SIZE/2, "#ffffff");
            respawnQueue.push({ x: PLAYER.mining.x, y: PLAYER.mining.y, resource: minedResName, timeLeft: RESOURCES[minedResName].time * globalTimerMult });
            worldMap[PLAYER.mining.y][PLAYER.mining.x].resource = null; PLAYER.mining = null; PLAYER.targetMine = null; 
            showMessage("Добыто: " + minedResName);
        }
    }

    for (let i = respawnQueue.length - 1; i >= 0; i--) {
        let item = respawnQueue[i]; item.timeLeft -= dt;
        if (item.timeLeft <= 0) {
            let pGridX = Math.floor((PLAYER.x + TILE_SIZE / 2) / TILE_SIZE); let pGridY = Math.floor((PLAYER.y + TILE_SIZE / 2) / TILE_SIZE);
            if (pGridX !== item.x || pGridY !== item.y) { worldMap[item.y][item.x].resource = item.resource; respawnQueue.splice(i, 1); }
        }
    }
}

function draw() {
    let brightnessVal = document.getElementById('brightness') ? document.getElementById('brightness').value : 100;
    if (aberration > 0.1) {
        canvas.style.filter = `brightness(${brightnessVal}%) drop-shadow(${aberration}px 0 rgba(255,0,0,0.8)) drop-shadow(-${aberration}px 0 rgba(0,255,255,0.8))`;
    } else {
        canvas.style.filter = `brightness(${brightnessVal}%)`;
    }

    ctx.fillStyle = "#111111"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save(); 

    if (screenShake > 0) {
        let dx = (Math.random() - 0.5) * screenShake; let dy = (Math.random() - 0.5) * screenShake;
        ctx.translate(dx, dy); screenShake *= 0.85; if (screenShake < 0.5) screenShake = 0;
    }

    let offsetX = canvas.width / 2 - PLAYER.x - TILE_SIZE / 2; 
    let offsetY = canvas.height / 2 - PLAYER.y - TILE_SIZE / 2;
    ctx.translate(offsetX, offsetY);

    // --- ОТРИСОВКА КАРТЫ С АВТОТАЙЛИНГОМ ---
    for (let y = 0; y < WORLD_SIZE; y++) {
        for (let x = 0; x < WORLD_SIZE; x++) {
            let tile = worldMap[y][x]; 
            let px = x * TILE_SIZE; 
            let py = y * TILE_SIZE;
            
            // Оптимизация (не рисуем то, что за экраном)
            if (px < -offsetX - TILE_SIZE*2 || px > -offsetX + canvas.width + TILE_SIZE ||
                py < -offsetY - TILE_SIZE*2 || py > -offsetY + canvas.height + TILE_SIZE) continue;

            let hash1 = (x * 37 + y * 17) % 10;
            let hash2 = (x * 13 + y * 43) % 10;

            if (tile.type === 'floor') {
                ctx.fillStyle = getBiomeFloorColor(tile.biome);
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                
                if (tile.biome === "Плотный") {
                    ctx.fillStyle = "#3e2723"; ctx.fillRect(px + hash1 * 5, py + hash2 * 5, 8, 6);
                } else if (tile.biome === "Горнило") {
                    let pulse = Math.sin(Date.now() * 0.003 + x + y) * 0.5 + 0.5; 
                    ctx.strokeStyle = `rgba(255, ${60 + pulse * 100}, 0, ${0.4 + pulse * 0.4})`; ctx.lineWidth = 3;
                    ctx.beginPath(); if (hash1 > 5) { ctx.moveTo(px + 10, py + 10); ctx.lineTo(px + TILE_SIZE/2, py + TILE_SIZE - 10); } else { ctx.moveTo(px + TILE_SIZE - 10, py + 10); ctx.lineTo(px + 10, py + TILE_SIZE/2); } ctx.stroke();
                } else if (tile.biome === "Филара") {
                    ctx.strokeStyle = "#1b5e20"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px + hash1 * 2, py); ctx.quadraticCurveTo(px + TILE_SIZE/2, py + TILE_SIZE/2, px + TILE_SIZE, py + hash2 * 5); ctx.stroke();
                }

                // Смешивание биомов
                if (x < WORLD_SIZE - 1 && worldMap[y][x+1].biome !== tile.biome && worldMap[y][x+1].type === 'floor') {
                    let grad = ctx.createLinearGradient(px + TILE_SIZE - 20, py, px + TILE_SIZE, py);
                    grad.addColorStop(0, "transparent"); grad.addColorStop(1, getBiomeFloorColor(worldMap[y][x+1].biome));
                    ctx.fillStyle = grad; ctx.fillRect(px + TILE_SIZE - 20, py, 20, TILE_SIZE);
                }
                if (y < WORLD_SIZE - 1 && worldMap[y+1][x].biome !== tile.biome && worldMap[y+1][x].type === 'floor') {
                    let grad = ctx.createLinearGradient(px, py + TILE_SIZE - 20, px, py + TILE_SIZE);
                    grad.addColorStop(0, "transparent"); grad.addColorStop(1, getBiomeFloorColor(worldMap[y+1][x].biome));
                    ctx.fillStyle = grad; ctx.fillRect(px, py + TILE_SIZE - 20, TILE_SIZE, 20);
                }
            } else if (tile.type === 'wall') {
                ctx.fillStyle = getBiomeWallColor(tile.biome);
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

                // Автотайлинг (объем стен)
                ctx.fillStyle = "rgba(0,0,0,0.5)";
                if (y > 0 && worldMap[y-1][x].type !== 'wall') ctx.fillRect(px, py, TILE_SIZE, 5); 
                if (x > 0 && worldMap[y][x-1].type !== 'wall') ctx.fillRect(px, py, 5, TILE_SIZE); 
                if (x < WORLD_SIZE-1 && worldMap[y][x+1].type !== 'wall') ctx.fillRect(px + TILE_SIZE - 5, py, 5, TILE_SIZE); 
                if (y < WORLD_SIZE-1 && worldMap[y+1][x].type !== 'wall') {
                    ctx.fillStyle = "rgba(0,0,0,0.7)"; 
                    ctx.fillRect(px, py + TILE_SIZE - 15, TILE_SIZE, 15);
                }
            }
        }
    }

    // Отрисовка следов ног
    footprints.forEach(f => {
        ctx.fillStyle = `rgba(0, 0, 0, ${f.life * 0.15})`;
        ctx.beginPath();
        ctx.ellipse(f.x - 4, f.y, 4, 6, Math.PI/6, 0, Math.PI*2);
        ctx.ellipse(f.x + 4, f.y + 4, 4, 6, -Math.PI/6, 0, Math.PI*2);
        ctx.fill();
    });

    // Отрисовка ресурсов
    for (let y = 0; y < WORLD_SIZE; y++) {
        for (let x = 0; x < WORLD_SIZE; x++) {
            let tile = worldMap[y][x]; 
            if (tile.resource) {
                let px = x * TILE_SIZE; let py = y * TILE_SIZE;
                let res = RESOURCES[tile.resource];
                let rName = tile.resource;
                let cx = px + TILE_SIZE / 2; let cy = py + TILE_SIZE / 2;
                let s = TILE_SIZE / 3;

                ctx.fillStyle = res.color;
                ctx.beginPath();
                
                // Кастомные формы для ресурсов
                if (rName === "Вода") {
                    let pulse = Math.sin(Date.now() * 0.005 + x) * 2;
                    ctx.ellipse(cx, cy + 8, s * 1.2 + pulse, s / 1.5 + pulse/2, 0, 0, Math.PI * 2); ctx.fill();
                } else if (rName === "Волокна") {
                    let sway = Math.sin(Date.now() * 0.003 + x*10) * 5; 
                    ctx.moveTo(cx, cy + s); ctx.quadraticCurveTo(cx - s + sway, cy, cx - s/2 + sway/2, cy - s);
                    ctx.quadraticCurveTo(cx + sway, cy, cx + sway, cy - s/1.5); ctx.quadraticCurveTo(cx + s/2 + sway, cy - s*1.2, cx + s, cy - s/2);
                    ctx.quadraticCurveTo(cx + s/2, cy, cx, cy + s); ctx.fill();
                } else if (rName === "Древесина") {
                    ctx.fillStyle = "#5d4037"; ctx.fillRect(cx - 6, cy - 5, 12, s + 5); ctx.fillStyle = res.color; 
                    ctx.beginPath(); ctx.arc(cx, cy - 8, s, 0, Math.PI*2); ctx.fill();
                    ctx.beginPath(); ctx.arc(cx - 10, cy - 2, s/1.2, 0, Math.PI*2); ctx.fill();
                    ctx.beginPath(); ctx.arc(cx + 10, cy - 2, s/1.2, 0, Math.PI*2); ctx.fill();
                } else if (rName === "Органика") {
                    let sway = Math.sin(Date.now() * 0.002 + y*10) * 2;
                    ctx.fillStyle = "#e0e0e0"; ctx.fillRect(cx - 4 + sway, cy, 8, s); ctx.fillStyle = res.color; 
                    ctx.beginPath(); ctx.ellipse(cx + sway, cy, s*1.2, s/1.2, 0, Math.PI, Math.PI*2); ctx.fill();
                } else if (rName === "Камень" || rName === "Обсидиан") {
                    ctx.moveTo(cx - s, cy); ctx.lineTo(cx - s/2, cy - s); ctx.lineTo(cx + s/2, cy - s/1.2); ctx.lineTo(cx + s, cy + s/2); ctx.lineTo(cx + s/3, cy + s); ctx.lineTo(cx - s/1.5, cy + s/1.5); ctx.fill();
                } else if (rName === "Лёд") {
                    ctx.moveTo(cx - s, cy - s/2); ctx.lineTo(cx, cy - s); ctx.lineTo(cx + s, cy - s/3); ctx.lineTo(cx + s/1.5, cy + s); ctx.lineTo(cx - s/2, cy + s/1.2); ctx.fill();
                } else if (rName === "Золото" || rName === "Метал") {
                    ctx.beginPath(); ctx.arc(cx - 6, cy + 6, s/1.2, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 8, cy - 2, s/1.5, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(cx - 2, cy - 8, s/2, 0, Math.PI*2); ctx.fill();
                } else {
                    ctx.beginPath(); ctx.moveTo(cx - 8, cy + s); ctx.lineTo(cx - s, cy); ctx.lineTo(cx - 4, cy - s/1.5); ctx.fill();
                    ctx.beginPath(); ctx.moveTo(cx + 8, cy + s); ctx.lineTo(cx + s, cy + 4); ctx.lineTo(cx + 6, cy - s/1.2); ctx.fill();
                    ctx.beginPath(); ctx.moveTo(cx - 6, cy + s); ctx.lineTo(cx + 6, cy + s); ctx.lineTo(cx + s/1.5, cy - 4); ctx.lineTo(cx, cy - s*1.4); ctx.lineTo(cx - s/1.5, cy - 2); ctx.fill();
                }

                let isMiningThis = (PLAYER.mining && PLAYER.mining.x === x && PLAYER.mining.y === y);
                if (isMiningThis) {
                    let progress = 1 - (PLAYER.mining.timeLeft / PLAYER.mining.totalTime);
                    
                    if (hitFlashTimer > 0) {
                        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
                        ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI*2); ctx.fill(); 
                    }
                    
                    if (progress > 0.2) {
                        ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 2; ctx.beginPath();
                        ctx.moveTo(cx, cy); ctx.lineTo(cx - s/2, cy - s/2);
                        if (progress > 0.5) { ctx.moveTo(cx, cy); ctx.lineTo(cx + s/2, cy - s/4); }
                        if (progress > 0.8) { ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + s/2); }
                        ctx.stroke();
                    }
                    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(px + 10, py + TILE_SIZE - 15, TILE_SIZE - 20, 8); 
                    ctx.fillStyle = "#4CAF50"; ctx.fillRect(px + 10, py + TILE_SIZE - 15, (TILE_SIZE - 20) * progress, 8);
                }
                
                ctx.fillStyle = "#fff"; ctx.font = "bold 14px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.shadowColor = "black"; ctx.shadowBlur = 4;
                ctx.fillText(rName.charAt(0), cx, (rName === "Вода") ? cy - 8 : cy);
                ctx.shadowBlur = 0;
            }
        }
    }

    particles.forEach(p => {
        let lifeRatio = p.life / 0.8; ctx.globalAlpha = lifeRatio > 0 ? lifeRatio : 0;
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * lifeRatio, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // --- ДИНАМИЧЕСКОЕ ЦВЕТНОЕ ОСВЕЩЕНИЕ ---
    ctx.globalCompositeOperation = "lighter";
    let pGridX = Math.floor(PLAYER.x / TILE_SIZE); let pGridY = Math.floor(PLAYER.y / TILE_SIZE);
    for (let y = Math.max(0, pGridY - 8); y < Math.min(WORLD_SIZE, pGridY + 8); y++) {
        for (let x = Math.max(0, pGridX - 8); x < Math.min(WORLD_SIZE, pGridX + 8); x++) {
            if (worldMap[y][x].resource) {
                let resData = RESOURCES[worldMap[y][x].resource];
                if (resData.glow) {
                    let cx = x * TILE_SIZE + TILE_SIZE/2; let cy = y * TILE_SIZE + TILE_SIZE/2;
                    let pulse = Math.sin(Date.now() * 0.003 + x + y) * 5;
                    let grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, TILE_SIZE * 1.5 + pulse);
                    grad.addColorStop(0, resData.color); grad.addColorStop(1, "transparent");
                    ctx.fillStyle = grad; ctx.globalAlpha = 0.5; 
                    ctx.beginPath(); ctx.arc(cx, cy, TILE_SIZE * 1.5 + pulse, 0, Math.PI*2); ctx.fill();
                }
            }
        }
    }
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = "source-over";

    // --- ИГРОК ---
    ctx.save();
    ctx.translate(PLAYER.x + TILE_SIZE / 2, PLAYER.y + TILE_SIZE / 2);
    ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.ellipse(0, 15, PLAYER.radius, PLAYER.radius / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f5f5f5"; ctx.beginPath(); ctx.arc(0, PLAYER.bobbing, PLAYER.radius, 0, Math.PI * 2); ctx.fill(); 
    ctx.fillStyle = "#111"; let lookDir = PLAYER.targetX > PLAYER.x ? 3 : -3;
    ctx.beginPath(); ctx.arc(lookDir - 4, PLAYER.bobbing - 2, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(lookDir + 4, PLAYER.bobbing - 2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    
    ambientParticles.forEach(p => {
        ctx.globalAlpha = p.life > 1 ? 0.6 : p.life * 0.6; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    ctx.restore(); // Сброс сдвига камеры

    let centerX = canvas.width / 2; let centerY = canvas.height / 2;
    let gradient = ctx.createRadialGradient(centerX, centerY, TILE_SIZE * 1.5, centerX, centerY, Math.max(canvas.width, canvas.height) * 0.7);
    gradient.addColorStop(0, 'rgba(0, 0, 10, 0)'); gradient.addColorStop(0.5, 'rgba(0, 0, 10, 0.4)'); gradient.addColorStop(1, 'rgba(0, 0, 10, 0.85)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- КАСТОМНЫЙ КУРСОР (КИРКА И ПРИЦЕЛ) ---
    ctx.save();
    ctx.translate(MOUSE.x, MOUSE.y);
    if (MOUSE.hover) {
        ctx.rotate(Math.sin(Date.now() * 0.01) * 0.3); 
        ctx.scale(1.2, 1.2); 
    }
    ctx.fillStyle = "#8b4513"; ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(8, -12); ctx.lineTo(12, -8); ctx.lineTo(2, 2); ctx.fill(); 
    ctx.fillStyle = "#e0e0e0"; ctx.beginPath(); ctx.arc(10, -10, 8, Math.PI, Math.PI/2, true); ctx.lineTo(14, -14); ctx.fill(); 
    ctx.restore();

    // Всплывающие сообщения
    if (floatingMessage.timer > 0) {
        ctx.globalAlpha = floatingMessage.opacity; ctx.fillStyle = "white"; ctx.font = "bold 24px Arial"; ctx.textAlign = "center"; ctx.strokeStyle = "black"; ctx.lineWidth = 4;
        let textY = canvas.height / 2 - 50 - (1 - floatingMessage.opacity) * 20;
        ctx.strokeText(floatingMessage.text, canvas.width / 2, textY); ctx.fillText(floatingMessage.text, canvas.width / 2, textY); 
        ctx.textAlign = "left"; ctx.globalAlpha = 1.0;
    }
}

gameLoop();