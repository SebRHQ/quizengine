# 📜 Arany János Irodalmi Kvíz

Egy interaktív, valós idejű kvíz alkalmazás, amelyet előadásokhoz, tanórákhoz vagy rendezvényekhez terveztek. A résztvevők a saját telefonjukon csatlakoznak, míg az előadó egy központi Dashboardon vezérli a játékot.

## ✨ Funkciók

*   **🚀 Valós idejű játék:** A kérdések egyszerre jelennek meg mindenkinél.
*   **📱 Mobilbarát:** Reszponzív, "vintage/papír" stílusú felület.
*   **🏆 Élő Eredményhirdetés:** Dobogó animációval és konfetti esővel.
*   **🛠️ Config Editor:** Kérdések és szövegek szerkesztése grafikus felületen (`/config.html`).
*   **🔄 Session Kezelés:** Automatikus újratöltés és "reset" új csoportok számára.
*   **🛡️ Moderáció:** Játékosok eltávolítása (Kick) és jelszóval védett admin felület.
*   **💾 Biztonságos Config:** YAML alapú konfiguráció, jelszóvédelemmel.

## 🚀 Telepítés és Indítás

Előfeltétel: [Node.js](https://nodejs.org/) telepítése.

1.  **Klónozd le a repót:**
    ```bash
    git clone https://github.com/SebRHQ/quizengine.git
    cd quizengine
    ```

2.  **Telepítsd a függőségeket:**
    ```bash
    npm install
    ```

3.  **Indítsd el a szervert:**
    ```bash
    node server.js
    ```

4.  **Nyisd meg a böngészőben:**
    *   **Játékosoknak:** `http://localhost:3000` (vagy ngrok link)
    *   **Dashboard:** `http://localhost:3000/dashboard.html`
    *   **Config Editor:** `http://localhost:3000/config.html`

**Admin Jelszó:** Alapértelmezetten `admin` (a `config.yml`-ben vagy a Config Editorban módosítható).

## 🌐 Publikálás (Internetre)

Hogy a résztvevők mobilnetről is elérjék, használd az [ngrok](https://ngrok.com/)-ot:

1.  Indítsd el a szervert (`node server.js`).
2.  Egy másik terminálban: `ngrok http 3000`.
3.  A kapott linkből generálj QR kódot a Dashboardon található gombbal.

## 🛠️ Technológia

*   **Backend:** Node.js, Express
*   **Frontend:** HTML5, CSS3 (Flexbox/Grid), JavaScript (Vanilla)
*   **Animációk:** GSAP (GreenSock Animation Platform)
*   **Adatkezelés:** YAML (konfiguráció), JSON (sessionök)

## 📝 Licensz

MIT
