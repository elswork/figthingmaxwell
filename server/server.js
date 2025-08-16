const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '../public')));

let players = {};
let playerCount = 0; // To generate unique player names
let items = []; // Array to store items like health packs

const worldWidth = 1600;
const worldHeight = 1200;

const memeImages = [
    'img/maxwell.jpg',
    'img/cheems.webp',
    'img/doge.jpg'
];

let obstacles = [];

function broadcast(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function generateRandomMap() {
    obstacles = [];
    const numberOfObstacles = Math.floor(Math.random() * 10) + 5; // 5 to 14 obstacles
    const obstacleTypes = ["tree", "trash"];

    for (let i = 0; i < numberOfObstacles; i++) {
        const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
        let width, height;

        if (type === "tree") {
            width = 100;
            height = 150;
        } else { // trash
            width = 50;
            height = 50;
        }

        obstacles.push({
            x: Math.random() * (worldWidth - width),
            y: Math.random() * (worldHeight - height),
            width: width,
            height: height,
            type: type
        });
    }

    // Adjust player positions if they collide with new obstacles
    for (const playerId in players) {
        const player = players[playerId];
        for (const obstacle of obstacles) {
            if (checkCollision(player, obstacle)) {
                player.x = Math.random() * (worldWidth - 50);
                player.y = Math.random() * (worldHeight - 50);
                break; // Move to next player
            }
        }
    }

    // Broadcast the new map to all clients
    broadcast({ type: 'map-update', obstacles: obstacles, players: players });
}

// Generate the initial map
generateRandomMap();

// Regenerate map every 30 seconds
setInterval(generateRandomMap, 30000);

function spawnItem() {
    const itemTypes = ['health-pack', 'shield', 'sword'];
    const itemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
    const width = 30;
    const height = 30;

    const item = {
        id: uuidv4(),
        type: itemType,
        x: Math.random() * (worldWidth - width),
        y: Math.random() * (worldHeight - height),
        width: width,
        height: height
    };

    items.push(item);

    // Broadcast new item to all clients
    broadcast({ type: 'item-spawn', item: item });
}

// Spawn an item every 15 seconds
// setInterval(spawnItem, 15000);

function maintainItemCount() {
    const desiredItemCount = 10;
    const currentItemCount = items.length;

    if (currentItemCount < desiredItemCount) {
        const itemsToSpawn = desiredItemCount - currentItemCount;
        for (let i = 0; i < itemsToSpawn; i++) {
            spawnItem();
        }
    }
}

// Check and maintain item count every second
setInterval(maintainItemCount, 1000);

function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

const COOLDOWN_TIME = 1000; // 1 second cooldown

wss.on('connection', (ws) => {
    const playerId = uuidv4();
    // Store the WebSocket connection with its ID temporarily
    ws.id = playerId; // Attach playerId to ws object for easy lookup

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'join-game':
                if (!players[playerId]) { // Only create player if not already created
                    const playerName = data.name || `Player ${playerCount++}`; // Use provided name or generate one
                    players[playerId] = {
                        x: Math.random() * (worldWidth - 50),
                        y: Math.random() * (worldHeight - 50),
                        width: 50, // Add width
                        height: 50, // Add height
                        name: playerName, // Assign the chosen name
                        health: 100, // Initial health
                        score: 0, // Initialize score
                        lastAttackTime: 0, // Initialize last attack time
                        isShielded: false, // Shield status
                        damageBoost: 1, // Damage boost multiplier
                        memeUrl: memeImages[Math.floor(Math.random() * memeImages.length)] // Assign random meme image
                    };

                    // Send the new player their ID and the current list of all players and items
                    ws.send(JSON.stringify({ type: 'init', id: playerId, players: players, obstacles: obstacles, items: items }));

                    // Broadcast the new player to all other clients
                    const newPlayerBroadcast = JSON.stringify({ type: 'new-player', id: playerId, player: players[playerId] });
                    wss.clients.forEach((client) => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(newPlayerBroadcast);
                        }
                    });
                }
                break;
            case 'update':
                if (players[playerId]) {
                    const currentPlayer = players[playerId];
                    const oldX = currentPlayer.x;
                    const oldY = currentPlayer.y;

                    currentPlayer.x = data.player.x;
                    currentPlayer.y = data.player.y;

                    // Clamp player position to world boundaries
                    currentPlayer.x = Math.max(0, Math.min(currentPlayer.x, worldWidth - currentPlayer.width));
                    currentPlayer.y = Math.max(0, Math.min(currentPlayer.y, worldHeight - currentPlayer.height));

                    currentPlayer.width = 50;
                    currentPlayer.height = 50;

                    // Collision with other players
                    for (const id in players) {
                        if (id === playerId) continue;

                        const otherPlayer = players[id];
                        otherPlayer.width = 50;
                        otherPlayer.height = 50;

                        if (checkCollision(currentPlayer, otherPlayer)) {
                            currentPlayer.x = oldX;
                            currentPlayer.y = oldY;
                            break;
                        }
                    }

                    // Collision with obstacles
                    for (const obstacle of obstacles) {
                        if (checkCollision(currentPlayer, obstacle)) {
                            currentPlayer.x = oldX;
                            currentPlayer.y = oldY;
                            break;
                        }
                    }

                    // Collision with items
                    for (let i = items.length - 1; i >= 0; i--) {
                        const item = items[i];
                        if (checkCollision(currentPlayer, item)) {
                            if (item.type === 'health-pack') {
                                currentPlayer.health = Math.min(100, currentPlayer.health + 25);
                                broadcast({ type: 'health-update', id: playerId, health: currentPlayer.health });
                            } else if (item.type === 'shield') {
                                currentPlayer.isShielded = true;
                                broadcast({ type: 'player-shielded', id: playerId });
                                setTimeout(() => {
                                    if (players[playerId]) {
                                        players[playerId].isShielded = false;
                                        broadcast({ type: 'player-unshielded', id: playerId });
                                    }
                                }, 5000); // 5 seconds
                            } else if (item.type === 'sword') {
                                currentPlayer.damageBoost = 1.25;
                                broadcast({ type: 'player-damage-boost', id: playerId });
                                setTimeout(() => {
                                    if (players[playerId]) {
                                        players[playerId].damageBoost = 1;
                                        broadcast({ type: 'player-damage-boost-end', id: playerId });
                                    }
                                }, 10000); // 10 seconds
                            }
                            items.splice(i, 1); // Remove item
                            broadcast({ type: 'item-removed', id: item.id });
                        }
                    }

                    // Send the full player object for update
                    const updateBroadcast = JSON.stringify({ type: 'update', id: playerId, player: currentPlayer });
                    wss.clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(updateBroadcast);
                        }
                    });
                }
                break;

            case 'attack':
                if (players[playerId] && players[data.targetId]) {
                    const attacker = players[playerId];
                    const target = players[data.targetId];

                    if (target.isShielded) return; // Can't attack shielded players

                    const currentTime = Date.now();
                    if (currentTime - attacker.lastAttackTime < COOLDOWN_TIME) {
                        return; // Prevent attack if on cooldown
                    }

                    // Basic attack validation: check if attacker is close enough to target
                    const distance = Math.sqrt(
                        Math.pow(attacker.x - target.x, 2) +
                        Math.pow(attacker.y - target.y, 2)
                    );
                    const attackRange = 250; // Increased attack range

                    if (distance <= attackRange) {
                        const damage = 10 * attacker.damageBoost; // Example damage
                        target.health -= damage;

                        attacker.lastAttackTime = currentTime; // Update last attack time on server

                        // Broadcast health update to all clients
                        wss.clients.forEach((client) => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({ type: 'health-update', id: data.targetId, health: target.health }));
                            }
                        });

                        // Handle player defeat
                        if (target.health <= 0) {
                            attacker.score = (attacker.score || 0) + 1; // Increment attacker's score

                            // Broadcast score update to all clients
                            wss.clients.forEach((client) => {
                                if (client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify({ type: 'score-update', id: playerId, score: attacker.score }));
                                }
                            });

                            // Respawn defeated player
                            target.health = 100; // Respawn with full health
                            target.x = Math.random() * (worldWidth - 50);
                            target.y = Math.random() * (worldHeight - 50);

                            wss.clients.forEach((client) => {
                                if (client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify({ type: 'player-defeated', id: data.targetId, newX: target.x, newY: target.y }));
                                    client.send(JSON.stringify({ type: 'health-update', id: data.targetId, health: target.health }));
                                }
                            });
                        }
                    } else {
                    }
                }
                break;
        }
    });

    ws.on('close', () => {
        delete players[playerId];
        // Broadcast that a player has left
        const leaveBroadcast = JSON.stringify({ type: 'player-left', id: playerId });
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(leaveBroadcast);
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
});