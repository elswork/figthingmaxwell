const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 600;

const worldWidth = 1600;
const worldHeight = 1200;

let player = {};
let otherPlayers = {};
let obstacles = [];
let items = []; // Array to store items like health packs
let playerId = null;
const speed = 5;
let cameraX = 0;
let cameraY = 0;

let damageNumbers = []; // Array to store active damage numbers
const COOLDOWN_TIME = 1000; // 1 second cooldown

const keys = {
    w: false,
    a: false,
    s: false,
    d: false
};

// Joystick elements
const joystickContainer = document.getElementById('joystick-container');
const joystickBase = document.getElementById('joystick-base');
const joystickStick = document.getElementById('joystick-stick');

let isJoystickActive = false;
let joystickCenterX, joystickCenterY, joystickRadius;
let joystickDirection = { x: 0, y: 0 };

// Show joystick only on mobile devices
if (window.matchMedia("(max-width: 768px)").matches) {
    joystickContainer.style.display = 'block';
}

// Meme image URLs (must match server-side)
const memeImages = [
    'img/maxwell.jpg',
    'img/cheems.webp',
    'img/doge.jpg',
    'img/fondo.webp', // Use fondo.webp for background
    'img/obstaculoarbol.jpg',
    'img/obstaculobasura.jpg',
    'img/corazóndevida.jpg', // Health pack image
    'img/escudo.webp', // Shield image
    'img/espada.webp' // Sword image
];

const collisionSound = new Audio('sounds/collision.mp3');
const hitSound = new Audio('sounds/hit.mp3'); // New hit sound
const backgroundMusic = new Audio('sounds/maxwell-the-cat-theme.mp3'); // Background music

const loadedMemeImages = {};
let imagesLoadedCount = 0;

// Preload images
memeImages.forEach(url => {
    const img = new Image();
    img.src = url;
    img.onload = () => {
        if (url === 'img/obstaculoarbol.jpg' || url === 'img/obstaculobasura.jpg' || url === 'img/corazóndevida.jpg' || url === 'img/escudo.webp' || url === 'img/espada.webp') {
            loadedMemeImages[url] = removeWhitespace(img);
        } else {
            loadedMemeImages[url] = img;
        }
        imagesLoadedCount++;
        
    };
    img.onerror = () => {
        console.error(`Failed to load image: ${url}`);
        imagesLoadedCount++;
    };
});


// WebSocket connection
const ws = new WebSocket(`ws://${window.location.host}`);



