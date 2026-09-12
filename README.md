# 🎮 AIBot — Minecraft AI Player

Yerel Paper sunucusunda, yapay zekayı bir Minecraft oyuncusu gibi yöneten açık kaynaklı bir projedir. **Mineflayer** tabanlı bir bot, **MCP (Model Context Protocol)** üzerinden bağlanır; opencode, Claude, GPT veya DeepSeek gibi herhangi bir LLM ile kontrol edilebilir.

---

## 🏗️ Mimari

```
┌──────────────┐     MCP stdio      ┌───────────────────────────────┐
│   LLM        │◄──────────────────►│   bot/index.js (Node.js)      │
│  (opencode,  │                    │  Mineflayer + pathfinder/     │
│   Claude,    │                    │  collectblock/auto-eat/pvp/   │
│   GPT-4o)    │                    │  tool)                        │
└──────────────┘                    └──────────────┬────────────────┘
                                                   │ mineflayer
                                                   ▼
                                          ┌────────────────────┐
                                          │  Paper 26.1.2      │
                                          │  (Java 25, lokaldə) │
                                          └────────────────────┘
```

- **bot/index.js**: 16 MCP tool sunar.
- **Otonom mod**: AGENTS.md'deki 8 aşamalı hedef döngüsünü izler (ahşap → taş → yemek → yatak → demir → elmas → üs).
- **Reflex katmanı**: düşük can→kaçma, ölüm→otomatik respawn, açlık→otomatik yer yeme.

---

## ✅ Özellikler

| Alan | Tool'lar |
|---|---|
| **Hareket** | `goto`, `goto_player`, `follow_player`, `come_here`, `stop` |
| **Madencilik** | `mine_block` (yol bulma + kuşanma otomatik), `observe` (cevher/ağaç/su/lava haritası) |
| **Craft** | `craft_item`, `smelt_item`, `place_block`, `equip_best_tools` |
| **Hayatta kalma** | `eat`, `sleep_in_bed`, `attack_entity`, `get_status` |
| **Sohbet** | `say` (oyun içi chat) |
| **Güvenlik** | Otomatik yeme, düşük can kaçma, ölümde respawn |

---

## 📋 Gereksinimler

| Bileşen | Minimum |
|---|---|
| **Java** | JDK 25 (Temurin) |
| **Node.js** | v20+ |
| **Minecraft** | Paper 26.1.x |
| **Bot** | mineflayer ^4.39.0, 7 eklenti |

---

## 🚀 Kurulum

### 1. JDK 25 indir (portable)
```powershell
New-Item -ItemType Directory -Path tools -Force
Invoke-WebRequest 'https://api.adoptium.net/v3/binary/latest/25/ga/windows/x64/jdk/hotspot/normal/eclipse' -OutFile tools\jdk25.zip
Expand-Archive tools\jdk25.zip -DestinationPath tools
```

### 2. Paper sunucusunu kur
```powershell
New-Item -ItemType Directory -Path server -Force
& "tools\jdk-25*\bin\java.exe" -Xmx2G -jar server\paper.jar nogui
# Eula dosyasına "eula=true" yaz, server.properties'te online-mode=false yap
```
> veya `scripts\start-server.bat` dosyasını çift tıkla.

### 3. Bot projesini kur
```powershell
cd bot
npm install
```

### 4. Botu başlat
```powershell
node index.js
```
> Bot ilk tool çağrısında otomatik bağlanır. `opencode.json` üzerinden MCP olarak tanımlanmıştır.

### 5. Kendin de oyuna gir
Minecraft client → **Multiplayer** → **Add Server** → `localhost:25565` (offline mod, istediğin nick).

---

## 🎯 Kullanım

### opencode ile kontrol
Bu dosyanın bulunduğu dizinde opencode'yu aç. MCP server otomatik bağlanır.

| Komut | Açıklama |
|---|---|
| `"otonom mod"` | Bot kendi kendine hayatta kalır ve gelişir |
| `"get_status"` | Can, açlık, konum, envanter, biyom |
| `"demir bul"` | `observe` + `mine_block iron_ore` |
| `"bana ev yap"` | Craft zinciri ile barınak inşa eder |
| `"şu an neredesin"` | Konum ve yakındaki varlıklar |

### Terminal/test
```powershell
cd bot
node test.js    # tam senaryo: odun → planks → masa → kazma → taş → yerleştir
```

---

## 📁 Proje Yapısı

```
minecraftplay/
├── server/              # Paper 26.1.2 sunucusu
│   ├── paper.jar
│   ├── world/
│   └── server.properties
├── bot/                 # MCP server (Mineflayer)
│   ├── index.js         # 16 tool + reflex katmanı
│   ├── test.js          # tüm senaryo testi
│   └── package.json
├── tools/               # portable JDK 25
├── scripts/
│   └── start-server.bat
├── opencode.json        # MCP sunucu tanımı
├── AGENTS.md            # otonom mod + hayatta kalma talimatları
└── .gitignore
```

---

## ⚙️ Yapılandırma

### Bot (bot/index.js)
| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `MC_HOST` | `localhost` | Sunucu adresi |
| `MC_PORT` | `25565` | Sunucu portu |
| `MC_USERNAME` | `AIBot` | Bot adı |
| `MC_VERSION` | `26.1.2` | Minecraft versiyonu |

### opencode.json
MCP server otomatik başlar. Zorunlu argümanlar: `node index.js`. Bellek sınırı: `--max-old-space-size=2048`.

---

## 🧪 Test Senaryoları

`bot/test.js` aşağıdaki akışı doğrular:
```
get_status → mine_block oak_log 4 → craft oak_planks 8
→ craft crafting_table 1 → craft stick 4 → craft wooden_pickaxe 1
→ equip_best_tools → mine_block cobblestone 3 → craft stone_pickaxe 1
→ place_block cobblestone → say "Test tamamlandı"
```

---

## 📄 Lisans

MIT
