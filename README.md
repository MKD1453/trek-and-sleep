# Trek & Sleep V2.7 — korrigierte Ausgabe

Diese Datei ersetzt die zuvor fehlerhafte V2.7. Es ist bewusst KEINE neue Versionsnummer.

Behoben:
- fehlende GPS-/Navigations-Hilfsfunktionen wiederhergestellt
- App-Initialisierung läuft wieder bis `bind()`
- GPX-, GPS-, Planungs-, Profil- und Tour-Check-Buttons werden wieder gebunden
- zentrale Zustände GPS → Anreise → Live-Navigation bleiben erhalten
- einheitliche Distanzfunktion aus V2.7 bleibt erhalten
- NaN/Infinity-Schutz bleibt erhalten

Prüfungen:
- JavaScript-Syntaxcheck
- alle benötigten Navigationsfunktionen genau einmal vorhanden
- alle wichtigen UI-Elemente vorhanden
- alle wichtigen onclick/onchange-Bindungen vorhanden
- nur eine haversineKm-Distanzfunktion vorhanden