// Unlock audio context on first user interaction
// Removed unlockAudio function and its event listeners.

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
        case 'init':
            playerId = data.id;
            player = { ...data.players[playerId], health: data.players[playerId].health || 100, score: data.players[playerId].score || 0, lastAttackTime: 0, isAttacking: false, isHit: false, name: data.players[playerId].name, isShielded: data.players[playerId].isShielded || false, hasDamageBoost: data.players[playerId].damageBoost > 1 || false }; // width/height now from server
            obstacles = data.obstacles || [];
            items = data.items || []; // Initialize items
            for (const id in data.players) {
                if (id !== playerId) {
                    otherPlayers[id] = {
                        ...data.players[id],
                        health: data.players[id].health || 100,
                        score: data.players[id].score || 0,
                        lastX: data.players[id].x, // Initialize lastX
                        lastY: data.players[id].y, // Initialize lastY
                        targetX: data.players[id].x, // Initialize targetX
                        targetY: data.players[id].y,  // Initialize targetY
                        isShielded: data.players[id].isShielded || false,
                        hasDamageBoost: data.players[id].damageBoost > 1 || false
                    };
                }
            }
            break;
        case 'new-player':
            otherPlayers[data.id] = {
                ...data.player,
                health: data.player.health || 100,
                score: data.player.score || 0,
                name: data.player.name, // Include player name
                lastX: data.player.x, // Initialize lastX
                lastY: data.player.y, // Initialize lastY
                targetX: data.player.x, // Initialize targetX
                targetY: data.player.y,  // Initialize targetY
                isShielded: data.player.isShielded || false,
                hasDamageBoost: data.player.damageBoost > 1 || false
            };
            break;
        case 'player-left':
            delete otherPlayers[data.id];
            break;
        case 'update':
            if (data.id !== playerId) {
                if (otherPlayers[data.id]) {
                    // Update all properties of the other player
                    otherPlayers[data.id] = {
                        ...otherPlayers[data.id], // Keep existing properties
                        ...data.player, // Overlay new properties from server
                        lastX: otherPlayers[data.id].x, // Store current x as lastX for interpolation
                        lastY: otherPlayers[data.id].y, // Store current y as lastY for interpolation
                        targetX: data.player.x, // New x is targetX
                        targetY: data.player.y  // New y is targetY
                    };
                }
            }
            break;
        case 'health-update':
            const oldHealth = (data.id === playerId) ? player.health : otherPlayers[data.id].health;
            const damageDealt = oldHealth - data.health;

            if (data.id === playerId) {
                if (player.health > data.health) { // Only set isHit if health decreased
                    player.isHit = true;
                    setTimeout(() => {
                        player.isHit = false;
                    }, 200); // Flash for 200ms
                }
                player.health = data.health;
                if (damageDealt > 0) {
                    damageNumbers.push({
                        x: player.x + player.width / 2,
                        y: player.y,
                        value: damageDealt,
                        alpha: 1.0,
                        life: 100, // frames
                        color: 'red'
                    });
                }
            }
            else if (otherPlayers[data.id]) {
                if (otherPlayers[data.id].health > data.health) { // Only set isHit if health decreased
                    otherPlayers[data.id].isHit = true;
                    setTimeout(() => {
                        otherPlayers[data.id].isHit = false;
                    }, 200); // Flash for 200ms
                }
                otherPlayers[data.id].health = data.health;
                if (damageDealt > 0) {
                    damageNumbers.push({
                        x: otherPlayers[data.id].x + otherPlayers[data.id].width / 2,
                        y: otherPlayers[data.id].y,
                        value: damageDealt,
                        alpha: 1.0,
                        life: 100, // frames
                        color: 'red'
                    });
                }
            }
            break;
        case 'player-defeated':
            if (data.id === playerId) {
                player.x = data.newX;
                player.y = data.newY;
                player.health = 100; // Reset health on client side for defeated player
            }
            else if (otherPlayers[data.id]) {
                otherPlayers[data.id].x = data.newX;
                otherPlayers[data.id].y = data.newY;
                otherPlayers[data.id].health = 100; // Reset health on client side for defeated player
            }
            break;
        case 'score-update':
            if (data.id === playerId) {
                player.score = data.score;
            } else if (otherPlayers[data.id]) {
                otherPlayers[data.id].score = data.score;
            }
            break;
        case 'map-update':
            obstacles = data.obstacles;
            // Update player positions based on the server's update
            for (const id in data.players) {
                if (id === playerId) {
                    player.x = data.players[id].x;
                    player.y = data.players[id].y;
                } else if (otherPlayers[id]) {
                    otherPlayers[id].x = data.players[id].x;
                    otherPlayers[id].y = data.players[id].y;
                }
            }
            break;
        case 'item-spawn':
            items.push(data.item);
            break;
        case 'item-removed':
            items = items.filter(item => item.id !== data.id);
            break;
        case 'player-shielded':
            if (data.id === playerId) {
                player.isShielded = true;
            } else if (otherPlayers[data.id]) {
                otherPlayers[data.id].isShielded = true;
            }
            break;
        case 'player-unshielded':
            if (data.id === playerId) {
                player.isShielded = false;
            } else if (otherPlayers[data.id]) {
                otherPlayers[data.id].isShielded = false;
            }
            break;
        case 'player-damage-boost':
            if (data.id === playerId) {
                player.hasDamageBoost = true;
            } else if (otherPlayers[data.id]) {
                otherPlayers[data.id].hasDamageBoost = true;
            }
            break;
        case 'player-damage-boost-end':
            if (data.id === playerId) {
                player.hasDamageBoost = false;
            } else if (otherPlayers[data.id]) {
                otherPlayers[data.id].hasDamageBoost = false;
            }
            break;
    }
};

ws.onclose = () => {
};

// Handle Play Music button
const playMusicBtn = document.getElementById('playMusicBtn');
const pauseMusicBtn = document.getElementById('pauseMusicBtn');
const resumeMusicBtn = document.getElementById('resumeMusicBtn');
const volumeSlider = document.getElementById('volumeSlider');
const musicControlsDiv = document.getElementById('music-controls');

const playerNameInput = document.getElementById('playerNameInput');
const joinGameBtn = document.getElementById('joinGameBtn');
const nameInputContainer = document.getElementById('name-input-container');

const gameCanvas = document.getElementById('gameCanvas');

// Initially hide the game canvas
gameCanvas.style.display = 'none';

