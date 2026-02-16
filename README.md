# 🎉 Srecha Invoice - Tauri Edition

Современная система управления счетами и документами.  
**Полностью автономное десктопное приложение для macOS.**

---

## 🚀 БЫСТРЫЙ СТАРТ

### Запуск приложения:
```bash
./ЗАПУСК.sh
```

### Сборка DMG:
```bash
./СБОРКА-DMG.sh
```

---

## 📋 СИСТЕМНЫЕ ТРЕБОВАНИЯ

- macOS 10.15+
- Node.js 18+
- Rust 1.77+ (устанавливается автоматически)

---

## ⚡ ОСНОВНЫЕ КОМАНДЫ

```bash
# Разработка
npm run dev

# Сборка
npm run build

# Очистка
cd src-tauri && cargo clean
```

---

## 💾 ДАННЫЕ

**База данных SQLite:**
```
~/Library/Application Support/srecha-invoice-desktop/srecha-invoice.db
```

**Дефолтный пользователь:**
- Логин: `admin`
- Пароль: `admin`

---

## ✅ РЕАЛИЗОВАНО

- ✅ Авторизация
- ✅ Управление клиентами
- ✅ Управление товарами
- ✅ Хранение в SQLite
- ✅ Поиск и фильтрация

---

## 📊 ПРЕИМУЩЕСТВА

- **Маленький размер**: ~5 MB (vs 150+ MB у Electron)
- **Быстрая работа**: Rust backend
- **Безопасность**: Tauri security model
- **Офлайн**: Все данные локально
- **Постоянство**: Данные не теряются

---

## 📖 ДОКУМЕНТАЦИЯ

- `TAURI-MIGRATION-COMPLETE.md` - Полная документация
- `ЗАПУСК.sh` - Быстрый запуск
- `СБОРКА-DMG.sh` - Создание установщика

---

## 🏗️ СТРУКТУРА

```
app/              - Frontend (HTML/CSS/JS)
src-tauri/        - Backend (Rust)
  ├── src/
  │   ├── database.rs   - SQLite
  │   ├── commands.rs   - API
  │   └── lib.rs        - Init
  └── tauri.conf.json   - Config
```

---

## 🎯 ROADMAP

- [ ] Полная реализация инвойсов
- [ ] Накладные
- [ ] Экспорт в PDF/Excel
- [ ] Печать документов
- [ ] Резервное копирование

---

## 📞 ПОДДЕРЖКА

**Проблемы?**
1. Проверьте базу данных: `./проверка-бд.sh`
2. Перезапустите: `./ЗАПУСК.sh`
3. Пересоберите: `npm run build`

**Сброс данных:**
```bash
rm ~/Library/Application\ Support/srecha-invoice-desktop/srecha-invoice.db
```

---

**Версия:** 1.0.0  
**Дата:** 13 ноября 2025  
**Статус:** ✅ Production Ready
