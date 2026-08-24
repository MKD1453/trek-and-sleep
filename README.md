# Trek & Sleep V3.2.4

## Neuer Navigations-Simulator
Mit dem Simulator lässt sich eine komplette Tour zuhause testen.

- virtuelle GPS-Position auf der geladenen GPX-Route
- Simulation mit 1–8 km/h
- +100 m / −100 m manuell springen
- direkt zum nächsten Abbiegehinweis springen
- Reststrecke und virtueller Fortschritt
- 50 m / 100 m / 200 m Routenabweichung simulieren
- Abbiegewarnung testen
- Routenwarnung testen
- Sprachansage testen
- Live-HUD mit simuliertem GPS verwenden

Während der Simulator aktiv ist, überschreibt echtes GPS die Testposition nicht.

Alle Funktionen aus V3.2 bleiben erhalten.


## V3.2.4 Stabilitätsfix
- lange Kurven bleiben nicht mehr dauerhaft bei 0 m hängen
- passierte Abbiegehinweise werden endgültig als erledigt markiert
- bereits erledigte Hinweise können nicht zurückspringen
- Hysterese verhindert Flackern an weichen/langen Kurven
- der Simulator läuft auch dann weiter, wenn ein UI-Update einmal fehlschlägt
