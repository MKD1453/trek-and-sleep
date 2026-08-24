# Trek & Sleep V3.6.4 — Modal-Manager Root-Cause Fix

V3.6.4 enthält keinen neuen Funktionsumfang.

## Behobene Ursache
In V3.6.2/V3.6.3 enthielt der zentrale Modal-Manager versehentlich:

    function showAppModal() {
      ...
      showAppModal();
      ...
    }

Dadurch rief sich `showAppModal()` beim Öffnen eines Fensters rekursiv selbst auf.
Safari lief in einen Stack-Overflow. Funktionen, die ein Modal öffnen, konnten
deshalb nicht oder nur fehlerhaft reagieren.

V3.6.4 ersetzt diesen Aufruf wieder durch:

    modal.classList.remove('hidden');

## Nicht verändert
- Simulatorlogik
- Jagd-Radar
- Navigation
- Track-Aufzeichnung
- Etappen
- Assistenz
- Sprachansagen
- Kartenlogik
- obere Aktionsleiste

Diese Version korrigiert gezielt nur den nachgewiesenen Modal-Manager-Fehler.
