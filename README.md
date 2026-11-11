# 🤖 Dark AI – tvoje vlastní AI aplikace

Vlastní AI asistent, který jde **nainstalovat do telefonu jako appka**. Umí:

- 💬 **Chat** s vlastní osobností (jméno, avatar, styl, vlastní pokyny)
- 👨‍💻 **Programovat, kódovat, skriptovat** – kód ti rovnou vygeneruje (Python, JS, Bash…) s tlačítky Kopírovat / Stáhnout
- 🎙️ **Mluvit místo psaní** + hlasové odpovědi (mikrofon v telefonu)
- 📞 **Hovor** – mluv a poslouchej, ruce volné
- 🎬 **Tvořit videa** – kinetické video s dabingem (vždy funguje) + experimentální AI video přes Google Veo
- 🗣️ **Dabing** – text promění v nahraný hlas (stáhneš jako .wav)
- 🖼️ **Generovat obrázky** + **číst obrázky** (přilož fotku a AI ji přečte)
- 💻 **Spouštění kódu** – JS kód rovnou spustí, HTML ukáže v náhledu
- 📁 **Tvorba souborů** – AI vytvoří soubor, stáhneš si ho
- 🤖 **Agentní režim** – AI sama používá nástroje (obrázek, web, kód, soubor) a na základě výsledků odpovídá
- 🌐 **Hledat na webu** (Google Search) + **čtení webových stránek** – odpoví i na aktuální dění
- 🏗️ **Weby, appky & software** – postaví kompletní projekt s živým náhledem, stáhneš jako .html / .zip
- 🎵 **Hudba & písničky** – složí skladbu (melodie + basa + bicí), přehraje a stáhneš jako .wav; texty písní píše AI
- 🐝 **Včelí úl (tým AI)** – královna povolá 4 specialisty, kteří pracují paralelně, a shrne jejich výstupy
- 🐙 **GitHub integrace** – AI umí vytvářet repozitáře a nahrávat kód (projekty rovnou na GitHub)
- 🧩 **Vývojář appky v appce** – záložka 🧩 Funkce: popíšeš funkci, AI ji naprogramuje jako plugin,
  ty ji schválíš a appka se rozšíří (na hosting se pluginy nahrají s ní). Vzhled 🎨 i osobnost 🎭 také
  upravíš přímo v appce – na vývojáře už odkázaný nejsi.
- 🔎 **Hledání všude** – Google + DuckDuckGo + fóra + sociální sítě (Instagram, TikTok, YouTube, Reddit)
- 🧠 **Paměť** – pamatuje si věci mezi sezeními
- 🔓 **Otevřený režim** – přímé odpovědi bez kázání

---

## 🚀 Rychlý start

