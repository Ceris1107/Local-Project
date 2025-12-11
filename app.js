document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎨 Приложение рисовалки загружается...');
    
    // Инициализация клиента Supabase
    const supabaseClient = window.supabaseClient;
    const canvasManager = window.canvasManager;
    
    // Подключение к Supabase
    const isConnected = await supabaseClient.connect();
    
    // Обновление статуса соединения
    const statusElement = document.getElementById('connectionStatus');
    const statusDot = statusElement.querySelector('.status-dot');
    
    if (isConnected) {
        statusDot.classList.add('connected');
        statusElement.innerHTML = `
            <span class="status-dot connected"></span>
            <span>Подключено к серверу</span>
        `;
        
        // Загрузка текущего состояния холста
        const canvasData = await supabaseClient.loadCanvas();
        if (canvasData && canvasData.imageData) {
            canvasManager.loadImage(canvasData.imageData);
            canvasManager.updateLastSaved();
            
            // Форматируем дату последнего обновления
            const lastUpdated = new Date(canvasData.lastUpdated);
            const formattedDate = lastUpdated.toLocaleString('ru-RU');
            document.getElementById('lastUpdated').textContent = 
                `Последнее обновление: ${formattedDate}`;
        }
        
        // Подписка на обновления от других пользователей
        supabaseClient.onCanvasUpdate((newData) => {
            console.log('🔄 Получены обновления от другого пользователя');
            canvasManager.loadImage(newData.canvas_data);
            
            // Обновляем время
            const lastUpdated = new Date(newData.last_updated);
            const formattedDate = lastUpdated.toLocaleString('ru-RU');
            document.getElementById('lastUpdated').textContent = 
                `Последнее обновление: ${formattedDate}`;
            
            // Показываем уведомление
            canvasManager.showToast('Холст обновлен другим пользователем', 'info');
        });
    } else {
        statusElement.innerHTML = `
            <span class="status-dot" style="background: #ff3b30;"></span>
            <span>Не подключено к серверу (режим офлайн)</span>
        `;
        canvasManager.showToast('Работаем в офлайн-режиме', 'error');
    }
    
    // Инициализация элементов управления
    
    // Инструменты
    document.querySelectorAll('[data-tool]').forEach(button => {
        button.addEventListener('click', (e) => {
            // Убираем активный класс у всех кнопок
            document.querySelectorAll('.tool-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Добавляем активный класс нажатой кнопке
            e.currentTarget.classList.add('active');
            
            // Устанавливаем инструмент
            const tool = e.currentTarget.dataset.tool;
            canvasManager.setTool(tool);
        });
    });
    
    // Цвета
    document.querySelectorAll('.color-option').forEach(colorOption => {
        colorOption.addEventListener('click', (e) => {
            // Убираем активный класс у всех цветов
            document.querySelectorAll('.color-option').forEach(option => {
                option.classList.remove('active');
            });
            
            // Добавляем активный класс выбранному цвету
            e.currentTarget.classList.add('active');
            
            // Устанавливаем цвет
            const color = e.currentTarget.dataset.color;
            canvasManager.setColor(color);
            
            // Обновляем кастомный выбор цвета
            document.getElementById('customColor').value = color;
        });
    });
    
    // Кастомный выбор цвета
    document.getElementById('customColor').addEventListener('input', (e) => {
        const color = e.target.value;
        canvasManager.setColor(color);
        
        // Обновляем активный цвет в палитре
        document.querySelectorAll('.color-option').forEach(option => {
            option.classList.remove('active');
        });
    });
    
    // Размер кисти
    const brushSizeInput = document.getElementById('brushSize');
    brushSizeInput.addEventListener('input', (e) => {
        canvasManager.setSize(e.target.value);
    });
    
    // Кнопка сохранения
    document.getElementById('saveBtn').addEventListener('click', () => {
        canvasManager.saveCanvas();
        canvasManager.showToast('Холст сохранен!', 'success');
    });
    
    // Кнопка очистки
    document.getElementById('clearBtn').addEventListener('click', () => {
        if (confirm('Вы уверены, что хотите очистить холст? Это действие нельзя отменить.')) {
            canvasManager.clearCanvas();
            canvasManager.showToast('Холст очищен', 'success');
        }
    });
    
    // Кнопка отмены
    document.getElementById('undoBtn').addEventListener('click', () => {
        canvasManager.undo();
    });
    
    // Адаптивный размер холста
    function resizeCanvas() {
        const container = document.querySelector('.canvas-wrapper');
        const canvas = document.getElementById('drawingCanvas');
        
        const containerWidth = container.clientWidth - 40; // Учитываем padding
        const containerHeight = container.clientHeight - 40;
        
        // Сохраняем соотношение сторон
        const scale = Math.min(
            containerWidth / 800,
            containerHeight / 600
        );
        
        const width = 800 * scale;
        const height = 600 * scale;
        
        // Устанавливаем размеры отображения
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
    }
    
    // Инициализация размера холста
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Горячие клавиши
    document.addEventListener('keydown', (e) => {
        // Ctrl+Z для отмены
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            canvasManager.undo();
        }
        
        // Ctrl+S для сохранения
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            canvasManager.saveCanvas();
            canvasManager.showToast('Холст сохранен (Ctrl+S)', 'success');
        }
        
        // Delete для очистки
        if (e.key === 'Delete') {
            canvasManager.clearCanvas();
        }
    });
    
    // Инструкция при первом посещении
    if (!localStorage.getItem('drawingAppVisited')) {
        setTimeout(() => {
            canvasManager.showToast(
                '💡 Совет: Используйте Ctrl+Z для отмены, Ctrl+S для сохранения',
                'info'
            );
            localStorage.setItem('drawingAppVisited', 'true');
        }, 2000);
    }
    
    console.log('✅ Приложение успешно инициализировано');
});
