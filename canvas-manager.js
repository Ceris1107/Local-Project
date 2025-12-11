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
        
        // Оптимизация
        this.debounceTimer = null;
        this.debounceDelay = 500; // 0.5 секунды
        
        this.init();
    }

    init() {
        // Настройка контекста
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Обработчики событий мыши
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
        
        // Обработчики событий касания
        this.canvas.addEventListener('touchstart', this.handleTouch.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouch.bind(this));
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
        
        // Загрузка сохраненного изображения
        this.loadImage();
        
        // Обновление превью размера кисти
        this.updateBrushPreview();
    }

    // Установка инструмента
    setTool(tool) {
        this.currentTool = tool;
        
        // Обновление курсора
        this.canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
        
        // Если ластик, устанавливаем цвет фона
        if (tool === 'eraser') {
            this.ctx.globalCompositeOperation = 'destination-out';
        } else {
            this.ctx.globalCompositeOperation = 'source-over';
        }
        
        console.log(`Инструмент изменен: ${tool}`);
    }

    // Установка цвета
    setColor(color) {
        this.currentColor = color;
        this.ctx.strokeStyle = color;
        
        // Обновление превью
        const preview = document.getElementById('sizePreview');
        preview.style.color = color;
        
        console.log(`Цвет изменен: ${color}`);
    }

    // Установка размера
    setSize(size) {
        this.currentSize = parseInt(size);
        this.ctx.lineWidth = this.currentSize;
        
        // Обновление отображения
        document.getElementById('sizeValue').textContent = `${this.currentSize}px`;
        
        // Обновление превью
        this.updateBrushPreview();
        
        console.log(`Размер изменен: ${size}px`);
    }

    // Обновление превью кисти
    updateBrushPreview() {
        const preview = document.getElementById('sizePreview');
        preview.style.width = `${this.currentSize * 2}px`;
        preview.style.height = `${this.currentSize * 2}px`;
    }

    // Начало рисования
    startDrawing(e) {
        this.isDrawing = true;
        
        // Сохраняем текущее состояние в историю
        this.saveToHistory();
        
        // Получаем координаты
        const { x, y } = this.getCoordinates(e);
        
        // Начинаем новый путь
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        
        this.lastX = x;
        this.lastY = y;
    }

    // Процесс рисования
    draw(e) {
        if (!this.isDrawing) return;
        
        e.preventDefault();
        
        // Получаем координаты
        const { x, y } = this.getCoordinates(e);
        
        // Рисуем линию
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        
        this.lastX = x;
        this.lastY = y;
        
        // Дебаунс для автосохранения
        this.debounceSave();
    }

    // Остановка рисования
    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.ctx.closePath();
            
            // Сохраняем изменения
            this.saveCanvas();
        }
    }

    // Обработка касаний
    handleTouch(e) {
        e.preventDefault();
        
        if (e.type === 'touchstart') {
            this.startDrawing(e.touches[0]);
        } else if (e.type === 'touchmove') {
            this.draw(e.touches[0]);
        }
    }

    // Получение координат относительно холста
    getCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    // Очистка холста
    clearCanvas() {
        // Сохраняем текущее состояние в историю
        this.saveToHistory();
        
        // Очищаем холст
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Сохраняем изменения
        this.saveCanvas();
        
        console.log('Холст очищен');
    }

    // Отмена последнего действия
    undo() {
        if (this.history.length > 0) {
            const lastState = this.history.pop();
            
            // Восстанавливаем изображение
            const img = new Image();
            img.onload = () => {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.drawImage(img, 0, 0);
                this.saveCanvas();
            };
            img.src = lastState;
            
            // Обновляем состояние кнопки отмены
            document.getElementById('undoBtn').disabled = this.history.length === 0;
            
            console.log('Действие отменено');
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
        document.getElementById('undoBtn').disabled = false;
    }

    // Дебаунс для автосохранения
    debounceSave() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = setTimeout(() => {
            this.saveCanvas();
        }, this.debounceDelay);
    }

    // Сохранение холста
    saveCanvas() {
        const imageData = this.canvas.toDataURL('image/png');
        
        // Сохраняем в Supabase
        window.supabaseClient.saveCanvas(imageData)
            .then(success => {
                if (success) {
                    this.showToast('Изменения сохранены', 'success');
                    this.updateLastSaved();
                }
            });
    }

    // Загрузка изображения на холст
    loadImage(imageData) {
        if (!imageData) return;
        
        const img = new Image();
        img.onload = () => {
            // Очищаем холст и рисуем загруженное изображение
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
            
            console.log('Изображение загружено на холст');
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
        
        document.getElementById('lastUpdated').textContent = 
            `Последнее обновление: ${timeString}`;
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
        
        // Добавляем на страницу
        document.body.appendChild(toast);
        
        // Показываем
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Удаляем через 3 секунды
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Создаем глобальный экземпляр менеджера
window.canvasManager = new CanvasManager();
