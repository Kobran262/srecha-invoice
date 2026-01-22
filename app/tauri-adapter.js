/**
 * Tauri API Adapter
 * Все данные сохраняются ЛОКАЛЬНО в SQLite через Rust backend
 * Никаких HTTP запросов! Только IPC через Tauri!
 */

console.log('🔧 Загрузка Tauri API adapter...');

// Функция для вызова Tauri команд
async function invoke(cmd, args = {}) {
    if (window.__TAURI_INTERNALS__) {
        return window.__TAURI_INTERNALS__.invoke(cmd, args);
    } else if (window.__TAURI__ && window.__TAURI__.core) {
        return window.__TAURI__.core.invoke(cmd, args);
    } else if (window.__TAURI__ && window.__TAURI__.invoke) {
        return window.__TAURI__.invoke(cmd, args);
    } else {
        throw new Error('Tauri API не найден! Убедитесь что приложение запущено через Tauri.');
    }
}

console.log('✅ Tauri invoke функция готова');

// API объект для работы с данными
// ВСЕ данные сохраняются ЛОКАЛЬНО на устройстве в SQLite!
window.api = {
    // ==================== CLIENTS ====================
    clients: {
        getAll: async () => {
            try {
                console.log('📡 Загружаем клиентов из ЛОКАЛЬНОЙ базы...');
                const clients = await invoke('get_clients');
                console.log(`✅ Загружено клиентов: ${clients.length}`);
                return clients;
            } catch (error) {
                console.error('❌ Ошибка получения клиентов:', error);
                throw new Error(`Не удалось загрузить клиентов: ${error}`);
            }
        },
        
        create: async (data) => {
            try {
                console.log('📡 Создаем клиента в ЛОКАЛЬНОЙ базе:', data.name);
                const client = await invoke('create_client', { client: data });
                console.log('✅ Клиент создан:', client.id);
                return client;
            } catch (error) {
                console.error('❌ Ошибка создания клиента:', error);
                throw new Error(`Не удалось создать клиента: ${error}`);
            }
        },
        
        update: async (id, data) => {
            try {
                console.log('📡 Обновляем клиента в ЛОКАЛЬНОЙ базе:', id);
                const client = await invoke('update_client', { id, client: data });
                console.log('✅ Клиент обновлен');
                return client;
            } catch (error) {
                console.error('❌ Ошибка обновления клиента:', error);
                throw new Error(`Не удалось обновить клиента: ${error}`);
            }
        },
        
        delete: async (id) => {
            try {
                console.log('📡 Удаляем клиента из ЛОКАЛЬНОЙ базы:', id);
                await invoke('delete_client', { id });
                console.log('✅ Клиент удален');
            } catch (error) {
                console.error('❌ Ошибка удаления клиента:', error);
                throw new Error(`Не удалось удалить клиента: ${error}`);
            }
        },
    },

    // ==================== PRODUCTS ====================
    products: {
        getAll: async () => {
            try {
                console.log('📡 Загружаем товары из ЛОКАЛЬНОЙ базы...');
                const products = await invoke('get_products');
                console.log(`✅ Загружено товаров: ${products.length}`);
                if (products.length > 0) {
                    console.log('Первый товар:', products[0]);
                }
                return products;
            } catch (error) {
                console.error('❌ Ошибка получения товаров:', error);
                throw new Error(`Не удалось загрузить товары: ${error}`);
            }
        },
        
        create: async (data) => {
            try {
                console.log('📡 Создаем товар в ЛОКАЛЬНОЙ базе:', data.name);
                const product = await invoke('create_product', { product: data });
                console.log('✅ Товар создан и сохранен ЛОКАЛЬНО:', product.id);
                return product;
            } catch (error) {
                console.error('❌ Ошибка создания товара:', error);
                throw new Error(`Не удалось создать товар: ${error}`);
            }
        },
        
        getByCode: async (code) => {
            try {
                console.log('📡 Ищем товар по коду:', code);
                const product = await invoke('get_product_by_code', { code });
                if (product) {
                    console.log('✅ Товар найден:', product.code);
                } else {
                    console.log('ℹ️ Товар не найден');
                }
                return product;
            } catch (error) {
                console.error('❌ Ошибка поиска товара:', error);
                throw new Error(`Не удалось найти товар: ${error}`);
            }
        },
        
        update: async (id, data) => {
            try {
                console.log('📡 Обновляем товар в ЛОКАЛЬНОЙ базе:', id);
                const product = await invoke('update_product', { id, product: data });
                console.log('✅ Товар обновлен');
                return product;
            } catch (error) {
                console.error('❌ Ошибка обновления товара:', error);
                throw new Error(`Не удалось обновить товар: ${error}`);
            }
        },
        
        delete: async (id) => {
            try {
                console.log('📡 Удаляем товар из ЛОКАЛЬНОЙ базы:', id);
                await invoke('delete_product', { id });
                console.log('✅ Товар удален');
            } catch (error) {
                console.error('❌ Ошибка удаления товара:', error);
                throw new Error(`Не удалось удалить товар: ${error}`);
            }
        },
    },

    // ==================== AUTH ====================
    auth: {
        login: async (username, password) => {
            try {
                console.log('📡 Авторизация:', username);
                const user = await invoke('login', { 
                    username: username,
                    password: password
                });
                console.log('✅ Авторизация успешна:', user.username);
                return user;
            } catch (error) {
                console.error('❌ Ошибка авторизации:', error);
                throw new Error('Неверный логин или пароль');
            }
        },
    },

    // ==================== INVOICES ====================
    invoices: {
        getAll: async () => {
            try {
                console.log('📡 Загружаем инвойсы из ЛОКАЛЬНОЙ базы...');
                const invoices = await invoke('get_invoices');
                console.log(`✅ Загружено инвойсов: ${invoices.length}`);
                return invoices;
            } catch (error) {
                console.error('❌ Ошибка получения инвойсов:', error);
                throw new Error(`Не удалось загрузить инвойсы: ${error}`);
            }
        },
        
        getById: async (id) => {
            try {
                console.log('📡 Загружаем инвойс по ID:', id);
                const invoiceWithItems = await invoke('get_invoice_by_id', { id });
                if (invoiceWithItems) {
                    console.log('✅ Инвойс загружен с', invoiceWithItems.items.length, 'items');
                }
                return invoiceWithItems;
            } catch (error) {
                console.error('❌ Ошибка получения инвойса:', error);
                throw new Error(`Не удалось загрузить инвойс: ${error}`);
            }
        },
        
        create: async (invoice, items) => {
            try {
                console.log('📡 Создаем инвойс в ЛОКАЛЬНОЙ базе:', invoice.number);
                const invoiceId = await invoke('create_invoice', { invoice, items });
                console.log('✅ Инвойс создан и сохранен ЛОКАЛЬНО:', invoiceId);
                return invoiceId;
            } catch (error) {
                console.error('❌ Ошибка создания инвойса:', error);
                throw new Error(`Не удалось создать инвойс: ${error}`);
            }
        },
        
        updateStatus: async (id, status) => {
            try {
                console.log('📡 Обновляем статус инвойса:', id, '->', status);
                await invoke('update_invoice_status', { id, status });
                console.log('✅ Статус обновлен');
                return true;
            } catch (error) {
                console.error('❌ Ошибка обновления статуса:', error);
                throw new Error(`Не удалось обновить статус: ${error}`);
            }
        },
        
        update: async (id, invoice) => {
            try {
                console.log('📡 Обновляем инвойс:', id);
                const updated = await invoke('update_invoice', { id, invoice });
                console.log('✅ Инвойс обновлен');
                return updated;
            } catch (error) {
                console.error('❌ Ошибка обновления инвойса:', error);
                throw new Error(`Не удалось обновить инвойс: ${error}`);
            }
        },
        
        delete: async (id) => {
            try {
                console.log('📡 Удаляем инвойс:', id);
                await invoke('delete_invoice', { id });
                console.log('✅ Инвойс удален');
                return true;
            } catch (error) {
                console.error('❌ Ошибка удаления инвойса:', error);
                throw new Error(`Не удалось удалить инвойс: ${error}`);
            }
        },
        
        getClientHistory: async (clientId) => {
            try {
                console.log('📡 Загружаем историю клиента:', clientId);
                const invoices = await invoke('get_client_history', { clientId });
                console.log(`✅ Загружено ${invoices.length} инвойсов клиента`);
                return invoices;
            } catch (error) {
                console.error('❌ Ошибка получения истории:', error);
                throw new Error(`Не удалось загрузить историю: ${error}`);
            }
        },
    },
    
    // ==================== WAREHOUSE GROUPS ====================
    warehouseGroups: {
        getAll: async () => {
            try {
                console.log('📡 Загружаем группы склада из ЛОКАЛЬНОЙ базы...');
                const groups = await invoke('get_warehouse_groups');
                console.log(`✅ Загружено групп: ${groups.length}`);
                return groups;
            } catch (error) {
                console.error('❌ Ошибка получения групп:', error);
                throw new Error(`Не удалось загрузить группы: ${error}`);
            }
        },
        
        create: async (data) => {
            try {
                console.log('📡 Создаем группу склада:', data.name);
                const groupId = await invoke('create_warehouse_group', { group: data });
                console.log('✅ Группа создана:', groupId);
                return groupId;
            } catch (error) {
                console.error('❌ Ошибка создания группы:', error);
                throw new Error(`Не удалось создать группу: ${error}`);
            }
        },
        
        update: async (id, data) => {
            try {
                console.log('📡 Обновляем группу склада:', id);
                await invoke('update_warehouse_group', { id, group: data });
                console.log('✅ Группа обновлена');
                return true;
            } catch (error) {
                console.error('❌ Ошибка обновления группы:', error);
                throw new Error(`Не удалось обновить группу: ${error}`);
            }
        },
        
        delete: async (id) => {
            try {
                console.log('📡 Удаляем группу склада:', id);
                await invoke('delete_warehouse_group', { id });
                console.log('✅ Группа удалена');
                return true;
            } catch (error) {
                console.error('❌ Ошибка удаления группы:', error);
                throw new Error(`Не удалось удалить группу: ${error}`);
            }
        },
        
        deleteItem: async (groupId, productId) => {
            try {
                console.log('📡 Удаляем товар из группы:', groupId, productId);
                await invoke('delete_warehouse_group_item', { groupId, productId });
                console.log('✅ Товар удален из группы');
                return true;
            } catch (error) {
                console.error('❌ Ошибка удаления товара:', error);
                throw new Error(`Не удалось удалить товар: ${error}`);
            }
        },
    },

    // ==================== CATEGORIES ====================
    categories: {
        getAll: async () => {
            try {
                console.log('📡 Загружаем категории из ЛОКАЛЬНОЙ базы...');
                const categories = await invoke('get_categories');
                console.log(`✅ Загружено категорий: ${categories.length}`);
                return categories;
            } catch (error) {
                console.error('❌ Ошибка получения категорий:', error);
                throw new Error(`Не удалось загрузить категории: ${error}`);
            }
        },
        
        create: async (data) => {
            try {
                console.log('📡 Создаем категорию:', data.name);
                const category = await invoke('create_category', { category: data });
                console.log('✅ Категория создана:', category.id);
                return category;
            } catch (error) {
                console.error('❌ Ошибка создания категории:', error);
                throw new Error(`Не удалось создать категорию: ${error}`);
            }
        },
        
        delete: async (id) => {
            try {
                console.log('📡 Удаляем категорию:', id);
                await invoke('delete_category', { id });
                console.log('✅ Категория удалена');
            } catch (error) {
                console.error('❌ Ошибка удаления категории:', error);
                throw new Error(`Не удалось удалить категорию: ${error}`);
            }
        },
    },

    // ==================== SUBCATEGORIES ====================
    subcategories: {
        getAll: async () => {
            try {
                console.log('📡 Загружаем субкатегории из ЛОКАЛЬНОЙ базы...');
                const subcategories = await invoke('get_subcategories');
                console.log(`✅ Загружено субкатегорий: ${subcategories.length}`);
                return subcategories;
            } catch (error) {
                console.error('❌ Ошибка получения субкатегорий:', error);
                throw new Error(`Не удалось загрузить субкатегории: ${error}`);
            }
        },
        
        getByCategory: async (categoryId) => {
            try {
                console.log('📡 Загружаем субкатегории категории:', categoryId);
                const subcategories = await invoke('get_subcategories_by_category', { categoryId });
                console.log(`✅ Загружено субкатегорий: ${subcategories.length}`);
                return subcategories;
            } catch (error) {
                console.error('❌ Ошибка получения субкатегорий:', error);
                throw new Error(`Не удалось загрузить субкатегории: ${error}`);
            }
        },
        
        create: async (data) => {
            try {
                console.log('📡 Создаем субкатегорию:', data.name);
                const subcategory = await invoke('create_subcategory', { subcategory: data });
                console.log('✅ Субкатегория создана:', subcategory.id);
                return subcategory;
            } catch (error) {
                console.error('❌ Ошибка создания субкатегории:', error);
                throw new Error(`Не удалось создать субкатегорию: ${error}`);
            }
        },
        
        delete: async (id) => {
            try {
                console.log('📡 Удаляем субкатегорию:', id);
                await invoke('delete_subcategory', { id });
                console.log('✅ Субкатегория удалена');
            } catch (error) {
                console.error('❌ Ошибка удаления субкатегории:', error);
                throw new Error(`Не удалось удалить субкатегорию: ${error}`);
            }
        },
    },

    // ==================== COUNTRIES ====================
    countries: {
        getAll: async () => {
            try {
                console.log('📡 Загружаем страны из ЛОКАЛЬНОЙ базы...');
                const countries = await invoke('get_countries');
                console.log(`✅ Загружено стран: ${countries.length}`);
                return countries;
            } catch (error) {
                console.error('❌ Ошибка получения стран:', error);
                throw new Error(`Не удалось загрузить страны: ${error}`);
            }
        },
    },

    // ==================== SUPPLIER SECTORS ====================
    supplierSectors: {
        getAll: async () => {
            try {
                console.log('📡 Загружаем секторы поставщиков...');
                const sectors = await invoke('get_supplier_sectors');
                console.log(`✅ Загружено секторов: ${sectors.length}`);
                return sectors;
            } catch (error) {
                console.error('❌ Ошибка получения секторов:', error);
                throw new Error(`Не удалось загрузить секторы: ${error}`);
            }
        },
        
        create: async (data) => {
            try {
                console.log('📡 Создаем сектор:', data.name);
                const sector = await invoke('create_supplier_sector', { sector: data });
                console.log('✅ Сектор создан:', sector.id);
                return sector;
            } catch (error) {
                console.error('❌ Ошибка создания сектора:', error);
                throw new Error(`Не удалось создать сектор: ${error}`);
            }
        },
        
        delete: async (id) => {
            try {
                console.log('📡 Удаляем сектор:', id);
                await invoke('delete_supplier_sector', { id });
                console.log('✅ Сектор удален');
            } catch (error) {
                console.error('❌ Ошибка удаления сектора:', error);
                throw new Error(`Не удалось удалить сектор: ${error}`);
            }
        },
    },

    // ==================== SUPPLIER PRODUCTS ====================
    supplierProducts: {
        getAll: async () => {
            try {
                console.log('📡 Загружаем продукцию поставщиков...');
                const products = await invoke('get_supplier_products');
                console.log(`✅ Загружено продукции: ${products.length}`);
                return products;
            } catch (error) {
                console.error('❌ Ошибка получения продукции:', error);
                throw new Error(`Не удалось загрузить продукцию: ${error}`);
            }
        },
        
        getBySector: async (sectorId) => {
            try {
                console.log('📡 Загружаем продукцию сектора:', sectorId);
                const products = await invoke('get_supplier_products_by_sector', { sectorId });
                console.log(`✅ Загружено продукции: ${products.length}`);
                return products;
            } catch (error) {
                console.error('❌ Ошибка получения продукции:', error);
                throw new Error(`Не удалось загрузить продукцию: ${error}`);
            }
        },
        
        create: async (data) => {
            try {
                console.log('📡 Создаем продукцию:', data.name);
                const product = await invoke('create_supplier_product', { product: data });
                console.log('✅ Продукция создана:', product.id);
                return product;
            } catch (error) {
                console.error('❌ Ошибка создания продукции:', error);
                throw new Error(`Не удалось создать продукцию: ${error}`);
            }
        },
        
        delete: async (id) => {
            try {
                console.log('📡 Удаляем продукцию:', id);
                await invoke('delete_supplier_product', { id });
                console.log('✅ Продукция удалена');
            } catch (error) {
                console.error('❌ Ошибка удаления продукции:', error);
                throw new Error(`Не удалось удалить продукцию: ${error}`);
            }
        },
    },

    // ==================== SUPPLIERS ====================
    suppliers: {
        getAll: async () => {
            try {
                console.log('📡 Загружаем поставщиков из ЛОКАЛЬНОЙ базы...');
                const suppliers = await invoke('get_suppliers');
                console.log(`✅ Загружено поставщиков: ${suppliers.length}`);
                return suppliers;
            } catch (error) {
                console.error('❌ Ошибка получения поставщиков:', error);
                throw new Error(`Не удалось загрузить поставщиков: ${error}`);
            }
        },
        
        create: async (data) => {
            try {
                console.log('📡 Создаем поставщика:', data.name);
                const supplier = await invoke('create_supplier', { supplier: data });
                console.log('✅ Поставщик создан:', supplier.id);
                return supplier;
            } catch (error) {
                console.error('❌ Ошибка создания поставщика:', error);
                throw new Error(`Не удалось создать поставщика: ${error}`);
            }
        },
        
        update: async (id, data) => {
            try {
                console.log('📡 Обновляем поставщика:', id);
                const supplier = await invoke('update_supplier', { id, supplier: data });
                console.log('✅ Поставщик обновлен');
                return supplier;
            } catch (error) {
                console.error('❌ Ошибка обновления поставщика:', error);
                throw new Error(`Не удалось обновить поставщика: ${error}`);
            }
        },
        
        delete: async (id) => {
            try {
                console.log('📡 Удаляем поставщика:', id);
                await invoke('delete_supplier', { id });
                console.log('✅ Поставщик удален');
            } catch (error) {
                console.error('❌ Ошибка удаления поставщика:', error);
                throw new Error(`Не удалось удалить поставщика: ${error}`);
            }
        },
    },

    // ==================== HTML ФАЙЛЫ ИНВОЙСОВ ====================
    invoiceHtml: {
        save: async (invoiceNumber, documentType, year, month, htmlContent) => {
            try {
                console.log(`💾 Сохраняем HTML инвойса ${documentType} #${invoiceNumber}`);
                const path = await invoke('save_invoice_html', {
                    invoiceNumber,
                    documentType,
                    year,
                    month,
                    htmlContent
                });
                console.log(`✅ HTML сохранен: ${path}`);
                return path;
            } catch (error) {
                console.error('❌ Ошибка сохранения HTML:', error);
                throw new Error(`Не удалось сохранить HTML: ${error}`);
            }
        },

        load: async (invoiceNumber, documentType, year, month) => {
            try {
                console.log(`📂 Загружаем HTML инвойса ${documentType} #${invoiceNumber}`);
                const html = await invoke('load_invoice_html', {
                    invoiceNumber,
                    documentType,
                    year,
                    month
                });
                console.log(`✅ HTML загружен (${html.length} символов)`);
                return html;
            } catch (error) {
                console.error('❌ Ошибка загрузки HTML:', error);
                throw new Error(`Не удалось загрузить HTML: ${error}`);
            }
        },

        delete: async (invoiceNumber, documentType, year, month) => {
            try {
                console.log(`🗑️ Удаляем HTML инвойса ${documentType} #${invoiceNumber}`);
                await invoke('delete_invoice_html', {
                    invoiceNumber,
                    documentType,
                    year,
                    month
                });
                console.log('✅ HTML удален');
            } catch (error) {
                console.error('❌ Ошибка удаления HTML:', error);
                throw new Error(`Не удалось удалить HTML: ${error}`);
            }
        }
    }
};

