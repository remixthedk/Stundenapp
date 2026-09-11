# Stundenzettel App – John Haustechnik

## Was ist das?
Eine installierbare Web-App (PWA) zur Stundenerfassung. Läuft komplett offline,
Daten bleiben lokal auf dem jeweiligen Gerät. Jeder Mitarbeiter installiert sich
die App auf seinem Handy und exportiert am Monatsende sein eigenes PDF im
Layout eurer bisherigen Vorlage.

## Dateien
- `index.html` – die App selbst
- `app.js` – Logik (Formulare, Speicherung, Monatsansicht)
- `pdf.js` – PDF-Erzeugung im Vorlagen-Layout
- `manifest.json` / `sw.js` – machen die App installierbar & offline-fähig
- `icon-192.png` / `icon-512.png` – App-Icon

## Hosten (einmalig, z.B. mit GitHub Pages – kostenlos)
1. Kostenloses GitHub-Konto anlegen (falls nicht vorhanden)
2. Neues Repository erstellen, z.B. `stundenzettel`
3. Alle Dateien aus diesem Ordner hochladen (Drag & Drop reicht im Browser)
4. Unter „Settings" → „Pages" → Branch `main` auswählen → Speichern
5. Nach ca. 1 Minute ist die App unter `https://DEINNAME.github.io/stundenzettel/` erreichbar

Alternativ: eigener Webspace / Subdomain – einfach alle Dateien dort ablegen.

## Installation auf dem Handy (jeder Mitarbeiter einmalig)
1. Link im Handy-Browser öffnen (Chrome/Safari)
2. Menü → „Zum Startbildschirm hinzufügen" bzw. „App installieren"
3. Danach öffnet sich die App wie eine normale App – auch ohne Internet

## Wichtig für den ersten Start
Jeder Mitarbeiter trägt einmalig in den Einstellungen (⚙-Symbol oben rechts)
seinen Namen, seine Adresse und ggf. abweichende Standard-Arbeitszeiten ein.

## Update später
Falls Anpassungen gewünscht sind: Dateien einfach im gleichen Repository/Webspace
ersetzen. Für bereits installierte Apps empfiehlt sich danach ein Neuladen der Seite.
