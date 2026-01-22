use serde::{Deserialize, Serialize};
use tauri::{State, Manager};
use crate::database::Database;
use rusqlite::params;
use chrono::Utc;

// ==================== СТРУКТУРЫ ====================

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub role: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Client {
    pub id: Option<i64>,
    pub name: String,
    pub legal_name: Option<String>,
    pub mb: String,
    pub pib: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub postal_code: Option<String>,
    pub country: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub tax_id: Option<String>,
    pub bank: Option<String>,
    pub client_type: Option<String>,
    pub abbreviation: Option<String>,
    pub municipality: Option<String>,
    pub street: Option<String>,
    pub house_number: Option<String>,
    pub is_manual_address: i32,
    pub google_maps: Option<String>,
    pub contact_person: Option<String>,
    pub contact_person_status: Option<String>,
    pub telegram: Option<String>,
    pub instagram: Option<String>,
    pub installment: i32,
    pub installment_term: Option<i32>,
    pub showcase: i32,
    pub bar: i32,
    pub notes: Option<String>,
    pub contact: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: Option<String>,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub price: Option<f64>,
    pub category: Option<String>,
    pub subcategory: Option<String>,
    pub weight: Option<f64>,
    pub supplier: Option<String>,
    pub internal_code: Option<String>,
    pub is_active: Option<i32>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: Option<String>,
    pub name: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subcategory {
    pub id: Option<String>,
    pub name: String,
    pub category_id: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Invoice {
    pub id: Option<String>,
    pub invoice_number: String,
    pub document_type: String,
    pub client_id: Option<String>,
    pub client_name: Option<String>,
    pub date: String,
    pub due_date: Option<String>,
    pub total: f64,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceItem {
    pub id: Option<String>,
    pub invoice_id: String,
    pub product_id: String,
    pub product_name: String,
    pub quantity: f64,
    pub price: f64,
    pub total: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InvoiceWithItems {
    #[serde(flatten)]
    pub invoice: Invoice,
    pub items: Vec<InvoiceItem>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Delivery {
    pub id: Option<String>,
    pub delivery_number: String,
    pub client_id: Option<String>,
    pub client_name: Option<String>,
    pub date: String,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryItem {
    pub id: Option<String>,
    pub delivery_id: String,
    pub product_id: String,
    pub product_name: String,
    pub quantity: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WarehouseGroup {
    pub id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WarehouseItem {
    pub id: Option<String>,
    pub group_id: String,
    pub product_id: String,
    pub product_code: String,
    pub product_name: String,
    pub quantity: f64,
    pub notes: Option<String>,
    pub created_at: Option<String>,
}

// ==================== КОМАНДЫ: АВТОРИЗАЦИЯ ====================

#[tauri::command]
pub fn login(username: String, password: String, db: State<Database>) -> Result<User, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, username, password, role FROM users WHERE username = ?1")
        .map_err(|e| e.to_string())?;
    
    let user_result = stmt.query_row([&username], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
        ))
    });
    
    match user_result {
        Ok((id, username, password_hash, role)) => {
            if bcrypt::verify(&password, &password_hash).unwrap_or(false) {
                Ok(User { id, username, role })
            } else {
                Err("Invalid credentials".to_string())
            }
        }
        Err(_) => Err("User not found".to_string()),
    }
}

// ==================== КОМАНДЫ: КЛИЕНТЫ ====================

#[tauri::command]
pub fn get_clients(db: State<Database>) -> Result<Vec<Client>, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, name, legal_name, mb, pib, address, city, postal_code, country, phone, email, tax_id, bank, client_type, abbreviation, municipality, street, house_number, is_manual_address, google_maps, contact_person, contact_person_status, telegram, instagram, installment, installment_term, showcase, bar, notes, contact, created_at FROM clients ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    
    let clients = stmt.query_map([], |row| {
        Ok(Client {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            legal_name: row.get(2)?,
            mb: row.get(3)?,
            pib: row.get(4)?,
            address: row.get(5)?,
            city: row.get(6)?,
            postal_code: row.get(7)?,
            country: row.get(8)?,
            phone: row.get(9)?,
            email: row.get(10)?,
            tax_id: row.get(11)?,
            bank: row.get(12)?,
            client_type: row.get(13)?,
            abbreviation: row.get(14)?,
            municipality: row.get(15)?,
            street: row.get(16)?,
            house_number: row.get(17)?,
            is_manual_address: row.get(18)?,
            google_maps: row.get(19)?,
            contact_person: row.get(20)?,
            contact_person_status: row.get(21)?,
            telegram: row.get(22)?,
            instagram: row.get(23)?,
            installment: row.get(24)?,
            installment_term: row.get(25)?,
            showcase: row.get(26)?,
            bar: row.get(27)?,
            notes: row.get(28)?,
            contact: row.get(29)?,
            created_at: Some(row.get(30)?),
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    
    Ok(clients)
}

#[tauri::command]
pub fn create_client(client: Client, db: State<Database>) -> Result<Client, String> {
    let created_at = Utc::now().to_rfc3339();
    
    db.conn().execute(
        "INSERT INTO clients (name, legal_name, mb, pib, address, city, postal_code, country, phone, email, tax_id, bank, client_type, abbreviation, municipality, street, house_number, is_manual_address, google_maps, contact_person, contact_person_status, telegram, instagram, installment, installment_term, showcase, bar, notes, contact, created_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30)",
        params![
            client.name,
            client.legal_name,
            client.mb,
            client.pib,
            client.address,
            client.city,
            client.postal_code,
            client.country,
            client.phone,
            client.email,
            client.tax_id,
            client.bank,
            client.client_type,
            client.abbreviation,
            client.municipality,
            client.street,
            client.house_number,
            client.is_manual_address,
            client.google_maps,
            client.contact_person,
            client.contact_person_status,
            client.telegram,
            client.instagram,
            client.installment,
            client.installment_term,
            client.showcase,
            client.bar,
            client.notes,
            client.contact,
            created_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    
    let id = db.conn().last_insert_rowid();
    
    Ok(Client {
        id: Some(id),
        created_at: Some(created_at),
        ..client
    })
}

#[tauri::command]
pub fn update_client(client: Client, db: State<Database>) -> Result<Client, String> {
    let id = client.id.ok_or("Client ID is required")?;
    
    db.conn().execute(
        "UPDATE clients SET name = ?1, legal_name = ?2, mb = ?3, pib = ?4, address = ?5, city = ?6, postal_code = ?7, country = ?8, phone = ?9, email = ?10, tax_id = ?11, bank = ?12, client_type = ?13, abbreviation = ?14, municipality = ?15, street = ?16, house_number = ?17, is_manual_address = ?18, google_maps = ?19, contact_person = ?20, contact_person_status = ?21, telegram = ?22, instagram = ?23, installment = ?24, installment_term = ?25, showcase = ?26, bar = ?27, notes = ?28, contact = ?29 WHERE id = ?30",
        params![
            client.name,
            client.legal_name,
            client.mb,
            client.pib,
            client.address,
            client.city,
            client.postal_code,
            client.country,
            client.phone,
            client.email,
            client.tax_id,
            client.bank,
            client.client_type,
            client.abbreviation,
            client.municipality,
            client.street,
            client.house_number,
            client.is_manual_address,
            client.google_maps,
            client.contact_person,
            client.contact_person_status,
            client.telegram,
            client.instagram,
            client.installment,
            client.installment_term,
            client.showcase,
            client.bar,
            client.notes,
            client.contact,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(client)
}

#[tauri::command]
pub fn delete_client(id: i64, db: State<Database>) -> Result<(), String> {
    db.conn()
        .execute("DELETE FROM clients WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ==================== КОМАНДЫ: ТОВАРЫ ====================

#[tauri::command]
pub fn get_products(db: State<Database>) -> Result<Vec<Product>, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, code, name, description, price, category, subcategory, weight, supplier, internal_code, is_active, created_at, updated_at FROM products WHERE is_active = 1 ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    
    let products = stmt.query_map([], |row| {
        Ok(Product {
            id: Some(row.get(0)?),
            code: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            price: row.get(4)?,
            category: row.get(5)?,
            subcategory: row.get(6)?,
            weight: row.get(7)?,
            supplier: row.get(8)?,
            internal_code: row.get(9)?,
            is_active: row.get(10)?,
            created_at: Some(row.get(11)?),
            updated_at: row.get(12)?,
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    
    Ok(products)
}

#[tauri::command]
pub fn create_product(product: Product, db: State<Database>) -> Result<Product, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    
    db.conn().execute(
        "INSERT INTO products (id, code, name, description, price, category, subcategory, weight, supplier, internal_code, is_active, created_at, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            id,
            product.code,
            product.name,
            product.description,
            product.price.unwrap_or(0.0),
            product.category,
            product.subcategory,
            product.weight,
            product.supplier,
            product.internal_code,
            product.is_active.unwrap_or(1),
            created_at.clone(),
            created_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(Product {
        id: Some(id),
        created_at: Some(created_at.clone()),
        updated_at: Some(created_at),
        ..product
    })
}

#[tauri::command]
pub fn get_product_by_code(code: String, db: State<Database>) -> Result<Option<Product>, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, code, name, description, price, category, subcategory, weight, supplier, internal_code, is_active, created_at, updated_at FROM products WHERE code = ?1")
        .map_err(|e| e.to_string())?;
    
    let product = stmt.query_row([&code], |row| {
        Ok(Product {
            id: Some(row.get(0)?),
            code: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            price: row.get(4)?,
            category: row.get(5)?,
            subcategory: row.get(6)?,
            weight: row.get(7)?,
            supplier: row.get(8)?,
            internal_code: row.get(9)?,
            is_active: row.get(10)?,
            created_at: Some(row.get(11)?),
            updated_at: row.get(12)?,
        })
    });
    
    match product {
        Ok(p) => Ok(Some(p)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn update_product(id: String, product: Product, db: State<Database>) -> Result<Product, String> {
    let updated_at = Utc::now().to_rfc3339();
    
    db.conn().execute(
        "UPDATE products SET code = ?1, name = ?2, description = ?3, price = ?4, category = ?5, subcategory = ?6, weight = ?7, supplier = ?8, internal_code = ?9, is_active = ?10, updated_at = ?11 WHERE id = ?12",
        params![
            product.code,
            product.name,
            product.description,
            product.price.unwrap_or(0.0),
            product.category,
            product.subcategory,
            product.weight,
            product.supplier,
            product.internal_code,
            product.is_active.unwrap_or(1),
            updated_at,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(Product {
        id: Some(id),
        updated_at: Some(updated_at),
        ..product
    })
}

#[tauri::command]
pub fn delete_product(id: String, db: State<Database>) -> Result<(), String> {
    db.conn()
        .execute("UPDATE products SET is_active = 0 WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ==================== КОМАНДЫ: ИНВОЙСЫ ====================

#[tauri::command]
pub fn get_invoices(db: State<Database>) -> Result<Vec<Invoice>, String> {
    println!("🔍 get_invoices: Starting to fetch invoices...");
    
    let mut stmt = db.conn()
        .prepare("SELECT id, invoice_number, document_type, client_id, client_name, date, due_date, total, status, notes, created_at FROM invoices ORDER BY created_at DESC")
        .map_err(|e| {
            println!("❌ get_invoices: Failed to prepare statement: {}", e);
            e.to_string()
        })?;
    
    let invoices = stmt.query_map([], |row| {
        Ok(Invoice {
            id: Some(row.get(0)?),
            invoice_number: row.get(1)?,
            document_type: row.get(2)?,
            client_id: row.get(3)?,
            client_name: row.get(4)?,
            date: row.get(5)?,
            due_date: row.get(6)?,
            total: row.get(7)?,
            status: row.get(8)?,
            notes: row.get(9)?,
            created_at: Some(row.get(10)?),
        })
    })
    .map_err(|e| {
        println!("❌ get_invoices: Failed to query_map: {}", e);
        e.to_string()
    })?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| {
        println!("❌ get_invoices: Failed to collect: {}", e);
        e.to_string()
    })?;
    
    println!("✅ get_invoices: Successfully fetched {} invoices", invoices.len());
    Ok(invoices)
}

#[tauri::command]
pub fn get_invoice_by_id(id: String, db: State<Database>) -> Result<Option<InvoiceWithItems>, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, invoice_number, document_type, client_id, client_name, date, due_date, total, status, notes, created_at FROM invoices WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    
    let invoice_result = stmt.query_row([&id], |row| {
        Ok(Invoice {
            id: Some(row.get(0)?),
            invoice_number: row.get(1)?,
            document_type: row.get(2)?,
            client_id: row.get(3)?,
            client_name: row.get(4)?,
            date: row.get(5)?,
            due_date: row.get(6)?,
            total: row.get(7)?,
            status: row.get(8)?,
            notes: row.get(9)?,
            created_at: Some(row.get(10)?),
        })
    });
    
    match invoice_result {
        Ok(invoice) => {
            let mut items_stmt = db.conn()
                .prepare("SELECT id, invoice_id, product_id, product_name, quantity, price, total FROM invoice_items WHERE invoice_id = ?1")
                .map_err(|e| e.to_string())?;
            
            let items = items_stmt.query_map([&id], |row| {
                Ok(InvoiceItem {
                    id: Some(row.get(0)?),
                    invoice_id: row.get(1)?,
                    product_id: row.get(2)?,
                    product_name: row.get(3)?,
                    quantity: row.get(4)?,
                    price: row.get(5)?,
                    total: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
            
            Ok(Some(InvoiceWithItems { invoice, items }))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn create_invoice(invoice: Invoice, items: Vec<InvoiceItem>, db: State<Database>) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    
    db.conn().execute(
        "INSERT INTO invoices (id, invoice_number, document_type, client_id, client_name, date, due_date, total, status, notes, created_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            id,
            invoice.invoice_number,
            invoice.document_type,
            invoice.client_id,
            invoice.client_name,
            invoice.date,
            invoice.due_date,
            invoice.total,
            invoice.status,
            invoice.notes,
            created_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    
    for item in items {
        let item_id = uuid::Uuid::new_v4().to_string();
        db.conn().execute(
            "INSERT INTO invoice_items (id, invoice_id, product_id, product_name, quantity, price, total) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                item_id,
                id,
                item.product_id,
                item.product_name,
                item.quantity,
                item.price,
                item.total,
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    
    Ok(id)
}

#[tauri::command]
pub fn update_invoice_status(id: String, status: String, db: State<Database>) -> Result<(), String> {
    db.conn()
        .execute("UPDATE invoices SET status = ?1 WHERE id = ?2", params![status, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_invoice(id: String, invoice: Invoice, db: State<Database>) -> Result<Invoice, String> {
    println!("🔄 update_invoice: Updating invoice {}", id);
    
    db.conn().execute(
        "UPDATE invoices SET invoice_number = ?1, document_type = ?2, client_id = ?3, client_name = ?4, date = ?5, due_date = ?6, total = ?7, status = ?8, notes = ?9 WHERE id = ?10",
        params![
            invoice.invoice_number,
            invoice.document_type,
            invoice.client_id,
            invoice.client_name,
            invoice.date,
            invoice.due_date,
            invoice.total,
            invoice.status,
            invoice.notes,
            id,
        ],
    )
    .map_err(|e| {
        println!("❌ update_invoice: Failed to update: {}", e);
        e.to_string()
    })?;
    
    println!("✅ update_invoice: Successfully updated invoice {}", id);
    Ok(Invoice {
        id: Some(id),
        invoice_number: invoice.invoice_number,
        document_type: invoice.document_type,
        client_id: invoice.client_id,
        client_name: invoice.client_name,
        date: invoice.date,
        due_date: invoice.due_date,
        total: invoice.total,
        status: invoice.status,
        notes: invoice.notes,
        created_at: invoice.created_at,
    })
}

#[tauri::command]
pub fn delete_invoice(id: String, db: State<Database>) -> Result<(), String> {
    println!("🗑️ delete_invoice: Deleting invoice {}", id);
    
    // Сначала удаляем items
    db.conn()
        .execute("DELETE FROM invoice_items WHERE invoice_id = ?1", params![id])
        .map_err(|e| {
            println!("❌ delete_invoice: Failed to delete items: {}", e);
            e.to_string()
        })?;
    
    // Затем удаляем сам invoice
    db.conn()
        .execute("DELETE FROM invoices WHERE id = ?1", params![id])
        .map_err(|e| {
            println!("❌ delete_invoice: Failed to delete invoice: {}", e);
            e.to_string()
        })?;
    
    println!("✅ delete_invoice: Successfully deleted invoice {}", id);
    Ok(())
}

#[tauri::command]
pub fn get_client_history(client_id: String, db: State<Database>) -> Result<Vec<Invoice>, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, invoice_number, document_type, client_id, client_name, date, due_date, total, status, notes, created_at FROM invoices WHERE client_id = ?1 ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    
    let invoices = stmt.query_map([&client_id], |row| {
        Ok(Invoice {
            id: Some(row.get(0)?),
            invoice_number: row.get(1)?,
            document_type: row.get(2)?,
            client_id: row.get(3)?,
            client_name: row.get(4)?,
            date: row.get(5)?,
            due_date: row.get(6)?,
            total: row.get(7)?,
            status: row.get(8)?,
            notes: row.get(9)?,
            created_at: Some(row.get(10)?),
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    
    Ok(invoices)
}

// ==================== КОМАНДЫ: ДОСТАВКИ ====================

#[tauri::command]
pub fn get_deliveries(db: State<Database>) -> Result<Vec<Delivery>, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, delivery_number, client_id, client_name, date, status, notes, created_at FROM deliveries ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    
    let deliveries = stmt.query_map([], |row| {
        Ok(Delivery {
            id: Some(row.get(0)?),
            delivery_number: row.get(1)?,
            client_id: row.get(2)?,
            client_name: row.get(3)?,
            date: row.get(4)?,
            status: row.get(5)?,
            notes: row.get(6)?,
            created_at: Some(row.get(7)?),
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    
    Ok(deliveries)
}

#[tauri::command]
pub fn create_delivery(delivery: Delivery, items: Vec<DeliveryItem>, db: State<Database>) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    
    db.conn().execute(
        "INSERT INTO deliveries (id, delivery_number, client_id, client_name, date, status, notes, created_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            delivery.delivery_number,
            delivery.client_id,
            delivery.client_name,
            delivery.date,
            delivery.status,
            delivery.notes,
            created_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    
    for item in items {
        let item_id = uuid::Uuid::new_v4().to_string();
        db.conn().execute(
            "INSERT INTO delivery_items (id, delivery_id, product_id, product_name, quantity) 
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                item_id,
                id,
                item.product_id,
                item.product_name,
                item.quantity,
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    
    Ok(id)
}

// ==================== КОМАНДЫ: СКЛАД ====================

#[tauri::command]
pub fn get_warehouse_groups(db: State<Database>) -> Result<Vec<WarehouseGroup>, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, name, description, created_at FROM warehouse_groups ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    
    let groups = stmt.query_map([], |row| {
        Ok(WarehouseGroup {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            description: row.get(2)?,
            created_at: Some(row.get(3)?),
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    
    Ok(groups)
}

#[tauri::command]
pub fn create_warehouse_group(group: WarehouseGroup, db: State<Database>) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    
    db.conn().execute(
        "INSERT INTO warehouse_groups (id, name, description, created_at) 
         VALUES (?1, ?2, ?3, ?4)",
        params![
            id,
            group.name,
            group.description,
            created_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(id)
}

#[tauri::command]
pub fn update_warehouse_group(id: String, group: WarehouseGroup, db: State<Database>) -> Result<(), String> {
    db.conn().execute(
        "UPDATE warehouse_groups SET name = ?1, description = ?2 WHERE id = ?3",
        params![
            group.name,
            group.description,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_warehouse_group_item(group_id: String, product_id: String, db: State<Database>) -> Result<(), String> {
    db.conn()
        .execute("DELETE FROM warehouse_items WHERE group_id = ?1 AND product_id = ?2", params![group_id, product_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_warehouse_group(id: String, db: State<Database>) -> Result<(), String> {
    println!("🗑️ delete_warehouse_group: Deleting group {}", id);
    
    // Сначала удаляем все items в группе
    db.conn()
        .execute("DELETE FROM warehouse_items WHERE group_id = ?1", params![id])
        .map_err(|e| {
            println!("❌ delete_warehouse_group: Failed to delete items: {}", e);
            e.to_string()
        })?;
    
    // Затем удаляем саму группу
    db.conn()
        .execute("DELETE FROM warehouse_groups WHERE id = ?1", params![id])
        .map_err(|e| {
            println!("❌ delete_warehouse_group: Failed to delete group: {}", e);
            e.to_string()
        })?;
    
    println!("✅ delete_warehouse_group: Successfully deleted group {}", id);
    Ok(())
}

// ==================== HTML ФАЙЛЫ ИНВОЙСОВ ====================

#[tauri::command]
pub fn save_invoice_html(
    invoice_number: String,
    document_type: String,
    year: String,
    month: String,
    html_content: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use std::fs;
    use std::path::PathBuf;

    println!("💾 save_invoice_html: Saving {} #{}", document_type, invoice_number);

    // Получаем путь к папке приложения
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Создаем структуру папок: invoices/{document_type}/{year}/{month}/
    let invoice_dir = app_data_dir
        .join("invoices")
        .join(&document_type)
        .join(&year)
        .join(&month);

    // Создаем все необходимые папки
    fs::create_dir_all(&invoice_dir)
        .map_err(|e| format!("Failed to create directories: {}", e))?;

    // Имя файла: invoice_number.html (заменяем / на -)
    let safe_filename = invoice_number.replace("/", "-").replace("\\", "-");
    let file_path = invoice_dir.join(format!("{}.html", safe_filename));

    // Сохраняем HTML
    fs::write(&file_path, html_content)
        .map_err(|e| format!("Failed to write HTML file: {}", e))?;

    let path_str = file_path.to_string_lossy().to_string();
    println!("✅ save_invoice_html: Saved to {}", path_str);
    Ok(path_str)
}

#[tauri::command]
pub fn load_invoice_html(
    invoice_number: String,
    document_type: String,
    year: String,
    month: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use std::fs;

    println!("📂 load_invoice_html: Loading {} #{}", document_type, invoice_number);

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let safe_filename = invoice_number.replace("/", "-").replace("\\", "-");
    let file_path = app_data_dir
        .join("invoices")
        .join(&document_type)
        .join(&year)
        .join(&month)
        .join(format!("{}.html", safe_filename));

    if !file_path.exists() {
        return Err(format!("HTML file not found: {}", file_path.to_string_lossy()));
    }

    let html_content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read HTML file: {}", e))?;

    println!("✅ load_invoice_html: Loaded from {}", file_path.to_string_lossy());
    Ok(html_content)
}

#[tauri::command]
pub fn delete_invoice_html(
    invoice_number: String,
    document_type: String,
    year: String,
    month: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    use std::fs;

    println!("🗑️ delete_invoice_html: Deleting {} #{}", document_type, invoice_number);

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let safe_filename = invoice_number.replace("/", "-").replace("\\", "-");
    let file_path = app_data_dir
        .join("invoices")
        .join(&document_type)
        .join(&year)
        .join(&month)
        .join(format!("{}.html", safe_filename));

    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete HTML file: {}", e))?;
        println!("✅ delete_invoice_html: Deleted {}", file_path.to_string_lossy());
    } else {
        println!("⚠️ delete_invoice_html: File not found, skipping");
    }

    Ok(())
}

// ==================== КОМАНДЫ: КАТЕГОРИИ ====================

#[tauri::command]
pub fn get_categories(db: State<Database>) -> Result<Vec<Category>, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, name, created_at FROM categories ORDER BY name ASC")
        .map_err(|e| e.to_string())?;
    
    let categories = stmt.query_map([], |row| {
        Ok(Category {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            created_at: Some(row.get(2)?),
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    
    Ok(categories)
}

#[tauri::command]
pub fn create_category(category: Category, db: State<Database>) -> Result<Category, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    
    db.conn().execute(
        "INSERT INTO categories (id, name, created_at) VALUES (?1, ?2, ?3)",
        params![id, category.name, created_at],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(Category {
        id: Some(id),
        name: category.name,
        created_at: Some(created_at),
    })
}

#[tauri::command]
pub fn delete_category(id: String, db: State<Database>) -> Result<(), String> {
    // Сначала удаляем все субкатегории этой категории
    db.conn()
        .execute("DELETE FROM subcategories WHERE category_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    
    // Затем удаляем саму категорию
    db.conn()
        .execute("DELETE FROM categories WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

// ==================== КОМАНДЫ: СУБКАТЕГОРИИ ====================

#[tauri::command]
pub fn get_subcategories(db: State<Database>) -> Result<Vec<Subcategory>, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, name, category_id, created_at FROM subcategories ORDER BY name ASC")
        .map_err(|e| e.to_string())?;
    
    let subcategories = stmt.query_map([], |row| {
        Ok(Subcategory {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            category_id: row.get(2)?,
            created_at: Some(row.get(3)?),
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    
    Ok(subcategories)
}

#[tauri::command]
pub fn get_subcategories_by_category(category_id: String, db: State<Database>) -> Result<Vec<Subcategory>, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, name, category_id, created_at FROM subcategories WHERE category_id = ?1 ORDER BY name ASC")
        .map_err(|e| e.to_string())?;
    
    let subcategories = stmt.query_map([&category_id], |row| {
        Ok(Subcategory {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            category_id: row.get(2)?,
            created_at: Some(row.get(3)?),
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    
    Ok(subcategories)
}

#[tauri::command]
pub fn create_subcategory(subcategory: Subcategory, db: State<Database>) -> Result<Subcategory, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    
    db.conn().execute(
        "INSERT INTO subcategories (id, name, category_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, subcategory.name, subcategory.category_id, created_at],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(Subcategory {
        id: Some(id),
        name: subcategory.name,
        category_id: subcategory.category_id,
        created_at: Some(created_at),
    })
}

#[tauri::command]
pub fn delete_subcategory(id: String, db: State<Database>) -> Result<(), String> {
    db.conn()
        .execute("DELETE FROM subcategories WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

// ==================== СТРУКТУРЫ: СТРАНЫ ====================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Country {
    pub id: Option<String>,
    pub name: String,
    pub code: Option<String>,
    pub created_at: Option<String>,
}

// ==================== СТРУКТУРЫ: ПОСТАВЩИКИ ====================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierSector {
    pub id: Option<String>,
    pub name: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierProduct {
    pub id: Option<String>,
    pub name: String,
    pub sector_id: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Supplier {
    pub id: Option<i64>,
    pub name: String,
    pub legal_name: Option<String>,
    pub mb: Option<String>,
    pub pib: Option<String>,
    pub reg_number: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub country: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub telegram: Option<String>,
    pub instagram: Option<String>,
    pub wechat: Option<String>,
    pub website: Option<String>,
    pub bank: Option<String>,
    pub sector_id: Option<String>,
    pub product_id: Option<String>,
    pub contact_person: Option<String>,
    pub contact_person_status: Option<String>,
    pub google_maps: Option<String>,
    pub notes: Option<String>,
    pub is_active: Option<i32>,
    pub created_at: Option<String>,
}

// ==================== КОМАНДЫ: СТРАНЫ ====================

#[tauri::command]
pub fn get_countries(db: State<Database>) -> Result<Vec<Country>, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, name, code, created_at FROM countries ORDER BY name ASC")
        .map_err(|e| e.to_string())?;
    
    let countries = stmt.query_map([], |row| {
        Ok(Country {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            code: row.get(2)?,
            created_at: Some(row.get(3)?),
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    
    Ok(countries)
}

// ==================== КОМАНДЫ: СЕКТОРЫ ПОСТАВЩИКОВ ====================

#[tauri::command]
pub fn get_supplier_sectors(db: State<Database>) -> Result<Vec<SupplierSector>, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, name, created_at FROM supplier_sectors ORDER BY name ASC")
        .map_err(|e| e.to_string())?;
    
    let sectors = stmt.query_map([], |row| {
        Ok(SupplierSector {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            created_at: Some(row.get(2)?),
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    
    Ok(sectors)
}

#[tauri::command]
pub fn create_supplier_sector(sector: SupplierSector, db: State<Database>) -> Result<SupplierSector, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    
    db.conn().execute(
        "INSERT INTO supplier_sectors (id, name, created_at) VALUES (?1, ?2, ?3)",
        params![id, sector.name, created_at],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(SupplierSector {
        id: Some(id),
        name: sector.name,
        created_at: Some(created_at),
    })
}

#[tauri::command]
pub fn delete_supplier_sector(id: String, db: State<Database>) -> Result<(), String> {
    // Сначала удаляем все продукции этого сектора
    db.conn()
        .execute("DELETE FROM supplier_products WHERE sector_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    
    // Затем удаляем сам сектор
    db.conn()
        .execute("DELETE FROM supplier_sectors WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

// ==================== КОМАНДЫ: ПРОДУКЦИЯ ПОСТАВЩИКОВ ====================

#[tauri::command]
pub fn get_supplier_products(db: State<Database>) -> Result<Vec<SupplierProduct>, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, name, sector_id, created_at FROM supplier_products ORDER BY name ASC")
        .map_err(|e| e.to_string())?;
    
    let products = stmt.query_map([], |row| {
        Ok(SupplierProduct {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            sector_id: row.get(2)?,
            created_at: Some(row.get(3)?),
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    
    Ok(products)
}

#[tauri::command]
pub fn get_supplier_products_by_sector(sector_id: String, db: State<Database>) -> Result<Vec<SupplierProduct>, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, name, sector_id, created_at FROM supplier_products WHERE sector_id = ?1 ORDER BY name ASC")
        .map_err(|e| e.to_string())?;
    
    let products = stmt.query_map([&sector_id], |row| {
        Ok(SupplierProduct {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            sector_id: row.get(2)?,
            created_at: Some(row.get(3)?),
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    
    Ok(products)
}

#[tauri::command]
pub fn create_supplier_product(product: SupplierProduct, db: State<Database>) -> Result<SupplierProduct, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    
    db.conn().execute(
        "INSERT INTO supplier_products (id, name, sector_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, product.name, product.sector_id, created_at],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(SupplierProduct {
        id: Some(id),
        name: product.name,
        sector_id: product.sector_id,
        created_at: Some(created_at),
    })
}

#[tauri::command]
pub fn delete_supplier_product(id: String, db: State<Database>) -> Result<(), String> {
    db.conn()
        .execute("DELETE FROM supplier_products WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

// ==================== КОМАНДЫ: ПОСТАВЩИКИ ====================

#[tauri::command]
pub fn get_suppliers(db: State<Database>) -> Result<Vec<Supplier>, String> {
    let mut stmt = db.conn()
        .prepare("SELECT id, name, legal_name, mb, pib, reg_number, address, city, country, phone, email, telegram, instagram, wechat, website, bank, sector_id, product_id, contact_person, contact_person_status, google_maps, notes, is_active, created_at FROM suppliers WHERE is_active = 1 ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    
    let suppliers = stmt.query_map([], |row| {
        Ok(Supplier {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            legal_name: row.get(2)?,
            mb: row.get(3)?,
            pib: row.get(4)?,
            reg_number: row.get(5)?,
            address: row.get(6)?,
            city: row.get(7)?,
            country: row.get(8)?,
            phone: row.get(9)?,
            email: row.get(10)?,
            telegram: row.get(11)?,
            instagram: row.get(12)?,
            wechat: row.get(13)?,
            website: row.get(14)?,
            bank: row.get(15)?,
            sector_id: row.get(16)?,
            product_id: row.get(17)?,
            contact_person: row.get(18)?,
            contact_person_status: row.get(19)?,
            google_maps: row.get(20)?,
            notes: row.get(21)?,
            is_active: row.get(22)?,
            created_at: Some(row.get(23)?),
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    
    Ok(suppliers)
}

#[tauri::command]
pub fn create_supplier(supplier: Supplier, db: State<Database>) -> Result<Supplier, String> {
    let created_at = Utc::now().to_rfc3339();
    
    db.conn().execute(
        "INSERT INTO suppliers (name, legal_name, mb, pib, reg_number, address, city, country, phone, email, telegram, instagram, wechat, website, bank, sector_id, product_id, contact_person, contact_person_status, google_maps, notes, is_active, created_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)",
        params![
            supplier.name,
            supplier.legal_name,
            supplier.mb,
            supplier.pib,
            supplier.reg_number,
            supplier.address,
            supplier.city,
            supplier.country,
            supplier.phone,
            supplier.email,
            supplier.telegram,
            supplier.instagram,
            supplier.wechat,
            supplier.website,
            supplier.bank,
            supplier.sector_id,
            supplier.product_id,
            supplier.contact_person,
            supplier.contact_person_status,
            supplier.google_maps,
            supplier.notes,
            supplier.is_active.unwrap_or(1),
            created_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    
    let id = db.conn().last_insert_rowid();
    
    Ok(Supplier {
        id: Some(id),
        created_at: Some(created_at),
        ..supplier
    })
}

#[tauri::command]
pub fn update_supplier(supplier: Supplier, db: State<Database>) -> Result<Supplier, String> {
    let id = supplier.id.ok_or("Supplier ID is required")?;
    
    db.conn().execute(
        "UPDATE suppliers SET name = ?1, legal_name = ?2, mb = ?3, pib = ?4, reg_number = ?5, address = ?6, city = ?7, country = ?8, phone = ?9, email = ?10, telegram = ?11, instagram = ?12, wechat = ?13, website = ?14, bank = ?15, sector_id = ?16, product_id = ?17, contact_person = ?18, contact_person_status = ?19, google_maps = ?20, notes = ?21 WHERE id = ?22",
        params![
            supplier.name,
            supplier.legal_name,
            supplier.mb,
            supplier.pib,
            supplier.reg_number,
            supplier.address,
            supplier.city,
            supplier.country,
            supplier.phone,
            supplier.email,
            supplier.telegram,
            supplier.instagram,
            supplier.wechat,
            supplier.website,
            supplier.bank,
            supplier.sector_id,
            supplier.product_id,
            supplier.contact_person,
            supplier.contact_person_status,
            supplier.google_maps,
            supplier.notes,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(supplier)
}

#[tauri::command]
pub fn delete_supplier(id: i64, db: State<Database>) -> Result<(), String> {
    // Soft delete - помечаем как неактивного
    db.conn()
        .execute("UPDATE suppliers SET is_active = 0 WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
