# Сборка Srecha Invoice для Windows

## Требования

1. **Windows 10/11** (64-bit)
2. **Visual Studio Build Tools 2022** с компонентами:
   - "Desktop development with C++"
   - Windows 10/11 SDK
3. **Rust** - https://rustup.rs
4. **Node.js 18+** - https://nodejs.org
5. **WebView2** (обычно предустановлен в Windows 10/11)

## Установка зависимостей

### 1. Visual Studio Build Tools
Скачайте с https://visualstudio.microsoft.com/visual-cpp-build-tools/
При установке выберите:
- "Desktop development with C++"
- Windows 10 SDK (или 11)

### 2. Rust
```powershell
# Запустите в PowerShell от администратора
winget install Rustlang.Rustup
# или скачайте установщик с https://rustup.rs
```

### 3. Node.js
```powershell
winget install OpenJS.NodeJS.LTS
```

## Сборка приложения

1. Скопируйте папку проекта на Windows машину

2. Откройте PowerShell в папке проекта:
```powershell
cd путь\к\srecha_invoice_tauri
```

3. Установите npm зависимости:
```powershell
npm install
```

4. Соберите приложение:
```powershell
npm run tauri build
```

## Результат сборки

После успешной сборки файлы будут в:

- **MSI установщик**: `src-tauri\target\release\bundle\msi\Srecha Invoice_1.0.0_x64_en-US.msi`
- **EXE установщик (NSIS)**: `src-tauri\target\release\bundle\nsis\Srecha Invoice_1.0.0_x64-setup.exe`
- **Портативный EXE**: `src-tauri\target\release\srecha-invoice.exe`

## Альтернатива: GitHub Actions

Если нет доступа к Windows машине, загрузите проект на GitHub и используйте workflow файл `.github/workflows/build-windows.yml` для автоматической сборки в облаке.

## Устранение проблем

### Ошибка: WebView2 not found
Установите WebView2 Runtime: https://developer.microsoft.com/microsoft-edge/webview2/

### Ошибка: MSVC not found
Убедитесь, что Visual Studio Build Tools установлены с компонентом "Desktop development with C++"

### Ошибка: link.exe not found
Перезапустите терминал после установки Build Tools
