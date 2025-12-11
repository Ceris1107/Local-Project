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
    }

    // Подключение к серверу
    async connect() {
        try {
            // Проверяем соединение
            const { data, error } = await supabase.from('canvas_state').select('id').limit(1);
            
            if (error) throw error;
            
            this.isConnected = true;
            
            // Настраиваем подписку на обновления
            this.setupRealtimeSubscription();
            
            // Настраиваем Presence для подсчета онлайн пользователей
            this.setupPresence();
            
            console.log('✅ Подключено к Supabase');
            return true;
        } catch (error) {
            console.error('❌ Ошибка подключения к Supabase:', error);
            return false;
        }
    }

    // Загрузка состояния холста
    async loadCanvas() {
        try {
            const { data, error } = await supabase
                .from('canvas_state')
                .select('*')
                .eq('id', this.canvasId)
                .single();
            
            if (error && error.code !== 'PGRST116') throw error; // PGRST116 - нет данных
            
            if (data && data.canvas_data) {
                return {
                    imageData: data.canvas_data,
                    lastUpdated: data.last_updated
                };
            }
            
            // Если нет данных, возвращаем пустой холст
            return {
                imageData: null,
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Ошибка загрузки холста:', error);
            return null;
        }
    }

    // Сохранение состояния холста
    async saveCanvas(imageData) {
        try {
            const { data, error } = await supabase
                .from('canvas_state')
                .upsert({
                    id: this.canvasId,
                    canvas_data: imageData,
                    last_updated: new Date().toISOString()
                }, {
                    onConflict: 'id'
                });
            
            if (error) throw error;
            
            console.log('💾 Холст сохранен в Supabase');
            return true;
        } catch (error) {
            console.error('❌ Ошибка сохранения холста:', error);
            return false;
        }
    }

    // Настройка подписки на обновления в реальном времени
    setupRealtimeSubscription() {
        const channel = supabase
            .channel('canvas-updates')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'canvas_state',
                    filter: `id=eq.${this.canvasId}`
                },
                (payload) => {
                    console.log('🔄 Получено обновление холста');
                    
                    // Вызываем все callback-функции
                    this.updateCallbacks.forEach(callback => {
                        callback(payload.new);
                    });
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('🔔 Подписка на обновления активирована');
                }
            });
        
        this.realtimeChannel = channel;
    }

    // Настройка Presence для подсчета онлайн пользователей
    setupPresence() {
        const presenceChannel = supabase.channel('online-users', {
            config: {
                presence: {
                    key: 'user-' + Math.random().toString(36).substr(2, 9)
                }
            }
        });

        // Подписка на изменения Presence
        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = presenceChannel.presenceState();
                this.onlineUsers = Object.keys(state).length;
                
                // Обновляем счетчик онлайн пользователей
                document.getElementById('onlineCount').textContent = this.onlineUsers;
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // Отправляем статус присутствия
                    await presenceChannel.track({
                        online_at: new Date().toISOString()
                    });
                }
            });

        this.presenceChannel = presenceChannel;
    }

    // Регистрация callback-функции для обновлений
    onCanvasUpdate(callback) {
        this.updateCallbacks.push(callback);
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
    disconnect() {
        if (this.realtimeChannel) {
            supabase.removeChannel(this.realtimeChannel);
        }
        if (this.presenceChannel) {
            supabase.removeChannel(this.presenceChannel);
        }
    }
}

// Создаем глобальный экземпляр клиента
window.supabaseClient = new SupabaseClient();
