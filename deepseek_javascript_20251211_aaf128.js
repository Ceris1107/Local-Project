// Конфигурация
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

// Инициализация
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentGame = null;
let playerId = localStorage.getItem('chess_player_id') || crypto.randomUUID();
let playerUsername = localStorage.getItem('chess_username') || `Игрок_${Math.floor(Math.random() * 10000)}`;
let chess = new Chess();
let board = null;
let gameChannel = null;
let timers = {
    white: 600000,
    black: 600000,
    lastUpdate: Date.now()
};

// Инициализация игрока
async function initPlayer() {
    const { data: existing } = await supabase
        .from('players')
        .select('*')
        .eq('id', playerId)
        .single();

    if (!existing) {
        await supabase.from('players').insert({
            id: playerId,
            username: playerUsername,
            rating: 1200
        });
    } else {
        playerUsername = existing.username;
    }

    updatePlayerDisplay();
    subscribeToLobby();
}

// Отображение информации об игроке
function updatePlayerDisplay() {
    document.getElementById('player-username').textContent = playerUsername;
    localStorage.setItem('chess_player_id', playerId);
    localStorage.setItem('chess_username', playerUsername);
}

// Обновление имени
async function updateUsername() {
    const newUsername = document.getElementById('username-input').value.trim();
    if (newUsername && newUsername !== playerUsername) {
        playerUsername = newUsername;
        await supabase
            .from('players')
            .update({ username: newUsername })
            .eq('id', playerId);
        updatePlayerDisplay();
    }
}

// Создание новой игры
async function createGame() {
    const { data: game, error } = await supabase
        .from('chess_games')
        .insert({
            white_player: playerId,
            status: 'waiting',
            game_time_ms: 600000
        })
        .select()
        .single();

    if (!error) {
        currentGame = game;
        joinGame(game.id);
    }
}

// Присоединение к игре
async function joinGame(gameId) {
    if (currentGame) {
        if (gameChannel) {
            gameChannel.unsubscribe();
        }
    }

    const { data: game } = await supabase
        .from('chess_games')
        .select('*')
        .eq('id', gameId)
        .single();

    if (!game) return;

    // Если игра ожидает второго игрока и мы не создатель
    if (game.status === 'waiting' && game.white_player !== playerId) {
        await supabase
            .from('chess_games')
            .update({
                black_player: playerId,
                status: 'active'
            })
            .eq('id', gameId);
    }

    currentGame = game;
    setupGame();
}

// Настройка игры
function setupGame() {
    // Очищаем предыдущую доску
    if (board) {
        board.destroy();
    }

    // Инициализируем шахматный движок с текущей позицией
    chess.load(currentGame.current_fen);
    
    // Инициализируем доску
    board = Chessboard('board', {
        position: chess.fen(),
        draggable: true,
        pieceTheme: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/{piece}.png',
        onDrop: handleMove,
        orientation: getBoardOrientation()
    });

    updateGameDisplay();
    subscribeToGame();
    startTimer();
}

// Определение ориентации доски
function getBoardOrientation() {
    if (!currentGame) return 'white';
    return currentGame.white_player === playerId ? 'white' : 'black';
}

// Обновление отображения игры
function updateGameDisplay() {
    if (!currentGame) return;

    // Обновляем имена игроков
    async function updatePlayerName(playerId, elementId) {
        if (playerId) {
            const { data: player } = await supabase
                .from('players')
                .select('username, rating')
                .eq('id', playerId)
                .single();
            
            if (player) {
                document.getElementById(elementId).textContent = 
                    `${player.username} (${player.rating})`;
            }
        }
    }

    updatePlayerName(currentGame.white_player, 'white-name');
    updatePlayerName(currentGame.black_player, 'black-name');

    // Подсвечиваем активного игрока
    const isWhiteTurn = currentGame.turn === 'white';
    document.getElementById('white-player').classList.toggle('active', isWhiteTurn);
    document.getElementById('black-player').classList.toggle('active', !isWhiteTurn);

    // Загружаем историю ходов
    loadMoveHistory();
}