1. **Získej zdarma API klíč („mozek" AI):**
   - Jdi na **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)**
   - Přihlas se Google účtem
   - Klikni na **Create API key** → zkopíruj klíč
   - (Alternativa: OpenAI klíč z [platform.openai.com/api-keys](https://platform.openai.com/api-keys) – placený dle spotřeby)
2. V appce otevři **⚙️ Nastavení → Mozek** a klíč vlož.
3. Hotovo – mluv, piš, tvoř! 🎉

## 📱 Instalace do telefonu

Appka je webová (PWA) – instaluje se přímo z prohlížeče, bez obchodu:

- **Android (Chrome):** otevři appku → menu **⋮** → **„Instalovat aplikaci"** / **„Přidat na plochu"**
- **iPhone (Safari):** otevři appku → **Sdílet 📤** → **„Přidat na plochu"**

Po instalaci bude mít vlastní ikonu a otevře se bez lišty prohlížeče.

> **Tip k mikrofonu:** když mikrofon nefunguje v náhledu, otevři appku v nové kartě
> prohlížeče (celá adresa) a povol přístup k mikrofonu.

## ⚙️ Nastavení osobnosti

V **Nastavení → Osobnost** si vybereš:

- **Jméno** a **avatar** AI
- **Styl:** Univerzální / Kamarád / Programátor / Učitel
- **Otevřený režim:** odpovídá přímo, bez moralizování a zbytečných varování
- **Vlastní pokyny:** cokoliv dalšího („vždy piš česky", „zaměř se na hudbu"…)

## 🎬 Studio

- **Dabing:** text → nahraný hlas (.wav ke stažení). Hlas i jazyk se mění v Nastavení → Hlas.
- **Video z textu:** text + hlas → video, kde slova ožívají v rytmu řeči (funguje vždy, zdarma).
- **AI video (Veo):** reálné video z popisu – experimentální, vyžaduje přístup k Veo na tvém klíči.

## 🧠 Paměť

Řekni AI „zapamatuj si, že…" a uloží si to do paměti (Nastavení → Paměť), kde to můžeš spravovat.

## 💾 Data

Vše (chaty, paměť, klíč) se ukládá **jen do tvého prohlížeče**. V Nastavení → Data to můžeš exportovat, importovat nebo smazat.

## 🔗 Propojení &amp; hosting

- **GitHub:** v Nastavení → Propojení vlož token ([github.com/settings/tokens](https://github.com/settings/tokens),
  scope `repo`) – AI pak umí vytvářet repozitáře a nahrávat kód, třeba tvoje projekty. Z GitHubu jde
  appka i projekty **zdarma hostovat** (GitHub Pages – zapne se na pár kliknutí).
- **Hosting =** appka běží na veřejném serveru se svou adresou, nonstop, i když zavřeš chat.
  **Platit nemusíš:** GitHub Pages, Netlify, Vercel i Cloudflare Pages mají free tarif pro osobní věci.
  Placené jsou jen doplňky jako vlastní doména (řádově stovky Kč/rok).
- **Appka to umí sama:** Nastavení → Propojení → tlačítko **🚀 Zveřejnit appku na webu** – nahraje sebe
  sama na GitHub a zapne GitHub Pages. Potřebuješ jen GitHub účet + token (viz výše).
- **Další integrace** (Discord, Notion…) jdou přidat stejným způsobem – přes jejich API klíč/webhook.

## ⚖️ Co appka (ne)umí – otevřeně

- **„Bez cenzury":** Otevřený režim znamená přímé odpovědi bez kázání. Každý velký model ale má
  pořád tvrdé limity u tvrdě nelegálních věcí (zneužívání dětí, terorismus…) – ty žádná appka
  neodstraní a je to tak správně.
- **„Hledat všude":** Google + DuckDuckGo + site: dotazy na Instagram/TikTok/YouTube/Reddit + čtení
  veřejných stránek. Co je jen pro přihlášené (soukromé účty), to neuvidí – přihlašování se
  neprolamuje. Darkweb (Tor) appka nepodporuje záměrně.
- **Hudba:** skladby vznikají syntezátorem (elektronická/lo-fi hudba) – „zpěv" jako u Suno neumí,
  text písně ti ale AI napíše a může ho i přečíst hlasem.
- **Video/Dabing:** kvalita a dostupnost závisí na zvoleném modelu a klíči.

## 🤖 Agentní režim (nástroje)

AI umí sama rozhodnout, že potřebuje nástroj – aplikace ho provede a vrátí jí výsledek:

| Nástroj | Co dělá |
|---|---|
| `[AKCE:OBRAZEK]` | vygeneruje obrázek (Nano Banana / Gemini Image) |
| `[AKCE:WEB]` | přečte text libovolné webové stránky |
| `[AKCE:HLEDEJ]` | meta-hledání přes více vyhledávačů (DuckDuckGo, fóra, sociální sítě) |
| `[AKCE:KOD]` | spustí JavaScript v bezpečném sandboxu (výpočty, skripty) |
| `[AKCE:HUDBA]` | složí a přehraje skladbu (stáhneš jako .wav) |
| `[AKCE:TIM]` | včelí úl – 4 AI boti zpracují úkol paralelně, královna shrne |
| `[AKCE:SOUBOR:]` | vytvoří soubor ke stažení |

Kód v chatu spustíš i ručně tlačítkem **▶️ Spustit** (JS) nebo **👁 Náhled** (HTML).

---
Vytvořeno v Arena Agent Mode 🤍
