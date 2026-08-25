# Trek & Sleep V3.6.0.1 — Clean Maintenance Fix

Basis bleibt der V3.4.1-Clean-Rebuild. Keine V3.5/V3.6-Patcharchitektur wurde übernommen.

Gezielt behoben:
- Etappen öffnen auch ohne Höhenprofil; fehlende Höhe wird als „—“ angezeigt.
- Safari-AudioContext wird beim Test aus dem Fingertipp heraus resumed.
- Sprachtest nutzt speechSynthesis direkt aus dem Fingertipp und kann unabhängig vom AN/AUS-Zustand getestet werden.
- Live-HUD und Jagd-HUD werden nicht mehr alle 2/5 Sekunden blind per outerHTML ersetzt; DOM wird nur bei tatsächlicher Änderung aktualisiert.

Nicht verändert:
- Simulatorlogik
- Track-Aufzeichnung
- Jagdcenter-Berechnung
- Tour-/Punkteplanung
- Modal-System
