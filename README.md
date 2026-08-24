# Trek & Sleep V3.5.2

## Jagd & Sicherheit
V3.5.2 ergänzt die Tourwarnungen um ein standort- und datumsbezogenes Jagdmodul.

### Rheinland-Pfalz
- Tourregion wird aus der geladenen GPX-Route erkannt.
- Hinterlegte Jagdzeiten nach § 42 Landesjagdverordnung.
- Jede Wildart zeigt dynamisch „Jagdzeit“ oder „Schonzeit“.
- Anzahl aktuell offener Jagdzeiten wird berechnet.
- Pfälzerwald wird innerhalb von Rheinland-Pfalz separat benannt.

### Dämmerung
- Sonnenaufgang und Sonnenuntergang werden näherungsweise für die Tourposition berechnet.
- 90 Minuten vor bzw. rund um Sonnenauf-/untergang wird ein erhöhter Sicherheitshinweis gezeigt.

### Lokale Drückjagden / Sperrungen
V3.5.2 erfindet bewusst keine lokalen Echtzeitjagden.
Solange keine bestätigte offizielle lokale Meldung geladen ist, steht ausdrücklich:
„Keine bestätigte lokale Bewegungsjagd geladen“.

Kurzfristige Sperrungen, Beschilderung und Anweisungen vor Ort haben Vorrang.

### Weiterhin enthalten
- stabile V3.2.4 Live-Navigation und Simulator
- V3.3.2 Tour-Aufzeichnung und GPX-Export
- Offline-Daten
- POIs, Warncenter, Rechts-Layer, Höhenprofil und Etappen


## V3.5.2 – Jagdcenter-Fix
- Jagd-Button erhält einen eigenen robusten `addEventListener`.
- zusätzlicher Safari-Fallback nach vollständiger App-Initialisierung
- Tourmittelpunkt unterstützt Array- und Objektkoordinaten
- Fehler in Regions-/Dämmerungsberechnung können das Fenster nicht mehr still blockieren
- falls das Jagdcenter intern scheitert, erscheint eine sichtbare Fehlermeldung mit „Erneut laden“
- Navigation, Simulator und Track-Aufzeichnung wurden nicht verändert


## V3.5.2 – Jagd-Radar / Sicherheitslage
- vier Warnstufen: Rot, Orange, Gelb, Grün
- gelb = gesetzliche Jagdzeit aktiv, aber keine konkrete lokale Jagd bestätigt
- klar gekennzeichneter Simulator-Testbereich „TEST – Jagd/Sperrung“
- Testmodus standardmäßig aus und manuell aktivierbar
- simulierte Sperrzone wird auf der Karte markiert
- Entfernung zur Testzone zählt entlang der GPX-Route herunter
- Warnsignal beim Annähern (500 m), kurz davor (150 m) und beim Betreten
- Kartenfokus auf Testbereich
- Sicherheits-HUD in der Touransicht
- Quelle und Aktualitätsangabe in jeder Sicherheitslage
- keine simulierte Testwarnung wird als reale Jagdmeldung bezeichnet
- bestehende Navigation, Simulator und Track-Aufzeichnung bleiben erhalten


## V3.5.2 – Simulator ±100-m-Fix
- `−100 m` und `+100 m` arbeiten wieder als atomare manuelle Sprünge.
- Eine laufende Animation wird für den Sprung kurz angehalten und danach automatisch fortgesetzt.
- Navigation und Jagd-Radar werden nach dem Sprung synchron aktualisiert.
- Pause, Zurücksetzen und „Zum nächsten Hinweis“ bleiben unverändert.


## V3.5.2 – Live-Navigation / iPhone-Fix
- X-Schließen im Modal bekommt robuste Click- und Touch-Bindung.
- Modal-Schließen wird zentral behandelt.
- Sprachansagen-Schalter ist als komplette tappbare Zeile umgesetzt.
- Sprachansagen werden beim Einschalten direkt über eine echte Nutzeraktion für iOS/Safari aktiviert.
- „Sprachansage testen“ ist jetzt auch im Vor-Tour-Modus verfügbar.
- deutsche Systemstimme wird bevorzugt, wenn Safari sie liefert.
- `speechSynthesis.resume()` wird vor der Ansage aufgerufen.
- bestehende Simulator-, Jagd-Radar- und Navigationslogik wurde nicht verändert.
