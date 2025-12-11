// =================== КОНФИГУРАЦИЯ ===================
// ЗАМЕНИТЕ ЭТИ ДАННЫЕ НА СВОИ ИЗ SUPABASE!
const SUPABASE_URL = 'https://rxnhjdiomffjwtakfvot.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4bmhqZGlvbWZmand0YWtmdm90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NzA1MTQsImV4cCI6MjA4MTA0NjUxNH0.kl52B9r0UdTTKrRurpC3wOHKhxxpcS_Yyms1SK5ltXw';

// =================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===================
let supabase = null;
let currentGame = null;
let playerId = localStorage.getItem('chess_player_id') || crypto.randomUUID();
let playerUsername = localStorage.getItem('chess_username') || `Игрок_${Math.floor(Math.random() * 10000)}`;
let chess = null;
let board = null;
let gameChannel = null;
let timers = {
    white: 600000,
    black: 600000,
    lastUpdate: Date.now()
};

// =================== ОСНОВНАЯ ИНИЦИАЛИЗАЦИЯ ===================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Страница загружена, инициализируем...');
    
    try {
        // 1. Инициализируем Supabase
        if (typeof window.supabase === 'undefined') {
            console.error('Supabase не загружен! Проверьте подключение в index.html');
            return;
        }
        
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase инициализирован');
        
        // 2. Инициализируем шахматный движок
        if (typeof Chess === 'undefined') {
            console.error('Chess.js не загружен! Проверьте подключение в index.html');
            return;
        }
        
        chess = new Chess();
        console.log('Chess.js инициализирован');
        
        // 3. Инициализируем игрока
        await initPlayer();
        console.log('Игрок инициализирован');
        
        // 4. Заполняем поле имени
        document.getElementById('username-input').value = playerUsername;
        
        // 5. Загружаем список игр
        await loadAvailableGames();
        
        console.log('Система готова!');
        
        // Для отладки - сделаем переменные доступными в консоли
        window.debug = { supabase, chess, currentGame, playerId, playerUsername };
    } catch (error) {
        console.error('Критическая ошибка инициализации:', error);
    }
});

// =================== ИНИЦИАЛИЗАЦИЯ ИГРОКА ===================
async function initPlayer() {
    try {
        // Проверяем, существует ли игрок
        const { data: existing, error: fetchError } = await supabase
            .from('players')
            .select('*')
            .eq('id', playerId)
            .single();

        if (fetchError && fetchError.code === 'PGRST116') {
            // Игрок не найден, создаем нового
            const { error: insertError } = await supabase
                .from('players')
                .insert({
                    id: playerId,
                    username: playerUsername,
                    rating: 1200,
                    created_at: new Date().toISOString()
                });
            
            if (insertError) {
                console.warn('Ошибка создания игрока, используем локальный режим:', insertError.message);
                // Продолжаем без базы данных
            }
        } else if (existing) {
            // Игрок найден, обновляем имя
            playerUsername = existing.username;
        }

        updatePlayerDisplay();
        subscribeToLobby();
        
    } catch (error) {
        console.error('Ошибка в initPlayer:', error);
        // Продолжаем работу в локальном режиме
        updatePlayerDisplay();
    }
}

function updatePlayerDisplay() {
    document.getElementById('player-username').textContent = playerUsername;
    document.getElementById('player-rating').textContent = '1200';
    localStorage.setItem('chess_player_id', playerId);
    localStorage.setItem('chess_username', playerUsername);
}

// =================== УПРАВЛЕНИЕ ИМЕНЕМ ===================
async function updateUsername() {
    const input = document.getElementById('username-input');
    const newUsername = input.value.trim();
    
    if (!newUsername || newUsername.length < 2) {
        alert('Имя должно быть не короче 2 символов');
        return;
    }
    
    if (newUsername === playerUsername) return;
    
    try {
        playerUsername = newUsername;
        updatePlayerDisplay();
        
        // Пытаемся обновить в базе
        if (supabase) {
            await supabase
                .from('players')
                .update({ username: newUsername })
                .eq('id', playerId);
        }
        
        alert('Имя обновлено!');
    } catch (error) {
        console.error('Ошибка обновления имени:', error);
    }
}