// Подписка на обновления игры
function subscribeToGame() {
    if (!currentGame) return;

    if (gameChannel) {
        gameChannel.unsubscribe();
    }

    // Канал для обновлений игры
    gameChannel = supabase.channel(`game-${currentGame.id}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'chess_games',
            filter: `id=eq.${currentGame.id}`
        }, (payload) => {
            handleGameUpdate(payload.new);
        })
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'chess_moves',
            filter: `game_id=eq.${currentGame.id}`
        }, (payload) => {
            handleNewMove(payload.new);
        })
        .subscribe();
}

// Обработка обновления игры
function handleGameUpdate(gameData) {
    currentGame = gameData;
    
    if (gameData.status === 'finished') {
        endGame(gameData.winner);
    } else {
        chess.load(gameData.current_fen);
        board.position(chess.fen());
        updateGameDisplay();
    }
}

// Обработка нового хода
async function handleNewMove(moveData) {
    // Если ход сделан другим игроком
    if (moveData.player_id !== playerId) {
        chess.load(moveData.fen_after);
        board.position(chess.fen());
        
        // Обновляем таймеры
        updateTimers();
        
        // Добавляем ход в историю
        addMoveToHistory(moveData);
    }
}

// Обработка хода игрока
async function handleMove(source, target) {
    // Проверяем, что это наш ход
    const isOurTurn = (currentGame.turn === 'white' && currentGame.white_player === playerId) ||
                      (currentGame.turn === 'black' && currentGame.black_player === playerId);
    
    if (!isOurTurn) {
        board.position(chess.fen());
        return 'snapback';
    }

    // Проверяем ход на валидность
    const move = chess.move({
        from: source,
        to: target,
        promotion: 'q' // По умолчанию превращаем в ферзя
    });

    if (move === null) {
        return 'snapback';
    }

    // Если пешка достигает последней горизонтали, показываем выбор фигуры
    if (move.promotion && move.promotion !== 'q') {
        showPromotionModal(source, target);
        return 'snapback';
    }

    await saveMove(move);
}

// Сохранение хода в базу
async function saveMove(move) {
    const moveData = {
        game_id: currentGame.id,
        move_number: chess.history().length,
        from_square: move.from,
        to_square: move.to,
        piece: move.piece,
        captured_piece: move.captured,
        promotion: move.promotion,
        fen_after: chess.fen(),
        player_id: playerId
    };

    // Обновляем игру
    await supabase
        .from('chess_games')
        .update({
            current_fen: chess.fen(),
            turn: chess.turn() === 'w' ? 'white' : 'black',
            last_move_at: new Date().toISOString()
        })
        .eq('id', currentGame.id);

    // Сохраняем ход
    await supabase
        .from('chess_moves')
        .insert(moveData);

    // Обновляем таймеры
    updateTimers();
    
    // Добавляем ход в историю
    addMoveToHistory(moveData);
}

// Показ модального окна для выбора фигуры
function showPromotionModal(source, target) {
    document.getElementById('promotion-modal').style.display = 'flex';
    window.promotionMove = { from: source, to: target };
}

// Завершение превращения пешки
async function completePromotion(piece) {
    document.getElementById('promotion-modal').style.display = 'none';
    
    const move = chess.move({
        from: window.promotionMove.from,
        to: window.promotionMove.to,
        promotion: piece
    });

    if (move) {
        await saveMove(move);
    }
}

// Загрузка истории ходов
async function loadMoveHistory() {
    const { data: moves } = await supabase
        .from('chess_moves')
        .select('*')
        .eq('game_id', currentGame.id)
        .order('move_number', { ascending: true });

    const container = document.getElementById('moves-container');
    container.innerHTML = '';
    
    moves.forEach(move => {
        addMoveToHistory(move);
    });
}

// Добавление хода в историю
function addMoveToHistory(move) {
    const container = document.getElementById('moves-container');
    const moveNumber = Math.floor(move.move_number / 2) + 1;
    const isWhite = move.move_number % 2 === 0;
    
    let moveElement;
    
    if (isWhite) {
        moveElement = document.createElement('div');
        moveElement.className = 'move-item white';
        moveElement.innerHTML = `
            <span>${moveNumber}. ${formatMove(move)}</span>
            <span>${new Date(move.created_at).toLocaleTimeString()}</span>
        `;
    } else {
        // Если есть последний ход белых, добавляем к нему
        const lastMove = container.lastChild;
        if (lastMove && lastMove.className.includes('white')) {
            lastMove.innerHTML = lastMove.innerHTML.replace(
                '</span>',
                ` / ${formatMove(move)}</span>`
            );
            return;
        }
        
        moveElement = document.createElement('div');
        moveElement.className = 'move-item black';
        moveElement.innerHTML = `
            <span>${moveNumber}... ${formatMove(move)}</span>
            <span>${new Date(move.created_at).toLocaleTimeString()}</span>
        `;
    }
    
    container.appendChild(moveElement);
    container.scrollTop = container.scrollHeight;
}

// Форматирование хода
function formatMove(move) {
    let notation = '';
    
    // Превращение пешки
    if (move.promotion) {
        notation = `${move.to_square}=${move.promotion.toUpperCase()}`;
    }
    // Рокировка
    else if (move.piece === 'k' && Math.abs(move.from_square.charCodeAt(0) - move.to_square.charCodeAt(0)) > 1) {
        notation = move.to_square === 'g1' || move.to_square === 'g8' ? 'O-O' : 'O-O-O';
    }
    // Обычный ход
    else {
        const pieceLetter = move.piece === 'p' ? '' : move.piece.toUpperCase();
        const capture = move.captured_piece ? 'x' : '';
        notation = `${pieceLetter}${capture}${move.to_square}`;
    }
    
    // Шах и мат
    chess.load(move.fen_after);
    if (chess.in_checkmate()) notation += '#';
    else if (chess.in_check()) notation += '+';
    
    return notation;
}

// Таймеры
function startTimer() {
    setInterval(updateTimers, 1000);
}

function updateTimers() {
    if (!currentGame || currentGame.status !== 'active') return;
    
    const now = Date.now();
    const elapsed = now - timers.lastUpdate;
    
    if (currentGame.turn === 'white') {
        timers.white -= elapsed;
    } else {
        timers.black -= elapsed;
    }
    
    timers.lastUpdate = now;
    
    // Проверка на время
    if (timers.white <= 0) {
        endGame('black');
    } else if (timers.black <= 0) {
        endGame('white');
    }
    
    // Обновление отображения
    document.getElementById('white-time').textContent = formatTime(timers.white);
    document.getElementById('black-time').textContent = formatTime(timers.black);
}

function formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Конец игры
async function endGame(winner) {
    await supabase
        .from('chess_games')
        .update({
            status: 'finished',
            winner: winner
        })
        .eq('id', currentGame.id);
    
    alert(`Игра окончена! Победитель: ${winner === 'draw' ? 'Ничья' : winner}`);
}

// Предложение ничьей
async function offerDraw() {
    await supabase
        .from('chess_games')
        .update({
            draw_offered_by: playerId
        })
        .eq('id', currentGame.id);
    
    // Здесь можно добавить уведомление для оппонента
}

// Сдача
async function resign() {
    if (confirm('Вы уверены, что хотите сдаться?')) {
        const winner = currentGame.white_player === playerId ? 'black' : 'white';
        await endGame(winner);
    }
}

// Новая игра
function newGame() {
    if (confirm('Начать новую игру?')) {
        createGame();
    }
}

// Подписка на лобби
async function subscribeToLobby() {
    const lobbyChannel = supabase.channel('lobby')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'chess_games'
        }, () => {
            loadAvailableGames();
        })
        .subscribe();
    
    loadAvailableGames();
}

// Загрузка доступных игр
async function loadAvailableGames() {
    const { data: games } = await supabase
        .from('chess_games')
        .select('*, white_player:players!white_player(username), black_player:players!black_player(username)')
        .or('status.eq.waiting,status.eq.active')
        .order('created_at', { ascending: false });
    
    const container = document.getElementById('games-list');
    container.innerHTML = '';
    
    games.forEach(game => {
        const gameElement = document.createElement('div');
        gameElement.className = 'game-item';
        gameElement.onclick = () => joinGame(game.id);
        
        const whiteName = game.white_player?.username || 'Ожидание...';
        const blackName = game.black_player?.username || 'Свободно';
        
        gameElement.innerHTML = `
            <div style="font-weight: 500;">${whiteName} vs ${blackName}</div>
            <div style="font-size: 0.9rem; color: #ccc; margin-top: 5px;">
                Создано: ${new Date(game.created_at).toLocaleTimeString()}
                <span class="status-badge ${game.status}">${game.status === 'waiting' ? 'Ожидание' : 'Активна'}</span>
            </div>
        `;
        
        container.appendChild(gameElement);
    });
}

// Чат игры
async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (message && currentGame) {
        // Здесь можно добавить таблицу для чата в базе данных
        // Для простоты используем console.log
        console.log(`[${playerUsername}]: ${message}`);
        
        const chatContainer = document.getElementById('chat-messages');
        const messageElement = document.createElement('div');
        messageElement.textContent = `${playerUsername}: ${message}`;
        messageElement.style.padding = '5px 0';
        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        input.value = '';
    }
}

function handleChatKeypress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    initPlayer();
    
    // Заполняем поле имени текущим именем
    document.getElementById('username-input').value = playerUsername;
});