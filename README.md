# NutriTrack

A personal nutrition tracker tailored for body recomposition — lose fat and gain muscle. Logs calories, macros, and micronutrients. Scan food labels with your phone camera using on-device ML (no API key, no cost).

---

## Features

- **Calorie ring** — animated daily progress with color-coded status
- **Macros** — protein, carbs, fat progress bars
- **Micronutrients** — fiber, sodium, sugar, saturated fat, potassium, cholesterol
- **Label scanner** — point camera at a Nutrition Facts label; on-device ML reads it instantly
- **Manual food log** — full nutrition entry form
- **History** — collapsible day-by-day log with macro summaries
- **Profile** — targets recalculate live (Mifflin-St Jeor + TDEE)
- **Export / Import** — back up all data as a JSON file

**Default targets (pre-configured):** 30 yr · 205 lbs · 5′10″ · moderate activity · lose fat + gain muscle
→ ~2,600 cal · 205g protein · 260g carbs · 82g fat

---

## Project structure

```
nutritional-tracker/
├── android/                  ← Android Studio project (sideloadable APK)
│   ├── build.gradle
│   ├── settings.gradle
│   ├── gradle.properties
│   └── app/
│       ├── build.gradle
│       └── src/main/
│           ├── AndroidManifest.xml
│           ├── java/com/nutritrack/
│           │   └── MainActivity.java   ← camera, ML Kit OCR, file I/O bridge
│           ├── res/                    ← layouts, themes, icons
│           └── assets/                ← the web app (HTML/CSS/JS)
│               ├── index.html
│               ├── styles.css
│               └── app.js
├── public/                   ← Web server version (same UI, uses Claude API for OCR)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── server.js                 ← Node.js server for the web version
├── package.json
└── .env.example
```

---

## Option A — Android app (recommended, zero cost)

The Android version runs entirely on your phone. OCR uses **Google ML Kit** — fully offline, no API key.

### Prerequisites

| Tool | Download | Cost |
|------|----------|------|
| Android Studio | https://developer.android.com/studio | Free |
| Android SDK 34 | Installed via Android Studio SDK Manager | Free |
| JDK 17 | Bundled with Android Studio | Free |

### Build the APK

1. **Clone the repo**
   ```bash
   git clone https://github.com/Bergie15/nutritional-tracker.git
   cd nutritional-tracker
   ```

2. **Open the Android project in Android Studio**
   - Open Android Studio
   - Choose **Open** → select the `android/` folder (not the root)
   - Wait for Gradle to sync (downloads ~50 MB of dependencies on first run)

3. **Build a debug APK** (for sideloading)
   ```
   Build → Build Bundle(s) / APK(s) → Build APK(s)
   ```
   Output: `android/app/build/outputs/apk/debug/app-debug.apk`

4. **Or build from the command line** (once Android Studio has synced once)
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
   Output: `app/build/outputs/apk/debug/app-debug.apk`

5. **Build a release APK** (smaller, optimised)
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
   > For release builds you need a signing keystore. See [Sign your app](https://developer.android.com/studio/publish/app-signing).

### Sideload onto your phone

**Via Android Studio (easiest)**
- Connect phone via USB, enable **Developer Options → USB Debugging**
- In Android Studio click the green ▶ Run button — it installs and launches automatically

**Via ADB command line**
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

**Via file transfer**
1. Copy `app-debug.apk` to your phone (USB, Google Drive, email, etc.)
2. On your phone: **Settings → Install unknown apps** → allow your file manager
3. Tap the `.apk` file to install

### Android permissions requested

| Permission | Why |
|------------|-----|
| `CAMERA` | Take photos of nutrition labels |
| `READ_MEDIA_IMAGES` | Pick images from gallery |

No internet permission — the app is fully offline.

---

## Option B — Web server (requires Anthropic API key)

The web version runs in any browser and uses Claude's vision AI for label scanning (much higher accuracy on tricky photos).

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com) (~$0.0003 per label scan)

### Run locally

```bash
# Clone
git clone https://github.com/Bergie15/nutritional-tracker.git
cd nutritional-tracker

# Set your API key
cp .env.example .env
# Edit .env and add: ANTHROPIC_API_KEY=sk-ant-...

# Start the server
export ANTHROPIC_API_KEY=sk-ant-...
node server.js

# Open http://localhost:3000 in your browser
```

### Run with auto-reload (development)

```bash
nodemon server.js
```

### Access from your phone (same Wi-Fi)

```bash
# Find your computer's local IP
ip addr show   # Linux
ipconfig       # Windows

# Then open on your phone:
# http://192.168.x.x:3000
```

---

## Data storage

| Version | Storage | Export |
|---------|---------|--------|
| Android | `localStorage` inside the WebView (persists until app is uninstalled) | Settings → Export JSON |
| Web | `localStorage` in your browser | Settings → Export JSON |

**To back up your data:** open the app → tap the profile icon (top right) → **Export JSON**. This saves a file you can import later on any device.

---

## Updating your profile & targets

Tap the **👤 profile icon** (top right) to open settings. Changes recalculate targets immediately using the Mifflin-St Jeor BMR formula:

```
BMR  = 10×weight(kg) + 6.25×height(cm) − 5×age + 5   (male)
TDEE = BMR × activity multiplier
Goal = TDEE + adjustment (recomposition: −250 cal, cut: −500, bulk: +300)
```

---

## Useful Gradle commands

Run all of these from inside the `android/` directory.

```bash
# Sync dependencies
./gradlew dependencies

# Build debug APK
./gradlew assembleDebug

# Build release APK
./gradlew assembleRelease

# Install debug APK on connected device
./gradlew installDebug

# Run lint checks
./gradlew lint

# Clean build artifacts
./gradlew clean

# Full clean + build
./gradlew clean assembleDebug
```

---

## Troubleshooting

**Gradle sync fails on first open**
- Make sure you opened the `android/` subfolder, not the repo root
- Go to **File → Invalidate Caches → Invalidate and Restart**

**`INSTALL_FAILED_UPDATE_INCOMPATIBLE` when sideloading**
- Uninstall the existing version first: `adb uninstall com.nutritrack`

**Camera permission denied**
- Go to **Settings → Apps → NutriTrack → Permissions → Camera → Allow**

**OCR result is missing some values**
- ML Kit reads the raw text; the parser uses regex to extract values
- Edit any blank fields manually before tapping "Add to Log"
- For best results: good lighting, hold camera flat and parallel to the label

**Web server: label scan returns error**
- Check `ANTHROPIC_API_KEY` is set: `echo $ANTHROPIC_API_KEY`
- Verify the key is valid at https://console.anthropic.com