// =================== ЛОББИ И СПИСОК ИГР ===================
async function createGame() {
    try {
        if (!supabase) {
            throw new Error('Supabase не инициализирован');
        }
        
        console.log('Создаем новую игру...');
        
        const { data: game, error } = await supabase
            .from('chess_games')
            .insert({
                white_player: playerId,
                status: 'waiting',
                game_time_ms: 600000,
                current_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                turn: 'white',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('Ошибка создания игры:', error);
            alert('Не удалось создать игру: ' + error.message);
            return;
        }
        
        console.log('Игра создана:', game);
        currentGame = game;
        await joinGame(game.id);
        
    } catch (error) {
        console.error('Ошибка в createGame:', error);
        alert('Ошибка создания игры: ' + error.message);
    }
}

async function joinGame(gameId) {
    try {
        if (!supabase) return;
        
        // Получаем данные игры
        const { data: game, error } = await supabase
            .from('chess_games')
            .select('*')
            .eq('id', gameId)
            .single();
        
        if (error) {
            console.error('Ошибка получения игры:', error);
            return;
        }
        
        // Если игра в ожидании и мы не создатель - присоединяемся как черные
        if (game.status === 'waiting' && game.white_player !== playerId) {
            const { error: updateError } = await supabase
                .from('chess_games')
                .update({
                    black_player: playerId,
                    status: 'active'
                })
                .eq('id', gameId);
            
            if (updateError) {
                console.error('Ошибка присоединения к игре:', updateError);
                return;
            }
            
            game.black_player = playerId;
            game.status = 'active';
        }
        
        currentGame = game;
        setupGame();
        updateGameDisplay();
        
        // Подписываемся на обновления этой игры
        subscribeToGame();
        
    } catch (error) {
        console.error('Ошибка в joinGame:', error);
    }
}

async function loadAvailableGames() {
    try {
        if (!supabase) {
            document.getElementById('games-list').innerHTML = 
                '<div style="color: #ccc; padding: 10px;">База данных не подключена</div>';
            return;
        }
        
        const { data: games, error } = await supabase
            .from('chess_games')
            .select(`
                *,
                white_player_data:players!white_player(username),
                black_player_data:players!black_player(username)
            `)
            .in('status', ['waiting', 'active'])
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) {
            console.error('Ошибка загрузки игр:', error);
            return;
        }
        
        const container = document.getElementById('games-list');
        container.innerHTML = '';
        
        if (games.length === 0) {
            container.innerHTML = '<div style="color: #ccc; padding: 10px;">Нет активных игр</div>';
            return;
        }
        
        games.forEach(game => {
            const gameElement = document.createElement('div');
            gameElement.className = 'game-item';
            gameElement.onclick = () => joinGame(game.id);
            
            const whiteName = game.white_player_data?.username || 'Белые';
            const blackName = game.black_player_data?.username || 'Ожидание...';
            const isMyGame = game.white_player === playerId || game.black_player === playerId;
            
            gameElement.innerHTML = `
                <div style="font-weight: 500; ${isMyGame ? 'color: #3b82f6;' : ''}">
                    ${whiteName} vs ${blackName}
                </div>
                <div style="font-size: 0.9rem; color: #ccc; margin-top: 5px;">
                    ${new Date(game.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    <span class="status-badge ${game.status}">
                        ${game.status === 'waiting' ? 'Ожидание' : 'В процессе'}
                    </span>
                    ${isMyGame ? '<span style="color: #3b82f6; margin-left: 5px;">(Ваша)</span>' : ''}
                </div>
            `;
            
            container.appendChild(gameElement);
        });
        
    } catch (error) {
        console.error('Ошибка в loadAvailableGames:', error);
    }
}

