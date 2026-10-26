# Opa-Schutz Helfer (Werte-Erfassung)

Eigenständiges Hilfs-Userscript, **getrennt** vom Hauptscript. Es erfasst einmalig die
Code→Klartext-Zuordnung aller Profilfelder (für die Gruppenanfrage-Regeln) und untersucht,
ob das Alter **99** eine Sonderbedeutung hat.

## Nutzung
1. Im Hauptscript **„Alle Daten sichern"** (Export) erzeugen.
2. **Hauptscript deaktivieren** (der Helfer hat einen eigenen Rekorder).
3. Diesen Helfer in Tampermonkey installieren, auf **poppen.de angemeldet** eine Seite öffnen.
4. Im Dialog den **Datenexport einfügen** und **Start** drücken.
5. Alles läuft vollautomatisch (oben erscheint ein rotes Lauf-Badge). Am Ende werden
   zwei Dateien heruntergeladen: die **Roh-Aufnahme** und die **fertige Zuordnung**.
6. Zur Sicherheit **in beiden Profilen** laufen lassen (männlich/weiblich), damit auch
   geschlechtsspezifische Felder erfasst werden.

Nach getaner Arbeit kann der Helfer wieder deaktiviert/entfernt werden.
