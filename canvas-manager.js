class CanvasManager {
    constructor() {
        this.canvas = document.getElementById('drawingCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Настройки рисования
        this.currentTool = 'brush';
        this.currentColor = '#000000';
        this.currentSize = 5;
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        
        // История для отмены
        this.history = [];
        this.maxHistory = 20;
        
        // Для предотвращения циклических обновлений
        this.isLoadingExternal = false;
        this.lastSavedData = null;
        
        // Оптимизация
        this.debounceTimer = null;
        this.saveDelay = 300; // 300ms дебаунс для сохранения
        
        // Счетчик обновлений для отладки
        this.updateCount = 0;
        
        this.init();
    }

    init() {
        console.log('🎨 Инициализация CanvasManager...');
        
        // Настройка контекста
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.currentSize;
        
        // Создаем белый фон
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Обработчики событий мыши
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
        
        // Обработчики событий касания
        this.canvas.addEventListener('touchstart', this.handleTouch.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouch.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
        
        // Отключение контекстного меню на canvas
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Обновление превью размера кисти
        this.updateBrushPreview();
        
        console.log('✅ CanvasManager инициализирован');
    }

    // Установка инструмента
    setTool(tool) {
        this.currentTool = tool;
        
        // Обновление курсора
        this.canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
        
        console.log(`🛠️ Инструмент изменен: ${tool}`);
    }

    // Установка цвета
    setColor(color) {
        this.currentColor = color;
        if (this.currentTool !== 'eraser') {
            this.ctx.strokeStyle = color;
            this.ctx.globalCompositeOperation = 'source-over';
        }
        
        // Обновление превью
        const preview = document.getElementById('sizePreview');
        if (preview) {
            preview.style.color = color;
        }
        
        console.log(`🎨 Цвет изменен: ${color}`);
    }

    // Установка размера
    setSize(size) {
        this.currentSize = parseInt(size);
        this.ctx.lineWidth = this.currentSize;
        
        // Обновление отображения
        const sizeValueElement = document.getElementById('sizeValue');
        if (sizeValueElement) {
            sizeValueElement.textContent = `${this.currentSize}px`;
        }
        
        // Обновление превью
        this.updateBrushPreview();
        
        console.log(`📏 Размер изменен: ${size}px`);
    }

    // Обновление превью кисти
    updateBrushPreview() {
        const preview = document.getElementById('sizePreview');
        if (preview) {
            preview.style.width = `${this.currentSize * 2}px`;
            preview.style.height = `${this.currentSize * 2}px`;
            preview.style.color = this.currentColor;
        }
    }

    // Начало рисования
    startDrawing(e) {
        e.preventDefault();
        
        this.isDrawing = true;
        
        // Сохраняем текущее состояние в историю перед изменением
        this.saveToHistory();
        
        // Получаем координаты
        const { x, y } = this.getCoordinates(e);
        
        // Начинаем новый путь
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        
        // Рисуем первую точку (для точечных кликов)
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        
        this.lastX = x;
        this.lastY = y;
        
        console.log('✏️ Начало рисования');
    }

    // Процесс рисования
    draw(e) {
        if (!this.isDrawing) return;
        
        e.preventDefault();
        
        // Получаем координаты
        const { x, y } = this.getCoordinates(e);
        
        // Настраиваем контекст в зависимости от инструмента
        if (this.currentTool === 'eraser') {
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.strokeStyle = 'rgba(0,0,0,1)'; // Для ластика
        } else {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = this.currentColor;
        }
        
        // Продолжаем путь
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        
        this.lastX = x;
        this.lastY = y;
        
        // Автосохранение с дебаунсом
        this.debounceSave();
    }

    // Остановка рисования
    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.ctx.closePath();
            
            // Сохраняем окончательные изменения
            this.saveCanvas();
            
            console.log('🛑 Остановка рисования');
        }
    }

    // Обработка касаний
    handleTouch(e) {
        e.preventDefault();
        
        if (e.type === 'touchstart') {
            const touch = e.touches[0];
            this.startDrawing(touch);
        } else if (e.type === 'touchmove') {
            const touch = e.touches[0];
            this.draw(touch);
        }
    }

    // Получение координат относительно холста
    getCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        let clientX, clientY;
        
        if (e.type.includes('touch')) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    // Очистка холста
    clearCanvas() {
        if (confirm('Вы уверены, что хотите очистить холст? Все пользователи увидят очищенный холст.')) {
            // Сохраняем текущее состояние в историю
            this.saveToHistory();
            
            // Очищаем холст
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Сохраняем изменения
            this.saveCanvas();
            
            this.showToast('Холст очищен для всех пользователей', 'success');
            console.log('🧹 Холст очищен');
        }
    }

    // Отмена последнего действия (только локально)
    undo() {
        if (this.history.length > 0) {
            const lastState = this.history.pop();
            
            // Восстанавливаем изображение
            const img = new Image();
            img.onload = () => {
                // Очищаем и рисуем сохраненное состояние
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.drawImage(img, 0, 0);
                
                // НЕ сохраняем в базу при отмене, чтобы не конфликтовать с другими
                // Обновляем только локально
                this.lastSavedData = this.canvas.toDataURL('image/png');
            };
            img.src = lastState;
            
            // Обновляем состояние кнопки отмены
            const undoBtn = document.getElementById('undoBtn');
            if (undoBtn) {
                undoBtn.disabled = this.history.length === 0;
            }
            
            this.showToast('Действие отменено (только локально)', 'info');
            console.log('↩️ Действие отменено');
        }
    }

    // Сохранение в историю
    saveToHistory() {
        const imageData = this.canvas.toDataURL('image/png');
        this.history.push(imageData);
        
        // Ограничиваем размер истории
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        
        // Активируем кнопку отмены
        const undoBtn = document.getElementById('undoBtn');
        if (undoBtn) {
            undoBtn.disabled = false;
        }
    }

    // Дебаунс для автосохранения
    debounceSave() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = setTimeout(() => {
            this.saveCanvas();
        }, this.saveDelay);
    }

    // Сохранение холста в базу
    async saveCanvas() {
        if (this.isLoadingExternal) {
            console.log('⏸️ Пропускаем сохранение, загружаем внешние изменения');
            return;
        }
        
        const imageData = this.canvas.toDataURL('image/png');
        
        // Проверяем, изменилось ли изображение
        if (this.lastSavedData === imageData) {
            return;
        }
        
        console.log('💾 Сохранение локальных изменений...');
        
        // Сохраняем в Supabase
        const success = await window.supabaseClient.saveCanvas(imageData);
        
        if (success) {
            this.lastSavedData = imageData;
            this.updateLastSaved();
            
            // Показываем уведомление только при явном сохранении
            if (!this.isDrawing) {
                this.showToast('Изменения сохранены', 'success');
            }
        } else {
            this.showToast('Ошибка сохранения', 'error');
        }
    }

    // Загрузка изображения на холст (используется для внешних обновлений)
    loadImage(imageData, isExternal = false) {
        if (!imageData) return;
        
        // Устанавливаем флаг загрузки внешних данных
        if (isExternal) {
            this.isLoadingExternal = true;
        }
        
        const img = new Image();
        img.onload = () => {
            // Сохраняем текущее состояние в историю перед обновлением
            if (!isExternal) {
                this.saveToHistory();
            }
            
            // Очищаем холст и рисуем загруженное изображение
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
            
            // Обновляем последние сохраненные данные
            this.lastSavedData = this.canvas.toDataURL('image/png');
            
            if (isExternal) {
                console.log('🔄 Холст обновлен внешними изменениями');
                this.showToast('Холст обновлен другим пользователем', 'info');
            }
            
            // Снимаем флаг после завершения
            this.isLoadingExternal = false;
        };
        
        img.onerror = (error) => {
            console.error('❌ Ошибка загрузки изображения:', error);
            this.isLoadingExternal = false;
            if (isExternal) {
                this.showToast('Ошибка загрузки обновлений', 'error');
            }
        };
        
        img.src = imageData;
    }

    // Обновление времени последнего сохранения
    updateLastSaved() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const lastUpdatedElement = document.getElementById('lastUpdated');
        if (lastUpdatedElement) {
            lastUpdatedElement.textContent = `Последнее обновление: ${timeString}`;
        }
    }

    // Получение данных холста
    getCanvasData() {
        return this.canvas.toDataURL('image/png');
    }

    // Показать уведомление
    showToast(message, type = 'info') {
        // Создаем элемент уведомления
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toast.style.zIndex = '10000';
        
        // Добавляем на страницу
        document.body.appendChild(toast);
        
        // Показываем
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Удаляем через 3 секунды
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    // Сброс состояния (для отладки)
    resetState() {
        this.history = [];
        this.lastSavedData = null;
        const undoBtn = document.getElementById('undoBtn');
        if (undoBtn) {
            undoBtn.disabled = true;
        }
    }
}

// Создаем глобальный экземпляр менеджера
window.canvasManager = new CanvasManager();
