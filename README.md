# Trek & Sleep V3.6.3 — obere Aktionsleiste

Reiner UI-Stabilitätsfix auf Basis von V3.6.2.

## Änderungen
- Versionsanzeige korrigiert (kein versehentliches V3.6.2.2 mehr).
- Header und horizontale Aktionsleiste besitzen eine eigene Stacking-Ebene über Karte, Leaflet und Tour-Drawer.
- `main` ist eine abgeschlossene niedrigere Stacking-Ebene, sodass Karten-/Drawer-Layer nicht mehr unsichtbar über die obere Leiste ragen können.
- Buttons der Aktionsleiste erhalten explizite Pointer-/Touch-Freigabe für Safari.
- zentrale Backup-Bindung stellt einen Funktionsbutton wieder her, falls sein normaler `onclick` verloren geht.
- Simulator, Jagd, Navigation, Track und Modal-Logik wurden inhaltlich nicht verändert.

## Test
Die horizontale Leiste nach rechts scrollen und nacheinander Tour planen, Punkte planen, Profil, Tour-Check, Cockpit, Trail, Etappen, Assistenz, Live, Simulator, Track und Jagd öffnen.
