use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::fs;

pub struct Database {
    conn: Connection,
    db_path: PathBuf,
}

// ВАЖНО: Database НЕ использует Mutex, потому что Tauri автоматически
// синхронизирует доступ через State<Database>
unsafe impl Send for Database {}
unsafe impl Sync for Database {}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Result<Self> {
        // Создаем директорию если не существует
        fs::create_dir_all(&app_data_dir).ok();
        
        let db_path = app_data_dir.join("srecha-invoice.db");
        let conn = Connection::open(&db_path)?;
        
        Ok(Database { conn, db_path })
    }
    
    pub fn conn(&self) -> &Connection {
        &self.conn
    }
    
    pub fn set_permissions(&self) -> std::io::Result<()> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&self.db_path)?.permissions();
            perms.set_mode(0o666);
            fs::set_permissions(&self.db_path, perms)?;
        }
        Ok(())
    }
    
    pub fn init(&self) -> Result<()> {
        // 1. Таблица пользователей
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;
        
        // 2. Таблица клиентов (24 поля)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                legal_name TEXT,
                mb TEXT NOT NULL,
                pib TEXT,
                address TEXT,
                city TEXT,
                postal_code TEXT,
                country TEXT,
                phone TEXT,
                email TEXT,
                tax_id TEXT,
                bank TEXT,
                client_type TEXT,
                municipality TEXT,
                street TEXT,
                house_number TEXT,
                is_manual_address INTEGER DEFAULT 0,
                google_maps TEXT,
                contact_person TEXT,
                telegram TEXT,
                instagram TEXT,
                installment INTEGER DEFAULT 0,
                installment_term INTEGER,
                showcase INTEGER DEFAULT 0,
                bar INTEGER DEFAULT 0,
                notes TEXT,
                contact TEXT,
                created_at TEXT NOT NULL
            )",
            [],
        )?;
        
        // 3. Таблица товаров
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                code TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                price REAL,
                category TEXT,
                weight REAL,
                supplier TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;
        
        // Миграция: добавляем колонку supplier если её нет
        self.conn.execute(
            "ALTER TABLE products ADD COLUMN supplier TEXT",
            [],
        ).ok(); // Игнорируем ошибку если колонка уже существует
        
        // 4. Таблица инвойсов
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS invoices (
                id TEXT PRIMARY KEY,
                invoice_number TEXT UNIQUE NOT NULL,
                document_type TEXT NOT NULL,
                client_id TEXT,
                client_name TEXT,
                date TEXT NOT NULL,
                due_date TEXT,
                total REAL NOT NULL,
                status TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL
            )",
            [],
        )?;
        
        // 5. Таблица позиций инвойса
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS invoice_items (
                id TEXT PRIMARY KEY,
                invoice_id TEXT NOT NULL,
                product_id TEXT NOT NULL,
                product_name TEXT NOT NULL,
                quantity REAL NOT NULL,
                price REAL NOT NULL,
                total REAL NOT NULL,
                FOREIGN KEY (invoice_id) REFERENCES invoices(id)
            )",
            [],
        )?;
        
        // 6. Таблица доставок
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS deliveries (
                id TEXT PRIMARY KEY,
                delivery_number TEXT UNIQUE NOT NULL,
                client_id TEXT,
                client_name TEXT,
                date TEXT NOT NULL,
                status TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL
            )",
            [],
        )?;
        
        // 7. Таблица позиций доставки
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS delivery_items (
                id TEXT PRIMARY KEY,
                delivery_id TEXT NOT NULL,
                product_id TEXT NOT NULL,
                product_name TEXT NOT NULL,
                quantity REAL NOT NULL,
                FOREIGN KEY (delivery_id) REFERENCES deliveries(id)
            )",
            [],
        )?;
        
        // 8. Таблица групп склада
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS warehouse_groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL
            )",
            [],
        )?;
        
        // 9. Таблица товаров на складе
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS warehouse_items (
                id TEXT PRIMARY KEY,
                group_id TEXT NOT NULL,
                product_id TEXT NOT NULL,
                product_code TEXT NOT NULL,
                product_name TEXT NOT NULL,
                quantity REAL NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (group_id) REFERENCES warehouse_groups(id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            )",
            [],
        )?;
        
        // 10. Таблица статистики
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS statistics (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL,
                type TEXT NOT NULL,
                value REAL NOT NULL,
                metadata TEXT,
                created_at TEXT NOT NULL
            )",
            [],
        )?;
        
        // 11. Таблица категорий
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;
        
        // 12. Таблица субкатегорий
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS subcategories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (category_id) REFERENCES categories(id)
            )",
            [],
        )?;
        
        // 13. Таблица секторов поставщиков (аналог категорий)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS supplier_sectors (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;
        
        // 14. Таблица продукции поставщиков (аналог субкатегорий)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS supplier_products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                sector_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (sector_id) REFERENCES supplier_sectors(id)
            )",
            [],
        )?;
        
        // 15. Таблица поставщиков
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS suppliers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                legal_name TEXT,
                mb TEXT,
                pib TEXT,
                address TEXT,
                city TEXT,
                phone TEXT,
                email TEXT,
                telegram TEXT,
                instagram TEXT,
                website TEXT,
                bank TEXT,
                sector_id TEXT,
                product_id TEXT,
                contact_person TEXT,
                contact_person_status TEXT,
                google_maps TEXT,
                notes TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                FOREIGN KEY (sector_id) REFERENCES supplier_sectors(id),
                FOREIGN KEY (product_id) REFERENCES supplier_products(id)
            )",
            [],
        )?;
        
        // 16. Таблица стран (члены ООН)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS countries (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                code TEXT,
                created_at TEXT NOT NULL
            )",
            [],
        )?;
        
        // Миграция: добавляем колонку contact_person_status если её нет
        let _ = self.conn.execute(
            "ALTER TABLE clients ADD COLUMN contact_person_status TEXT",
            [],
        );
        
        // Миграция: добавляем колонку abbreviation в clients если её нет
        let _ = self.conn.execute(
            "ALTER TABLE clients ADD COLUMN abbreviation TEXT",
            [],
        );
        
        // Миграция: добавляем колонку subcategory в products если её нет
        let _ = self.conn.execute(
            "ALTER TABLE products ADD COLUMN subcategory TEXT",
            [],
        );
        
        // Миграция: добавляем колонку internal_code в products если её нет
        let _ = self.conn.execute(
            "ALTER TABLE products ADD COLUMN internal_code TEXT",
            [],
        );
        
        // Миграция: добавляем колонку country в suppliers если её нет
        let _ = self.conn.execute(
            "ALTER TABLE suppliers ADD COLUMN country TEXT",
            [],
        );
        
        // Миграция: добавляем колонку reg_number в suppliers если её нет (для не-сербских компаний)
        let _ = self.conn.execute(
            "ALTER TABLE suppliers ADD COLUMN reg_number TEXT",
            [],
        );
        
        // Миграция: добавляем колонку wechat в suppliers если её нет
        let _ = self.conn.execute(
            "ALTER TABLE suppliers ADD COLUMN wechat TEXT",
            [],
        );
        
        // Создаем дефолтные категории если их нет
        self.seed_default_categories()?;
        
        // Создаем дефолтные секторы поставщиков если их нет
        self.seed_default_supplier_sectors()?;
        
        // Создаем страны если их нет
        self.seed_countries()?;
        
        // Создаем дефолтного пользователя если его нет
        self.seed_default_user()?;
        
        Ok(())
    }
    
    fn seed_default_user(&self) -> Result<()> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM users",
            [],
            |row| row.get(0),
        )?;
        
        if count == 0 {
            let id = uuid::Uuid::new_v4().to_string();
            let password_hash = bcrypt::hash("MoskvaSlezamNeVeryt2024", bcrypt::DEFAULT_COST)
                .expect("Failed to hash password");
            let created_at = chrono::Utc::now().to_rfc3339();
            
            self.conn.execute(
                "INSERT INTO users (id, username, password, role, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                [&id, "BrankoFND", &password_hash, "admin", &created_at],
            )?;
            
            println!("✅ Создан дефолтный пользователь: BrankoFND");
        }
        
        Ok(())
    }
    
    fn seed_default_categories(&self) -> Result<()> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM categories",
            [],
            |row| row.get(0),
        )?;
        
        if count == 0 {
            let created_at = chrono::Utc::now().to_rfc3339();
            let default_categories = vec![
                ("Zeleni Čaj", "Зеленый чай"),
                ("Crni Čaj", "Черный чай"),
                ("Printing", "Полиграфия"),
                ("Посуда", "Посуда"),
                ("Other", "Другое"),
            ];
            
            for (name, _display_name) in default_categories {
                let id = uuid::Uuid::new_v4().to_string();
                self.conn.execute(
                    "INSERT INTO categories (id, name, created_at) VALUES (?1, ?2, ?3)",
                    [&id, name, &created_at],
                )?;
            }
            
            println!("✅ Созданы дефолтные категории");
        }
        
        Ok(())
    }
    
    fn seed_default_supplier_sectors(&self) -> Result<()> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM supplier_sectors",
            [],
            |row| row.get(0),
        )?;
        
        if count == 0 {
            let created_at = chrono::Utc::now().to_rfc3339();
            let default_sectors = vec![
                "Чай",
                "Упаковка",
                "Полиграфия",
                "Логистика",
                "Прочее",
            ];
            
            for name in default_sectors {
                let id = uuid::Uuid::new_v4().to_string();
                self.conn.execute(
                    "INSERT INTO supplier_sectors (id, name, created_at) VALUES (?1, ?2, ?3)",
                    [&id, name, &created_at],
                )?;
            }
            
            println!("✅ Созданы дефолтные секторы поставщиков");
        }
        
        Ok(())
    }
    
    fn seed_countries(&self) -> Result<()> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM countries",
            [],
            |row| row.get(0),
        )?;
        
        if count == 0 {
            let created_at = chrono::Utc::now().to_rfc3339();
            
            // Все 193 страны-члена ООН (на русском языке, отсортированы по алфавиту)
            let countries = vec![
                ("Австралия", "AU"), ("Австрия", "AT"), ("Азербайджан", "AZ"),
                ("Албания", "AL"), ("Алжир", "DZ"), ("Ангола", "AO"),
                ("Андорра", "AD"), ("Антигуа и Барбуда", "AG"), ("Аргентина", "AR"),
                ("Армения", "AM"), ("Афганистан", "AF"), ("Багамы", "BS"),
                ("Бангладеш", "BD"), ("Барбадос", "BB"), ("Бахрейн", "BH"),
                ("Беларусь", "BY"), ("Белиз", "BZ"), ("Бельгия", "BE"),
                ("Бенин", "BJ"), ("Болгария", "BG"), ("Боливия", "BO"),
                ("Босния и Герцеговина", "BA"), ("Ботсвана", "BW"), ("Бразилия", "BR"),
                ("Бруней", "BN"), ("Буркина-Фасо", "BF"), ("Бурунди", "BI"),
                ("Бутан", "BT"), ("Вануату", "VU"), ("Ватикан", "VA"),
                ("Великобритания", "GB"), ("Венгрия", "HU"), ("Венесуэла", "VE"),
                ("Восточный Тимор", "TL"), ("Вьетнам", "VN"), ("Габон", "GA"),
                ("Гаити", "HT"), ("Гайана", "GY"), ("Гамбия", "GM"),
                ("Гана", "GH"), ("Гватемала", "GT"), ("Гвинея", "GN"),
                ("Гвинея-Бисау", "GW"), ("Германия", "DE"), ("Гондурас", "HN"),
                ("Гренада", "GD"), ("Греция", "GR"), ("Грузия", "GE"),
                ("Дания", "DK"), ("Джибути", "DJ"), ("Доминика", "DM"),
                ("Доминиканская Республика", "DO"), ("Египет", "EG"), ("Замбия", "ZM"),
                ("Зимбабве", "ZW"), ("Израиль", "IL"), ("Индия", "IN"),
                ("Индонезия", "ID"), ("Иордания", "JO"), ("Ирак", "IQ"),
                ("Иран", "IR"), ("Ирландия", "IE"), ("Исландия", "IS"),
                ("Испания", "ES"), ("Италия", "IT"), ("Йемен", "YE"),
                ("Кабо-Верде", "CV"), ("Казахстан", "KZ"), ("Камбоджа", "KH"),
                ("Камерун", "CM"), ("Канада", "CA"), ("Катар", "QA"),
                ("Кения", "KE"), ("Кипр", "CY"), ("Киргизия", "KG"),
                ("Кирибати", "KI"), ("Китай", "CN"), ("Колумбия", "CO"),
                ("Коморы", "KM"), ("Конго", "CG"), ("ДР Конго", "CD"),
                ("Коста-Рика", "CR"), ("Кот-д'Ивуар", "CI"), ("Куба", "CU"),
                ("Кувейт", "KW"), ("Лаос", "LA"), ("Латвия", "LV"),
                ("Лесото", "LS"), ("Либерия", "LR"), ("Ливан", "LB"),
                ("Ливия", "LY"), ("Литва", "LT"), ("Лихтенштейн", "LI"),
                ("Люксембург", "LU"), ("Маврикий", "MU"), ("Мавритания", "MR"),
                ("Мадагаскар", "MG"), ("Малави", "MW"), ("Малайзия", "MY"),
                ("Мали", "ML"), ("Мальдивы", "MV"), ("Мальта", "MT"),
                ("Марокко", "MA"), ("Маршалловы Острова", "MH"), ("Мексика", "MX"),
                ("Мозамбик", "MZ"), ("Молдова", "MD"), ("Монако", "MC"),
                ("Монголия", "MN"), ("Мьянма", "MM"), ("Намибия", "NA"),
                ("Науру", "NR"), ("Непал", "NP"), ("Нигер", "NE"),
                ("Нигерия", "NG"), ("Нидерланды", "NL"), ("Никарагуа", "NI"),
                ("Новая Зеландия", "NZ"), ("Норвегия", "NO"), ("ОАЭ", "AE"),
                ("Оман", "OM"), ("Пакистан", "PK"), ("Палау", "PW"),
                ("Панама", "PA"), ("Папуа — Новая Гвинея", "PG"), ("Парагвай", "PY"),
                ("Перу", "PE"), ("Польша", "PL"), ("Португалия", "PT"),
                ("Россия", "RU"), ("Руанда", "RW"), ("Румыния", "RO"),
                ("Сальвадор", "SV"), ("Самоа", "WS"), ("Сан-Марино", "SM"),
                ("Сан-Томе и Принсипи", "ST"), ("Саудовская Аравия", "SA"), ("Северная Корея", "KP"),
                ("Северная Македония", "MK"), ("Сейшелы", "SC"), ("Сенегал", "SN"),
                ("Сент-Винсент и Гренадины", "VC"), ("Сент-Китс и Невис", "KN"), ("Сент-Люсия", "LC"),
                ("Сербия", "RS"), ("Сингапур", "SG"), ("Сирия", "SY"),
                ("Словакия", "SK"), ("Словения", "SI"), ("Соломоновы Острова", "SB"),
                ("Сомали", "SO"), ("Судан", "SD"), ("Суринам", "SR"),
                ("США", "US"), ("Сьерра-Леоне", "SL"), ("Таджикистан", "TJ"),
                ("Таиланд", "TH"), ("Танзания", "TZ"), ("Того", "TG"),
                ("Тонга", "TO"), ("Тринидад и Тобаго", "TT"), ("Тувалу", "TV"),
                ("Тунис", "TN"), ("Туркменистан", "TM"), ("Турция", "TR"),
                ("Уганда", "UG"), ("Узбекистан", "UZ"), ("Украина", "UA"),
                ("Уругвай", "UY"), ("Федеративные Штаты Микронезии", "FM"), ("Фиджи", "FJ"),
                ("Филиппины", "PH"), ("Финляндия", "FI"), ("Франция", "FR"),
                ("Хорватия", "HR"), ("ЦАР", "CF"), ("Чад", "TD"),
                ("Черногория", "ME"), ("Чехия", "CZ"), ("Чили", "CL"),
                ("Швейцария", "CH"), ("Швеция", "SE"), ("Шри-Ланка", "LK"),
                ("Эквадор", "EC"), ("Экваториальная Гвинея", "GQ"), ("Эритрея", "ER"),
                ("Эсватини", "SZ"), ("Эстония", "EE"), ("Эфиопия", "ET"),
                ("ЮАР", "ZA"), ("Южная Корея", "KR"), ("Южный Судан", "SS"),
                ("Ямайка", "JM"), ("Япония", "JP"),
            ];
            
            let count = countries.len();
            for (name, code) in countries {
                let id = uuid::Uuid::new_v4().to_string();
                self.conn.execute(
                    "INSERT INTO countries (id, name, code, created_at) VALUES (?1, ?2, ?3, ?4)",
                    [&id, name, code, &created_at],
                )?;
            }
            
            println!("✅ Созданы страны-члены ООН ({} стран)", count);
        }
        
        Ok(())
    }
}