function resizeCanvas() {
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        const containerWidth = gameContainer.clientWidth;
        const containerHeight = gameContainer.clientHeight;

        const aspectRatio = canvas.width / canvas.height; // 800 / 600 = 1.333
        let newWidth = containerWidth;
        let newHeight = containerWidth / aspectRatio;

        if (newHeight > containerHeight) {
            newHeight = containerHeight;
            newWidth = containerHeight * aspectRatio;
        }

        gameCanvas.style.width = `${newWidth}px`;
        gameCanvas.style.height = `${newHeight}px`;
    }
}

// Call resizeCanvas initially and on window resize
window.addEventListener('resize', resizeCanvas);
document.addEventListener('fullscreenchange', resizeCanvas);
document.addEventListener('webkitfullscreenchange', resizeCanvas);
document.addEventListener('mozfullscreenchange', resizeCanvas);
document.addEventListener('MSFullscreenChange', resizeCanvas);

joinGameBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value.trim();
    if (playerName) {
        nameInputContainer.style.display = 'none';
        gameCanvas.style.display = 'block';
        resizeCanvas(); // Call resizeCanvas when game becomes visible
        musicControlsDiv.style.display = 'block'; // Show music controls
        if (window.matchMedia("(max-width: 768px)").matches) {
            joystickContainer.style.setProperty('display', 'block', 'important');
            joystickContainer.style.zIndex = '9999';
        }
        backgroundMusic.loop = true;
        backgroundMusic.volume = volumeSlider.value; // Set initial volume
        backgroundMusic.play().catch(error => {
            console.error('Error playing background music on join:', error);
        });
        ws.send(JSON.stringify({ type: 'join-game', name: playerName }));
    } else {
        alert('Please enter your name!');
    }
});

if (pauseMusicBtn) {
    pauseMusicBtn.addEventListener('click', () => {
        backgroundMusic.pause();
    });
}

if (resumeMusicBtn) {
    resumeMusicBtn.addEventListener('click', () => {
        backgroundMusic.play().catch(error => {
            console.error('Error resuming background music:', error);
        });
    });
}

if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
        backgroundMusic.volume = volumeSlider.value;
    });
}

function removeWhitespace(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = img.width;
    canvas.height = img.height;

    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // If the pixel is light gray or white, make it transparent
        if (r > 200 && g > 200 && b > 200) {
            data[i + 3] = 0; // Set alpha to 0
        }
    }

    ctx.putImageData(imageData, 0, 0);

    return canvas;
}

function drawPlayer() {
    let displayX = player.x;
    let displayY = player.y;
    let displayWidth = player.width;
    let displayHeight = player.height;

    const img = loadedMemeImages[player.memeUrl];
    let drawWidth = displayWidth;
    let drawHeight = displayHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (img) {
        const imgAspectRatio = img.width / img.height;
        const displayAspectRatio = displayWidth / displayHeight;

        let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;

        if (player.memeUrl === 'img/doge.jpg') {
            if (imgAspectRatio > displayAspectRatio) {
                // Image is wider than display area, crop horizontally
                sWidth = img.height * displayAspectRatio;
                sx = (img.width - sWidth) / 2;
            } else if (imgAspectRatio < displayAspectRatio) {
                // Image is taller than display area, crop vertically
                sHeight = img.width / displayAspectRatio;
                sy = (img.height - sHeight) / 2;
            }
            // Draw the cropped image to fill the 50x50 display area
            ctx.drawImage(img, sx, sy, sWidth, sHeight, displayX, displayY, displayWidth, displayHeight);
        } else {
            // Existing logic for other images
            if (displayWidth / displayHeight > imgAspectRatio) {
                drawWidth = displayHeight * imgAspectRatio;
            } else {
                drawHeight = displayWidth / imgAspectRatio;
            }
            offsetX = (displayWidth - drawWidth) / 2;
            offsetY = (displayHeight - drawHeight) / 2;
            ctx.drawImage(img, displayX + offsetX, displayY + offsetY, drawWidth, drawHeight);
        }
    }

    ctx.putImageData(imageData, 0, 0);

    return canvas;
}

