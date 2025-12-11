document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎨 Приложение рисовалки загружается...');
    
    // Инициализация клиентов
    const supabaseClient = window.supabaseClient;
    const canvasManager = window.canvasManager;
    
    // Подключение к Supabase
    console.log('🔄 Подключение к Supabase...');
    const isConnected = await supabaseClient.connect();
    
    if (isConnected) {
        // Регистрируем callback для получения обновлений от других пользователей
        supabaseClient.onCanvasUpdate((data) => {
            console.log('📨 Получены данные обновления:', data.isExternal ? 'Внешние' : 'Внутренние');
            
            if (data.imageData) {
                // Загружаем изображение на холст
                canvasManager.loadImage(data.imageData, data.isExternal);
                
                // Обновляем время последнего обновления
                if (data.lastUpdated) {
                    const lastUpdated = new Date(data.lastUpdated);
                    const formattedDate = lastUpdated.toLocaleString('ru-RU');
                    document.getElementById('lastUpdated').textContent = 
                        `Последнее обновление: ${formattedDate}`;
                }
            }
        });
    } else {
        canvasManager.showToast('Работаем в офлайн-режиме. Изменения не синхронизируются.', 'error');
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
            
            // Если выбран ластик, меняем цвет на белый в настройках
            if (tool === 'eraser') {
                canvasManager.setColor('#ffffff');
            }
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
            
            // Переключаемся на кисть при выборе цвета
            document.querySelectorAll('[data-tool]').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelector('[data-tool="brush"]').classList.add('active');
            canvasManager.setTool('brush');
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
        
        // Переключаемся на кисть
        document.querySelectorAll('[data-tool]').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector('[data-tool="brush"]').classList.add('active');
        canvasManager.setTool('brush');
    });
    
    // Размер кисти
    const brushSizeInput = document.getElementById('brushSize');
    brushSizeInput.addEventListener('input', (e) => {
        canvasManager.setSize(e.target.value);
    });
    
    // Кнопка сохранения
    document.getElementById('saveBtn').addEventListener('click', async () => {
        canvasManager.showToast('Сохранение...', 'info');
        await canvasManager.saveCanvas();
    });
    
    // Кнопка очистки
    document.getElementById('clearBtn').addEventListener('click', () => {
        canvasManager.clearCanvas();
    });
    
    // Кнопка отмены
    document.getElementById('undoBtn').addEventListener('click', () => {
        canvasManager.undo();
    });
    
    // Адаптивный размер холста
    function resizeCanvas() {
        const container = document.querySelector('.canvas-wrapper');
        const canvas = document.getElementById('drawingCanvas');
        
        if (!container || !canvas) return;
        
        const containerWidth = container.clientWidth - 40; // Учитываем padding
        const containerHeight = container.clientHeight - 40;
        
        // Сохраняем соотношение сторон
        const scale = Math.min(
            containerWidth / 800,
            containerHeight / 600
        );
        
        const width = 800 * scale;
        const height = 600 * scale;
        
        // Устанавливаем размеры отображения (не меняя внутренний размер)
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
    }
    
    // Инициализация размера холста
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Горячие клавиши
    document.addEventListener('keydown', (e) => {
        // Ctrl+Z для отмены
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            canvasManager.undo();
        }
        
        // Ctrl+Shift+Z или Ctrl+Y для повтора (не реализовано)
        if (((e.ctrlKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && e.key === 'y')) && !e.altKey) {
            e.preventDefault();
            canvasManager.showToast('Повтор действия не реализован', 'info');
        }
        
        // Ctrl+S для сохранения
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            canvasManager.saveCanvas();
            canvasManager.showToast('Сохранено (Ctrl+S)', 'success');
        }
        
        // Delete для очистки
        if (e.key === 'Delete' || e.key === 'Del') {
            e.preventDefault();
            canvasManager.clearCanvas();
        }
        
        // B для кисти
        if (e.key === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            document.querySelector('[data-tool="brush"]').click();
        }
        
        // E для ластика
        if (e.key === 'e' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            document.querySelector('[data-tool="eraser"]').click();
        }
        
        // Цифры для быстрого выбора размера
        if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
            const size = parseInt(e.key) * 5;
            document.getElementById('brushSize').value = size;
            canvasManager.setSize(size);
            canvasManager.showToast(`Размер кисти: ${size}px`, 'info');
        }
    });
    
    // Инструкция при первом посещении
    if (!localStorage.getItem('drawingAppVisited')) {
        setTimeout(() => {
            canvasManager.showToast(
                '💡 Совет: Используйте B для кисти, E для ластика, цифры 1-9 для размера, Ctrl+Z для отмены',
                'info'
            );
            localStorage.setItem('drawingAppVisited', 'true');
        }, 2000);
    }
    
    // Обработка закрытия страницы
    window.addEventListener('beforeunload', () => {
        supabaseClient.disconnect();
    });
    
    // Периодическая проверка соединения
    setInterval(async () => {
        const isStillConnected = supabaseClient.getConnectionStatus();
        if (!isStillConnected) {
            console.log('🔄 Попытка переподключения...');
            await supabaseClient.connect();
        }
    }, 30000); // Каждые 30 секунд
    
    console.log('✅ Приложение успешно инициализировано');
});
