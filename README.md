# Trek & Sleep V3.3.2

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


## V3.3.2 Fix
- „Beenden & speichern“ speichert die Aufzeichnung zuerst verifiziert in der lokalen Historie.
- Erst nach erfolgreicher Speicherung wird der aktive Track zurückgesetzt.
- Das Aufzeichnungsfenster aktualisiert sich sofort nach dem Speichern.
- Doppelklicks während des Speicherns werden blockiert.
- Falls localStorage fehlschlägt, bleibt die fertige Aufzeichnung im Speicher erhalten und wird nicht verworfen.


## V3.3.2 – Speicher-Fix
- Ursache behoben: Beim Speichern wurde auf eine nicht vorhandene Variable `currentRoute` zugegriffen.
- Der Tourname wird jetzt aus dem tatsächlich vorhandenen `#routeName` gelesen.
- „Speichere …“ kann bei einem JavaScript-Fehler nicht mehr dauerhaft hängen bleiben.
- Erfolgreiche Speicherung zeigt kurz „✓ Tour gespeichert“.
- Bei einem Speicherfehler bleibt die Aufzeichnung für einen erneuten Versuch erhalten.
- Trackpunkte werden vor dem Speichern auf einfache, JSON-sichere Zahlenwerte reduziert.