function drawPlayerImage(playerObj, displayX, displayY, displayWidth, displayHeight) {
    const img = loadedMemeImages[playerObj.memeUrl];

    if (!img) {
        ctx.fillStyle = 'gray';
        ctx.fillRect(displayX, displayY, displayWidth, displayHeight);
        return;
    }

    const imgAspectRatio = img.width / img.height;
    const displayAspectRatio = displayWidth / displayHeight;

    let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height; // Source rectangle for drawImage
    let drawWidth = displayWidth;
    let drawHeight = displayHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (playerObj.memeUrl === 'img/doge.jpg') {
        if (imgAspectRatio > displayAspectRatio) {
            // Image is wider than display area, crop horizontally
            sWidth = img.height * displayAspectRatio;
            sx = (img.width - sWidth) / 2;
        } else if (imgAspectRatio < displayAspectRatio) {
            // Image is taller than display area, crop vertically
            sHeight = img.width / displayAspectRatio;
            sy = (img.height - sHeight) / 2;
        }
        // Draw the cropped image to fill the 50x50 display area
        ctx.drawImage(img, sx, sy, sWidth, sHeight, displayX, displayY, displayWidth, displayHeight);
    } else {
        // Existing logic for other images (scale to fit within displayWidth/Height)
        if (displayWidth / displayHeight > imgAspectRatio) {
            drawWidth = displayHeight * imgAspectRatio;
        } else {
            drawHeight = displayWidth / imgAspectRatio;
        }
        offsetX = (displayWidth - drawWidth) / 2;
        offsetY = (displayHeight - drawHeight) / 2;
        ctx.drawImage(img, displayX + offsetX, displayY + offsetY, drawWidth, drawHeight);
    }
}

