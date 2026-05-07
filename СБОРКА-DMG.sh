#!/bin/bash

echo "📦 Сборка DMG для macOS"
echo ""

cd ~/Downloads/srecha_invoice_tauri

# Активация Rust
source $HOME/.cargo/env

echo "🔨 Начинаю сборку..."
echo "⏱️  Это займет 2-3 минуты..."
echo ""

# ВАЖНО: фиксируем CARGO_TARGET_DIR в репозитории, чтобы сборка не ссылалась на cursor-sandbox-cache
# (иначе libsqlite3-sys может падать на отсутствующем bindgen.rs).
export CARGO_TARGET_DIR="$(pwd)/src-tauri/target"

npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Сборка завершена!"
    echo ""
    echo "📁 DMG файлы находятся в:"
    echo "   src-tauri/target/release/bundle/dmg/"
    echo ""
    ls -lh src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null || echo "DMG файлы не найдены"

    # =========================================================
    # Копирование DMG в ./dmg с авто-нумерацией
    # =========================================================
    mkdir -p dmg

    # В зависимости от окружения сборки (IDE sandbox и т.п.) артефакты могут оказаться
    # либо в репозитории (src-tauri/target/...), либо во временном cargo-target.
    # ВАЖНО: нужно брать САМЫЙ СВЕЖИЙ DMG среди обоих путей (иначе можно случайно копировать старый артефакт).
    BUILT_DMG_DIR="src-tauri/target/release/bundle/dmg"
    LATEST_DMG="$(ls -t \
        "$BUILT_DMG_DIR"/*.dmg \
        /var/folders/*/*/*/cursor-sandbox-cache/*/cargo-target/release/bundle/dmg/*.dmg \
        2>/dev/null | head -n 1)"

    if [ -z "$LATEST_DMG" ]; then
        echo ""
        echo "❌ Не найден собранный DMG ни в $BUILT_DMG_DIR ни в cursor-sandbox-cache cargo-target"
        exit 1
    fi

    # Нумерация: Srecha_Invoice_YYYYMMDD_XXX.dmg, где XXX = следующий номер в папке dmg/
    TODAY="$(date +%Y%m%d)"
    LAST_NUM="$(ls -1 dmg/Srecha_Invoice_*_*.dmg 2>/dev/null | sed -E 's/.*_([0-9]{3})\\.dmg$/\\1/' | sort | tail -n 1)"
    if [[ "$LAST_NUM" =~ ^[0-9]{3}$ ]]; then
        NEXT_NUM=$((10#$LAST_NUM + 1))
    else
        NEXT_NUM=1
    fi
    NEXT_NUM_PADDED="$(printf '%03d' "$NEXT_NUM")"

    OUT_DMG="dmg/Srecha_Invoice_${TODAY}_${NEXT_NUM_PADDED}.dmg"

    echo ""
    echo "📦 Копирую DMG в: $OUT_DMG"
    cp -f "$LATEST_DMG" "$OUT_DMG"

    echo "✅ Готово. Файлы в ./dmg:"
    ls -lh dmg/*.dmg 2>/dev/null || true
else
    echo "❌ Ошибка сборки!"
    exit 1
fi
