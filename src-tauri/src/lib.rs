mod database;
mod commands;

use tauri::Manager;
use database::Database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Инициализация базы данных
            let app_handle = app.handle().clone();
            let app_data_dir = app_handle
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            
            let db = Database::new(app_data_dir)
                .expect("Failed to initialize database");
            
            db.init().expect("Failed to initialize database tables");
            db.set_permissions().ok(); // Устанавливаем права доступа
            
            // Сохраняем базу данных в состоянии приложения
            app.manage(db);
            
            // Создаем Splash Screen окно
            let splash_window = tauri::WebviewWindowBuilder::new(
                app,
                "splash",
                tauri::WebviewUrl::App("splash.html".into())
            )
            .title("Загрузка...")
            .inner_size(600.0, 400.0)
            .center()
            .resizable(false)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .build()?;
            
            // Создаем главное окно (скрытое)
            let main_window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into())
            )
            .title("Srecha Invoice")
            .inner_size(1400.0, 900.0)
            .center()
            .visible(false) // Скрываем до завершения загрузки
            .build()?;
            
            // Клонируем окна для использования в замыкании
            let splash = splash_window.clone();
            let main = main_window.clone();
            
            // Через 3 секунды закрываем Splash Screen и показываем главное окно
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(3));
                
                // Закрываем Splash Screen
                splash.close().ok();
                
                // Показываем главное окно
                main.show().ok();
                main.set_focus().ok();
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::login,
            commands::get_clients,
            commands::create_client,
            commands::update_client,
            commands::delete_client,
            commands::get_products,
            commands::create_product,
            commands::get_product_by_code,
            commands::update_product,
            commands::delete_product,
            commands::get_invoices,
            commands::get_invoice_by_id,
            commands::create_invoice,
            commands::update_invoice_status,
            commands::update_invoice,
            commands::delete_invoice,
            commands::get_client_history,
            commands::get_deliveries,
            commands::create_delivery,
            commands::get_warehouse_groups,
            commands::create_warehouse_group,
            commands::update_warehouse_group,
            commands::delete_warehouse_group_item,
            commands::delete_warehouse_group,
            commands::save_invoice_html,
            commands::load_invoice_html,
            commands::delete_invoice_html,
            commands::get_categories,
            commands::create_category,
            commands::delete_category,
            commands::get_subcategories,
            commands::get_subcategories_by_category,
            commands::create_subcategory,
            commands::delete_subcategory,
            // Страны
            commands::get_countries,
            // Поставщики
            commands::get_supplier_sectors,
            commands::create_supplier_sector,
            commands::delete_supplier_sector,
            commands::get_supplier_products,
            commands::get_supplier_products_by_sector,
            commands::create_supplier_product,
            commands::delete_supplier_product,
            commands::get_suppliers,
            commands::create_supplier,
            commands::update_supplier,
            commands::delete_supplier,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
