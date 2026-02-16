/**
 * SQLite Cloud Sync Service
 * Сервис синхронизации данных между устройствами через SQLite Cloud
 */

const SyncService = {
    // Настройки подключения
    apiKey: null,
    projectUrl: null,
    databaseName: 'srecha_sync',
    
    // Состояние
    isConnected: false,
    lastSync: null,
    deviceId: null,
    syncInProgress: false,
    
    // Callback для разрешения конфликтов
    conflictResolver: null,
    
    /**
     * Инициализация сервиса
     */
    init() {
        console.log('🔄 SyncService: Инициализация...');
        
        // Загружаем сохраненные настройки
        this.loadSettings();
        
        // Генерируем или загружаем device ID
        this.deviceId = localStorage.getItem('syncDeviceId');
        if (!this.deviceId) {
            this.deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('syncDeviceId', this.deviceId);
        }
        
        console.log('🔄 SyncService: Device ID:', this.deviceId);
        
        // Загружаем время последней синхронизации
        const lastSyncStr = localStorage.getItem('syncLastTime');
        if (lastSyncStr) {
            this.lastSync = new Date(lastSyncStr);
        }
        
        return this;
    },
    
    /**
     * Загрузка настроек из localStorage
     */
    loadSettings() {
        this.apiKey = localStorage.getItem('syncApiKey') || null;
        this.projectUrl = localStorage.getItem('syncProjectUrl') || null;
        this.databaseName = localStorage.getItem('syncDatabaseName') || 'srecha_sync';
        
        if (this.apiKey && this.projectUrl) {
            console.log('🔄 SyncService: Настройки загружены');
        }
    },
    
    /**
     * Сохранение настроек
     */
    saveSettings(apiKey, projectUrl, databaseName) {
        this.apiKey = apiKey;
        this.projectUrl = projectUrl;
        this.databaseName = databaseName || 'srecha_sync';
        
        localStorage.setItem('syncApiKey', apiKey);
        localStorage.setItem('syncProjectUrl', projectUrl);
        localStorage.setItem('syncDatabaseName', this.databaseName);
        
        console.log('🔄 SyncService: Настройки сохранены');
    },
    
    /**
     * Проверка наличия настроек
     */
    hasSettings() {
        return !!(this.apiKey && this.projectUrl);
    },
    
    /**
     * Парсинг connection string SQLite Cloud
     * Формат: sqlitecloud://hostname:port/database?apikey=KEY
     */
    parseConnectionString(connStr) {
        const result = {
            hostname: null,
            port: 8860,
            database: null,
            apiKey: null
        };
        
        if (!connStr) return result;
        
        // Убираем протокол sqlitecloud://
        let str = connStr.replace(/^sqlitecloud:\/\//, '');
        
        // Извлекаем apikey из query string
        const apiKeyMatch = str.match(/[?&]apikey=([^&]+)/i);
        if (apiKeyMatch) {
            result.apiKey = apiKeyMatch[1];
            str = str.replace(/[?&]apikey=[^&]+/i, '');
        }
        
        // Извлекаем database из пути
        const pathMatch = str.match(/\/([^?]+)/);
        if (pathMatch) {
            result.database = pathMatch[1];
            str = str.replace(/\/[^?]+/, '');
        }
        
        // Извлекаем hostname и port
        const hostMatch = str.match(/^([^:]+):?(\d+)?/);
        if (hostMatch) {
            result.hostname = hostMatch[1];
            if (hostMatch[2]) {
                result.port = parseInt(hostMatch[2]);
            }
        }
        
        console.log('🔄 SyncService: Parsed connection string:', result);
        return result;
    },
    
    /**
     * Получить hostname из projectUrl (может быть connection string или просто hostname)
     */
    getHostname() {
        if (!this.projectUrl) return null;
        
        // Если это полный connection string
        if (this.projectUrl.includes('sqlitecloud://')) {
            const parsed = this.parseConnectionString(this.projectUrl);
            return parsed.hostname;
        }
        
        // Иначе просто убираем протокол и порт если есть
        return this.projectUrl
            .replace(/^https?:\/\//, '')
            .replace(/^sqlitecloud:\/\//, '')
            .replace(/:.*$/, '')
            .replace(/\/.*$/, '');
    },
    
    /**
     * Получить базовый URL API
     */
    getApiUrl() {
        const hostname = this.getHostname();
        if (!hostname) return null;
        // SQLite Cloud REST API работает на стандартном HTTPS порту 443
        return `https://${hostname}/v2/weblite`;
    },
    
    /**
     * Получить API Key (из настроек или из connection string)
     */
    getEffectiveApiKey() {
        // Если apiKey задан напрямую
        if (this.apiKey && !this.apiKey.includes('sqlitecloud://')) {
            return this.apiKey;
        }
        
        // Попробуем извлечь из projectUrl если это connection string
        if (this.projectUrl && this.projectUrl.includes('apikey=')) {
            const parsed = this.parseConnectionString(this.projectUrl);
            return parsed.apiKey || this.apiKey;
        }
        
        return this.apiKey;
    },
    
    /**
     * Получить имя базы данных (из настроек или из connection string)
     */
    getEffectiveDatabase() {
        // Попробуем извлечь из projectUrl если это connection string
        if (this.projectUrl && this.projectUrl.includes('sqlitecloud://')) {
            const parsed = this.parseConnectionString(this.projectUrl);
            if (parsed.database) return parsed.database;
        }
        
        return this.databaseName || 'srecha_sync';
    },
    
    /**
     * Получить полный connection string для авторизации
     */
    getConnectionString() {
        const hostname = this.getHostname();
        const apiKey = this.getEffectiveApiKey();
        return `sqlitecloud://${hostname}:8860?apikey=${apiKey}`;
    },
    
    /**
     * Получить функцию fetch (Tauri HTTP или браузерную)
     */
    async getTauriFetch() {
        // Пробуем использовать Tauri HTTP plugin
        if (window.__TAURI__ && window.__TAURI__.http) {
            console.log('🔄 SyncService: Используем Tauri HTTP fetch');
            return window.__TAURI__.http.fetch;
        }
        
        // Пробуем загрузить через invoke
        if (window.__TAURI__ && window.__TAURI__.core) {
            console.log('🔄 SyncService: Tauri HTTP plugin не найден, пробуем core');
        }
        
        // Fallback на обычный fetch
        console.log('🔄 SyncService: Используем браузерный fetch');
        return fetch;
    },
    
    /**
     * Выполнение HTTP запроса через Tauri Rust команду
     */
    async httpRequest(url, options) {
        // Используем нашу Rust команду http_request
        if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
            try {
                // Формируем заголовки в правильном формате
                const headers = {};
                if (options.headers) {
                    for (const [key, value] of Object.entries(options.headers)) {
                        headers[key] = value;
                    }
                }
                
                console.log('🔄 SyncService: Calling Rust http_request');
                if (typeof window.addSyncLog === 'function') {
                    window.addSyncLog(`Вызов Rust http_request: ${options.method} ${url.substring(0, 60)}...`, 'request');
                }
                
                // Вызываем нашу Rust команду
                const response = await window.__TAURI__.core.invoke('http_request', {
                    url: url,
                    method: options.method || 'GET',
                    headers: headers,
                    body: options.body || null
                });
                
                console.log('🔄 SyncService: Rust HTTP response:', response);
                if (typeof window.addSyncLog === 'function') {
                    window.addSyncLog(`Response: status=${response.status}, ok=${response.ok}`, response.ok ? 'success' : 'error');
                }
                
                return {
                    ok: response.ok,
                    status: response.status,
                    statusText: '',
                    text: async () => response.body,
                    json: async () => JSON.parse(response.body)
                };
            } catch (tauriError) {
                console.error('🔄 SyncService: Rust HTTP error:', tauriError);
                if (typeof window.addSyncLog === 'function') {
                    window.addSyncLog(`Rust HTTP Error: ${tauriError}`, 'error');
                }
                throw new Error(`HTTP request failed: ${tauriError}`);
            }
        }
        
        // Fallback на браузерный fetch (не должен использоваться в Tauri)
        console.log('🔄 SyncService: Tauri not available, using browser fetch');
        if (typeof window.addSyncLog === 'function') {
            window.addSyncLog(`Tauri недоступен, используем браузерный fetch`, 'warning');
        }
        return fetch(url, options);
    },
    
    /**
     * Выполнение SQL запроса к SQLite Cloud
     */
    /**
     * Экранирование строки для SQL
     */
    escapeSQL(value) {
        if (value === null || value === undefined) {
            return 'NULL';
        }
        if (typeof value === 'number') {
            return value.toString();
        }
        if (typeof value === 'boolean') {
            return value ? '1' : '0';
        }
        // Экранируем одинарные кавычки
        const escaped = String(value).replace(/'/g, "''");
        return `'${escaped}'`;
    },
    
    /**
     * Подстановка параметров в SQL запрос
     */
    prepareSQLWithParams(sql, params = []) {
        console.log(`🔄 SyncService: prepareSQLWithParams вызван с ${params ? params.length : 0} параметрами`);
        
        if (!params || params.length === 0) {
            console.log('🔄 SyncService: Нет параметров, возвращаем SQL как есть');
            return sql;
        }
        
        let result = sql;
        let paramIndex = 0;
        
        // Заменяем ? на значения параметров
        result = result.replace(/\?/g, () => {
            if (paramIndex < params.length) {
                const escaped = this.escapeSQL(params[paramIndex]);
                console.log(`🔄 SyncService: Параметр ${paramIndex}: ${String(params[paramIndex]).substring(0, 50)}... -> ${escaped.substring(0, 50)}...`);
                paramIndex++;
                return escaped;
            }
            return '?';
        });
        
        console.log(`🔄 SyncService: SQL после подстановки: ${result.substring(0, 200)}...`);
        return result;
    },
    
    async executeSQL(sql, params = []) {
        if (!this.hasSettings()) {
            throw new Error('Настройки синхронизации не заданы');
        }
        
        // Подставляем параметры в SQL
        const preparedSQL = this.prepareSQLWithParams(sql, params);
        
        const apiUrl = this.getApiUrl();
        const connectionString = this.getConnectionString();
        
        console.log('🔄 SyncService: Выполняем запрос к', apiUrl);
        console.log('🔄 SyncService: SQL:', preparedSQL.substring(0, 150) + '...');
        
        // Логируем в UI если функция доступна
        if (typeof window.addSyncLog === 'function') {
            window.addSyncLog(`HTTP Request: ${apiUrl}/sql`, 'request');
        }
        
        try {
            // Формируем URL с параметрами для GET запроса (для SELECT)
            // Или POST для INSERT/UPDATE/CREATE
            const isReadQuery = sql.trim().toUpperCase().startsWith('SELECT') || 
                               sql.trim().toUpperCase().startsWith('PRAGMA');
            
            let response;
            let fullUrl;
            
            if (isReadQuery) {
                // GET запрос для чтения
                const encodedSql = encodeURIComponent(preparedSQL);
                const dbName = this.getEffectiveDatabase();
                fullUrl = `${apiUrl}/sql?sql=${encodedSql}&database=${dbName}`;
                
                console.log('🔄 SyncService: GET Request URL:', fullUrl);
                if (typeof window.addSyncLog === 'function') {
                    window.addSyncLog(`GET: ${fullUrl.substring(0, 100)}...`, 'request');
                }
                
                response = await this.httpRequest(fullUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${connectionString}`,
                        'Accept': 'application/json'
                    }
                });
            } else {
                // POST запрос для записи
                fullUrl = `${apiUrl}/sql`;
                const dbName = this.getEffectiveDatabase();
                const body = JSON.stringify({
                    database: dbName,
                    sql: preparedSQL
                });
                
                console.log('🔄 SyncService: POST Request URL:', fullUrl);
                console.log('🔄 SyncService: POST Body:', body.substring(0, 200));
                if (typeof window.addSyncLog === 'function') {
                    window.addSyncLog(`POST: ${fullUrl}`, 'request');
                    window.addSyncLog(`Body: ${body.substring(0, 100)}...`, 'request');
                }
                
                response = await this.httpRequest(fullUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${connectionString}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: body
                });
            }
            
            console.log('🔄 SyncService: Response status:', response.status);
            if (typeof window.addSyncLog === 'function') {
                window.addSyncLog(`Response Status: ${response.status} ${response.statusText}`, response.ok ? 'success' : 'error');
            }
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('🔄 SyncService: Error response:', errorText);
                if (typeof window.addSyncLog === 'function') {
                    window.addSyncLog(`Error Body: ${errorText}`, 'error');
                }
                throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
            }
            
            const result = await response.json();
            console.log('🔄 SyncService: Результат получен', result);
            if (typeof window.addSyncLog === 'function') {
                window.addSyncLog(`Response: ${JSON.stringify(result).substring(0, 150)}...`, 'success');
            }
            return result;
        } catch (error) {
            console.error('🔄 SyncService: Ошибка SQL запроса:', error);
            if (typeof window.addSyncLog === 'function') {
                window.addSyncLog(`Exception: ${error.message}`, 'error');
            }
            throw error;
        }
    },
    
    /**
     * Проверка подключения к SQLite Cloud
     */
    async testConnection() {
        console.log('🔄 SyncService: Проверка подключения...');
        
        try {
            // Пробуем выполнить простой запрос
            const result = await this.executeSQL('SELECT 1 as test');
            this.isConnected = true;
            console.log('🔄 SyncService: Подключение успешно!', result);
            return { success: true, message: 'Подключение установлено' };
        } catch (error) {
            this.isConnected = false;
            console.error('🔄 SyncService: Ошибка подключения:', error);
            return { success: false, message: error.message };
        }
    },
    
    /**
     * Инициализация таблиц в облачной базе данных
     */
    async initCloudTables() {
        console.log('🔄 SyncService: Инициализация таблиц в облаке (Вариант 3: Version + Status)...');
        
        const tables = [
            // ========== НОВАЯ СХЕМА: Version + Status ==========
            
            // Клиенты (ключ: mb)
            `CREATE TABLE IF NOT EXISTS sync_clients_v2 (
                id INTEGER PRIMARY KEY,
                entity_key TEXT UNIQUE NOT NULL,
                data TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                version INTEGER DEFAULT 1,
                modified_at TEXT NOT NULL,
                modified_by TEXT,
                device_id TEXT
            )`,
            
            // Товары (ключ: internal_code)
            `CREATE TABLE IF NOT EXISTS sync_products_v2 (
                id INTEGER PRIMARY KEY,
                entity_key TEXT UNIQUE NOT NULL,
                data TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                version INTEGER DEFAULT 1,
                modified_at TEXT NOT NULL,
                modified_by TEXT,
                device_id TEXT
            )`,
            
            // Инвойсы (ключ: number)
            `CREATE TABLE IF NOT EXISTS sync_invoices_v2 (
                id INTEGER PRIMARY KEY,
                entity_key TEXT UNIQUE NOT NULL,
                data TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                version INTEGER DEFAULT 1,
                modified_at TEXT NOT NULL,
                modified_by TEXT,
                device_id TEXT
            )`,
            
            // Группы склада (ключ: groupCode)
            `CREATE TABLE IF NOT EXISTS sync_warehouse_v2 (
                id INTEGER PRIMARY KEY,
                entity_key TEXT UNIQUE NOT NULL,
                data TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                version INTEGER DEFAULT 1,
                modified_at TEXT NOT NULL,
                modified_by TEXT,
                device_id TEXT
            )`,
            
            // localStorage данные
            `CREATE TABLE IF NOT EXISTS sync_local_storage (
                id INTEGER PRIMARY KEY,
                key_name TEXT UNIQUE,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                device_id TEXT
            )`,
            
            // История изменений
            `CREATE TABLE IF NOT EXISTS sync_object_history (
                id INTEGER PRIMARY KEY,
                history_id TEXT UNIQUE,
                entity_type TEXT NOT NULL,
                action TEXT NOT NULL,
                object_id TEXT,
                object_name TEXT,
                details TEXT,
                old_data TEXT,
                new_data TEXT,
                timestamp TEXT NOT NULL,
                device_id TEXT NOT NULL,
                user_name TEXT
            )`,
            
            // Журнал изменений для хронологической синхронизации
            `CREATE TABLE IF NOT EXISTS sync_changes (
                id INTEGER PRIMARY KEY,
                change_id TEXT UNIQUE,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                action TEXT NOT NULL,
                data TEXT,
                old_data TEXT,
                timestamp TEXT NOT NULL,
                device_id TEXT NOT NULL,
                user_name TEXT,
                applied INTEGER DEFAULT 0
            )`,
            
            // НОВАЯ ТАБЛИЦА: Статусы инвойсов (paid/delivered)
            // Отдельная таблица для гарантированной синхронизации статусов
            `CREATE TABLE IF NOT EXISTS sync_invoice_statuses (
                id INTEGER PRIMARY KEY,
                invoice_key TEXT UNIQUE NOT NULL,
                doc_type TEXT NOT NULL,
                doc_number TEXT NOT NULL,
                paid INTEGER DEFAULT 0,
                delivered INTEGER DEFAULT 0,
                paid_at TEXT,
                delivered_at TEXT,
                modified_at TEXT NOT NULL,
                modified_by TEXT,
                device_id TEXT NOT NULL
            )`
        ];
        
        for (const sql of tables) {
            try {
                await this.executeSQL(sql);
            } catch (error) {
                console.error('🔄 SyncService: Ошибка создания таблицы:', error);
            }
        }
        
        console.log('🔄 SyncService: Таблицы инициализированы');
    },
    
    /**
     * Проверка конфликта перед созданием записи
     */
    async checkConflict(type, field, value) {
        if (!this.hasSettings() || !this.isConnected) {
            // Если нет подключения, не блокируем создание
            return { hasConflict: false };
        }
        
        console.log(`🔄 SyncService: Проверка конфликта ${type}.${field} = ${value}`);
        
        let tableName, columnName;
        
        switch (type) {
            case 'invoice':
                tableName = 'sync_invoices';
                columnName = 'invoice_number';
                break;
            case 'product':
                tableName = 'sync_products';
                columnName = 'internal_code';
                break;
            case 'warehouse_group':
                tableName = 'sync_warehouse_groups';
                columnName = 'code';
                break;
            case 'client':
                tableName = 'sync_clients';
                columnName = 'sync_id'; // MB используется как sync_id для клиентов
                break;
            default:
                return { hasConflict: false };
        }
        
        try {
            const result = await this.executeSQL(
                `SELECT * FROM ${tableName} WHERE ${columnName} = ? AND deleted_at IS NULL`,
                [value]
            );
            
            if (result && result.data && result.data.length > 0) {
                const serverRecord = result.data[0];
                return {
                    hasConflict: true,
                    type: type,
                    field: field,
                    value: value,
                    serverRecord: serverRecord,
                    serverDate: serverRecord.updated_at
                };
            }
            
            return { hasConflict: false };
        } catch (error) {
            console.error('🔄 SyncService: Ошибка проверки конфликта:', error);
            // В случае ошибки не блокируем создание
            return { hasConflict: false };
        }
    },
    
    /**
     * ========== ВАРИАНТ 3: СИНХРОНИЗАЦИЯ ПО VERSION + STATUS ==========
     */
    
    /**
     * Полная синхронизация (Вариант 3)
     */
    async fullSync(progressCallback) {
        console.log('🔄 SyncService: ===== НАЧАЛО СИНХРОНИЗАЦИИ (Version + Status) =====');
        
        if (this.syncInProgress) {
            console.log('🔄 SyncService: Синхронизация уже выполняется');
            return { success: false, message: 'Синхронизация уже выполняется' };
        }
        
        if (!this.hasSettings()) {
            console.log('🔄 SyncService: Настройки не заданы');
            return { success: false, message: 'Настройки синхронизации не заданы' };
        }
        
        this.syncInProgress = true;
        const startTime = Date.now();
        
        try {
            // 1. Проверяем подключение
            if (progressCallback) progressCallback(5, 'Проверка подключения...');
            const connectionTest = await this.testConnection();
            if (!connectionTest.success) {
                throw new Error('Не удалось подключиться к серверу');
            }
            
            // 2. Инициализируем таблицы
            if (progressCallback) progressCallback(10, 'Инициализация таблиц...');
            await this.initCloudTables();
            
            // 3. СНАЧАЛА выгружаем локальную историю на сервер (важно для отправки изменений!)
            if (progressCallback) progressCallback(15, 'Выгрузка истории изменений...');
            await this.uploadObjectHistory();
            
            // 4. Затем скачиваем историю с сервера и ПРИМЕНЯЕМ изменения
            if (progressCallback) progressCallback(20, 'Скачивание и применение истории...');
            await this.downloadObjectHistory(); // Автоматически применяет изменения из истории
            
            // 5. Синхронизируем клиентов (двусторонняя)
            if (progressCallback) progressCallback(30, 'Синхронизация клиентов...');
            await this.syncClientsV2();
            
            // 6. Синхронизируем товары (двусторонняя)
            if (progressCallback) progressCallback(45, 'Синхронизация товаров...');
            await this.syncProductsV2();
            
            // 7. Синхронизируем инвойсы (двусторонняя)
            if (progressCallback) progressCallback(55, 'Синхронизация инвойсов...');
            await this.syncInvoicesV2();
            
            // 7.5 ВАЖНО: Синхронизируем статусы инвойсов (отдельная таблица)
            if (progressCallback) progressCallback(65, 'Синхронизация статусов инвойсов...');
            await this.syncInvoiceStatuses();
            
            // 8. Синхронизируем склад (двусторонняя)
            if (progressCallback) progressCallback(75, 'Синхронизация склада...');
            await this.syncWarehouseV2();
            
            // 9. Загружаем localStorage
            if (progressCallback) progressCallback(85, 'Скачивание данных с сервера...');
            await this.downloadLocalStorage();
            
            if (progressCallback) progressCallback(92, 'Выгрузка данных на сервер...');
            await this.uploadLocalStorage();
            
            // 9. Завершение
            if (progressCallback) progressCallback(97, 'Завершение...');
            this.lastSync = new Date();
            localStorage.setItem('syncLastTime', this.lastSync.toISOString());
            
            if (progressCallback) progressCallback(100, 'Готово!');
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`🔄 SyncService: Синхронизация завершена за ${duration}с`);
            
            return { 
                success: true, 
                message: `Синхронизация завершена за ${duration}с`,
                lastSync: this.lastSync
            };
            
        } catch (error) {
            console.error('🔄 SyncService: Ошибка синхронизации:', error);
            return { success: false, message: error.message };
        } finally {
            this.syncInProgress = false;
        }
    },
    
    /**
     * Синхронизация клиентов (Вариант 1: CRDT - Last Write Wins по timestamp)
     * Правила:
     * 1. Сравниваем по updated_at (timestamp) - кто новее, тот прав
     * 2. deleted_at НЕ NULL = запись удалена везде (удаление всегда побеждает)
     * 3. Сначала СКАЧИВАЕМ ВСЕ с сервера, потом ВЫГРУЖАЕМ локальные
     */
    async syncClientsV2() {
        console.log('🔄 SyncService: Синхронизация клиентов (CRDT - Last Write Wins)...');
        
        try {
            const now = new Date().toISOString();
            const user = window.currentUser?.username || 'system';
            
            // Получаем серверные данные
            const serverResult = await this.executeSQL('SELECT * FROM sync_clients_v2');
            const serverClients = serverResult?.data || [];
            const serverMap = new Map(serverClients.map(s => [s.entity_key, s]));
            
            console.log(`🔄 SyncService: Найдено ${serverClients.length} клиентов на сервере`);
            
            // Получаем локальные данные
            let localClients = await window.api.clients.getAll();
            const localMap = new Map(localClients.filter(c => c.mb).map(c => [c.mb, c]));
            
            // ========== ШАГ 1: СКАЧИВАЕМ ВСЕ С СЕРВЕРА ==========
            for (const serverRecord of serverClients) {
                const key = serverRecord.entity_key;
                const localClient = localMap.get(key);
                
                const serverTime = serverRecord.modified_at || serverRecord.updated_at || '1970-01-01';
                // Используем updated_at если есть (было редактирование), иначе created_at, иначе старую дату
                const localTime = localClient?._syncModified || localClient?.updated_at || localClient?.createdAt || localClient?.created_at || '1970-01-01';
                
                // Удаление ВСЕГДА побеждает
                if (serverRecord.status === 'deleted') {
                    await this.applyServerClient(serverRecord);
                    console.log(`🔄 [Клиент ${key}] УДАЛЁН (с сервера)`);
                    continue;
                }
                
                // Last Write Wins - сравниваем timestamp
                // Сервер побеждает ТОЛЬКО если его время СТРОГО больше
                if (!localClient || serverTime > localTime) {
                    await this.applyServerClient(serverRecord);
                    console.log(`🔄 [Клиент ${key}] Применен с сервера (${serverTime} > ${localTime})`);
                }
            }
            
            // ========== ШАГ 2: ВЫГРУЖАЕМ ВСЕ ЛОКАЛЬНЫЕ НА СЕРВЕР ==========
            // Перезагружаем локальные данные после обновления
            localClients = await window.api.clients.getAll();
            
            for (const client of localClients) {
                const key = client.mb;
                if (!key) continue;
                
                const serverRecord = serverMap.get(key);
                // Используем updated_at если есть (было редактирование), иначе created_at
                const localTime = client._syncModified || client.updated_at || client.updatedAt || client.createdAt || client.created_at || now;
                const serverTime = serverRecord?.modified_at || '1970-01-01';
                
                // Если на сервере нет ИЛИ локальный новее или равен (для гарантии синхронизации) - выгружаем
                if (!serverRecord || localTime >= serverTime) {
                    await this.upsertServerRecord('sync_clients_v2', key, client, 'active', 1, localTime, user);
                    console.log(`🔄 [Клиент ${key}] Выгружен на сервер (${localTime} >= ${serverTime})`);
                }
            }
            
            // ========== ШАГ 3: Выгружаем удалённых из архива ==========
            const localArchive = JSON.parse(localStorage.getItem('deletedArchive') || '[]');
            for (const archivedItem of localArchive.filter(a => a.entityType === 'clients')) {
                const key = archivedItem.object?.mb;
                if (!key) continue;
                
                const serverRecord = serverMap.get(key);
                const localDeletedAt = archivedItem.deletedAt || now;
                const serverTime = serverRecord?.modified_at || '1970-01-01';
                
                // Выгружаем удалённого если на сервере его нет или локальное удаление новее
                if (!serverRecord || localDeletedAt > serverTime) {
                    await this.upsertServerRecord('sync_clients_v2', key, archivedItem.object, 'deleted', 1, localDeletedAt, user);
                    console.log(`🔄 [Клиент ${key}] Выгружен как удалённый (${localDeletedAt})`);
                }
            }
            
            console.log('🔄 SyncService: Клиенты синхронизированы (CRDT)');
        } catch (error) {
            console.error('🔄 SyncService: Ошибка синхронизации клиентов:', error);
        }
    },
    
    /**
     * Применение серверного клиента локально
     */
    async applyServerClient(serverRecord) {
        try {
            const clientData = JSON.parse(serverRecord.data);
            clientData._syncVersion = serverRecord.version;
            clientData._syncModified = serverRecord.modified_at;
            
            if (serverRecord.status === 'deleted') {
                // Удаляем локально
                const localClients = await window.api.clients.getAll();
                const toDelete = localClients.find(c => c.mb === serverRecord.entity_key);
                if (toDelete) {
                    try { await window.api.clients.delete(toDelete.id); } catch(e) {}
                }
                // Добавляем в архив если нет
                let archive = JSON.parse(localStorage.getItem('deletedArchive') || '[]');
                if (!archive.find(a => a.entityType === 'clients' && a.object.mb === serverRecord.entity_key)) {
                    archive.push({
                        id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        entityType: 'clients',
                        object: clientData,
                        deletedAt: serverRecord.modified_at,
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                    });
                    localStorage.setItem('deletedArchive', JSON.stringify(archive));
                }
                // Удаляем из localStorage
                let lsClients = JSON.parse(localStorage.getItem('clients') || '[]');
                lsClients = lsClients.filter(c => c.mb !== serverRecord.entity_key);
                localStorage.setItem('clients', JSON.stringify(lsClients));
            } else {
                // Создаём/обновляем локально
                const localClients = await window.api.clients.getAll();
                const existing = localClients.find(c => c.mb === serverRecord.entity_key);
                
                if (existing) {
                    await window.api.clients.update(existing.id, {...existing, ...clientData});
                } else {
                    try { await window.api.clients.create(clientData); } catch(e) {}
                }
                
                // Обновляем localStorage
                let lsClients = JSON.parse(localStorage.getItem('clients') || '[]');
                const lsIdx = lsClients.findIndex(c => c.mb === serverRecord.entity_key);
                if (lsIdx !== -1) {
                    lsClients[lsIdx] = {...lsClients[lsIdx], ...clientData};
                } else {
                    lsClients.push(clientData);
                }
                localStorage.setItem('clients', JSON.stringify(lsClients));
                
                // Удаляем из архива если был там
                let archive = JSON.parse(localStorage.getItem('deletedArchive') || '[]');
                archive = archive.filter(a => !(a.entityType === 'clients' && a.object.mb === serverRecord.entity_key));
                localStorage.setItem('deletedArchive', JSON.stringify(archive));
            }
        } catch (error) {
            console.error('🔄 SyncService: Ошибка применения клиента:', error);
        }
    },
    
    /**
     * Синхронизация товаров (Вариант 1: CRDT - Last Write Wins по timestamp)
     * Правила:
     * 1. Сравниваем по updated_at (timestamp) - кто новее, тот прав
     * 2. deleted_at НЕ NULL = запись удалена везде (удаление всегда побеждает)
     * 3. Первичный ключ = internal_code (не id!)
     */
    async syncProductsV2() {
        console.log('🔄 SyncService: Синхронизация товаров (CRDT - Last Write Wins)...');
        
        try {
            const now = new Date().toISOString();
            const user = window.currentUser?.username || 'system';
            
            // Получаем серверные данные
            const serverResult = await this.executeSQL('SELECT * FROM sync_products_v2');
            const serverProducts = serverResult?.data || [];
            const serverMap = new Map(serverProducts.map(s => [s.entity_key, s]));
            
            console.log(`🔄 SyncService: Найдено ${serverProducts.length} товаров на сервере`);
            
            // Получаем локальные данные
            let localProducts = await window.api.products.getAll();
            const getProductKey = (p) => p.internal_code || p.internalCode || p.code;
            const localMap = new Map(localProducts.filter(p => getProductKey(p)).map(p => [getProductKey(p), p]));
            
            // ========== ШАГ 1: СКАЧИВАЕМ ВСЕ С СЕРВЕРА ==========
            for (const serverRecord of serverProducts) {
                const key = serverRecord.entity_key;
                const localProduct = localMap.get(key);
                
                const serverTime = serverRecord.modified_at || serverRecord.updated_at || '1970-01-01';
                // Используем updated_at если есть (было редактирование), иначе created_at
                const localTime = localProduct?._syncModified || localProduct?.updated_at || localProduct?.updatedAt || localProduct?.createdAt || localProduct?.created_at || '1970-01-01';
                
                // Удаление ВСЕГДА побеждает
                if (serverRecord.status === 'deleted') {
                    await this.applyServerProduct(serverRecord);
                    console.log(`🔄 [Товар ${key}] УДАЛЁН (с сервера)`);
                    continue;
                }
                
                // Last Write Wins - сравниваем timestamp
                // Сервер побеждает ТОЛЬКО если его время СТРОГО больше
                if (!localProduct || serverTime > localTime) {
                    await this.applyServerProduct(serverRecord);
                    console.log(`🔄 [Товар ${key}] Применен с сервера (${serverTime} > ${localTime})`);
                }
            }
            
            // ========== ШАГ 2: ВЫГРУЖАЕМ ВСЕ ЛОКАЛЬНЫЕ НА СЕРВЕР ==========
            // Перезагружаем локальные данные после обновления
            localProducts = await window.api.products.getAll();
            
            for (const product of localProducts) {
                const key = getProductKey(product);
                if (!key) continue;
                
                const serverRecord = serverMap.get(key);
                // Используем updated_at если есть (было редактирование), иначе created_at
                const localTime = product._syncModified || product.updated_at || product.updatedAt || product.createdAt || product.created_at || now;
                const serverTime = serverRecord?.modified_at || '1970-01-01';
                
                // Если на сервере нет ИЛИ локальный новее или равен (для гарантии синхронизации) - выгружаем
                if (!serverRecord || localTime >= serverTime) {
                    await this.upsertServerRecord('sync_products_v2', key, product, 'active', 1, localTime, user);
                    console.log(`🔄 [Товар ${key}] Выгружен на сервер (${localTime} >= ${serverTime})`);
                }
            }
            
            // ========== ШАГ 3: Выгружаем удалённых из архива ==========
            const localArchive = JSON.parse(localStorage.getItem('deletedArchive') || '[]');
            for (const archivedItem of localArchive.filter(a => a.entityType === 'products')) {
                const key = archivedItem.object?.internal_code || archivedItem.object?.internalCode || archivedItem.object?.code;
                if (!key) continue;
                
                const serverRecord = serverMap.get(key);
                const localDeletedAt = archivedItem.deletedAt || now;
                const serverTime = serverRecord?.modified_at || '1970-01-01';
                
                // Выгружаем удалённого если на сервере его нет или локальное удаление новее
                if (!serverRecord || localDeletedAt > serverTime) {
                    await this.upsertServerRecord('sync_products_v2', key, archivedItem.object, 'deleted', 1, localDeletedAt, user);
                    console.log(`🔄 [Товар ${key}] Выгружен как удалённый (${localDeletedAt})`);
                }
            }
            
            console.log('🔄 SyncService: Товары синхронизированы (CRDT)');
        } catch (error) {
            console.error('🔄 SyncService: Ошибка синхронизации товаров:', error);
        }
    },
    
    /**
     * Применение серверного товара локально
     */
    async applyServerProduct(serverRecord) {
        try {
            const productData = JSON.parse(serverRecord.data);
            productData._syncVersion = serverRecord.version;
            productData._syncModified = serverRecord.modified_at;
            
            const productKey = serverRecord.entity_key;
            
            if (serverRecord.status === 'deleted') {
                // Удаляем локально
                const localProducts = await window.api.products.getAll();
                const toDelete = localProducts.find(p => 
                    p.internal_code === productKey || p.internalCode === productKey || p.code === productKey
                );
                if (toDelete) {
                    try { await window.api.products.delete(toDelete.id); } catch(e) {}
                }
                // Добавляем в архив
                let archive = JSON.parse(localStorage.getItem('deletedArchive') || '[]');
                const archiveExists = archive.find(a => {
                    if (a.entityType !== 'products') return false;
                    const aKey = a.object.internal_code || a.object.internalCode || a.object.code;
                    return aKey === productKey;
                });
                if (!archiveExists) {
                    archive.push({
                        id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        entityType: 'products',
                        object: productData,
                        deletedAt: serverRecord.modified_at,
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                    });
                    localStorage.setItem('deletedArchive', JSON.stringify(archive));
                }
                // Удаляем из localStorage
                let lsProducts = JSON.parse(localStorage.getItem('products') || '[]');
                lsProducts = lsProducts.filter(p => {
                    const pKey = p.internal_code || p.internalCode || p.code;
                    return pKey !== productKey;
                });
                localStorage.setItem('products', JSON.stringify(lsProducts));
            } else {
                // Создаём/обновляем локально
                const localProducts = await window.api.products.getAll();
                const existing = localProducts.find(p => 
                    p.internal_code === productKey || p.internalCode === productKey || p.code === productKey
                );
                
                if (existing) {
                    await window.api.products.update(existing.id, {...existing, ...productData});
                } else {
                    try { await window.api.products.create(productData); } catch(e) { console.log('Товар уже существует'); }
                }
                
                // Обновляем localStorage
                let lsProducts = JSON.parse(localStorage.getItem('products') || '[]');
                const lsIdx = lsProducts.findIndex(p => {
                    const pKey = p.internal_code || p.internalCode || p.code;
                    return pKey === productKey;
                });
                if (lsIdx !== -1) {
                    lsProducts[lsIdx] = {...lsProducts[lsIdx], ...productData};
                } else {
                    lsProducts.push(productData);
                }
                localStorage.setItem('products', JSON.stringify(lsProducts));
                
                // Удаляем из архива
                let archive = JSON.parse(localStorage.getItem('deletedArchive') || '[]');
                archive = archive.filter(a => {
                    if (a.entityType !== 'products') return true;
                    const aKey = a.object.internal_code || a.object.internalCode || a.object.code;
                    return aKey !== productKey;
                });
                localStorage.setItem('deletedArchive', JSON.stringify(archive));
            }
        } catch (error) {
            console.error('🔄 SyncService: Ошибка применения товара:', error);
        }
    },
    
    /**
     * Синхронизация инвойсов V2 (включая все типы документов)
     * ПОРЯДОК: 1) Сначала загружаем ВСЕ с сервера, 2) Потом выгружаем локальные
     * Использует timestamp (_syncModified) для сравнения - Last Write Wins
     */
    async syncInvoicesV2() {
        console.log('🔄 SyncService: Синхронизация документов V2 (CRDT - Last Write Wins)...');
        
        try {
            const now = new Date().toISOString();
            const user = window.currentUser?.username || 'system';
            
            // Получаем серверные данные СНАЧАЛА
            const serverResult = await this.executeSQL('SELECT * FROM sync_invoices_v2');
            const serverDocs = serverResult?.data || [];
            const serverMap = new Map(serverDocs.map(s => [s.entity_key, s]));
            
            console.log(`🔄 SyncService: Найдено ${serverDocs.length} документов на сервере`);
            
            // Получаем список удалённых клиентов для фильтрации их инвойсов
            const deletedArchive = JSON.parse(localStorage.getItem('deletedArchive') || '[]');
            const deletedClientMBs = new Set(
                deletedArchive
                    .filter(a => a.entityType === 'clients')
                    .map(a => a.object?.mb)
                    .filter(mb => mb)
            );
            
            console.log(`🔄 Удалённые клиенты (MB): ${[...deletedClientMBs].join(', ') || 'нет'}`);
            
            // Получаем локальные документы
            let confirmedInvoices = JSON.parse(localStorage.getItem('confirmedInvoices') || '[]');
            let confirmedDeliveries = JSON.parse(localStorage.getItem('confirmedDeliveries') || '[]');
            let confirmedPredracuns = JSON.parse(localStorage.getItem('confirmedPredracuns') || '[]');
            let confirmedRacuns = JSON.parse(localStorage.getItem('confirmedRacuns') || '[]');
            
            // ШАГ 0: ОЧИЩАЕМ ЛОКАЛЬНЫЕ ИНВОЙСЫ УДАЛЁННЫХ КЛИЕНТОВ И ПОМЕЧАЕМ ИХ КАК DELETED НА СЕРВЕРЕ
            if (deletedClientMBs.size > 0) {
                // Сначала помечаем инвойсы удалённых клиентов как deleted на сервере
                console.log('🗑️ Помечаем инвойсы удалённых клиентов как deleted на сервере...');
                for (const serverRecord of serverDocs) {
                    if (serverRecord.status === 'deleted') continue; // Уже удалён
                    
                    try {
                        const docData = JSON.parse(serverRecord.data);
                        const clientMB = docData.client?.mb;
                        
                        if (clientMB && deletedClientMBs.has(clientMB)) {
                            // Помечаем как deleted на сервере
                            await this.executeSQL(`UPDATE sync_invoices_v2 SET status = 'deleted', modified_at = '${now}' WHERE entity_key = '${serverRecord.entity_key}'`);
                            console.log(`🗑️ Инвойс ${serverRecord.entity_key} удалённого клиента MB:${clientMB} помечен как deleted на сервере`);
                        }
                    } catch(e) {
                        console.error('Ошибка пометки инвойса как deleted:', e);
                    }
                }
                
                const filterOutDeletedClients = (docs) => {
                    return docs.filter(doc => {
                        const clientMB = doc.client?.mb;
                        if (clientMB && deletedClientMBs.has(clientMB)) {
                            console.log(`🗑️ Удаляем локальный инвойс ${doc.number || doc.invoiceNumber} удалённого клиента MB: ${clientMB}`);
                            return false;
                        }
                        return true;
                    });
                };
                
                const beforeInv = confirmedInvoices.length;
                const beforeDel = confirmedDeliveries.length;
                const beforePre = confirmedPredracuns.length;
                const beforeRac = confirmedRacuns.length;
                
                confirmedInvoices = filterOutDeletedClients(confirmedInvoices);
                confirmedDeliveries = filterOutDeletedClients(confirmedDeliveries);
                confirmedPredracuns = filterOutDeletedClients(confirmedPredracuns);
                confirmedRacuns = filterOutDeletedClients(confirmedRacuns);
                
                if (beforeInv !== confirmedInvoices.length || beforeDel !== confirmedDeliveries.length ||
                    beforePre !== confirmedPredracuns.length || beforeRac !== confirmedRacuns.length) {
                    console.log(`🗑️ Удалено локальных инвойсов удалённых клиентов: ${(beforeInv - confirmedInvoices.length) + (beforeDel - confirmedDeliveries.length) + (beforePre - confirmedPredracuns.length) + (beforeRac - confirmedRacuns.length)}`);
                    // Сохраняем очищенные данные
                    localStorage.setItem('confirmedInvoices', JSON.stringify(confirmedInvoices));
                    localStorage.setItem('confirmedDeliveries', JSON.stringify(confirmedDeliveries));
                    localStorage.setItem('confirmedPredracuns', JSON.stringify(confirmedPredracuns));
                    localStorage.setItem('confirmedRacuns', JSON.stringify(confirmedRacuns));
                }
            }
            
            // ШАГ 1: СКАЧИВАЕМ ВСЕ ДОКУМЕНТЫ С СЕРВЕРА
            let updatedInvoices = false;
            let updatedDeliveries = false;
            let updatedPredracuns = false;
            let updatedRacuns = false;
            
            // Также обрабатываем удалённые документы
            for (const serverRecord of serverDocs) {
                // Если документ удалён на сервере - удаляем локально
                if (serverRecord.status === 'deleted') {
                    try {
                        const docData = JSON.parse(serverRecord.data);
                        const docType = docData.documentType || 'invoice';
                        const docNumber = docData.number || docData.invoiceNumber;
                        
                        if (docType === 'predracun') {
                            const idx = confirmedPredracuns.findIndex(d => (d.number || d.invoiceNumber) === docNumber);
                            if (idx >= 0) {
                                confirmedPredracuns.splice(idx, 1);
                                updatedPredracuns = true;
                                console.log(`🔄 Предрачун ${docNumber} УДАЛЁН (с сервера)`);
                            }
                        } else if (docType === 'racun') {
                            const idx = confirmedRacuns.findIndex(d => (d.number || d.invoiceNumber) === docNumber);
                            if (idx >= 0) {
                                confirmedRacuns.splice(idx, 1);
                                updatedRacuns = true;
                                console.log(`🔄 Рачун ${docNumber} УДАЛЁН (с сервера)`);
                            }
                        } else if (docType === 'delivery') {
                            const idx = confirmedDeliveries.findIndex(d => (d.number || d.invoiceNumber) === docNumber);
                            if (idx >= 0) {
                                confirmedDeliveries.splice(idx, 1);
                                updatedDeliveries = true;
                                console.log(`🔄 Отпремница ${docNumber} УДАЛЕНА (с сервера)`);
                            }
                        } else {
                            const idx = confirmedInvoices.findIndex(d => (d.number || d.invoiceNumber) === docNumber);
                            if (idx >= 0) {
                                confirmedInvoices.splice(idx, 1);
                                updatedInvoices = true;
                                console.log(`🔄 Инвойс ${docNumber} УДАЛЁН (с сервера)`);
                            }
                        }
                    } catch (e) {}
                    continue;
                }
                
                if (serverRecord.status !== 'active') continue;
                
                try {
                    const docData = JSON.parse(serverRecord.data);
                    
                    // Проверяем, не удалён ли клиент этого инвойса
                    const clientMB = docData.client?.mb;
                    if (clientMB && deletedClientMBs.has(clientMB)) {
                        console.log(`🔄 Пропуск инвойса ${serverRecord.entity_key} - клиент удалён (MB: ${clientMB})`);
                        continue;
                    }
                    
                    docData._syncVersion = serverRecord.version;
                    docData._syncModified = serverRecord.modified_at;
                    
                    const docType = docData.documentType || 'invoice';
                    const docNumber = docData.number || docData.invoiceNumber;
                    const serverTime = serverRecord.modified_at || '1970-01-01';
                    
                    // Определяем куда добавить/обновить - используем timestamp для сравнения
                    if (docType === 'delivery') {
                        const existIdx = confirmedDeliveries.findIndex(d => (d.number || d.invoiceNumber) === docNumber);
                        const localTime = existIdx >= 0 ? (confirmedDeliveries[existIdx]._syncModified || confirmedDeliveries[existIdx].confirmedDate || '1970-01-01') : '1970-01-01';
                        
                        // Сервер побеждает если его время СТРОГО больше
                        if (existIdx < 0 || serverTime > localTime) {
                            // ВАЖНО: Сохраняем локальные статусы оплаченности/доставки
                            // Статус TRUE всегда имеет приоритет!
                            if (existIdx >= 0) {
                                const localPaid = confirmedDeliveries[existIdx].paid;
                                const localDelivered = confirmedDeliveries[existIdx].delivered;
                                const serverPaid = docData.paid;
                                const serverDelivered = docData.delivered;
                                
                                confirmedDeliveries[existIdx] = docData;
                                // Восстанавливаем статусы: TRUE побеждает
                                confirmedDeliveries[existIdx].paid = localPaid === true || serverPaid === true;
                                confirmedDeliveries[existIdx].delivered = localDelivered === true || serverDelivered === true;
                            } else {
                                confirmedDeliveries.push(docData);
                            }
                            updatedDeliveries = true;
                            console.log(`🔄 Отпремница ${docNumber} применена с сервера (${serverTime} > ${localTime})`);
                        }
                    } else if (docType === 'predracun') {
                        const existIdx = confirmedPredracuns.findIndex(d => (d.number || d.invoiceNumber) === docNumber);
                        const localTime = existIdx >= 0 ? (confirmedPredracuns[existIdx]._syncModified || confirmedPredracuns[existIdx].confirmedDate || '1970-01-01') : '1970-01-01';
                        
                        if (existIdx < 0 || serverTime > localTime) {
                            // ВАЖНО: Сохраняем локальные статусы оплаченности/доставки
                            // Проверяем время изменения каждого статуса отдельно
                            if (existIdx >= 0) {
                                const localDoc = confirmedPredracuns[existIdx];
                                const localPaid = localDoc.paid;
                                const localDelivered = localDoc.delivered;
                                const localPaidTime = localDoc._statusModifiedAt?.paid || '1970-01-01';
                                const localDeliveredTime = localDoc._statusModifiedAt?.delivered || '1970-01-01';
                                const serverPaid = docData.paid;
                                const serverDelivered = docData.delivered;
                                
                                console.log(`📝 Предрачун ${docNumber}: local(paid=${localPaid}@${localPaidTime}, delivered=${localDelivered}@${localDeliveredTime}) vs server(paid=${serverPaid}, delivered=${serverDelivered})`);
                                
                                // Сохраняем _statusModifiedAt
                                const savedStatusModifiedAt = localDoc._statusModifiedAt;
                                
                                confirmedPredracuns[existIdx] = docData;
                                
                                // Восстанавливаем статусы на основе времени изменения
                                // Если локальный статус изменён ПОСЛЕ времени сервера - сохраняем локальный
                                if (localPaidTime > serverTime) {
                                    confirmedPredracuns[existIdx].paid = localPaid;
                                } else {
                                    confirmedPredracuns[existIdx].paid = localPaid === true || serverPaid === true;
                                }
                                
                                if (localDeliveredTime > serverTime) {
                                    confirmedPredracuns[existIdx].delivered = localDelivered;
                                } else {
                                    confirmedPredracuns[existIdx].delivered = localDelivered === true || serverDelivered === true;
                                }
                                
                                // Восстанавливаем _statusModifiedAt
                                if (savedStatusModifiedAt) {
                                    confirmedPredracuns[existIdx]._statusModifiedAt = savedStatusModifiedAt;
                                }
                                
                                console.log(`   Итог: paid=${confirmedPredracuns[existIdx].paid}, delivered=${confirmedPredracuns[existIdx].delivered}`);
                            } else {
                                confirmedPredracuns.push(docData);
                            }
                            updatedPredracuns = true;
                            console.log(`🔄 Предрачун ${docNumber} применен с сервера (${serverTime} > ${localTime})`);
                        }
                    } else if (docType === 'racun') {
                        const existIdx = confirmedRacuns.findIndex(d => (d.number || d.invoiceNumber) === docNumber);
                        const localTime = existIdx >= 0 ? (confirmedRacuns[existIdx]._syncModified || confirmedRacuns[existIdx].confirmedDate || '1970-01-01') : '1970-01-01';
                        
                        if (existIdx < 0 || serverTime > localTime) {
                            // ВАЖНО: Сохраняем локальные статусы оплаченности/доставки
                            // Проверяем время изменения каждого статуса отдельно
                            if (existIdx >= 0) {
                                const localDoc = confirmedRacuns[existIdx];
                                const localPaid = localDoc.paid;
                                const localDelivered = localDoc.delivered;
                                const localPaidTime = localDoc._statusModifiedAt?.paid || '1970-01-01';
                                const localDeliveredTime = localDoc._statusModifiedAt?.delivered || '1970-01-01';
                                const serverPaid = docData.paid;
                                const serverDelivered = docData.delivered;
                                
                                console.log(`📝 Рачун ${docNumber}: local(paid=${localPaid}@${localPaidTime}, delivered=${localDelivered}@${localDeliveredTime}) vs server(paid=${serverPaid}, delivered=${serverDelivered})`);
                                
                                // Сохраняем _statusModifiedAt
                                const savedStatusModifiedAt = localDoc._statusModifiedAt;
                                
                                confirmedRacuns[existIdx] = docData;
                                
                                // Восстанавливаем статусы на основе времени изменения
                                // Если локальный статус изменён ПОСЛЕ времени сервера - сохраняем локальный
                                if (localPaidTime > serverTime) {
                                    confirmedRacuns[existIdx].paid = localPaid;
                                } else {
                                    confirmedRacuns[existIdx].paid = localPaid === true || serverPaid === true;
                                }
                                
                                if (localDeliveredTime > serverTime) {
                                    confirmedRacuns[existIdx].delivered = localDelivered;
                                } else {
                                    confirmedRacuns[existIdx].delivered = localDelivered === true || serverDelivered === true;
                                }
                                
                                // Восстанавливаем _statusModifiedAt
                                if (savedStatusModifiedAt) {
                                    confirmedRacuns[existIdx]._statusModifiedAt = savedStatusModifiedAt;
                                }
                                
                                console.log(`   Итог: paid=${confirmedRacuns[existIdx].paid}, delivered=${confirmedRacuns[existIdx].delivered}`);
                            } else {
                                confirmedRacuns.push(docData);
                            }
                            updatedRacuns = true;
                            console.log(`🔄 Рачун ${docNumber} применен с сервера (${serverTime} > ${localTime})`);
                        }
                    } else {
                        const existIdx = confirmedInvoices.findIndex(d => (d.number || d.invoiceNumber) === docNumber);
                        const localTime = existIdx >= 0 ? (confirmedInvoices[existIdx]._syncModified || confirmedInvoices[existIdx].confirmedDate || '1970-01-01') : '1970-01-01';
                        
                        if (existIdx < 0 || serverTime > localTime) {
                            // ВАЖНО: Сохраняем локальные статусы оплаченности/доставки
                            // Статус TRUE всегда имеет приоритет!
                            if (existIdx >= 0) {
                                const localPaid = confirmedInvoices[existIdx].paid;
                                const localDelivered = confirmedInvoices[existIdx].delivered;
                                const serverPaid = docData.paid;
                                const serverDelivered = docData.delivered;
                                
                                confirmedInvoices[existIdx] = docData;
                                // Восстанавливаем статусы: TRUE побеждает
                                confirmedInvoices[existIdx].paid = localPaid === true || serverPaid === true;
                                confirmedInvoices[existIdx].delivered = localDelivered === true || serverDelivered === true;
                            } else {
                                confirmedInvoices.push(docData);
                            }
                            updatedInvoices = true;
                            console.log(`🔄 Инвойс ${docNumber} применен с сервера (${serverTime} > ${localTime})`);
                        }
                    }
                } catch (e) {
                    console.error('Ошибка парсинга документа:', e);
                }
            }
            
            // Сохраняем обновлённые данные после скачивания
            // ВСЕГДА сохраняем чтобы гарантировать синхронизацию
            if (updatedInvoices || serverDocs.length > 0) {
                localStorage.setItem('confirmedInvoices', JSON.stringify(confirmedInvoices));
                console.log(`💾 Сохранено confirmedInvoices: ${confirmedInvoices.length}`);
            }
            if (updatedDeliveries || serverDocs.length > 0) {
                localStorage.setItem('confirmedDeliveries', JSON.stringify(confirmedDeliveries));
                console.log(`💾 Сохранено confirmedDeliveries: ${confirmedDeliveries.length}`);
            }
            if (updatedPredracuns || serverDocs.length > 0) {
                localStorage.setItem('confirmedPredracuns', JSON.stringify(confirmedPredracuns));
                console.log(`💾 Сохранено confirmedPredracuns: ${confirmedPredracuns.length}`);
            }
            if (updatedRacuns || serverDocs.length > 0) {
                localStorage.setItem('confirmedRacuns', JSON.stringify(confirmedRacuns));
                console.log(`💾 Сохранено confirmedRacuns: ${confirmedRacuns.length}`);
            }
            
            // ШАГ 1.5: СОХРАНЯЕМ В ЛОКАЛЬНУЮ SQLITE БАЗУ
            // Это позволит данным сохраняться между сессиями
            console.log('💾 Сохраняем документы в локальную SQLite базу...');
            await this.saveDocsToLocalDB([...confirmedPredracuns, ...confirmedRacuns]);
            
            // ШАГ 2: ВЫГРУЖАЕМ ЛОКАЛЬНЫЕ ДОКУМЕНТЫ НА СЕРВЕР
            // Перезагружаем после обновления
            confirmedInvoices = JSON.parse(localStorage.getItem('confirmedInvoices') || '[]');
            confirmedDeliveries = JSON.parse(localStorage.getItem('confirmedDeliveries') || '[]');
            confirmedPredracuns = JSON.parse(localStorage.getItem('confirmedPredracuns') || '[]');
            confirmedRacuns = JSON.parse(localStorage.getItem('confirmedRacuns') || '[]');
            
            const allLocalDocs = [
                ...confirmedInvoices.map(d => ({...d, _docType: 'invoice'})),
                ...confirmedDeliveries.map(d => ({...d, _docType: 'delivery'})),
                ...confirmedPredracuns.map(d => ({...d, _docType: 'predracun'})),
                ...confirmedRacuns.map(d => ({...d, _docType: 'racun'}))
            ];
            
            console.log(`🔄 Локально документов после скачивания: ${allLocalDocs.length}`);
            
            for (const doc of allLocalDocs) {
                const key = doc.number || doc.invoiceNumber;
                if (!key) continue;
                
                // Пропускаем инвойсы удалённых клиентов
                const clientMB = doc.client?.mb;
                if (clientMB && deletedClientMBs.has(clientMB)) {
                    console.log(`🔄 Пропуск выгрузки ${key} - клиент удалён`);
                    continue;
                }
                
                const docType = doc.documentType || doc._docType || 'invoice';
                const uniqueKey = `${docType}_${key}`;
                
                const serverRecord = serverMap.get(uniqueKey);
                const localTime = doc._syncModified || doc.confirmedDate || now;
                const serverTime = serverRecord?.modified_at || '1970-01-01';
                
                // Копируем документ без служебных полей
                const docToSync = {...doc};
                delete docToSync._docType;
                
                // Получаем время последнего изменения статусов
                const localPaidTime = doc._statusModifiedAt?.paid || '1970-01-01';
                const localDeliveredTime = doc._statusModifiedAt?.delivered || '1970-01-01';
                const latestLocalStatusTime = localPaidTime > localDeliveredTime ? localPaidTime : localDeliveredTime;
                
                // Проверяем серверные данные
                let serverData = null;
                let serverPaidTime = '1970-01-01';
                let serverDeliveredTime = '1970-01-01';
                let statusNeedsUpdate = false;
                
                if (serverRecord) {
                    try {
                        serverData = JSON.parse(serverRecord.data);
                        serverPaidTime = serverData._statusModifiedAt?.paid || serverRecord.modified_at || '1970-01-01';
                        serverDeliveredTime = serverData._statusModifiedAt?.delivered || serverRecord.modified_at || '1970-01-01';
                        
                        // Проверяем нужно ли обновить статусы на основе времени изменения
                        // Если локальное время изменения статуса НОВЕЕ серверного - обновляем
                        const paidNeedsUpdate = localPaidTime > serverPaidTime && doc.paid !== serverData.paid;
                        const deliveredNeedsUpdate = localDeliveredTime > serverDeliveredTime && doc.delivered !== serverData.delivered;
                        
                        if (paidNeedsUpdate || deliveredNeedsUpdate) {
                            statusNeedsUpdate = true;
                            console.log(`📝 Статусы ${uniqueKey} требуют обновления:`);
                            if (paidNeedsUpdate) {
                                console.log(`   paid: local=${doc.paid}@${localPaidTime} > server=${serverData.paid}@${serverPaidTime}`);
                            }
                            if (deliveredNeedsUpdate) {
                                console.log(`   delivered: local=${doc.delivered}@${localDeliveredTime} > server=${serverData.delivered}@${serverDeliveredTime}`);
                            }
                        }
                    } catch(e) {}
                }
                
                // Проверяем установлены ли статусы локально с известным временем изменения
                const hasLocalStatusWithTime = (doc.paid === true && localPaidTime > '1970-01-01') || 
                                               (doc.delivered === true && localDeliveredTime > '1970-01-01');
                
                // ВАЖНО: Документы выгружаем если:
                // 1. На сервере нет записи
                // 2. Локальное время >= серверного
                // 3. Статусы требуют обновления (локальное время статуса > серверного)
                // 4. Есть локальный статус TRUE с временем изменения
                const shouldForceUpload = statusNeedsUpdate || hasLocalStatusWithTime;
                
                if (!serverRecord || localTime >= serverTime || shouldForceUpload) {
                    // Увеличиваем версию при изменении статусов
                    const version = shouldForceUpload ? (doc._syncVersion || 1) + 1 : (doc._syncVersion || 1);
                    // Используем самое новое время из локальных изменений
                    const uploadTime = shouldForceUpload ? 
                        (latestLocalStatusTime > localTime ? latestLocalStatusTime : now) : 
                        localTime;
                    
                    // forceUpdate = true если статусы требуют обновления - гарантирует полную перезапись (DELETE + INSERT)
                    await this.upsertServerRecord('sync_invoices_v2', uniqueKey, docToSync, 'active', version, uploadTime, user, shouldForceUpload);
                    
                    if (!serverRecord) {
                        console.log(`🔄 Документ ${uniqueKey} выгружен на сервер (новый)`);
                    } else if (shouldForceUpload) {
                        console.log(`🔄 Документ ${uniqueKey} ПРИНУДИТЕЛЬНО перезаписан на сервере:`);
                        console.log(`   paid=${doc.paid}@${localPaidTime}, delivered=${doc.delivered}@${localDeliveredTime}, v${version}`);
                    } else {
                        console.log(`🔄 Документ ${uniqueKey} обновлён на сервере (${localTime} >= ${serverTime})`);
                    }
                }
            }
            
            console.log(`🔄 SyncService: Документы V2 синхронизированы`);
            console.log(`   Инвойсы: ${confirmedInvoices.length}, Отпремницы: ${confirmedDeliveries.length}`);
            console.log(`   Предрачуны: ${confirmedPredracuns.length}, Рачуны: ${confirmedRacuns.length}`);
        } catch (error) {
            console.error('🔄 SyncService: Ошибка синхронизации инвойсов V2:', error);
        }
    },
    
    /**
     * Синхронизация склада V2
     */
    /**
     * Синхронизация склада V2
     * ПОРЯДОК: 1) Сначала загружаем ВСЕ с сервера, 2) Потом выгружаем локальные
     */
    async syncWarehouseV2() {
        console.log('🔄 SyncService: Синхронизация склада V2 (сначала сервер -> локально)...');
        
        try {
            const now = new Date().toISOString();
            const user = window.currentUser?.username || 'system';
            
            // Получаем серверные данные СНАЧАЛА
            const serverResult = await this.executeSQL('SELECT * FROM sync_warehouse_v2');
            const serverGroups = serverResult?.data || [];
            const serverMap = new Map(serverGroups.map(s => [s.entity_key, s]));
            
            console.log(`🔄 SyncService: Найдено ${serverGroups.length} групп склада на сервере`);
            
            // Получаем локальные группы
            let localGroups = JSON.parse(localStorage.getItem('productGroups') || '[]');
            
            // ШАГ 1: СКАЧИВАЕМ ВСЕ ГРУППЫ С СЕРВЕРА
            for (const serverRecord of serverGroups) {
                if (serverRecord.status !== 'active') continue;
                
                const key = serverRecord.entity_key;
                const serverVersion = serverRecord.version || 1;
                
                const localIdx = localGroups.findIndex(g => 
                    (g.groupCode || g.code || g.id?.toString()) === key
                );
                const localVersion = localIdx >= 0 ? (localGroups[localIdx]._syncVersion || 0) : 0;
                
                // Серверная версия приоритетнее или равна - применяем
                if (serverVersion >= localVersion) {
                    try {
                        const groupData = JSON.parse(serverRecord.data);
                        groupData._syncVersion = serverRecord.version;
                        groupData._syncModified = serverRecord.modified_at;
                        
                        if (localIdx >= 0) {
                            localGroups[localIdx] = groupData;
                        } else {
                            localGroups.push(groupData);
                        }
                        console.log(`🔄 [Склад ${key}] Применен с сервера (v${serverVersion})`);
                    } catch (e) {
                        console.error('Ошибка парсинга группы склада:', e);
                    }
                }
            }
            
            // Сохраняем после скачивания
            localStorage.setItem('productGroups', JSON.stringify(localGroups));
            
            // ШАГ 2: ВЫГРУЖАЕМ ЛОКАЛЬНЫЕ ГРУППЫ НА СЕРВЕР
            // Перезагружаем после обновления
            localGroups = JSON.parse(localStorage.getItem('productGroups') || '[]');
            
            for (const group of localGroups) {
                const key = group.groupCode || group.code || group.id?.toString();
                if (!key) continue;
                
                const serverRecord = serverMap.get(key);
                const localVersion = group._syncVersion || 1;
                
                if (!serverRecord) {
                    // На сервере нет - загружаем
                    await this.upsertServerRecord('sync_warehouse_v2', key, group, 'active', localVersion, now, user);
                    console.log(`🔄 [Склад ${key}] Выгружен на сервер (новый)`);
                } else {
                    const serverVersion = serverRecord.version || 1;
                    // Если локальная версия СТРОГО больше - обновляем сервер
                    if (localVersion > serverVersion) {
                        await this.upsertServerRecord('sync_warehouse_v2', key, group, 'active', localVersion, now, user);
                        console.log(`🔄 [Склад ${key}] Обновлен на сервере (v${localVersion} > v${serverVersion})`);
                    }
                }
            }
            
            console.log('🔄 SyncService: Склад V2 синхронизирован');
        } catch (error) {
            console.error('🔄 SyncService: Ошибка синхронизации склада V2:', error);
        }
    },
    
    /**
     * Вставка/обновление записи на сервере
     * forceUpdate = true для инвойсов со статусами (всегда перезаписывает)
     */
    async upsertServerRecord(tableName, entityKey, data, status, version, modifiedAt, modifiedBy, forceUpdate = false) {
        const dataJson = JSON.stringify(data);
        
        if (forceUpdate) {
            // ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ: Сначала удаляем, потом вставляем
            // Это гарантирует полную перезапись данных на сервере
            console.log(`🔄 FORCE UPDATE: ${tableName} / ${entityKey}`);
            console.log(`   paid=${data.paid}, delivered=${data.delivered}, version=${version}`);
            
            try {
                // Шаг 1: Удаляем старую запись
                await this.executeSQL(`DELETE FROM ${tableName} WHERE entity_key = ?`, [entityKey]);
                console.log(`   ✓ Старая запись удалена`);
            } catch(e) {
                console.log(`   ⚠️ Запись не существовала или ошибка удаления`);
            }
            
            // Шаг 2: Вставляем новую запись
            const insertSql = `
                INSERT INTO ${tableName} (entity_key, data, status, version, modified_at, modified_by, device_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            await this.executeSQL(insertSql, [
                entityKey,
                dataJson,
                status,
                version,
                modifiedAt,
                modifiedBy,
                this.deviceId
            ]);
            console.log(`   ✓ Новая запись создана с paid=${data.paid}, delivered=${data.delivered}`);
            
        } else {
            // Обычное обновление с проверкой версии/времени
            const sql = `
                INSERT INTO ${tableName} (entity_key, data, status, version, modified_at, modified_by, device_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(entity_key) DO UPDATE SET
                    data = excluded.data,
                    status = excluded.status,
                    version = excluded.version,
                    modified_at = excluded.modified_at,
                    modified_by = excluded.modified_by,
                    device_id = excluded.device_id
                WHERE excluded.version > ${tableName}.version 
                   OR (excluded.version = ${tableName}.version AND excluded.modified_at > ${tableName}.modified_at)
            `;
            
            await this.executeSQL(sql, [
                entityKey,
                dataJson,
                status,
                version,
                modifiedAt,
                modifiedBy,
                this.deviceId
            ]);
        }
    },
    
    /**
     * Загрузка клиентов на сервер
     */
    async uploadClients() {
        try {
            console.log('🔄 SyncService: uploadClients() - начало');
            const clients = await window.api.clients.getAll();
            console.log(`🔄 SyncService: Получено ${clients.length} клиентов из локальной БД`);
            
            let uploaded = 0;
            for (const client of clients) {
                const syncId = client.mb || `client_${client.id}`;
                const now = new Date().toISOString();
                const clientJson = JSON.stringify(client);
                
                console.log(`🔄 SyncService: Загружаем клиента ${syncId}, данные: ${clientJson.substring(0, 100)}...`);
                
                const sql = `
                    INSERT INTO sync_clients (sync_id, data, updated_at, device_id)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(sync_id) DO UPDATE SET
                        data = excluded.data,
                        updated_at = excluded.updated_at,
                        device_id = excluded.device_id
                    WHERE excluded.updated_at > sync_clients.updated_at
                `;
                
                await this.executeSQL(sql, [syncId, clientJson, now, this.deviceId]);
                uploaded++;
            }
            console.log(`🔄 SyncService: uploadClients() - загружено ${uploaded} клиентов`);
            
            // Обрабатываем удалённые записи из архива
            await this.markDeletedOnServer('clients');
        } catch (error) {
            console.error('🔄 SyncService: Ошибка загрузки клиентов:', error);
        }
    },
    
    /**
     * Пометка удалённых записей на сервере
     */
    async markDeletedOnServer(entityType) {
        try {
            const archive = JSON.parse(localStorage.getItem('deletedArchive') || '[]');
            const deletedItems = archive.filter(a => a.entityType === entityType);
            
            if (deletedItems.length === 0) return;
            
            console.log(`🔄 SyncService: Помечаем ${deletedItems.length} удалённых ${entityType} на сервере`);
            
            for (const item of deletedItems) {
                try {
                    let tableName, syncId;
                    
                    if (entityType === 'clients') {
                        tableName = 'sync_clients';
                        syncId = item.object.mb || `client_${item.object.id}`;
                    } else if (entityType === 'products') {
                        tableName = 'sync_products';
                        syncId = item.object.internal_code || item.object.internalCode || `product_${item.object.id}`;
                    } else {
                        continue;
                    }
                    
                    const sql = `
                        UPDATE ${tableName} 
                        SET deleted_at = ?, device_id = ?
                        WHERE sync_id = ? AND deleted_at IS NULL
                    `;
                    
                    await this.executeSQL(sql, [item.deletedAt, this.deviceId, syncId]);
                } catch (e) {
                    console.error(`🔄 SyncService: Ошибка пометки удалённого ${entityType}:`, e);
                }
            }
        } catch (error) {
            console.error('🔄 SyncService: Ошибка markDeletedOnServer:', error);
        }
    },
    
    /**
     * Загрузка товаров на сервер
     */
    async uploadProducts() {
        try {
            const products = await window.api.products.getAll();
            console.log(`🔄 SyncService: Загружаем ${products.length} товаров на сервер`);
            
            for (const product of products) {
                const syncId = product.internal_code || product.code || `product_${product.id}`;
                const now = new Date().toISOString();
                
                await this.executeSQL(`
                    INSERT INTO sync_products (sync_id, internal_code, data, updated_at, device_id)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(sync_id) DO UPDATE SET
                        internal_code = excluded.internal_code,
                        data = excluded.data,
                        updated_at = excluded.updated_at,
                        device_id = excluded.device_id
                    WHERE excluded.updated_at > sync_products.updated_at
                `, [syncId, product.internal_code || '', JSON.stringify(product), now, this.deviceId]);
            }
            
            // Обрабатываем удалённые записи из архива
            await this.markDeletedOnServer('products');
        } catch (error) {
            console.error('🔄 SyncService: Ошибка загрузки товаров:', error);
        }
    },
    
    /**
     * Загрузка групп склада на сервер
     */
    async uploadWarehouseGroups() {
        try {
            // Из localStorage
            const productGroups = JSON.parse(localStorage.getItem('productGroups') || '[]');
            console.log(`🔄 SyncService: Загружаем ${productGroups.length} групп склада на сервер`);
            
            for (const group of productGroups) {
                const syncId = group.code || group.id || `group_${Date.now()}`;
                const now = new Date().toISOString();
                
                await this.executeSQL(`
                    INSERT INTO sync_warehouse_groups (sync_id, code, data, updated_at, device_id)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(sync_id) DO UPDATE SET
                        code = excluded.code,
                        data = excluded.data,
                        updated_at = excluded.updated_at,
                        device_id = excluded.device_id
                    WHERE excluded.updated_at > sync_warehouse_groups.updated_at
                `, [syncId, group.code || '', JSON.stringify(group), now, this.deviceId]);
            }
        } catch (error) {
            console.error('🔄 SyncService: Ошибка загрузки групп склада:', error);
        }
    },
    
    /**
     * Загрузка инвойсов на сервер
     */
    async uploadInvoices() {
        try {
            const confirmedInvoices = JSON.parse(localStorage.getItem('confirmedInvoices') || '[]');
            console.log(`🔄 SyncService: Загружаем ${confirmedInvoices.length} инвойсов на сервер`);
            
            for (const invoice of confirmedInvoices) {
                const syncId = invoice.number || `invoice_${invoice.id || Date.now()}`;
                const now = new Date().toISOString();
                
                await this.executeSQL(`
                    INSERT INTO sync_invoices (sync_id, invoice_number, data, updated_at, device_id)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(sync_id) DO UPDATE SET
                        invoice_number = excluded.invoice_number,
                        data = excluded.data,
                        updated_at = excluded.updated_at,
                        device_id = excluded.device_id
                    WHERE excluded.updated_at > sync_invoices.updated_at
                `, [syncId, invoice.number || '', JSON.stringify(invoice), now, this.deviceId]);
            }
        } catch (error) {
            console.error('🔄 SyncService: Ошибка загрузки инвойсов:', error);
        }
    },
    
    /**
     * Загрузка localStorage данных на сервер
     */
    async uploadLocalStorage() {
        const keysToSync = [
            'systemUsers',
            'productGroups',
            'writtenOffGroups',
            'confirmedInvoices',
            'confirmedDeliveries',
            'confirmedPredracuns',
            'consumableGroups',
            'consumableCategories',
            'consumableSubcategories',
            'consumableHistory',
            'clientProducts',
            'clientSalesHistory',
            'orders',
            'shipments',
            'teaStocks',
            'teaStockLogs',
            'productConsumables'
        ];
        
        const now = new Date().toISOString();
        
        for (const key of keysToSync) {
            try {
                const data = localStorage.getItem(key);
                if (data) {
                    await this.executeSQL(`
                        INSERT INTO sync_local_storage (key_name, data, updated_at, device_id)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(key_name) DO UPDATE SET
                            data = excluded.data,
                            updated_at = excluded.updated_at,
                            device_id = excluded.device_id
                    `, [key, data, now, this.deviceId]);
                }
            } catch (error) {
                console.error(`🔄 SyncService: Ошибка загрузки ${key}:`, error);
            }
        }
        
        // Загружаем клиентские группы товаров (динамические ключи)
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('clientProductGroups_')) {
                try {
                    const data = localStorage.getItem(key);
                    if (data) {
                        await this.executeSQL(`
                            INSERT INTO sync_local_storage (key_name, data, updated_at, device_id)
                            VALUES (?, ?, ?, ?)
                            ON CONFLICT(key_name) DO UPDATE SET
                                data = excluded.data,
                                updated_at = excluded.updated_at,
                                device_id = excluded.device_id
                        `, [key, data, now, this.deviceId]);
                    }
                } catch (error) {
                    console.error(`🔄 SyncService: Ошибка загрузки ${key}:`, error);
                }
            }
        }
    },
    
    /**
     * Скачивание клиентов с сервера
     */
    async downloadClients() {
        try {
            const result = await this.executeSQL(`
                SELECT * FROM sync_clients WHERE deleted_at IS NULL
            `);
            
            if (result && result.data && result.data.length > 0) {
                console.log(`🔄 SyncService: Получено ${result.data.length} клиентов с сервера`);
                
                // Получаем локальных клиентов
                const localClients = await window.api.clients.getAll();
                const localClientsMB = new Set(localClients.map(c => c.mb));
                
                // Получаем удалённых клиентов из архива
                const deletedArchive = JSON.parse(localStorage.getItem('deletedArchive') || '[]');
                const deletedClientsMB = new Set(
                    deletedArchive
                        .filter(a => a.entityType === 'clients')
                        .map(a => a.object.mb)
                );
                
                for (const serverClient of result.data) {
                    try {
                        const clientData = JSON.parse(serverClient.data);
                        
                        // Проверяем что клиент НЕ в архиве удалённых
                        if (deletedClientsMB.has(clientData.mb)) {
                            console.log(`🔄 SyncService: Пропускаем клиента ${clientData.name} - он в архиве удалённых`);
                            continue;
                        }
                        
                        // Если клиент с таким МБ не существует локально, создаем
                        if (!localClientsMB.has(clientData.mb)) {
                            console.log(`🔄 SyncService: Создаем клиента ${clientData.name}`);
                            await window.api.clients.create(clientData);
                        }
                    } catch (e) {
                        console.error('🔄 SyncService: Ошибка обработки клиента:', e);
                    }
                }
            }
        } catch (error) {
            console.error('🔄 SyncService: Ошибка скачивания клиентов:', error);
        }
    },
    
    /**
     * Скачивание товаров с сервера
     */
    async downloadProducts() {
        try {
            const result = await this.executeSQL(`
                SELECT * FROM sync_products WHERE deleted_at IS NULL
            `);
            
            if (result && result.data && result.data.length > 0) {
                console.log(`🔄 SyncService: Получено ${result.data.length} товаров с сервера`);
                
                // Получаем локальные товары
                const localProducts = await window.api.products.getAll();
                const localProductCodes = new Set(localProducts.map(p => p.internal_code || p.code));
                
                // Получаем удалённые товары из архива
                const deletedArchive = JSON.parse(localStorage.getItem('deletedArchive') || '[]');
                const deletedProductCodes = new Set(
                    deletedArchive
                        .filter(a => a.entityType === 'products')
                        .map(a => a.object.internal_code || a.object.internalCode || a.object.code)
                );
                
                for (const serverProduct of result.data) {
                    try {
                        const productData = JSON.parse(serverProduct.data);
                        const productCode = productData.internal_code || productData.internalCode || productData.code;
                        
                        // Проверяем что товар НЕ в архиве удалённых
                        if (deletedProductCodes.has(productCode)) {
                            console.log(`🔄 SyncService: Пропускаем товар ${productData.name} - он в архиве удалённых`);
                            continue;
                        }
                        
                        // Если товар с таким кодом не существует локально, создаем
                        if (!localProductCodes.has(productCode)) {
                            console.log(`🔄 SyncService: Создаем товар ${productData.name}`);
                            await window.api.products.create(productData);
                        }
                    } catch (e) {
                        console.error('🔄 SyncService: Ошибка обработки товара:', e);
                    }
                }
            }
        } catch (error) {
            console.error('🔄 SyncService: Ошибка скачивания товаров:', error);
        }
    },
    
    /**
     * Скачивание групп склада с сервера
     */
    async downloadWarehouseGroups() {
        try {
            const result = await this.executeSQL(`
                SELECT * FROM sync_warehouse_groups WHERE deleted_at IS NULL
            `);
            
            if (result && result.data && result.data.length > 0) {
                console.log(`🔄 SyncService: Получено ${result.data.length} групп склада с сервера`);
                
                // Получаем локальные группы
                let localGroups = JSON.parse(localStorage.getItem('productGroups') || '[]');
                const localGroupCodes = new Set(localGroups.map(g => g.code || g.id));
                
                let updated = false;
                
                for (const serverGroup of result.data) {
                    try {
                        const groupData = JSON.parse(serverGroup.data);
                        const groupCode = groupData.code || groupData.id;
                        
                        // Если группа с таким кодом не существует локально, добавляем
                        if (!localGroupCodes.has(groupCode)) {
                            console.log(`🔄 SyncService: Добавляем группу ${groupData.name}`);
                            localGroups.push(groupData);
                            updated = true;
                        }
                    } catch (e) {
                        console.error('🔄 SyncService: Ошибка обработки группы:', e);
                    }
                }
                
                if (updated) {
                    localStorage.setItem('productGroups', JSON.stringify(localGroups));
                    // Обновляем глобальную переменную
                    if (window.productGroups) {
                        window.productGroups = localGroups;
                    }
                }
            }
        } catch (error) {
            console.error('🔄 SyncService: Ошибка скачивания групп склада:', error);
        }
    },
    
    /**
     * Скачивание инвойсов с сервера
     */
    async downloadInvoices() {
        try {
            const result = await this.executeSQL(`
                SELECT * FROM sync_invoices WHERE deleted_at IS NULL
            `);
            
            if (result && result.data && result.data.length > 0) {
                console.log(`🔄 SyncService: Получено ${result.data.length} инвойсов с сервера`);
                
                // Получаем локальные инвойсы
                const localInvoices = await window.api.invoices.getAll();
                const localInvoiceNumbers = new Set(localInvoices.map(i => i.invoice_number || i.number));
                
                for (const serverInvoice of result.data) {
                    try {
                        const invoiceData = JSON.parse(serverInvoice.data);
                        const invoiceNumber = invoiceData.invoice_number || invoiceData.number;
                        
                        // Если инвойс с таким номером не существует локально, создаем
                        if (!localInvoiceNumbers.has(invoiceNumber)) {
                            console.log(`🔄 SyncService: Создаем инвойс ${invoiceNumber}`);
                            await window.api.invoices.create(invoiceData);
                        }
                    } catch (e) {
                        console.error('🔄 SyncService: Ошибка обработки инвойса:', e);
                    }
                }
            }
        } catch (error) {
            console.error('🔄 SyncService: Ошибка скачивания инвойсов:', error);
        }
    },
    
    /**
     * Скачивание localStorage данных с сервера
     */
    async downloadLocalStorage() {
        try {
            const result = await this.executeSQL(`
                SELECT * FROM sync_local_storage
            `);
            
            if (result && result.data && result.data.length > 0) {
                console.log(`🔄 SyncService: Получено ${result.data.length} записей localStorage с сервера`);
                
                for (const item of result.data) {
                    try {
                        const key = item.key_name;
                        const serverData = item.data;
                        const localData = localStorage.getItem(key);
                        
                        // Объединяем данные (серверные + локальные без дубликатов)
                        if (serverData && key !== 'syncDeviceId') {
                            if (!localData) {
                                // Если локально нет данных, просто используем серверные
                                localStorage.setItem(key, serverData);
                            } else {
                                // Объединяем массивы
                                try {
                                    const serverArray = JSON.parse(serverData);
                                    const localArray = JSON.parse(localData);
                                    
                                    if (Array.isArray(serverArray) && Array.isArray(localArray)) {
                                        const merged = this.mergeArrays(localArray, serverArray, key);
                                        localStorage.setItem(key, JSON.stringify(merged));
                                    }
                                } catch (e) {
                                    // Не массив, просто используем серверные данные
                                }
                            }
                        }
                    } catch (e) {
                        console.error(`🔄 SyncService: Ошибка обработки ${item.key_name}:`, e);
                    }
                }
            }
        } catch (error) {
            console.error('🔄 SyncService: Ошибка скачивания localStorage:', error);
        }
    },
    
    /**
     * Объединение массивов с удалением дубликатов
     */
    mergeArrays(local, server, key) {
        // Определяем уникальный ключ в зависимости от типа данных
        let idKey = 'id';
        
        if (key === 'confirmedInvoices' || key === 'confirmedDeliveries') {
            idKey = 'number';
        } else if (key === 'systemUsers') {
            idKey = 'login';
        } else if (key === 'productGroups' || key === 'consumableGroups') {
            idKey = 'code';
        }
        
        const merged = [...local];
        const localIds = new Set(local.map(item => item[idKey]));
        
        for (const serverItem of server) {
            if (!localIds.has(serverItem[idKey])) {
                merged.push(serverItem);
            }
        }
        
        return merged;
    },
    
    /**
     * Загрузка истории изменений на сервер
     */
    async uploadObjectHistory() {
        try {
            const history = JSON.parse(localStorage.getItem('objectHistory') || '[]');
            if (history.length === 0) {
                console.log('🔄 SyncService: Нет истории для загрузки');
                return;
            }
            
            console.log(`🔄 SyncService: Загрузка ${history.length} записей истории на сервер`);
            
            for (const entry of history) {
                try {
                    const sql = `
                        INSERT INTO sync_object_history (history_id, entity_type, action, object_id, object_name, details, old_data, new_data, timestamp, device_id, user_name)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(history_id) DO NOTHING
                    `;
                    
                    await this.executeSQL(sql, [
                        entry.id,
                        entry.entityType,
                        entry.action,
                        entry.objectId || '',
                        entry.objectName || '',
                        JSON.stringify(entry.details || {}),
                        entry.oldData ? JSON.stringify(entry.oldData) : null,
                        entry.newData ? JSON.stringify(entry.newData) : null,
                        entry.timestamp,
                        entry.deviceId || this.deviceId,
                        entry.user || 'system'
                    ]);
                } catch (e) {
                    console.error('🔄 SyncService: Ошибка загрузки записи истории:', e);
                }
            }
            
            console.log('🔄 SyncService: История загружена');
        } catch (error) {
            console.error('🔄 SyncService: Ошибка загрузки истории:', error);
        }
    },
    
    /**
     * Скачивание истории изменений с сервера
     * ВАЖНО: Применяем ВСЕ записи истории, чтобы гарантировать синхронизацию изменений
     */
    async downloadObjectHistory() {
        try {
            const result = await this.executeSQL(`
                SELECT * FROM sync_object_history ORDER BY timestamp DESC LIMIT 1000
            `);
            
            if (result && result.data && result.data.length > 0) {
                console.log(`🔄 SyncService: Получено ${result.data.length} записей истории с сервера`);
                
                const localHistory = JSON.parse(localStorage.getItem('objectHistory') || '[]');
                const localIds = new Set(localHistory.map(h => h.id));
                
                let added = 0;
                for (const item of result.data) {
                    if (!localIds.has(item.history_id)) {
                        localHistory.push({
                            id: item.history_id,
                            timestamp: item.timestamp,
                            entityType: item.entity_type,
                            action: item.action,
                            objectId: item.object_id,
                            objectName: item.object_name,
                            details: item.details ? JSON.parse(item.details) : {},
                            oldData: item.old_data ? JSON.parse(item.old_data) : null,
                            newData: item.new_data ? JSON.parse(item.new_data) : null,
                            user: item.user_name,
                            deviceId: item.device_id
                        });
                        added++;
                    }
                }
                
                // Сортируем по времени (новые первые)
                localHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                // Ограничиваем до 1000 записей
                if (localHistory.length > 1000) {
                    localHistory.splice(1000);
                }
                
                localStorage.setItem('objectHistory', JSON.stringify(localHistory));
                console.log(`🔄 SyncService: Добавлено ${added} новых записей истории`);
                
                // ВАЖНО: Применяем ВСЕ записи истории (не только новые)
                // Это гарантирует что все UPDATE операции будут синхронизированы
                // даже если они были пропущены при предыдущих синхронизациях
                await this.applyHistoryChanges(result.data);
            } else {
                console.log('🔄 SyncService: Нет записей истории на сервере');
            }
        } catch (error) {
            console.error('🔄 SyncService: Ошибка скачивания истории:', error);
        }
    },
    
    /**
     * Применение изменений из истории к локальной БД
     * История используется как ИСТОЧНИК ПРАВДЫ для синхронизации изменений
     * ВАЖНО: История имеет приоритет над sync_*_v2 таблицами для UPDATE операций!
     */
    async applyHistoryChanges(historyEntries) {
        console.log('🔄 SyncService: Применение изменений из истории (ПРИОРИТЕТ)...');
        
        // Сортируем по времени (старые первые - хронологический порядок)
        const sorted = [...historyEntries].sort((a, b) => 
            new Date(a.timestamp) - new Date(b.timestamp)
        );
        
        let appliedProducts = 0;
        let appliedClients = 0;
        let appliedStatuses = 0;
        
        for (const entry of sorted) {
            try {
                const entityType = entry.entity_type;
                const action = entry.action;
                const newData = entry.new_data ? JSON.parse(entry.new_data) : null;
                const details = entry.details ? (typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details) : null;
                const objectName = entry.object_name;
                
                // ВАЖНО: Обработка изменений статусов инвойсов
                if (entityType === 'invoices' && action === 'status_change' && details) {
                    const applied = await this.applyInvoiceStatusFromHistory(details, entry);
                    if (applied) appliedStatuses++;
                    continue;
                }
                
                // Пропускаем если нет данных для обновления
                if (!newData && action !== 'delete') continue;
                
                if (entityType === 'products' && action === 'update' && newData) {
                    // Применяем изменения к товару
                    const applied = await this.applyProductUpdateFromHistory(newData, entry);
                    if (applied) appliedProducts++;
                } else if (entityType === 'clients' && action === 'update' && newData) {
                    // Применяем изменения к клиенту
                    const applied = await this.applyClientUpdateFromHistory(newData, entry);
                    if (applied) appliedClients++;
                } else if (entityType === 'documents' && (action === 'create' || action === 'update') && newData) {
                    // Применяем изменения к документам (инвойсы, рачуны, предрачуны)
                    await this.applyDocumentFromHistory(newData, entry);
                }
            } catch (e) {
                console.error('🔄 Ошибка применения записи истории:', e);
            }
        }
        
        console.log(`🔄 SyncService: Изменения из истории применены (товаров: ${appliedProducts}, клиентов: ${appliedClients}, статусов: ${appliedStatuses})`);
    },
    
    /**
     * Применение изменения статуса инвойса из истории
     * ИСТОРИЯ ИМЕЕТ ПРИОРИТЕТ - статусы применяются в хронологическом порядке
     */
    async applyInvoiceStatusFromHistory(details, historyEntry) {
        try {
            const { docType, docNumber, statusType, newValue } = details;
            if (!docType || !docNumber || !statusType) return false;
            
            const historyTime = historyEntry.timestamp;
            console.log(`📜 Применение статуса из истории: ${docType} #${docNumber}, ${statusType}=${newValue}, время: ${historyTime}`);
            
            // Определяем массив для данного типа документа
            let storageKey, docArray;
            if (docType === 'predracun') {
                storageKey = 'confirmedPredracuns';
                docArray = JSON.parse(localStorage.getItem(storageKey) || '[]');
            } else if (docType === 'racun') {
                storageKey = 'confirmedRacuns';
                docArray = JSON.parse(localStorage.getItem(storageKey) || '[]');
            } else {
                return false;
            }
            
            // Находим документ
            const docIdx = docArray.findIndex(d => (d.number || d.invoiceNumber) === docNumber);
            if (docIdx === -1) {
                console.log(`   ⚠️ Документ ${docType} #${docNumber} не найден локально`);
                return false;
            }
            
            const doc = docArray[docIdx];
            
            // Проверяем время последнего изменения статуса
            const localStatusTime = doc._statusModifiedAt?.[statusType] || '1970-01-01';
            
            // История применяется если её время >= локальному времени изменения статуса
            if (historyTime >= localStatusTime) {
                // Применяем статус
                doc[statusType] = newValue;
                doc._syncModified = historyTime;
                doc._syncVersion = (doc._syncVersion || 1) + 1;
                
                // Сохраняем время изменения статуса
                if (!doc._statusModifiedAt) doc._statusModifiedAt = {};
                doc._statusModifiedAt[statusType] = historyTime;
                
                // Сохраняем в localStorage
                localStorage.setItem(storageKey, JSON.stringify(docArray));
                
                // Также обновляем в confirmedInvoices
                let allInvoices = JSON.parse(localStorage.getItem('confirmedInvoices') || '[]');
                const allIdx = allInvoices.findIndex(inv => inv.number === docNumber && inv.documentType === docType);
                if (allIdx !== -1) {
                    allInvoices[allIdx][statusType] = newValue;
                    allInvoices[allIdx]._syncModified = historyTime;
                    allInvoices[allIdx]._syncVersion = doc._syncVersion;
                    if (!allInvoices[allIdx]._statusModifiedAt) allInvoices[allIdx]._statusModifiedAt = {};
                    allInvoices[allIdx]._statusModifiedAt[statusType] = historyTime;
                    localStorage.setItem('confirmedInvoices', JSON.stringify(allInvoices));
                }
                
                console.log(`   ✅ Статус ${statusType}=${newValue} применён к ${docType} #${docNumber}`);
                return true;
            } else {
                console.log(`   ⏭️ Пропущено: локальный статус новее (${localStatusTime} > ${historyTime})`);
            }
            
            return false;
        } catch (e) {
            console.error('🔄 Ошибка применения статуса из истории:', e);
            return false;
        }
    },
    
    /**
     * Синхронизация статусов инвойсов через отдельную таблицу
     * ГАРАНТИРУЕТ сохранение и синхронизацию paid/delivered
     */
    async syncInvoiceStatuses() {
        console.log('🔄 SyncService: Синхронизация статусов инвойсов...');
        
        try {
            const now = new Date().toISOString();
            const user = window.currentUser?.username || 'system';
            
            // ШАГ 1: Выгружаем локальные статусы на сервер
            const confirmedPredracuns = JSON.parse(localStorage.getItem('confirmedPredracuns') || '[]');
            const confirmedRacuns = JSON.parse(localStorage.getItem('confirmedRacuns') || '[]');
            
            const allDocs = [
                ...confirmedPredracuns.map(d => ({...d, _docType: 'predracun'})),
                ...confirmedRacuns.map(d => ({...d, _docType: 'racun'}))
            ];
            
            let uploaded = 0;
            for (const doc of allDocs) {
                const docType = doc._docType;
                const docNumber = doc.number || doc.invoiceNumber;
                if (!docNumber) continue;
                
                const invoiceKey = `${docType}_${docNumber}`;
                const paid = doc.paid === true ? 1 : 0;
                const delivered = doc.delivered === true ? 1 : 0;
                const paidAt = doc._statusModifiedAt?.paid || null;
                const deliveredAt = doc._statusModifiedAt?.delivered || null;
                const modifiedAt = doc._syncModified || doc.confirmedDate || now;
                
                // Выгружаем только если есть статус или время изменения статуса
                if (paid || delivered || paidAt || deliveredAt) {
                    try {
                        // Сначала получаем серверную версию
                        const serverResult = await this.executeSQL(
                            `SELECT * FROM sync_invoice_statuses WHERE invoice_key = ?`, 
                            [invoiceKey]
                        );
                        const serverStatus = serverResult?.data?.[0];
                        
                        // Определяем нужно ли обновлять
                        let shouldUpdate = !serverStatus;
                        
                        if (serverStatus) {
                            const serverPaidAt = serverStatus.paid_at || '1970-01-01';
                            const serverDeliveredAt = serverStatus.delivered_at || '1970-01-01';
                            
                            // Обновляем если локальное время изменения статуса новее
                            if ((paidAt && paidAt > serverPaidAt) || (deliveredAt && deliveredAt > serverDeliveredAt)) {
                                shouldUpdate = true;
                            }
                        }
                        
                        if (shouldUpdate) {
                            // Используем DELETE + INSERT для гарантии
                            await this.executeSQL(`DELETE FROM sync_invoice_statuses WHERE invoice_key = ?`, [invoiceKey]);
                            
                            await this.executeSQL(`
                                INSERT INTO sync_invoice_statuses 
                                (invoice_key, doc_type, doc_number, paid, delivered, paid_at, delivered_at, modified_at, modified_by, device_id)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `, [invoiceKey, docType, docNumber, paid, delivered, paidAt, deliveredAt, modifiedAt, user, this.deviceId]);
                            
                            uploaded++;
                            console.log(`   📤 Статус ${invoiceKey}: paid=${paid}, delivered=${delivered}`);
                        }
                    } catch (e) {
                        console.error(`   ❌ Ошибка выгрузки статуса ${invoiceKey}:`, e);
                    }
                }
            }
            console.log(`🔄 Выгружено статусов: ${uploaded}`);
            
            // ШАГ 2: Скачиваем статусы с сервера и применяем
            const serverStatuses = await this.executeSQL('SELECT * FROM sync_invoice_statuses');
            const statuses = serverStatuses?.data || [];
            
            let applied = 0;
            for (const status of statuses) {
                const docType = status.doc_type;
                const docNumber = status.doc_number;
                const serverPaid = status.paid === 1;
                const serverDelivered = status.delivered === 1;
                const serverPaidAt = status.paid_at;
                const serverDeliveredAt = status.delivered_at;
                
                // Находим локальный документ
                let storageKey, docArray;
                if (docType === 'predracun') {
                    storageKey = 'confirmedPredracuns';
                    docArray = JSON.parse(localStorage.getItem(storageKey) || '[]');
                } else if (docType === 'racun') {
                    storageKey = 'confirmedRacuns';
                    docArray = JSON.parse(localStorage.getItem(storageKey) || '[]');
                } else {
                    continue;
                }
                
                const docIdx = docArray.findIndex(d => (d.number || d.invoiceNumber) === docNumber);
                if (docIdx === -1) continue;
                
                const doc = docArray[docIdx];
                const localPaidAt = doc._statusModifiedAt?.paid || '1970-01-01';
                const localDeliveredAt = doc._statusModifiedAt?.delivered || '1970-01-01';
                
                let changed = false;
                
                // Применяем статус paid если серверное время новее
                if (serverPaidAt && serverPaidAt > localPaidAt && serverPaid !== doc.paid) {
                    doc.paid = serverPaid;
                    if (!doc._statusModifiedAt) doc._statusModifiedAt = {};
                    doc._statusModifiedAt.paid = serverPaidAt;
                    changed = true;
                    console.log(`   📥 ${docType} #${docNumber}: paid=${serverPaid} (сервер ${serverPaidAt} > локал ${localPaidAt})`);
                }
                
                // Применяем статус delivered если серверное время новее
                if (serverDeliveredAt && serverDeliveredAt > localDeliveredAt && serverDelivered !== doc.delivered) {
                    doc.delivered = serverDelivered;
                    if (!doc._statusModifiedAt) doc._statusModifiedAt = {};
                    doc._statusModifiedAt.delivered = serverDeliveredAt;
                    changed = true;
                    console.log(`   📥 ${docType} #${docNumber}: delivered=${serverDelivered} (сервер ${serverDeliveredAt} > локал ${localDeliveredAt})`);
                }
                
                if (changed) {
                    localStorage.setItem(storageKey, JSON.stringify(docArray));
                    applied++;
                    
                    // Обновляем confirmedInvoices
                    let allInvoices = JSON.parse(localStorage.getItem('confirmedInvoices') || '[]');
                    const allIdx = allInvoices.findIndex(inv => inv.number === docNumber && inv.documentType === docType);
                    if (allIdx !== -1) {
                        allInvoices[allIdx].paid = doc.paid;
                        allInvoices[allIdx].delivered = doc.delivered;
                        allInvoices[allIdx]._statusModifiedAt = doc._statusModifiedAt;
                        localStorage.setItem('confirmedInvoices', JSON.stringify(allInvoices));
                    }
                }
            }
            
            console.log(`🔄 Применено статусов с сервера: ${applied}`);
            console.log('🔄 SyncService: Статусы инвойсов синхронизированы');
            
        } catch (error) {
            console.error('🔄 SyncService: Ошибка синхронизации статусов:', error);
        }
    },
    
    /**
     * Применение обновления товара из истории
     * ИСТОРИЯ ИМЕЕТ ПРИОРИТЕТ - применяем если время истории >= локальному
     * @returns {boolean} true если изменения были применены
     */
    async applyProductUpdateFromHistory(newData, historyEntry) {
        try {
            const productKey = newData.internal_code || newData.internalCode || newData.code;
            if (!productKey) return false;
            
            // Находим товар по внутреннему коду
            const localProducts = await window.api.products.getAll();
            const localProduct = localProducts.find(p => 
                (p.internal_code || p.internalCode || p.code) === productKey
            );
            
            if (localProduct) {
                const localTime = localProduct._syncModified || localProduct.updated_at || localProduct.updatedAt || '1970-01-01';
                const historyTime = historyEntry.timestamp;
                
                // ИСТОРИЯ ПРИОРИТЕТ - применяем если история новее или равна (для гарантии синхронизации)
                if (historyTime >= localTime) {
                    const updatedProduct = {
                        ...localProduct,
                        ...newData,
                        _syncModified: historyTime,
                        updated_at: historyTime // Устанавливаем время из истории
                    };
                    
                    try {
                        await window.api.products.update(String(localProduct.id), updatedProduct);
                        console.log(`🔄 [Товар ${productKey}] Обновлён из истории (${historyTime} >= ${localTime})`);
                    } catch (e) {
                        console.log(`⚠️ [Товар ${productKey}] Ошибка API, обновляем localStorage`);
                    }
                    
                    // Обновляем localStorage
                    let lsProducts = JSON.parse(localStorage.getItem('products') || '[]');
                    const lsIdx = lsProducts.findIndex(p => 
                        (p.internal_code || p.internalCode || p.code) === productKey
                    );
                    if (lsIdx !== -1) {
                        lsProducts[lsIdx] = {...lsProducts[lsIdx], ...newData, _syncModified: historyTime, updated_at: historyTime};
                        localStorage.setItem('products', JSON.stringify(lsProducts));
                    }
                    
                    // Обновляем глобальный массив products
                    if (typeof products !== 'undefined') {
                        const globalIdx = products.findIndex(p => 
                            (p.internal_code || p.internalCode || p.code) === productKey
                        );
                        if (globalIdx !== -1) {
                            products[globalIdx] = {...products[globalIdx], ...newData, _syncModified: historyTime, updated_at: historyTime};
                        }
                    }
                    
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('🔄 Ошибка применения обновления товара из истории:', error);
            return false;
        }
    },
    
    /**
     * Применение обновления клиента из истории
     * ИСТОРИЯ ИМЕЕТ ПРИОРИТЕТ - применяем если время истории >= локальному
     * @returns {boolean} true если изменения были применены
     */
    async applyClientUpdateFromHistory(newData, historyEntry) {
        try {
            const clientKey = newData.mb;
            if (!clientKey) return false;
            
            // Находим клиента по MB
            const localClients = await window.api.clients.getAll();
            const localClient = localClients.find(c => c.mb === clientKey);
            
            if (localClient) {
                const localTime = localClient._syncModified || localClient.updated_at || localClient.updatedAt || '1970-01-01';
                const historyTime = historyEntry.timestamp;
                
                // ИСТОРИЯ ПРИОРИТЕТ - применяем если история новее или равна (для гарантии синхронизации)
                if (historyTime >= localTime) {
                    const updatedClient = {
                        ...localClient,
                        ...newData,
                        _syncModified: historyTime,
                        updated_at: historyTime // Устанавливаем время из истории
                    };
                    
                    try {
                        await window.api.clients.update(String(localClient.id), updatedClient);
                        console.log(`🔄 [Клиент ${clientKey}] Обновлён из истории (${historyTime} >= ${localTime})`);
                    } catch (e) {
                        console.log(`⚠️ [Клиент ${clientKey}] Ошибка API, обновляем localStorage`);
                    }
                    
                    // Обновляем localStorage
                    let lsClients = JSON.parse(localStorage.getItem('clients') || '[]');
                    const lsIdx = lsClients.findIndex(c => c.mb === clientKey);
                    if (lsIdx !== -1) {
                        lsClients[lsIdx] = {...lsClients[lsIdx], ...newData, _syncModified: historyTime, updated_at: historyTime};
                        localStorage.setItem('clients', JSON.stringify(lsClients));
                    }
                    
                    // Обновляем глобальный массив clients
                    if (typeof clients !== 'undefined') {
                        const globalIdx = clients.findIndex(c => c.mb === clientKey);
                        if (globalIdx !== -1) {
                            clients[globalIdx] = {...clients[globalIdx], ...newData, _syncModified: historyTime, updated_at: historyTime};
                        }
                    }
                    
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('🔄 Ошибка применения обновления клиента из истории:', error);
            return false;
        }
    },
    
    /**
     * Применение документа (инвойс/рачун/предрачун) из истории
     * Добавляет или обновляет документ в соответствующем localStorage массиве
     */
    async applyDocumentFromHistory(docData, historyEntry) {
        try {
            const docNumber = docData.number || docData.invoiceNumber;
            if (!docNumber) return false;
            
            const docType = docData.documentType || 'invoice';
            const historyTime = historyEntry.timestamp;
            
            // Определяем куда сохранять
            let storageKey;
            if (docType === 'predracun') {
                storageKey = 'confirmedPredracuns';
            } else if (docType === 'racun') {
                storageKey = 'confirmedRacuns';
            } else if (docType === 'delivery') {
                storageKey = 'confirmedDeliveries';
            } else {
                storageKey = 'confirmedInvoices';
            }
            
            // Загружаем текущие данные
            let docs = JSON.parse(localStorage.getItem(storageKey) || '[]');
            
            // Ищем существующий документ
            const existIdx = docs.findIndex(d => (d.number || d.invoiceNumber) === docNumber);
            
            if (existIdx >= 0) {
                // Проверяем нужно ли обновлять
                const localTime = docs[existIdx]._syncModified || docs[existIdx].confirmedDate || '1970-01-01';
                
                if (historyTime >= localTime) {
                    // Обновляем существующий
                    docs[existIdx] = {
                        ...docs[existIdx],
                        ...docData,
                        _syncModified: historyTime
                    };
                    console.log(`🔄 [Документ ${docNumber}] Обновлён из истории (${docType})`);
                }
            } else {
                // Добавляем новый
                docData._syncModified = historyTime;
                docs.push(docData);
                console.log(`🔄 [Документ ${docNumber}] Добавлен из истории (${docType})`);
            }
            
            // Сохраняем
            localStorage.setItem(storageKey, JSON.stringify(docs));
            
            // Также обновляем общий массив confirmedInvoices
            if (storageKey !== 'confirmedInvoices' && storageKey !== 'confirmedDeliveries') {
                let allInvoices = JSON.parse(localStorage.getItem('confirmedInvoices') || '[]');
                const allIdx = allInvoices.findIndex(d => (d.number || d.invoiceNumber) === docNumber);
                if (allIdx >= 0) {
                    allInvoices[allIdx] = docData;
                } else {
                    allInvoices.push(docData);
                }
                localStorage.setItem('confirmedInvoices', JSON.stringify(allInvoices));
            }
            
            return true;
        } catch (error) {
            console.error('🔄 Ошибка применения документа из истории:', error);
            return false;
        }
    },
    
    /**
     * Сохранение документов в локальную SQLite базу (через Tauri API)
     * Это обеспечивает постоянное хранение между сессиями
     */
    async saveDocsToLocalDB(docs) {
        if (!docs || docs.length === 0) {
            console.log('💾 Нет документов для сохранения в локальную БД');
            return;
        }
        
        // Проверяем доступность Tauri API
        if (!window.api || !window.api.invoices) {
            console.log('⚠️ Tauri API недоступен, пропускаем сохранение в локальную БД');
            return;
        }
        
        console.log(`💾 Сохраняем ${docs.length} документов в локальную SQLite...`);
        
        // Сначала получаем список существующих инвойсов из локальной БД
        let existingInvoices = [];
        try {
            existingInvoices = await window.api.invoices.getAll() || [];
            console.log(`📋 В локальной БД уже есть ${existingInvoices.length} инвойсов`);
        } catch (e) {
            console.log('⚠️ Не удалось получить существующие инвойсы:', e);
        }
        
        // Создаём Map для быстрого поиска
        const existingMap = new Map();
        for (const inv of existingInvoices) {
            const key = inv.invoice_number || inv.invoiceNumber || inv.number;
            if (key) existingMap.set(key, inv);
        }
        
        let savedCount = 0;
        let skippedCount = 0;
        
        for (const doc of docs) {
            try {
                const docNumber = doc.number || doc.invoiceNumber;
                if (!docNumber) {
                    console.log('⚠️ Пропускаем документ без номера');
                    continue;
                }
                
                // Проверяем существует ли уже
                if (existingMap.has(docNumber)) {
                    // Документ существует - обновляем только статусы paid/delivered если они изменились
                    const existingDoc = existingMap.get(docNumber);
                    const needsUpdate = (doc.paid !== existingDoc.paid) || (doc.delivered !== existingDoc.delivered);
                    
                    if (needsUpdate && window.api.invoices.updatePaymentStatus) {
                        try {
                            await window.api.invoices.updatePaymentStatus(docNumber, doc.paid || false, doc.delivered || false);
                            console.log(`🔄 Обновлены статусы ${docNumber}: paid=${doc.paid}, delivered=${doc.delivered}`);
                        } catch (e) {
                            console.log(`⚠️ Не удалось обновить статусы для ${docNumber}:`, e);
                        }
                    }
                    
                    skippedCount++;
                    continue;
                }
                
                // Подготавливаем данные для Rust API
                const invoice = {
                    invoiceNumber: docNumber,
                    documentType: doc.documentType || 'invoice',
                    clientId: doc.client?.mb || doc.clientId || null,
                    clientName: doc.client?.name || doc.clientName || 'Неизвестный клиент',
                    date: doc.date || doc.confirmedDate || new Date().toISOString(),
                    dueDate: doc.dueDate || null,
                    total: doc.total || 0,
                    status: doc.status || 'confirmed',
                    notes: doc.notes || null,
                    paid: doc.paid || false,
                    delivered: doc.delivered || false
                };
                
                // Подготавливаем items
                const items = (doc.items || []).map(item => ({
                    invoiceId: '', // будет заполнен в Rust
                    productId: item.product?.internalCode || item.product?.code || item.productId || '',
                    productName: item.product?.name || item.productName || 'Неизвестный товар',
                    quantity: item.quantity || 1,
                    price: item.price || item.product?.price || 0,
                    total: item.total || (item.quantity || 1) * (item.price || 0)
                }));
                
                // Сохраняем через Tauri API
                await window.api.invoices.create(invoice, items);
                savedCount++;
                console.log(`✅ Документ ${docNumber} сохранён в локальную БД (paid=${doc.paid}, delivered=${doc.delivered})`);
                
            } catch (e) {
                console.error(`❌ Ошибка сохранения документа в локальную БД:`, e);
            }
        }
        
        console.log(`💾 Итого: сохранено ${savedCount}, пропущено ${skippedCount} (уже существуют)`);
    },
    
    /**
     * Загрузка архива удалённых на сервер
     */
    async uploadDeletedArchive() {
        try {
            const archive = JSON.parse(localStorage.getItem('deletedArchive') || '[]');
            if (archive.length === 0) {
                console.log('🔄 SyncService: Нет архива для загрузки');
                return;
            }
            
            console.log(`🔄 SyncService: Загрузка ${archive.length} записей архива на сервер`);
            
            for (const entry of archive) {
                try {
                    const sql = `
                        INSERT INTO sync_deleted_archive (archive_id, entity_type, object_data, deleted_at, expires_at, deleted_by, device_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(archive_id) DO UPDATE SET
                            expires_at = excluded.expires_at
                    `;
                    
                    await this.executeSQL(sql, [
                        entry.id,
                        entry.entityType,
                        JSON.stringify(entry.object),
                        entry.deletedAt,
                        entry.expiresAt,
                        entry.deletedBy || 'system',
                        entry.deviceId || this.deviceId
                    ]);
                } catch (e) {
                    console.error('🔄 SyncService: Ошибка загрузки записи архива:', e);
                }
            }
            
            console.log('🔄 SyncService: Архив загружен');
        } catch (error) {
            console.error('🔄 SyncService: Ошибка загрузки архива:', error);
        }
    },
    
    /**
     * Скачивание архива удалённых с сервера и удаление локальных копий
     */
    async downloadDeletedArchive() {
        try {
            const now = new Date().toISOString();
            const result = await this.executeSQL(`
                SELECT * FROM sync_deleted_archive WHERE expires_at > ?
            `, [now]);
            
            if (result && result.data && result.data.length > 0) {
                console.log(`🔄 SyncService: Получено ${result.data.length} записей архива с сервера`);
                
                const localArchive = JSON.parse(localStorage.getItem('deletedArchive') || '[]');
                const localIds = new Set(localArchive.map(a => a.id));
                
                let added = 0;
                for (const item of result.data) {
                    const archiveEntry = {
                        id: item.archive_id,
                        entityType: item.entity_type,
                        object: JSON.parse(item.object_data),
                        deletedAt: item.deleted_at,
                        expiresAt: item.expires_at,
                        deletedBy: item.deleted_by,
                        deviceId: item.device_id
                    };
                    
                    if (!localIds.has(item.archive_id)) {
                        localArchive.push(archiveEntry);
                        added++;
                    }
                    
                    // ВАЖНО: Удаляем объект локально если он есть
                    await this.deleteLocalItemFromArchive(archiveEntry);
                }
                
                localStorage.setItem('deletedArchive', JSON.stringify(localArchive));
                console.log(`🔄 SyncService: Добавлено ${added} записей в архив`);
            }
        } catch (error) {
            console.error('🔄 SyncService: Ошибка скачивания архива:', error);
        }
    },
    
    /**
     * Удаление локального объекта на основе записи из архива
     * ВАЖНО: Сверка по внутреннему коду - если код совпадает, удаляем
     */
    async deleteLocalItemFromArchive(archiveEntry) {
        try {
            const { entityType, object } = archiveEntry;
            
            // Получаем внутренний код в обоих форматах
            const archivedInternalCode = object.internal_code || object.internalCode || '';
            const archivedCode = object.code || '';
            const archivedMB = object.mb || '';
            
            console.log(`🔄 SyncService: Проверка удаления ${entityType}: code=${archivedInternalCode || archivedCode}, mb=${archivedMB}`);
            
            if (entityType === 'clients') {
                // 1. Удаляем из API
                try {
                    const clients = await window.api.clients.getAll();
                    for (const client of clients) {
                        // Сверка по МБ (уникальный идентификатор клиента)
                        if (client.mb === archivedMB || 
                            (client.name === object.name && client.pib === object.pib)) {
                            console.log(`🔄 SyncService: УДАЛЯЕМ клиента из API: ${client.name} (MB: ${client.mb})`);
                            try {
                                await window.api.clients.delete(client.id);
                            } catch (e) {
                                console.error('Ошибка удаления клиента из API:', e);
                            }
                        }
                    }
                } catch (e) {
                    console.error('Ошибка получения клиентов:', e);
                }
                
                // 2. Удаляем из localStorage (даже если API не сработал)
                let localClients = JSON.parse(localStorage.getItem('clients') || '[]');
                const beforeCount = localClients.length;
                localClients = localClients.filter(c => {
                    const shouldDelete = c.mb === archivedMB || 
                        (c.name === object.name && c.pib === object.pib);
                    if (shouldDelete) {
                        console.log(`🔄 SyncService: УДАЛЯЕМ клиента из localStorage: ${c.name}`);
                    }
                    return !shouldDelete;
                });
                if (localClients.length !== beforeCount) {
                    localStorage.setItem('clients', JSON.stringify(localClients));
                    console.log(`🔄 SyncService: Удалено ${beforeCount - localClients.length} клиентов из localStorage`);
                }
                
            } else if (entityType === 'products') {
                // 1. Удаляем из API
                try {
                    const products = await window.api.products.getAll();
                    for (const product of products) {
                        const productInternalCode = product.internal_code || product.internalCode || '';
                        const productCode = product.code || '';
                        
                        // Сверка по ВНУТРЕННЕМУ КОДУ (главный критерий)
                        const matchByInternalCode = archivedInternalCode && 
                            (productInternalCode === archivedInternalCode || 
                             product.internal_code === archivedInternalCode ||
                             product.internalCode === archivedInternalCode);
                        
                        // Или по обычному коду если внутренний не задан
                        const matchByCode = !archivedInternalCode && archivedCode && productCode === archivedCode;
                        
                        if (matchByInternalCode || matchByCode) {
                            console.log(`🔄 SyncService: УДАЛЯЕМ товар из API: ${product.name} (код: ${productInternalCode || productCode})`);
                            try {
                                await window.api.products.delete(product.id);
                            } catch (e) {
                                console.error('Ошибка удаления товара из API:', e);
                            }
                        }
                    }
                } catch (e) {
                    console.error('Ошибка получения товаров:', e);
                }
                
                // 2. Удаляем из localStorage (даже если API не сработал)
                let localProducts = JSON.parse(localStorage.getItem('products') || '[]');
                const beforeCount = localProducts.length;
                localProducts = localProducts.filter(p => {
                    const pInternalCode = p.internal_code || p.internalCode || '';
                    const pCode = p.code || '';
                    
                    const matchByInternalCode = archivedInternalCode && 
                        (pInternalCode === archivedInternalCode ||
                         p.internal_code === archivedInternalCode ||
                         p.internalCode === archivedInternalCode);
                    
                    const matchByCode = !archivedInternalCode && archivedCode && pCode === archivedCode;
                    
                    const shouldDelete = matchByInternalCode || matchByCode;
                    if (shouldDelete) {
                        console.log(`🔄 SyncService: УДАЛЯЕМ товар из localStorage: ${p.name} (код: ${pInternalCode || pCode})`);
                    }
                    return !shouldDelete;
                });
                if (localProducts.length !== beforeCount) {
                    localStorage.setItem('products', JSON.stringify(localProducts));
                    console.log(`🔄 SyncService: Удалено ${beforeCount - localProducts.length} товаров из localStorage`);
                }
            }
        } catch (error) {
            console.error('🔄 SyncService: Ошибка удаления локального объекта:', error);
        }
    },
    
    /**
     * Сверка и удаление: если на сервере объект помечен как удалённый, удаляем локально
     * Сверка идёт по ВНУТРЕННЕМУ КОДУ для товаров и МБ для клиентов
     */
    async reconcileDeletedItems() {
        try {
            console.log('🔄 SyncService: Сверка удалённых объектов...');
            
            // === КЛИЕНТЫ ===
            const deletedClientsResult = await this.executeSQL(`
                SELECT sync_id, data FROM sync_clients WHERE deleted_at IS NOT NULL
            `);
            
            if (deletedClientsResult && deletedClientsResult.data && deletedClientsResult.data.length > 0) {
                console.log(`🔄 SyncService: На сервере ${deletedClientsResult.data.length} удалённых клиентов`);
                
                // Собираем все МБ удалённых клиентов
                const deletedClientMBs = new Set();
                for (const row of deletedClientsResult.data) {
                    deletedClientMBs.add(row.sync_id);
                    try {
                        const data = JSON.parse(row.data);
                        if (data.mb) deletedClientMBs.add(data.mb);
                    } catch (e) {}
                }
                
                // Удаляем из API
                try {
                    let clients = await window.api.clients.getAll();
                    let deletedCount = 0;
                    
                    for (const client of clients) {
                        if (deletedClientMBs.has(client.mb) || deletedClientMBs.has(`client_${client.id}`)) {
                            console.log(`🔄 SyncService: СВЕРКА - Удаляем клиента из API: ${client.name} (MB: ${client.mb})`);
                            try {
                                await window.api.clients.delete(client.id);
                                deletedCount++;
                            } catch (e) {
                                console.error('Ошибка удаления клиента:', e);
                            }
                        }
                    }
                    
                    if (deletedCount > 0) {
                        console.log(`🔄 SyncService: Удалено ${deletedCount} клиентов из API`);
                    }
                } catch (e) {
                    console.error('Ошибка получения клиентов:', e);
                }
                
                // Удаляем из localStorage
                let localClients = JSON.parse(localStorage.getItem('clients') || '[]');
                const beforeClientCount = localClients.length;
                localClients = localClients.filter(c => {
                    const shouldDelete = deletedClientMBs.has(c.mb) || deletedClientMBs.has(`client_${c.id}`);
                    if (shouldDelete) {
                        console.log(`🔄 SyncService: СВЕРКА - Удаляем клиента из localStorage: ${c.name}`);
                    }
                    return !shouldDelete;
                });
                if (localClients.length !== beforeClientCount) {
                    localStorage.setItem('clients', JSON.stringify(localClients));
                    console.log(`🔄 SyncService: Удалено ${beforeClientCount - localClients.length} клиентов из localStorage`);
                }
            }
            
            // === ТОВАРЫ ===
            const deletedProductsResult = await this.executeSQL(`
                SELECT sync_id, internal_code, data FROM sync_products WHERE deleted_at IS NOT NULL
            `);
            
            if (deletedProductsResult && deletedProductsResult.data && deletedProductsResult.data.length > 0) {
                console.log(`🔄 SyncService: На сервере ${deletedProductsResult.data.length} удалённых товаров`);
                
                // Собираем все внутренние коды удалённых товаров
                const deletedProductCodes = new Set();
                for (const row of deletedProductsResult.data) {
                    if (row.internal_code) deletedProductCodes.add(row.internal_code);
                    deletedProductCodes.add(row.sync_id);
                    try {
                        const data = JSON.parse(row.data);
                        if (data.internal_code) deletedProductCodes.add(data.internal_code);
                        if (data.internalCode) deletedProductCodes.add(data.internalCode);
                        if (data.code) deletedProductCodes.add(data.code);
                    } catch (e) {}
                }
                
                console.log(`🔄 SyncService: Коды удалённых товаров:`, Array.from(deletedProductCodes));
                
                // Удаляем из API
                try {
                    let products = await window.api.products.getAll();
                    let deletedCount = 0;
                    
                    for (const product of products) {
                        const productInternalCode = product.internal_code || product.internalCode || '';
                        const productCode = product.code || '';
                        
                        if (deletedProductCodes.has(productInternalCode) || 
                            deletedProductCodes.has(productCode) ||
                            deletedProductCodes.has(`product_${product.id}`)) {
                            console.log(`🔄 SyncService: СВЕРКА - Удаляем товар из API: ${product.name} (код: ${productInternalCode || productCode})`);
                            try {
                                await window.api.products.delete(product.id);
                                deletedCount++;
                            } catch (e) {
                                console.error('Ошибка удаления товара:', e);
                            }
                        }
                    }
                    
                    if (deletedCount > 0) {
                        console.log(`🔄 SyncService: Удалено ${deletedCount} товаров из API`);
                    }
                } catch (e) {
                    console.error('Ошибка получения товаров:', e);
                }
                
                // Удаляем из localStorage
                let localProducts = JSON.parse(localStorage.getItem('products') || '[]');
                const beforeProductCount = localProducts.length;
                localProducts = localProducts.filter(p => {
                    const pInternalCode = p.internal_code || p.internalCode || '';
                    const pCode = p.code || '';
                    
                    const shouldDelete = deletedProductCodes.has(pInternalCode) || 
                        deletedProductCodes.has(pCode) ||
                        deletedProductCodes.has(`product_${p.id}`);
                    
                    if (shouldDelete) {
                        console.log(`🔄 SyncService: СВЕРКА - Удаляем товар из localStorage: ${p.name} (код: ${pInternalCode || pCode})`);
                    }
                    return !shouldDelete;
                });
                if (localProducts.length !== beforeProductCount) {
                    localStorage.setItem('products', JSON.stringify(localProducts));
                    console.log(`🔄 SyncService: Удалено ${beforeProductCount - localProducts.length} товаров из localStorage`);
                }
            }
            
            console.log('🔄 SyncService: Сверка завершена');
        } catch (error) {
            console.error('🔄 SyncService: Ошибка сверки:', error);
        }
    },
    
    /**
     * Быстрая синхронизация при входе (только скачивание)
     */
    async quickDownload() {
        if (!this.hasSettings()) {
            console.log('🔄 SyncService: Пропускаем синхронизацию - нет настроек');
            return;
        }
        
        try {
            const connectionTest = await this.testConnection();
            if (!connectionTest.success) {
                console.log('🔄 SyncService: Нет подключения к серверу');
                return;
            }
            
            console.log('🔄 SyncService: Быстрая загрузка данных...');
            await this.downloadClients();
            await this.downloadProducts();
            await this.downloadWarehouseGroups();
            await this.downloadLocalStorage();
            
            console.log('🔄 SyncService: Быстрая загрузка завершена');
        } catch (error) {
            console.error('🔄 SyncService: Ошибка быстрой загрузки:', error);
        }
    },
    
    /**
     * Быстрая синхронизация при выходе (только загрузка)
     */
    async quickUpload() {
        if (!this.hasSettings()) {
            console.log('🔄 SyncService: Пропускаем синхронизацию - нет настроек');
            return;
        }
        
        try {
            const connectionTest = await this.testConnection();
            if (!connectionTest.success) {
                console.log('🔄 SyncService: Нет подключения к серверу');
                return;
            }
            
            console.log('🔄 SyncService: Быстрая выгрузка данных...');
            
            // Сначала загружаем журнал изменений
            await this.uploadPendingChanges();
            
            await this.uploadClients();
            await this.uploadProducts();
            await this.uploadWarehouseGroups();
            await this.uploadInvoices();
            await this.uploadLocalStorage();
            
            this.lastSync = new Date();
            localStorage.setItem('syncLastTime', this.lastSync.toISOString());
            
            console.log('🔄 SyncService: Быстрая выгрузка завершена');
        } catch (error) {
            console.error('🔄 SyncService: Ошибка быстрой выгрузки:', error);
        }
    },
    
    /**
     * Добавление изменения в локальный журнал для последующей синхронизации
     */
    addPendingChange(entityType, entityId, action, data, oldData = null) {
        const change = {
            change_id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            entity_type: entityType,
            entity_id: entityId,
            action: action, // create, update, delete
            data: JSON.stringify(data),
            old_data: oldData ? JSON.stringify(oldData) : null,
            timestamp: new Date().toISOString(),
            device_id: this.deviceId,
            user_name: window.currentUser?.username || 'system',
            synced: false
        };
        
        // Сохраняем в localStorage
        const pendingChanges = JSON.parse(localStorage.getItem('syncPendingChanges') || '[]');
        pendingChanges.push(change);
        localStorage.setItem('syncPendingChanges', JSON.stringify(pendingChanges));
        
        console.log(`🔄 SyncService: Изменение добавлено в очередь: ${action} ${entityType} ${entityId}`);
        
        return change;
    },
    
    /**
     * Загрузка ожидающих изменений на сервер
     */
    async uploadPendingChanges() {
        const pendingChanges = JSON.parse(localStorage.getItem('syncPendingChanges') || '[]');
        
        if (pendingChanges.length === 0) {
            console.log('🔄 SyncService: Нет ожидающих изменений');
            return;
        }
        
        console.log(`🔄 SyncService: Загрузка ${pendingChanges.length} изменений на сервер...`);
        
        const uploaded = [];
        
        for (const change of pendingChanges) {
            try {
                const sql = `
                    INSERT INTO sync_changes (change_id, entity_type, entity_id, action, data, old_data, timestamp, device_id, user_name, applied)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                    ON CONFLICT(change_id) DO NOTHING
                `;
                
                await this.executeSQL(sql, [
                    change.change_id,
                    change.entity_type,
                    change.entity_id,
                    change.action,
                    change.data,
                    change.old_data,
                    change.timestamp,
                    change.device_id,
                    change.user_name
                ]);
                
                uploaded.push(change.change_id);
            } catch (error) {
                console.error(`🔄 SyncService: Ошибка загрузки изменения ${change.change_id}:`, error);
            }
        }
        
        // Удаляем загруженные изменения из локального хранилища
        const remaining = pendingChanges.filter(c => !uploaded.includes(c.change_id));
        localStorage.setItem('syncPendingChanges', JSON.stringify(remaining));
        
        console.log(`🔄 SyncService: Загружено ${uploaded.length} изменений`);
    },
    
    /**
     * Скачивание и применение изменений с сервера по хронологии
     */
    async downloadAndApplyChanges() {
        console.log('🔄 SyncService: Скачивание изменений с сервера...');
        
        const lastAppliedTimestamp = localStorage.getItem('syncLastAppliedTimestamp') || '1970-01-01T00:00:00.000Z';
        
        try {
            // Получаем все изменения с других устройств после последнего применения
            const sql = `
                SELECT * FROM sync_changes 
                WHERE timestamp > ? AND device_id != ?
                ORDER BY timestamp ASC
                LIMIT 500
            `;
            
            const result = await this.executeSQL(sql, [lastAppliedTimestamp, this.deviceId]);
            
            if (!result || !result.data || result.data.length === 0) {
                console.log('🔄 SyncService: Нет новых изменений');
                return { applied: 0 };
            }
            
            console.log(`🔄 SyncService: Получено ${result.data.length} изменений для применения`);
            
            let applied = 0;
            let lastTimestamp = lastAppliedTimestamp;
            
            for (const change of result.data) {
                try {
                    await this.applyChange(change);
                    applied++;
                    lastTimestamp = change.timestamp;
                } catch (error) {
                    console.error(`🔄 SyncService: Ошибка применения изменения ${change.change_id}:`, error);
                }
            }
            
            // Сохраняем последний обработанный timestamp
            localStorage.setItem('syncLastAppliedTimestamp', lastTimestamp);
            
            console.log(`🔄 SyncService: Применено ${applied} изменений`);
            return { applied };
            
        } catch (error) {
            console.error('🔄 SyncService: Ошибка скачивания изменений:', error);
            return { applied: 0, error: error.message };
        }
    },
    
    /**
     * Применение одного изменения к локальным данным
     */
    async applyChange(change) {
        const entityType = change.entity_type;
        const action = change.action;
        const data = change.data ? JSON.parse(change.data) : null;
        
        console.log(`🔄 SyncService: Применение: ${action} ${entityType} (${change.entity_id})`);
        
        switch (entityType) {
            case 'clients':
                await this.applyClientChange(action, change.entity_id, data);
                break;
            case 'products':
                await this.applyProductChange(action, change.entity_id, data);
                break;
            case 'warehouse':
                await this.applyWarehouseChange(action, change.entity_id, data);
                break;
            default:
                console.log(`🔄 SyncService: Неизвестный тип сущности: ${entityType}`);
        }
    },
    
    /**
     * Применение изменения клиента
     */
    async applyClientChange(action, entityId, data) {
        let clients = await window.api.clients.getAll();
        
        // Функция поиска клиента
        const findClient = (searchData, searchId) => {
            return clients.find(c => 
                c.id == searchId || 
                c.mb === searchData?.mb ||
                (c.name === searchData?.name && c.pib === searchData?.pib)
            );
        };
        
        switch (action) {
            case 'create':
                // Проверяем, не существует ли уже
                const existingCreate = findClient(data, entityId);
                if (!existingCreate && data) {
                    await window.api.clients.create(data);
                    console.log(`🔄 SyncService: Клиент создан: ${data.companyName || data.name}`);
                }
                break;
            
            case 'restore':
                // ВОССТАНОВЛЕНИЕ из архива
                console.log(`🔄 SyncService: Восстановление клиента: ${data?.name || entityId}`);
                
                // Удаляем из локального архива
                let localArchive = JSON.parse(localStorage.getItem('deletedArchive') || '[]');
                localArchive = localArchive.filter(a => 
                    !(a.entityType === 'clients' && (a.object.mb === data?.mb || a.object.mb === entityId))
                );
                localStorage.setItem('deletedArchive', JSON.stringify(localArchive));
                
                // Создаём клиента если его нет
                const existingRestore = findClient(data, entityId);
                if (!existingRestore && data) {
                    try {
                        await window.api.clients.create(data);
                        // Добавляем в localStorage
                        let localClients = JSON.parse(localStorage.getItem('clients') || '[]');
                        if (!localClients.find(c => c.mb === data.mb)) {
                            localClients.push(data);
                            localStorage.setItem('clients', JSON.stringify(localClients));
                        }
                        console.log(`🔄 SyncService: Клиент восстановлен: ${data.companyName || data.name}`);
                    } catch (e) {
                        console.log('Клиент уже существует или ошибка создания:', e);
                    }
                }
                break;
                
            case 'update':
                const clientToUpdate = findClient(data, entityId);
                if (clientToUpdate && data) {
                    const updatedData = {...clientToUpdate, ...data};
                    await window.api.clients.update(clientToUpdate.id, updatedData);
                    console.log(`🔄 SyncService: Клиент обновлён: ${data.companyName || data.name || clientToUpdate.name}`);
                    
                    // Также обновляем в localStorage
                    let localClients = JSON.parse(localStorage.getItem('clients') || '[]');
                    const localIdx = localClients.findIndex(c => c.id == clientToUpdate.id || c.mb === clientToUpdate.mb);
                    if (localIdx !== -1) {
                        localClients[localIdx] = {...localClients[localIdx], ...data};
                        localStorage.setItem('clients', JSON.stringify(localClients));
                    }
                }
                break;
                
            case 'delete':
                const clientToDelete = findClient(data, entityId);
                if (clientToDelete) {
                    await window.api.clients.delete(clientToDelete.id);
                    console.log(`🔄 SyncService: Клиент удалён: ${entityId}`);
                }
                break;
        }
    },
    
    /**
     * Применение изменения товара
     */
    async applyProductChange(action, entityId, data) {
        let products = await window.api.products.getAll();
        
        // Функция поиска товара по разным идентификаторам
        const findProduct = (searchData, searchId) => {
            return products.find(p => 
                p.id == searchId || 
                p.internal_code === (searchData?.internal_code || searchData?.internalCode) ||
                p.internalCode === (searchData?.internal_code || searchData?.internalCode) ||
                p.code === searchData?.code
            );
        };
        
        switch (action) {
            case 'create':
                const existingCreate = findProduct(data, entityId);
                if (!existingCreate && data) {
                    await window.api.products.create(data);
                    console.log(`🔄 SyncService: Товар создан: ${data.name}`);
                }
                break;
            
            case 'restore':
                // ВОССТАНОВЛЕНИЕ из архива
                console.log(`🔄 SyncService: Восстановление товара: ${data?.name || entityId}`);
                
                const productCode = data?.internal_code || data?.internalCode || data?.code || entityId;
                
                // Удаляем из локального архива
                let localArchive = JSON.parse(localStorage.getItem('deletedArchive') || '[]');
                localArchive = localArchive.filter(a => {
                    if (a.entityType !== 'products') return true;
                    const archiveCode = a.object.internal_code || a.object.internalCode || a.object.code;
                    return archiveCode !== productCode;
                });
                localStorage.setItem('deletedArchive', JSON.stringify(localArchive));
                
                // Создаём товар если его нет
                const existingRestore = findProduct(data, entityId);
                if (!existingRestore && data) {
                    try {
                        await window.api.products.create(data);
                        // Добавляем в localStorage
                        let localProducts = JSON.parse(localStorage.getItem('products') || '[]');
                        const existsLocally = localProducts.find(p => 
                            p.internal_code === productCode || 
                            p.internalCode === productCode ||
                            p.code === data.code
                        );
                        if (!existsLocally) {
                            localProducts.push(data);
                            localStorage.setItem('products', JSON.stringify(localProducts));
                        }
                        console.log(`🔄 SyncService: Товар восстановлен: ${data.name}`);
                    } catch (e) {
                        console.log('Товар уже существует или ошибка создания:', e);
                    }
                } else if (existingRestore) {
                    console.log(`🔄 SyncService: Товар уже существует, пропускаем: ${data?.name}`);
                }
                break;
                
            case 'update':
                const productToUpdate = findProduct(data, entityId);
                if (productToUpdate && data) {
                    const updatedData = {...productToUpdate, ...data};
                    await window.api.products.update(productToUpdate.id, updatedData);
                    console.log(`🔄 SyncService: Товар обновлён: ${data.name || productToUpdate.name}`);
                    
                    // Также обновляем в localStorage
                    let localProducts = JSON.parse(localStorage.getItem('products') || '[]');
                    const localIdx = localProducts.findIndex(p => 
                        p.id == productToUpdate.id || 
                        p.internal_code === productToUpdate.internal_code ||
                        p.internalCode === productToUpdate.internalCode
                    );
                    if (localIdx !== -1) {
                        localProducts[localIdx] = {...localProducts[localIdx], ...data};
                        localStorage.setItem('products', JSON.stringify(localProducts));
                    }
                }
                break;
                
            case 'delete':
                const productToDelete = findProduct(data, entityId);
                if (productToDelete) {
                    await window.api.products.delete(productToDelete.id);
                    console.log(`🔄 SyncService: Товар удалён: ${entityId}`);
                }
                break;
        }
    },
    
    /**
     * Применение изменения склада
     */
    async applyWarehouseChange(action, entityId, data) {
        let groups = JSON.parse(localStorage.getItem('productGroups') || '[]');
        
        switch (action) {
            case 'create':
                const existingCreate = groups.find(g => g.groupCode === data?.groupCode || g.id == entityId);
                if (!existingCreate && data) {
                    groups.push(data);
                    localStorage.setItem('productGroups', JSON.stringify(groups));
                    console.log(`🔄 SyncService: Группа создана: ${data.name}`);
                }
                break;
                
            case 'update':
                const idx = groups.findIndex(g => g.id == entityId || g.groupCode === data?.groupCode);
                if (idx !== -1 && data) {
                    groups[idx] = {...groups[idx], ...data};
                    localStorage.setItem('productGroups', JSON.stringify(groups));
                    console.log(`🔄 SyncService: Группа обновлена: ${data.name}`);
                }
                break;
                
            case 'delete':
                const deleteIdx = groups.findIndex(g => g.id == entityId);
                if (deleteIdx !== -1) {
                    groups.splice(deleteIdx, 1);
                    localStorage.setItem('productGroups', JSON.stringify(groups));
                    console.log(`🔄 SyncService: Группа удалена: ${entityId}`);
                }
                break;
        }
    }
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    SyncService.init();
});

// Экспорт для использования в других скриптах
window.SyncService = SyncService;

console.log('🔄 SyncService загружен');
