# KIDZCUP E-Mail-Backend

Optionaler, eigenständiger Server für **vollautomatischen** E-Mail-Versand. Ohne dieses Backend
funktioniert die KIDZCUP-App trotzdem – dann öffnet sie beim Bestätigen/Ablehnen/Warteliste-Aufnehmen
einfach den E-Mail-Client des Admins mit fertiger Nachricht (der Admin klickt selbst auf Senden).

Mit diesem Backend passiert der Versand automatisch im Hintergrund, ganz ohne Klick.

## Warum ein eigener Server nötig ist

Der API-Key eines E-Mail-Anbieters darf nie im Code der Browser-App stehen – jede Person könnte ihn
sonst auslesen und in eurem Namen E-Mails verschicken. Deshalb läuft der eigentliche Versand hier,
auf einem Server, den nur ihr kontrolliert.

## Einrichtung

1. **Resend-Konto anlegen:** [resend.com](https://resend.com) – kostenloser Plan reicht für den Start.
   Eigene Absender-Domain verifizieren (Resend führt euch durch die DNS-Einträge) und einen API-Key erzeugen.
2. **Abhängigkeiten installieren:**
   ```bash
   npm install
   ```
3. **Umgebungsvariablen setzen:** `.env.example` zu `.env` kopieren und ausfüllen
   (`RESEND_API_KEY`, `FROM_EMAIL`, ein selbst ausgedachtes `WEBHOOK_SECRET`).
4. **Lokal testen:**
   ```bash
   npm start
   ```
   Der Server läuft dann unter `http://localhost:3000`, der Webhook unter `http://localhost:3000/webhook`.

## Live schalten (Hosting)

Jede Plattform, die einen Node.js-Prozess dauerhaft laufen lassen kann, funktioniert. Einfache,
günstige/kostenlose Optionen:

- **Render.com** – "New Web Service", GitHub-Repo verbinden, Umgebungsvariablen im Dashboard eintragen.
- **Railway.app** – ähnlich unkompliziert, ebenfalls über GitHub oder direkten Upload.
- **Fly.io** – etwas technischer, dafür sehr günstig im Dauerbetrieb.

Nach dem Deployment bekommt ihr eine öffentliche URL, z. B. `https://kidzcup-mail.onrender.com`.

## Die App mit dem Backend verbinden

In `kidzcup-app.jsx` ganz oben:

```js
const E_MAIL_WEBHOOK_URL = "https://kidzcup-mail.onrender.com/webhook";
const E_MAIL_WEBHOOK_SECRET = "dasselbe-secret-wie-in-der-.env";
```

Danach ruft die App bei jedem Statuswechsel zusätzlich diesen Webhook auf – **und** öffnet weiterhin
den mailto-Link als Fallback, falls der Server einmal nicht erreichbar sein sollte. Ihr verliert also
nichts, wenn der Server mal kurz down ist.

## Sicherheitshinweise

- `WEBHOOK_SECRET` unbedingt setzen, sonst kann theoretisch jede Person, die die URL errät, über euren
  Account E-Mails verschicken lassen.
- `RESEND_API_KEY` niemals ins Git-Repository committen – nur über Umgebungsvariablen setzen.
- Dieses Backend ist bewusst minimal gehalten (ein Endpunkt, eine Aufgabe). Für den echten Produktivbetrieb
  würde ich zusätzlich Rate-Limiting und Logging/Monitoring ergänzen.
