// Конфигурация Supabase
const SUPABASE_URL = 'https://rxnhjdiomffjwtakfvot.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4bmhqZGlvbWZmand0YWtmdm90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NzA1MTQsImV4cCI6MjA4MTA0NjUxNH0.kl52B9r0UdTTKrRurpC3wOHKhxxpcS_Yyms1SK5ltXw';

// Инициализация
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let myPlayerId = localStorage.getItem('playerId') || crypto.randomUUID();
localStorage.setItem('playerId', myPlayerId);

// Хранилище игроков
const players = new Map();

// Создаем/получаем своего игрока
async function initPlayer() {
    const { data: existing } = await supabase
        .from('players')
        .select('*')
        .eq('id', myPlayerId)
        .single();

    if (!existing) {
        const newPlayer = {
            id: myPlayerId,
            username: `Player_${Math.floor(Math.random() * 1000)}`,
            x: Math.random() * 700,
            y: Math.random() * 500,
            color: `#${Math.floor(Math.random()*16777215).toString(16)}`
        };
        
        await supabase.from('players').insert(newPlayer);
        players.set(myPlayerId, newPlayer);
    } else {
        players.set(myPlayerId, existing);
    }
}

// Real-time подписка на изменения игроков
function subscribeToPlayers() {
    supabase
        .channel('players-channel')
        .on('postgres_changes', {
            event: '*', // INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'players'
        }, (payload) => {
            const player = payload.new || payload.old;
            
            if (payload.eventType === 'DELETE') {
                players.delete(player.id);
                removePlayerFromDOM(player.id);
            } else {
                players.set(player.id, player);
                updateOrCreatePlayerInDOM(player);
            }
        })
        .subscribe();
}

// Обновление позиции своего игрока
async function updateMyPosition(x, y) {
    await supabase
        .from('players')
        .update({ x, y, last_seen: new Date().toISOString() })
        .eq('id', myPlayerId);
}

// Отрисовка игроков на Canvas
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function render() {
    // Очистка
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Рисуем всех игроков
    players.forEach(player => {
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(player.x, player.y, 20, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.username, player.x, player.y - 25);
    });
    
    requestAnimationFrame(render);
}

// Управление с клавиатуры
const keys = {};
window.addEventListener('keydown', (e) => keys[e.key] = true);
window.addEventListener('keyup', (e) => keys[e.key] = false);

function gameLoop() {
    const speed = 5;
    const myPlayer = players.get(myPlayerId);
    
    if (!myPlayer) return;
    
    let moved = false;
    
    if (keys['ArrowUp'] || keys['w']) {
        myPlayer.y -= speed;
        moved = true;
    }
    if (keys['ArrowDown'] || keys['s']) {
        myPlayer.y += speed;
        moved = true;
    }
    if (keys['ArrowLeft'] || keys['a']) {
        myPlayer.x -= speed;
        moved = true;
    }
    if (keys['ArrowRight'] || keys['d']) {
        myPlayer.x += speed;
        moved = true;
    }
    
    if (moved) {
        updateMyPosition(myPlayer.x, myPlayer.y);
    }
}

// Инициализация игры
async function initGame() {
    await initPlayer();
    subscribeToPlayers();
    
    // Загрузка существующих игроков
    const { data: allPlayers } = await supabase
        .from('players')
        .select('*');
    
    allPlayers.forEach(player => players.set(player.id, player));
    
    // Запуск игрового цикла
    setInterval(gameLoop, 1000/60); // 60 FPS
    requestAnimationFrame(render);
    
    // Очистка неактивных игроков (каждые 30 секунд)
    setInterval(cleanupInactivePlayers, 30000);
}

// Очистка неактивных игроков
async function cleanupInactivePlayers() {
    const timeout = new Date(Date.now() - 30000).toISOString();
    
    await supabase
        .from('players')
        .delete()
        .lt('last_seen', timeout);
}

// Запуск игры
initGame();
