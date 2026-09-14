// KIDZCUP E-Mail-Backend
//
// Ein winziger Server mit genau einem Zweck: Wenn die KIDZCUP-App ein Ereignis meldet
// (Zahlung bestätigt, abgelehnt, Erinnerung, Warteliste-Aufnahme), verschickt dieser
// Server automatisch eine E-Mail über den Anbieter Resend (https://resend.com).
//
// Warum überhaupt ein eigener Server?
// Ein API-Schlüssel für den Mail-Versand darf NIEMALS im Browser-Code der App stehen,
// weil ihn dort jede Person einsehen und missbrauchen könnte. Deshalb läuft der Versand
// hier auf einem Server, den nur du kontrollierst.
//
// ---- Einrichtung in Kürze ----
// 1. `npm install` in diesem Ordner ausführen.
// 2. Bei https://resend.com kostenlos registrieren, eine (verifizierte) Absenderadresse
//    einrichten und einen API-Key erzeugen.
// 3. Die Datei .env.example zu .env kopieren und die Werte eintragen.
// 4. Lokal testen: `npm start` (läuft dann z. B. auf http://localhost:3000/webhook).
// 5. Für den echten Betrieb irgendwo hosten, z. B. Render.com, Railway.app oder Fly.io
//    (alle haben kostenlose/günstige Einstiegspläne für so einen kleinen Dienst).
// 6. Die öffentliche URL (z. B. https://dein-service.onrender.com/webhook) in der
//    KIDZCUP-App bei der Konstante E_MAIL_WEBHOOK_URL eintragen, WEBHOOK_SECRET ebenso
//    bei E_MAIL_WEBHOOK_SECRET in der App hinterlegen.

const express = require("express");

const PORT = process.env.PORT || 3000;
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FROM_EMAIL = process.env.FROM_EMAIL || "KIDZCUP <turniere@deine-domain.de>";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ""; // eure eigene Adresse, für "neue Anmeldung"-Benachrichtigungen

const app = express();
app.use(express.json());

// CORS: erlaubt der KIDZCUP-App (läuft auf einer anderen Domain als dieser Server),
// diesen Server per fetch() aufzurufen. Ohne das blockiert der Browser die Anfrage
// stillschweigend, noch bevor sie hier überhaupt ankommt.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-Webhook-Secret");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

function pruefeSecret(req, res, next) {
  if (!WEBHOOK_SECRET) return next(); // kein Secret gesetzt -> keine Prüfung (nur für lokale Tests empfohlen)
  if (req.header("X-Webhook-Secret") !== WEBHOOK_SECRET) {
    return res.status(401).json({ fehler: "Ungültiges oder fehlendes Webhook-Secret." });
  }
  next();
}

function formatDatumZeit(ts) {
  if (!ts) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(ts));
}