// Real-time updates (заглушка)
window.api.on = (channel, callback) => {
    console.log(`📡 Event listener: ${channel}`);
};

console.log('✅ Tauri API adapter загружен');
console.log('📦 Все данные сохраняются ЛОКАЛЬНО в SQLite');
console.log('💾 База: ~/Library/Application Support/srecha-invoice-desktop/srecha-invoice.db');
console.log('💾 HTML: ~/Library/Application Support/srecha-invoice-desktop/invoices/');
console.log('');
console.log('🎯 Доступные API:');
console.log('  - window.api.clients.getAll/create/update/delete()');
console.log('  - window.api.products.getAll/create/update/delete/getByCode()');
console.log('  - window.api.categories.getAll/create/delete()');
console.log('  - window.api.subcategories.getAll/getByCategory/create/delete()');
console.log('  - window.api.suppliers.getAll/create/update/delete()');
console.log('  - window.api.supplierSectors.getAll/create/delete()');
console.log('  - window.api.supplierProducts.getAll/getBySector/create/delete()');
console.log('  - window.api.countries.getAll()');
console.log('  - window.api.auth.login(username, password)');
console.log('  - window.api.invoiceHtml.save/load/delete()');
console.log('  - window.api.warehouseGroups.getAll/create/update/delete()');