function drawPlayer() {
    let displayX = player.x;
    let displayY = player.y;
    let displayWidth = player.width;
    let displayHeight = player.height;

    // Draw player image using helper function
    drawPlayerImage(player, displayX, displayY, displayWidth, displayHeight);

    if (player.isAttacking) {
        ctx.filter = 'brightness(1.5) saturate(1.5) hue-rotate(330deg)'; // Red tint
    } else if (player.isHit) {
        ctx.filter = 'brightness(2) saturate(2) hue-rotate(0deg)'; // Bright red flash
    }

    ctx.filter = 'none'; // Reset filter after drawing player

function drawOtherPlayers() {
    for (const id in otherPlayers) {
        const other = otherPlayers[id];
        const displayWidth = 50; // Fixed width for other players
        const displayHeight = 50; // Fixed height for other players

        // Draw other player image using helper function
        drawPlayerImage(other, other.x, other.y, displayWidth, displayHeight);

        if (other.isHit) {
            ctx.filter = 'brightness(2) saturate(2) hue-rotate(0deg)'; // Bright red flash
        }
        ctx.filter = 'none'; // Reset filter after drawing other player
        }

        // Draw shield effect
        if (other.isShielded) {
            ctx.fillStyle = 'rgba(0, 100, 255, 0.3)'; // Semi-transparent blue
            ctx.beginPath();
            ctx.arc(other.x + other.width / 2, other.y + other.height / 2, other.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw damage boost effect
        if (other.hasDamageBoost) {
            const swordImg = loadedMemeImages['img/espada.webp'];
            if (swordImg) {
                ctx.drawImage(swordImg, other.x + other.width, other.y, 25, 25);
            }
        }

        // Draw player name
        ctx.fillStyle = 'black';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(other.name, other.x + displayWidth / 2, other.y - 20);
        ctx.textAlign = 'left'; // Reset to default

        // Draw outline
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.strokeRect(other.x, other.y, displayWidth, displayHeight);

        // Draw health bar for other players
        const barWidth = 50; // Assuming fixed width for other players
        const barHeight = 5;
        const barX = other.x;
        const barY = other.y - barHeight - 5; // 5 pixels above the player

        // Background of health bar (always full width)
        ctx.fillStyle = 'red';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Foreground of health bar (current health)
        const currentHealthWidth = (other.health / 100) * barWidth; // Assuming max health is 100
        ctx.fillStyle = 'green';
        ctx.fillRect(barX, barY, currentHealthWidth, barHeight);
    }
}

function drawObstacles() {
    const obstacleImages = {
        'tree': loadedMemeImages['img/obstaculoarbol.jpg'],
        'trash': loadedMemeImages['img/obstaculobasura.jpg']
    };

    for (const obstacle of obstacles) {
        const img = obstacleImages[obstacle.type];

        if (img) {
            const obstacleAspectRatio = obstacle.width / obstacle.height;
            const imageAspectRatio = img.width / img.height;

            let drawWidth = obstacle.width;
            let drawHeight = obstacle.height;
            let offsetX = 0;
            let offsetY = 0;

            if (obstacleAspectRatio > imageAspectRatio) {
                // Obstacle is wider than the image, so the height determines the size
                drawHeight = obstacle.height;
                drawWidth = drawHeight * imageAspectRatio;
                offsetX = (obstacle.width - drawWidth) / 2;
            } else {
                // Obstacle is taller or same aspect ratio, so the width determines the size
                drawWidth = obstacle.width;
                drawHeight = drawWidth / imageAspectRatio;
                offsetY = (obstacle.height - drawHeight) / 2;
            }

            ctx.drawImage(img, obstacle.x + offsetX, obstacle.y + offsetY, drawWidth, drawHeight);
        } else {
            // Fallback to the brown rectangle if the image isn't loaded
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        }
    }
}

function drawItems() {
    const itemImages = {
        'health-pack': loadedMemeImages['img/corazóndevida.jpg'],
        'shield': loadedMemeImages['img/escudo.webp'],
        'sword': loadedMemeImages['img/espada.webp']
    };

    for (const item of items) {
        const img = itemImages[item.type];
        if (img) {
            ctx.drawImage(img, item.x, item.y, item.width, item.height);
        }
    }
}

function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

function updatePlayerPosition() {
    if (!playerId) return;

    const lastX = player.x;
    const lastY = player.y;

    let dx = 0;
    let dy = 0;

    if (isJoystickActive) {
        dx = joystickDirection.x;
        dy = joystickDirection.y;
    } else {
        if (keys.w) dy -= 1;
        if (keys.s) dy += 1;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;
    }

    if (dx !== 0 || dy !== 0) {
        const length = Math.sqrt(dx * dx + dy * dy);
        dx = (dx / length) * speed;
        dy = (dy / length) * speed;
    }

    // Store potential new position
    let newX = player.x + dx;
    let newY = player.y + dy;

    // Create a temporary player object for collision checking
    const futurePlayer = { ...player, x: newX, y: newY };

    // Check for collisions with obstacles
    let collision = false;
    for (const obstacle of obstacles) {
        if (checkCollision(futurePlayer, obstacle)) {
            collision = true;
            break;
        }
    }

    // Check for collisions with other players
    if (!collision) {
        for (const id in otherPlayers) {
            const other = otherPlayers[id];
            if (checkCollision(futurePlayer, other)) {
                collision = true;
                break;
            }
        }
    }

    // If no collision, update player position
    if (!collision) {
        player.x = newX;
        player.y = newY;
    }

    // Clamp player position to world boundaries
    player.x = Math.max(0, Math.min(player.x, worldWidth - player.width));
    player.y = Math.max(0, Math.min(player.y, worldHeight - player.height));

    // If position changed, send update to server
    if (player.x !== lastX || player.y !== lastY) {
        ws.send(JSON.stringify({ type: 'update', player: player }));
    }
}

function gameLoop() {
    if (!playerId) {
        requestAnimationFrame(gameLoop);
        return;
    }

    updatePlayerPosition();

    // Interpolate other players' positions for smoother movement
    const interpolationFactor = 0.2; // Adjust as needed for smoothness vs. responsiveness
    for (const id in otherPlayers) {
        const other = otherPlayers[id];
        if (other.x !== other.targetX || other.y !== other.targetY) {
            other.x += (other.targetX - other.x) * interpolationFactor;
            other.y += (other.targetY - other.y) * interpolationFactor;

            // Snap to target if very close to avoid floating point issues
            if (Math.abs(other.targetX - other.x) < 0.1) {
                other.x = other.targetX;
            }
            if (Math.abs(other.targetY - other.y) < 0.1) {
                other.y = other.targetY;
            }
        }
    }

    // Camera position (center on player, clamped to world boundaries)
    cameraX = Math.max(0, Math.min(player.x - canvas.width / 2, worldWidth - canvas.width));
    cameraY = Math.max(0, Math.min(player.y - canvas.height / 2, worldHeight - canvas.height));

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context and apply camera transform
    ctx.save();
    ctx.translate(-cameraX, -cameraY);

    // Draw tiled background for the entire world
    const backgroundTile = loadedMemeImages['img/fondo.webp'];
    if (backgroundTile) {
        for (let x = 0; x < worldWidth; x += backgroundTile.width) {
            for (let y = 0; y < worldHeight; y += backgroundTile.height) {
                ctx.drawImage(backgroundTile, x, y);
            }
        }
    } else {
        ctx.fillStyle = '#f0f0f0'; // Fallback color if image not loaded
        ctx.fillRect(0, 0, worldWidth, worldHeight);
    }

    drawPlayer();
    drawOtherPlayers();
    drawObstacles();
    drawItems(); // Draw items
    drawDamageNumbers(); // Draw damage numbers

    // Restore context to draw UI elements
    ctx.restore();

    drawScores(); // Draw scores (UI, not affected by camera)

    requestAnimationFrame(gameLoop);
}

function drawDamageNumbers() {
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
        const dn = damageNumbers[i];

        dn.y -= 0.5; // Move upwards
        dn.life--; // Decrease life
        dn.alpha = dn.life / 100; // Fade out

        ctx.save();
        ctx.globalAlpha = dn.alpha;
        ctx.fillStyle = dn.color;
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(dn.value, dn.x, dn.y);
        ctx.restore();

        if (dn.life <= 0) {
            damageNumbers.splice(i, 1); // Remove if life is over
        }
    }
}

function drawScores() {
    ctx.fillStyle = 'black';
    ctx.font = '20px Arial';
    ctx.fillText(`Your Score: ${player.score || 0}`, 10, 30);

    let yOffset = 60;
    for (const id in otherPlayers) {
        const other = otherPlayers[id];
        ctx.fillText(`${other.name}: ${other.score || 0}`, 10, yOffset);
        yOffset += 30;
    }
}

requestAnimationFrame(gameLoop);

document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) {
        keys[key] = true;
    }
});

