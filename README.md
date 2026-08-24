# Trek & Sleep V3.6 — Stabilitätsrelease

V3.6 fügt bewusst keine neue Nutzerfunktion hinzu. Ziel ist, die bereits getesteten
Funktionen wieder gemeinsam stabil zu betreiben.

## Stabilitätsumbau
- Simulator läuft nach „Start“ im Hintergrund; das Simulatorfenster blockiert dadurch
  nicht mehr Jagd, Live-Navigation, Track oder andere Hauptbuttons.
- nur ein aktiver requestAnimationFrame für den Simulator
- zentraler Modal-Manager für Öffnen/Schließen
- keine globalen Touch-/Pointer-Capture-Listener am Modal
- Jagd-Button nur einmal gebunden
- Sprach-AN/AUS ändert den Zustand ohne das Fenster neu aufzubauen
- versteckte Modals können keine Touch-Eingaben abfangen
- Navigation, Jagd-Radar und Track bleiben funktional getrennt

## Regressionstest V3.6
### Simulator
- Start / Hintergrundlauf
- Pause / Weiter
- +100 m / -100 m
- nächster Hinweis
- mehrere Kurven / lange Kurven
- Ziel / Reset

### Live
- öffnen
- Sprachansage AN/AUS
- Testansage
- nächster Hinweis AN/AUS
- X / Fertig / Hintergrund schließen

### Jagd
- Jagdcenter öffnen/schließen
- TEST-Jagdzone an/aus
- Entfernung zur Testzone
- Eintritt / Verlassen
- keine Blockade anderer Buttons

### Track
- Start / Pause / Weiter
- Beenden & speichern
- gespeicherte Aufzeichnung sichtbar
- GPX exportieren

Neue Features kommen erst nach bestandenem Stabilitätstest.
