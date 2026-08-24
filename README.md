# Trek & Sleep V3.6.2 — UI-Stabilitätsfix

Diese Version enthält bewusst keine neuen Features.

## Behobener Fehlerkomplex
- Simulator führt die komplette Navigations-/Kartenberechnung nur noch 5× pro Sekunde statt bis zu 60×.
  Dadurch bleibt Safaris Hauptthread für Touch, Buttons, Scrollen und Modals frei.
- Alle alten direkten Modal-Aufrufe wurden auf einen zentralen Modal-Manager vereinheitlicht.
- X, Hintergrund-Tipp und Herunterziehen vom oberen Rand schließen dasselbe Modal.
- Versteckte Modals können keine Eingaben abfangen.
- „Zum nächsten Hinweis“ arbeitet atomar und setzt eine laufende Simulation danach fort.
- Jagd-Testzone wird wiederhergestellt, falls Leaflet sie während anderer Kartenupdates verliert.
- Track-, Simulator- und Assistenzbuttons sind explizite `type=button`-Elemente.
- Der UI-Watchdog greift nicht mehr in einen laufenden Simulator-Timer ein.

## Pflicht-Regressionsprüfung
Während die Simulation läuft:
1. Assistenz öffnen, Einstellungen ändern, Testton, X schließen.
2. Live öffnen, Sprache AN/AUS, Testansage, Fertig/X schließen.
3. Simulator: ±100 m und „Zum nächsten Hinweis“.
4. Jagd-Testzone auf der Karte prüfen.
5. Track starten, pausieren, fortsetzen.
6. Etappen öffnen und schließen.
7. Gehgeschwindigkeit öffnen, ändern und über X bzw. Herunterziehen schließen.

Erst wenn dieser kombinierte Ablauf funktioniert, gilt V3.6.2 als stabil.
