// Конфигурация Supabase
const SUPABASE_URL = 'https://rxnhjdiomffjwtakfvot.supabase.co'; // Замените на ваш URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4bmhqZGlvbWZmand0YWtmdm90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NzA1MTQsImV4cCI6MjA4MTA0NjUxNH0.kl52B9r0UdTTKrRurpC3wOHKhxxpcS_Yyms1SK5ltXw'; // Замените на ваш ключ

// Инициализация клиента Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

class SupabaseClient {
    constructor() {
        this.canvasId = 1; // У нас только один холст с id=1
        this.isConnected = false;
        this.onlineUsers = 1;
        this.updateCallbacks = [];
        this.presenceChannel = null;
        this.realtimeChannel = null;
        this.lastImageData = null;
        this.isSaving = false;
        this.debounceTimeout = null;
    }

    // Подключение к серверу
    async connect() {
        try {
            console.log('🔄 Подключение к Supabase...');
            
            // Проверяем соединение
            const { data, error } = await supabase.from('canvas_state').select('id').limit(1);
            
            if (error) {
                console.error('❌ Ошибка проверки соединения:', error);
                throw error;
            }
            
            this.isConnected = true;
            console.log('✅ Подключено к Supabase');
            
            // Загружаем текущее состояние
            await this.loadCanvas();
            
            // Настраиваем подписку на обновления в реальном времени
            await this.setupRealtimeSubscription();
            
            // Настраиваем Presence для подсчета онлайн пользователей
            await this.setupPresence();
            
            this.updateConnectionStatus(true);
            
            return true;
        } catch (error) {
            console.error('❌ Ошибка подключения к Supabase:', error);
            this.updateConnectionStatus(false);
            return false;
        }
    }

    // Загрузка состояния холста
    async loadCanvas() {
        try {
            console.log('📥 Загрузка состояния холста...');
            const { data, error } = await supabase
                .from('canvas_state')
                .select('*')
                .eq('id', this.canvasId)
                .single();
            
            if (error && error.code !== 'PGRST116') {
                console.error('❌ Ошибка загрузки холста:', error);
                throw error;
            }
            
            let result = {
                imageData: null,
                lastUpdated: new Date().toISOString()
            };
            
            if (data && data.canvas_data) {
                result.imageData = data.canvas_data;
                result.lastUpdated = data.last_updated;
                this.lastImageData = data.canvas_data;
                console.log('✅ Холст загружен');
            } else {
                console.log('ℹ️ Холст пустой, создаем новый');
            }
            
            // Вызываем коллбэки с загруженными данными
            this.updateCallbacks.forEach(callback => {
                callback(result);
            });
            
            return result;
        } catch (error) {
            console.error('❌ Критическая ошибка загрузки холста:', error);
            return null;
        }
    }

    // Сохранение состояния холста
    async saveCanvas(imageData) {
        // Защита от слишком частых сохранений
        if (this.isSaving) {
            console.log('⏳ Пропускаем сохранение, предыдущее еще выполняется');
            return false;
        }
        
        // Проверяем, изменились ли данные
        if (this.lastImageData === imageData) {
            console.log('ℹ️ Данные не изменились, пропускаем сохранение');
            return false;
        }
        
        // Дебаунс: ждем 300мс перед сохранением
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
        
        return new Promise((resolve) => {
            this.debounceTimeout = setTimeout(async () => {
                this.isSaving = true;
                
                try {
                    console.log('💾 Сохранение холста в Supabase...');
                    
                    const { data, error } = await supabase
                        .from('canvas_state')
                        .upsert({
                            id: this.canvasId,
                            canvas_data: imageData,
                            last_updated: new Date().toISOString()
                        }, {
                            onConflict: 'id'
                        });
                    
                    if (error) {
                        console.error('❌ Ошибка сохранения холста:', error);
                        resolve(false);
                        return;
                    }
                    
                    this.lastImageData = imageData;
                    console.log('✅ Холст сохранен в Supabase');
                    
                    // Обновляем локально, но не вызываем коллбэки (чтобы не обновлять текущего пользователя)
                    resolve(true);
                } catch (error) {
                    console.error('❌ Неожиданная ошибка при сохранении:', error);
                    resolve(false);
                } finally {
                    this.isSaving = false;
                }
            }, 300); // 300ms debounce
        });
    }