function subscribeToLobby() {
    if (!supabase) return;
    
    try {
        const lobbyChannel = supabase.channel('lobby-channel')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'chess_games'
            }, () => {
                loadAvailableGames();
            })
            .subscribe((status) => {
                console.log('Подписка на лобби:', status);
            });
    } catch (error) {
        console.error('Ошибка подписки на лобби:', error);
    }
}

// =================== НАСТРОЙКА ИГРЫ ===================
function setupGame() {
    if (!currentGame) return;
    
    console.log('Настраиваем игру:', currentGame.id);
    
    // Уничтожаем предыдущую доску
    if (board) {
        try {
            board.destroy();
        } catch (e) {
            console.warn('Ошибка при уничтожении доски:', e);
        }
    }
    
    // Инициализируем шахматный движок с текущей позицией
    try {
        chess = new Chess();
        chess.load(currentGame.current_fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    } catch (error) {
        console.error('Ошибка загрузки FEN:', error);
        chess = new Chess();
    }
    
    // Инициализируем доску
    const boardElement = document.getElementById('board');
    if (!boardElement) {
        console.error('Элемент #board не найден!');
        return;
    }
    
    board = Chessboard('board', {
        position: chess.fen(),
        draggable: true,
        pieceTheme: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/{piece}.png',
        onDrop: handleMove,
        orientation: getBoardOrientation(),
        showNotation: true
    });
    
    // Сбрасываем таймеры
    timers.white = currentGame.game_time_ms || 600000;
    timers.black = currentGame.game_time_ms || 600000;
    timers.lastUpdate = Date.now();
    
    // Обновляем отображение
    updateGameDisplay();
    
    // Загружаем историю ходов
    loadMoveHistory();
    
    // Запускаем таймер
    startTimer();
    
    console.log('Игра настроена');
}

function getBoardOrientation() {
    if (!currentGame) return 'white';
    
    if (currentGame.white_player === playerId) return 'white';
    if (currentGame.black_player === playerId) return 'black';
    
    // Если мы наблюдатель, показываем с белой стороны
    return 'white';
}

async function updateGameDisplay() {
    if (!currentGame) return;
    
    // Обновляем имена игроков
    await updatePlayerName(currentGame.white_player, 'white-name');
    await updatePlayerName(currentGame.black_player, 'black-name');
    
    // Обновляем таймеры
    updateTimerDisplay();
    
    // Подсвечиваем активного игрока
    const isWhiteTurn = currentGame.turn === 'white';
    document.getElementById('white-player').classList.toggle('active', isWhiteTurn);
    document.getElementById('black-player').classList.toggle('active', !isWhiteTurn);
}

async function updatePlayerName(playerId, elementId) {
    if (!playerId) {
        document.getElementById(elementId).textContent = 'Ожидание...';
        return;
    }
    
    try {
        const { data: player } = await supabase
            .from('players')
            .select('username, rating')
            .eq('id', playerId)
            .single();
        
        if (player) {
            document.getElementById(elementId).textContent = 
                `${player.username} (${player.rating})`;
        } else {
            document.getElementById(elementId).textContent = 'Игрок';
        }
    } catch (error) {
        document.getElementById(elementId).textContent = 'Игрок';
    }
}

// =================== ОБРАБОТКА ХОДОВ ===================
async function handleMove(source, target) {
    if (!currentGame || !chess) {
        board.position(chess.fen());
        return 'snapback';
    }
    
    // Проверяем, что это наш ход
    const isOurTurn = (currentGame.turn === 'white' && currentGame.white_player === playerId) ||
                      (currentGame.turn === 'black' && currentGame.black_player === playerId);
    
    if (!isOurTurn) {
        board.position(chess.fen());
        return 'snapback';
    }
    
    // Пытаемся сделать ход
    const move = chess.move({
        from: source,
        to: target,
        promotion: 'q' // По умолчанию превращаем в ферзя
    });
    
    if (move === null) {
        board.position(chess.fen());
        return 'snapback';
    }
    
    // Проверяем превращение пешки
    if (move.flags.includes('p') && !move.promotion) {
        // Показываем окно выбора фигуры
        showPromotionModal(source, target);
        return 'snapback';
    }
    
    // Сохраняем ход
    await saveMove(move);
    
    // Проверяем конец игры
    checkGameEnd();
    
    return true;
}

async function saveMove(move) {
    if (!currentGame || !supabase) return;
    
    try {
        const moveNumber = chess.history().length;
        const isWhite = chess.turn() === 'b'; // Ход только что сделан, turn уже поменялся
        
        // Сохраняем ход в базу
        const { error: moveError } = await supabase
            .from('chess_moves')
            .insert({
                game_id: currentGame.id,
                move_number: moveNumber,
                from_square: move.from,
                to_square: move.to,
                piece: move.piece,
                captured_piece: move.captured,
                promotion: move.promotion,
                fen_after: chess.fen(),
                player_id: playerId,
                created_at: new Date().toISOString()
            });
        
        if (moveError) {
            console.error('Ошибка сохранения хода:', moveError);
            // Откатываем ход в движке
            chess.undo();
            board.position(chess.fen());
            return;
        }
        
        // Обновляем состояние игры
        const { error: gameError } = await supabase
            .from('chess_games')
            .update({
                current_fen: chess.fen(),
                turn: chess.turn() === 'w' ? 'white' : 'black',
                last_move_at: new Date().toISOString()
            })
            .eq('id', currentGame.id);
        
        if (gameError) {
            console.error('Ошибка обновления игры:', gameError);
        }
        
        // Обновляем текущую игру
        currentGame.current_fen = chess.fen();
        currentGame.turn = chess.turn() === 'w' ? 'white' : 'black';
        
        // Добавляем ход в историю
        addMoveToHistory({
            move_number: moveNumber,
            from_square: move.from,
            to_square: move.to,
            piece: move.piece,
            captured_piece: move.captured,
            promotion: move.promotion,
            fen_after: chess.fen(),
            player_id: playerId,
            created_at: new Date().toISOString()
        });
        
        // Обновляем таймеры
        updateTimers();
        
    } catch (error) {
        console.error('Ошибка в saveMove:', error);
        chess.undo();
        board.position(chess.fen());
    }
}

function showPromotionModal(source, target) {
    window.pendingPromotion = { from: source, to: target };
    document.getElementById('promotion-modal').style.display = 'flex';
}

async function completePromotion(piece) {
    document.getElementById('promotion-modal').style.display = 'none';
    
    if (!window.pendingPromotion) return;
    
    const { from, to } = window.pendingPromotion;
    const move = chess.move({
        from: from,
        to: to,
        promotion: piece
    });
    
    if (move) {
        await saveMove(move);
        checkGameEnd();
    }
    
    window.pendingPromotion = null;
}

// =================== ИСТОРИЯ ХОДОВ ===================
async function loadMoveHistory() {
    if (!currentGame || !supabase) return;
    
    try {
        const { data: moves, error } = await supabase
            .from('chess_moves')
            .select('*')
            .eq('game_id', currentGame.id)
            .order('move_number', { ascending: true });
        
        if (error) {
            console.error('Ошибка загрузки истории:', error);
            return;
        }
        
        const container = document.getElementById('moves-container');
        container.innerHTML = '';
        
        moves.forEach(move => {
            addMoveToHistory(move);
        });
        
    } catch (error) {
        console.error('Ошибка в loadMoveHistory:', error);
    }
}

function addMoveToHistory(move) {
    const container = document.getElementById('moves-container');
    const moveNumber = Math.ceil(move.move_number / 2);
    const isWhite = move.move_number % 2 === 1;
    
    let moveElement;
    
    if (isWhite) {
        moveElement = document.createElement('div');
        moveElement.className = 'move-item white';
        moveElement.innerHTML = `
            <span><strong>${moveNumber}.</strong> ${formatMove(move)}</span>
            <span style="font-size: 0.8rem; color: #aaa;">
                ${new Date(move.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
        `;
        container.appendChild(moveElement);
    } else {
        // Если это черные, добавляем к последнему ходу белых
        const lastMove = container.lastElementChild;
        if (lastMove && lastMove.classList.contains('white')) {
            const span = lastMove.querySelector('span:first-child');
            if (span) {
                span.innerHTML = span.innerHTML + ` ${formatMove(move)}`;
            }
        } else {
            moveElement = document.createElement('div');
            moveElement.className = 'move-item black';
            moveElement.innerHTML = `
                <span><strong>${moveNumber}...</strong> ${formatMove(move)}</span>
                <span style="font-size: 0.8rem; color: #aaa;">
                    ${new Date(move.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            `;
            container.appendChild(moveElement);
        }
    }
    
    container.scrollTop = container.scrollHeight;
}

function formatMove(move) {
    let notation = '';
    
    // Для простоты, используем алгебраическую нотацию из chess.js
    const tempChess = new Chess(move.fen_after);
    tempChess.undo(); // Возвращаемся к позиции перед ходом
    
    const moves = tempChess.moves({ verbose: true });
    const foundMove = moves.find(m => 
        m.from === move.from_square && m.to === move.to_square
    );
    
    if (foundMove) {
        notation = foundMove.san;
    } else {
        // Если не нашли, создаем простую нотацию
        const pieceLetter = move.piece === 'p' ? '' : move.piece.toUpperCase();
        const capture = move.captured_piece ? 'x' : '';
        notation = `${pieceLetter}${capture}${move.to_square}`;
        if (move.promotion) {
            notation += `=${move.promotion.toUpperCase()}`;
        }
    }
    
    return notation;
}

// =================== ТАЙМЕРЫ ===================
function startTimer() {
    // Очищаем предыдущий интервал
    if (window.timerInterval) {
        clearInterval(window.timerInterval);
    }
    
    window.timerInterval = setInterval(updateTimers, 1000);
}

function updateTimers() {
    if (!currentGame || currentGame.status !== 'active') return;
    
    const now = Date.now();
    const elapsed = now - timers.lastUpdate;
    
    if (currentGame.turn === 'white') {
        timers.white = Math.max(0, timers.white - elapsed);
    } else {
        timers.black = Math.max(0, timers.black - elapsed);
    }
    
    timers.lastUpdate = now;
    
    // Проверка на окончание времени
    if (timers.white <= 0) {
        endGame('black', 'time');
    } else if (timers.black <= 0) {
        endGame('white', 'time');
    }
    
    updateTimerDisplay();
}

function updateTimerDisplay() {
    document.getElementById('white-time').textContent = formatTime(timers.white);
    document.getElementById('black-time').textContent = formatTime(timers.black);
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// =================== КОНЕЦ ИГРЫ ===================
function checkGameEnd() {
    if (!chess) return;
    
    if (chess.in_checkmate()) {
        const winner = chess.turn() === 'w' ? 'black' : 'white';
        endGame(winner, 'checkmate');
    } else if (chess.in_stalemate()) {
        endGame('draw', 'stalemate');
    } else if (chess.in_threefold_repetition()) {
        endGame('draw', 'repetition');
    } else if (chess.insufficient_material()) {
        endGame('draw', 'insufficient material');
    } else if (chess.in_draw()) {
        endGame('draw', '50 move rule');
    }
}

async function endGame(winner, reason) {
    if (!currentGame || !supabase) return;
    
    try {
        const { error } = await supabase
            .from('chess_games')
            .update({
                status: 'finished',
                winner: winner
            })
            .eq('id', currentGame.id);
        
        if (error) {
            console.error('Ошибка завершения игры:', error);
            return;
        }
        
        // Обновляем текущую игру
        currentGame.status = 'finished';
        currentGame.winner = winner;
        
        // Останавливаем таймер
        if (window.timerInterval) {
            clearInterval(window.timerInterval);
        }
        
        // Показываем сообщение
        let message = '';
        if (winner === 'draw') {
            message = 'Ничья! Причина: ';
            switch (reason) {
                case 'stalemate': message += 'пат'; break;
                case 'repetition': message += 'троекратное повторение'; break;
                case 'insufficient material': message += 'недостаточный материал'; break;
                case '50 move rule': message += 'правило 50 ходов'; break;
                default: message += reason;
            }
        } else {
            message = `Победили ${winner === 'white' ? 'белые' : 'черные'}!`;
            if (reason === 'checkmate') {
                message += ' Мат!';
            } else if (reason === 'time') {
                message += ' Время вышло!';
            }
        }
        
        setTimeout(() => {
            alert(message);
            // Обновляем список игр
            loadAvailableGames();
        }, 100);
        
    } catch (error) {
        console.error('Ошибка в endGame:', error);
    }
}

async function resign() {
    if (!currentGame || !confirm('Вы уверены, что хотите сдаться?')) return;
    
    const winner = currentGame.white_player === playerId ? 'black' : 'white';
    await endGame(winner, 'resignation');
}

async function offerDraw() {
    if (!currentGame) return;
    
    // Здесь можно добавить логику предложения ничьи
    alert('Предложение ничьи отправлено сопернику');
}

function newGame() {
    if (confirm('Создать новую игру?')) {
        createGame();
    }
}

// =================== REAL-TIME ПОДПИСКА ===================
function subscribeToGame() {
    if (!currentGame || !supabase) return;
    
    // Отписываемся от предыдущего канала
    if (gameChannel) {
        supabase.removeChannel(gameChannel);
        gameChannel = null;
    }
    
    gameChannel = supabase.channel(`game-${currentGame.id}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'chess_games',
            filter: `id=eq.${currentGame.id}`
        }, async (payload) => {
            console.log('Обновление игры:', payload.new);
            
            // Игнорируем собственные обновления
            if (payload.new.last_move_at === currentGame.last_move_at) return;
            
            currentGame = payload.new;
            
            // Обновляем доску если изменилась позиция
            if (payload.new.current_fen !== chess.fen()) {
                chess.load(payload.new.current_fen);
                board.position(chess.fen());
            }
            
            // Обновляем отображение
            updateGameDisplay();
            
            // Загружаем новые ходы если они есть
            await loadMoveHistory();
            
            // Проверяем конец игры
            if (payload.new.status === 'finished') {
                endGame(payload.new.winner, 'remote');
            }
        })
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'chess_moves',
            filter: `game_id=eq.${currentGame.id}`
        }, async (payload) => {
            // Игнорируем собственные ходы
            if (payload.new.player_id === playerId) return;
            
            console.log('Новый ход от соперника:', payload.new);
            
            // Обновляем доску
            chess.load(payload.new.fen_after);
            board.position(chess.fen());
            
            // Добавляем ход в историю
            addMoveToHistory(payload.new);
            
            // Проверяем конец игры
            checkGameEnd();
        })
        .subscribe((status) => {
            console.log('Статус подписки на игру:', status);
        });
}

// =================== ЧАТ ===================
function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message || !currentGame) return;
    
    const chatContainer = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.innerHTML = `<strong>${playerUsername}:</strong> ${message}`;
    messageElement.style.padding = '8px 0';
    messageElement.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
    chatContainer.appendChild(messageElement);
    
    // Прокручиваем вниз
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // Очищаем поле ввода
    input.value = '';
}

function handleChatKeypress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

// =================== ЭКСПОРТ ФУНКЦИЙ ДЛЯ HTML ===================
// Делаем функции доступными глобально
window.createGame = createGame;
window.updateUsername = updateUsername;
window.offerDraw = offerDraw;
window.resign = resign;
window.newGame = newGame;
window.completePromotion = completePromotion;
window.sendChatMessage = sendChatMessage;
window.handleChatKeypress = handleChatKeypress;

console.log('chess-game.js загружен!');
