# Trek & Sleep V3.6.0 — Clean Rebuild

Dieser Build wurde ausschließlich aus dem auf dem iPhone zuvor erfolgreich getesteten
V3.4.1-Stand erstellt. Es wurde kein Code aus V3.5.x oder den späteren fehlerhaften
V3.6.x-Patches übernommen.

## Enthalten
- Karte / GPX / POIs
- Tour- und Punkteplanung
- Etappen
- Navigationsassistenz
- Live-Navigation
- V3.2.4-Simulator
- V3.3.2-Track-Aufzeichnung und GPX-Export
- V3.4.1-Jagdcenter

## Bewusst nicht übernommen
- Jagd-Radar-Testzone aus V3.5.x
- spätere zentrale Modal-Manager
- UI-Watchdogs
- Pointer-/Touch-Fallback-Kaskaden
- spätere Simulator-Patches

## Kleine Bereinigungen
- Jagd-Button besitzt nur noch eine Event-Bindung statt Fallback + Hauptbindung.
- komplett neue Service-Worker-Cache-Namen
- App-Dateien werden online network-first geladen; offline erfolgt Cache-Fallback.

## Testreihenfolge
Zuerst ohne Simulator: Tour planen, Punkte planen, Etappen, Assistenz, Live, Track, Jagd.
Danach Simulator: Start, Pause, ±100 m, nächster Hinweis, mehrere Kurven.
Erst danach Fenster während laufender Simulation öffnen.