// Fügt Leerzeichen alle 4 Zeichen ein, damit die IBAN wie gewohnt lesbar dargestellt wird.
function formatIban(iban) {
  if (!iban) return "";
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

// Baut den Zahlungsabschnitt einer Mail: Link (falls vorhanden) + Bankverbindung (falls hinterlegt).
function bauZahlungshinweis(anmeldung, turnier) {
  const zahlLinkZeile = turnier?.zahlLink ? `Zahlungslink:\n${turnier.zahlLink}\n\n` : "";
  const bankZeile = turnier?.iban
    ? `Alternativ per Überweisung:\nIBAN: ${formatIban(turnier.iban)}\n${turnier.kontoinhaber ? `Kontoinhaber: ${turnier.kontoinhaber}\n` : ""}Verwendungszweck: ${anmeldung.verein} – ${turnier?.name}\n\n`
    : "";
  return zahlLinkZeile || bankZeile ? `${zahlLinkZeile}${bankZeile}` : "(Zahlungsmöglichkeit beim Veranstalter erfragen)\n\n";
}

// Muss inhaltlich zu den Vorlagen in der App (mailVorlage) passen.
function baueMail(ereignis, anmeldung, turnier) {
  const frist = anmeldung.frist ? formatDatumZeit(anmeldung.frist) : "";
  const termin = turnier ? `${turnier.datum} in ${turnier.ort}` : "";
  const gruss = "Sportliche Grüße\nDein KIDZCUP-Team";

  const vorlagen = {
    angenommen: {
      betreff: `Anmeldung angenommen – jetzt Startgebühr zahlen (${turnier?.name || "KIDZCUP"})`,
      text:
        `Hallo ${anmeldung.trainer || ""},\n\n` +
        `eure Anmeldung von ${anmeldung.verein} für "${turnier?.name}" (${termin}) wurde angenommen.\n\n` +
        `Bitte zahlt die Startgebühr von ${turnier?.preis} € bis spätestens ${frist}.\n\n` +
        bauZahlungshinweis(anmeldung, turnier) +
        `Ohne fristgerechte Zahlung können wir die Teilnahme leider nicht bestätigen.\n\n${gruss}`,
    },
    erinnerung: {
      betreff: `Erinnerung: Zahlung für ${turnier?.name || "euer Turnier"} noch offen`,
      text:
        `Hallo ${anmeldung.trainer || ""},\n\n` +
        `eure Anmeldung von ${anmeldung.verein} für "${turnier?.name}" (${termin}) ist noch nicht bestätigt, ` +
        `da die Startgebühr von ${turnier?.preis} € bisher nicht bei uns eingegangen ist.\n\n` +
        `Bitte zahlt bis spätestens ${frist}.\n\n` +
        bauZahlungshinweis(anmeldung, turnier) +
        `Ohne fristgerechte Zahlung können wir die Teilnahme leider nicht bestätigen.\n\n${gruss}`,
    },
    bestaetigung: {
      betreff: `Teilnahme bestätigt – ${turnier?.name || "KIDZCUP"}`,
      text:
        `Hallo ${anmeldung.trainer || ""},\n\n` +
        `${anmeldung.gebuehrenfrei ? "eure Mannschaft ist von der Startgebühr befreit, ihr müsst nichts bezahlen" : "eure Zahlung ist bei uns eingegangen"} – die Teilnahme von ${anmeldung.verein} (Jahrgang ${anmeldung.jahrgang}, ${anmeldung.jugend}) ` +
        `am Turnier "${turnier?.name}" am ${termin} steht damit fest.\n\nWir freuen uns auf euch!\n\n${gruss}`,
    },
    ablehnung: {
      betreff: `Zahlung nicht bestätigt – ${turnier?.name || "KIDZCUP"}`,
      text:
        `Hallo ${anmeldung.trainer || ""},\n\n` +
        `leider konnten wir die gemeldete Zahlung für "${turnier?.name}" (${anmeldung.verein}) nicht zuordnen bzw. bestätigen.\n\n` +
        `Bitte meldet euch kurz bei uns, damit wir das gemeinsam klären können.\n\n${gruss}`,
    },
    warteliste_aufnahme: {
      betreff: `Platz frei geworden – ${turnier?.name || "KIDZCUP"}`,
      text:
        `Hallo ${anmeldung.trainer || ""},\n\n` +
        `gute Neuigkeiten: Für "${turnier?.name}" (${termin}) ist ein Platz frei geworden und eure Mannschaft ${anmeldung.verein} ` +
        `rückt von der Warteliste ins Turnier nach.\n\n` +
        `Bitte zahlt die Startgebühr von ${turnier?.preis} € bis spätestens ${frist}.\n\n` +
        bauZahlungshinweis(anmeldung, turnier) +
        `Ohne fristgerechte Zahlung wird der Platz erneut freigegeben.\n\n${gruss}`,
    },
    // Anders als die übrigen Vorlagen geht diese an EUCH (den Veranstalter), nicht an den Verein.
    neue_anmeldung: {
      betreff: `Neue Anmeldung: ${anmeldung.verein} – ${turnier?.name || "KIDZCUP"}`,
      text:
        `Neue Turnieranmeldung eingegangen:\n\n` +
        `Turnier: ${turnier?.name || "-"} (${termin})\n` +
        `Verein: ${anmeldung.verein}\n` +
        `Trainer: ${anmeldung.trainer}\n` +
        `Jahrgang/Jugend: ${anmeldung.jahrgang} / ${anmeldung.jugend}\n` +
        `E-Mail: ${anmeldung.email}\n` +
        `Telefon: ${anmeldung.telefon}\n` +
        `Status: ${anmeldung.status === "warteliste" ? "Warteliste" : "Ausstehend (Zahlungsfrist " + frist + ")"}\n\n` +
        `Anmeldecode: ${anmeldung.id}`,
    },
  };

  return vorlagen[ereignis] || null;
}

// Für die meisten Ereignisse ist der Verein der Empfänger, bei "neue_anmeldung" seid ihr es selbst.
function empfaengerFuer(ereignis, anmeldung) {
  if (ereignis === "neue_anmeldung") return ADMIN_EMAIL;
  return anmeldung.email;
}

app.post("/webhook", pruefeSecret, async (req, res) => {
  const { ereignis, anmeldung, turnier } = req.body || {};

  if (!ereignis || !anmeldung) {
    return res.status(400).json({ fehler: "ereignis und anmeldung sind erforderlich." });
  }

  const mail = baueMail(ereignis, anmeldung, turnier);
  if (!mail) {
    return res.status(400).json({ fehler: `Unbekanntes Ereignis: ${ereignis}` });
  }

  const empfaenger = empfaengerFuer(ereignis, anmeldung);
  if (!empfaenger) {
    return res.status(400).json({ fehler: ereignis === "neue_anmeldung" ? "ADMIN_EMAIL ist nicht gesetzt." : "anmeldung.email fehlt." });
  }

  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY fehlt – E-Mail wird nur geloggt, nicht verschickt:", mail);
    return res.status(200).json({ status: "nur_geloggt", grund: "RESEND_API_KEY nicht gesetzt" });
  }

  try {
    const antwort = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [empfaenger],
        subject: mail.betreff,
        text: mail.text,
      }),
    });

    if (!antwort.ok) {
      const fehlertext = await antwort.text();
      console.error("Resend-Fehler:", antwort.status, fehlertext);
      return res.status(502).json({ fehler: "Mailversand fehlgeschlagen", details: fehlertext });
    }

    return res.status(200).json({ status: "gesendet" });
  } catch (e) {
    console.error("Fehler beim Mailversand:", e);
    return res.status(500).json({ fehler: "Interner Fehler beim Mailversand" });
  }
});

app.get("/", (req, res) => {
  res.send("KIDZCUP E-Mail-Backend läuft. Endpunkt: POST /webhook");
});

app.listen(PORT, () => {
  console.log(`KIDZCUP E-Mail-Backend läuft auf Port ${PORT}`);
});