document.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) {
        keys[key] = false;
    }
});

// Handle both click and touch events for attacking
canvas.addEventListener('click', handleAttackInput);
canvas.addEventListener('touchstart', handleAttackInput, { passive: false });

function getScaledCoordinates(x, y) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (x - rect.left) * scaleX + cameraX,
        y: (y - rect.top) * scaleY + cameraY
    };
}

function handleAttackInput(event) {
    event.preventDefault(); // Prevent default touch behavior like scrolling/zooming

    const currentTime = Date.now();
    if (currentTime - player.lastAttackTime < COOLDOWN_TIME) {
        return; // Prevent attack if on cooldown
    }

    let clientX, clientY;

    if (event.type === 'touchstart') {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else { // event.type === 'click'
        clientX = event.clientX;
        clientY = event.clientY;
    }

    const { x: inputX, y: inputY } = getScaledCoordinates(clientX, clientY);

    // Check if any other player was clicked/touched
    for (const id in otherPlayers) {
        const other = otherPlayers[id];
        // Use other player's actual dimensions for click detection
        if (inputX >= other.x && inputX <= other.x + other.width &&
            inputY >= other.y && inputY <= other.y + other.height) {

            // Client-side attack range check
            const attackRange = 250; // Must match server's attackRange
            const distance = Math.sqrt(
                Math.pow(player.x - other.x, 2) +
                Math.pow(player.y - other.y, 2)
            );

            if (distance <= attackRange) {
                hitSound.play(); // Play hit sound
                ws.send(JSON.stringify({ type: 'attack', targetId: id }));
                player.lastAttackTime = currentTime; // Update last attack time
                player.isAttacking = true; // Set attacking flag
                setTimeout(() => {
                    player.isAttacking = false;
                }, 200); // Reset after 200ms (adjust as needed for animation duration)
            } else {
            }
            break; // Only attack one player per click/touch
        }
    }
}

joystickContainer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isJoystickActive = true;
    const rect = joystickBase.getBoundingClientRect();
    joystickCenterX = rect.left + rect.width / 2;
    joystickCenterY = rect.top + rect.height / 2;
    joystickRadius = rect.width / 2;
    handleJoystickMove(e.touches[0]);
}, { passive: false });

joystickContainer.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (isJoystickActive) {
        handleJoystickMove(e.touches[0]);
    }
}, { passive: false });

joystickContainer.addEventListener('touchend', () => {
    isJoystickActive = false;
    joystickStick.style.transform = 'translate(-50%, -50%)';
    joystickDirection = { x: 0, y: 0 };
});

function handleJoystickMove(touch) {
    let touchX = touch.clientX;
    let touchY = touch.clientY;

    let dx = touchX - joystickCenterX;
    let dy = touchY - joystickCenterY;

    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > joystickRadius) {
        dx *= joystickRadius / distance;
        dy *= joystickRadius / distance;
    }

    joystickStick.style.transform = `translate(${dx}px, ${dy}px)`;

    joystickDirection.x = dx / joystickRadius;
    joystickDirection.y = dy / joystickRadius;
}

const fullscreenBtn = document.getElementById('fullscreen-btn');

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    }
}