    // Настройка подписки на обновления в реальном времени
    async setupRealtimeSubscription() {
        try {
            console.log('🔔 Настройка real-time подписки...');
            
            // Удаляем старый канал, если существует
            if (this.realtimeChannel) {
                await supabase.removeChannel(this.realtimeChannel);
            }
            
            // Создаем новый канал с подпиской на изменения таблицы
            this.realtimeChannel = supabase
                .channel('canvas-realtime')
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'canvas_state',
                        filter: `id=eq.${this.canvasId}`
                    },
                    (payload) => {
                        console.log('🔄 Получено обновление холста от другого пользователя');
                        
                        // Проверяем, что это не наше собственное сохранение
                        if (payload.new.canvas_data !== this.lastImageData) {
                            // Обновляем локальное состояние
                            this.lastImageData = payload.new.canvas_data;
                            
                            // Вызываем все callback-функции
                            this.updateCallbacks.forEach(callback => {
                                callback({
                                    imageData: payload.new.canvas_data,
                                    lastUpdated: payload.new.last_updated,
                                    isExternal: true // Флаг, что это внешнее изменение
                                });
                            });
                        }
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'canvas_state'
                    },
                    (payload) => {
                        console.log('📝 Создан новый холст');
                        this.updateCallbacks.forEach(callback => {
                            callback({
                                imageData: payload.new.canvas_data,
                                lastUpdated: payload.new.last_updated,
                                isExternal: true
                            });
                        });
                    }
                )
                .subscribe((status, err) => {
                    console.log(`📡 Статус real-time подписки: ${status}`);
                    
                    if (status === 'SUBSCRIBED') {
                        console.log('✅ Real-time подписка активирована');
                        this.showToast('Подключено к общему холсту', 'success');
                    }
                    
                    if (status === 'CHANNEL_ERROR') {
                        console.error('❌ Ошибка real-time канала:', err);
                        this.showToast('Ошибка подключения к real-time', 'error');
                    }
                    
                    if (status === 'TIMED_OUT') {
                        console.error('🕒 Timeout real-time канала');
                        this.showToast('Таймаут соединения', 'error');
                    }
                    
                    if (status === 'CLOSED') {
                        console.log('📴 Real-time канал закрыт');
                    }
                });
            
            console.log('🎯 Real-time подписка настроена');
            return true;
        } catch (error) {
            console.error('❌ Ошибка настройки real-time подписки:', error);
            return false;
        }
    }

    // Настройка Presence для подсчета онлайн пользователей
    async setupPresence() {
        try {
            console.log('👥 Настройка presence...');
            
            // Удаляем старый канал, если существует
            if (this.presenceChannel) {
                await supabase.removeChannel(this.presenceChannel);
            }
            
            // Создаем уникальный ID для пользователя
            const userId = 'user_' + Math.random().toString(36).substr(2, 9);
            
            // Создаем presence канал
            this.presenceChannel = supabase.channel('online-users', {
                config: {
                    presence: {
                        key: userId
                    }
                }
            });

            // Подписка на изменения Presence
            this.presenceChannel
                .on('presence', { event: 'sync' }, () => {
                    const state = this.presenceChannel.presenceState();
                    const users = Object.keys(state).length;
                    this.onlineUsers = users;
                    
                    // Обновляем счетчик онлайн пользователей
                    const onlineCountElement = document.getElementById('onlineCount');
                    if (onlineCountElement) {
                        onlineCountElement.textContent = users;
                    }
                    
                    console.log(`👥 Пользователей онлайн: ${users}`);
                })
                .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                    console.log('👋 Новый пользователь присоединился:', key);
                })
                .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                    console.log('👋 Пользователь покинул:', key);
                })
                .subscribe(async (status) => {
                    console.log(`👥 Presence статус: ${status}`);
                    
                    if (status === 'SUBSCRIBED') {
                        // Отправляем статус присутствия
                        await this.presenceChannel.track({
                            user_id: userId,
                            online_at: new Date().toISOString(),
                            device: this.getDeviceInfo()
                        });
                        
                        console.log('✅ Presence отслеживание активировано');
                    }
                });

            console.log('🎯 Presence настроен');
            return true;
        } catch (error) {
            console.error('❌ Ошибка настройки Presence:', error);
            return false;
        }
    }

    // Получение информации об устройстве
    getDeviceInfo() {
        const ua = navigator.userAgent;
        let device = 'Unknown';
        
        if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
            device = 'Tablet';
        } else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
            device = 'Mobile';
        } else {
            device = 'Desktop';
        }
        
        return device;
    }

    // Обновление статуса соединения в UI
    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connectionStatus');
        if (!statusElement) return;
        
        if (connected) {
            statusElement.innerHTML = `
                <span class="status-dot connected"></span>
                <span>Подключено к серверу (real-time)</span>
            `;
        } else {
            statusElement.innerHTML = `
                <span class="status-dot" style="background: #ff3b30;"></span>
                <span>Не подключено к серверу (офлайн режим)</span>
            `;
        }
    }

    // Регистрация callback-функции для обновлений
    onCanvasUpdate(callback) {
        if (typeof callback === 'function') {
            this.updateCallbacks.push(callback);
            console.log(`✅ Коллбэк зарегистрирован, всего: ${this.updateCallbacks.length}`);
        }
    }

    // Удаление callback-функции
    removeCanvasUpdate(callback) {
        const index = this.updateCallbacks.indexOf(callback);
        if (index > -1) {
            this.updateCallbacks.splice(index, 1);
            console.log(`🗑️ Коллбэк удален, осталось: ${this.updateCallbacks.length}`);
        }
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
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    // Получение статуса соединения
    getConnectionStatus() {
        return this.isConnected;
    }

    // Получение количества онлайн пользователей
    getOnlineUsers() {
        return this.onlineUsers;
    }

    // Отключение
    async disconnect() {
        console.log('🔌 Отключение от Supabase...');
        
        // Удаляем Presence
        if (this.presenceChannel) {
            await this.presenceChannel.untrack();
            await supabase.removeChannel(this.presenceChannel);
            this.presenceChannel = null;
        }
        
        // Удаляем real-time канал
        if (this.realtimeChannel) {
            await supabase.removeChannel(this.realtimeChannel);
            this.realtimeChannel = null;
        }
        
        this.isConnected = false;
        this.updateConnectionStatus(false);
        console.log('✅ Отключено от Supabase');
    }
}

// Создаем глобальный экземпляр клиента
window.supabaseClient = new SupabaseClient();
