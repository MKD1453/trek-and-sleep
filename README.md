# Trek & Sleep V3.3.1

## Neuer großer Schritt: Tour-Aufzeichnung
- tatsächlichen gelaufenen Track mitschreiben
- funktioniert mit echtem GPS und Navigations-Simulator
- aufgezeichnete Distanz
- Bewegungszeit
- Durchschnittsgeschwindigkeit
- maximale Abweichung von der geplanten GPX-Strecke
- Aufzeichnung pausieren und fortsetzen
- abgeschlossene Touren lokal speichern
- gespeicherten Track als GPX exportieren
- laufende Aufzeichnung wird lokal zwischengespeichert
- kompaktes REC-HUD während der Navigation

## Bestehende Navigation
Die stabile V3.2.4-Kurvenlogik bleibt unverändert erhalten:
- automatische Abbiegehinweise
- Hysterese gegen Flackern
- Simulator
- Ton, Vibration und Sprache
- Routenabweichungs-Hilfe
- Offline-Tourdaten
- Höhenprofil und Etappen


## V3.3.1 Fix
- „Beenden & speichern“ speichert die Aufzeichnung zuerst verifiziert in der lokalen Historie.
- Erst nach erfolgreicher Speicherung wird der aktive Track zurückgesetzt.
- Das Aufzeichnungsfenster aktualisiert sich sofort nach dem Speichern.
- Doppelklicks während des Speicherns werden blockiert.
- Falls localStorage fehlschlägt, bleibt die fertige Aufzeichnung im Speicher erhalten und wird nicht verworfen.
