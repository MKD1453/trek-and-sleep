# Trek & Sleep V3.1.1

## Fix gegenüber V3.1
Die Abbiegeleiste aus V3.0/V3.1 wird jetzt strikt unterdrückt, solange die App im
Vor-Tour-/Anreisemodus ist.

Ein Hinweis wie „Rechts abbiegen – 25 m“ darf erst erscheinen, wenn:
- die Navigation wirklich aktiv ist,
- der Live-Modus aktiv ist,
- eine gültige GPS-Position vorliegt,
- eine belastbare Zuordnung zur GPX-Route möglich ist,
- und der nächste Richtungswechsel nah genug ist.

Zusätzlich wird die Leiste beim Rendern des Vor-Tour-Status sofort ausgeblendet.

Alle Funktionen aus V3.1 bleiben erhalten.
