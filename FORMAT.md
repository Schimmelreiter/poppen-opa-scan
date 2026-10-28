# Gemeinsame Ablage „opa-gemeinsam“ – Formatdefinition

Diese Ablage teilen sich alle Opa-Scan-Skripte (poppen.de, JOYclub, künftig weitere). Sie liegt als IndexedDB
`opa-gemeinsam` auf `schimmelreiter.github.io` und wird nur im unsichtbaren Briefkasten-Rahmen
(`briefkasten.html`) geöffnet. Keine der Plattform-Seiten kann sie lesen.

## Grundregeln (robust gegen künftige Änderungen)

1. **Formatversion:** In `meta` steht der Eintrag `{ k: "schema", schema, minRead }`.
   - `schema` ist die höchste bekannte Formatversion. Ein Skript erhöht sie, wenn es Neues schreibt, und senkt sie nie.
   - `minRead` ist die kleinste Version, die ein Skript verstehen muss, um überhaupt zu lesen. Sie wird nur bei
     grundlegenden Umbauten erhöht. Ein Skript mit kleinerer Version schreibt dann nicht mehr und zeigt einen Hinweis.
2. **Nur hinzufügen, nie umdeuten:** Ein Feld behält für immer seine Bedeutung. Wer etwas grundlegend ändert,
   legt ein neues Feld an.
3. **Unbekanntes mitführen:** Ein Skript liest die Felder, die es kennt. Beim Zurückschreiben übernimmt es den
   ganzen Eintrag mit allen unbekannten Feldern unverändert. Kein Skript baut einen Eintrag „neu“ zusammen.
4. **Aufzählungswerte sind feste Codes.** Unbekannte Codes werden als „unbekannt“ angezeigt und unverändert gelassen.
5. **Weggefallene Felder** bleiben unten als „veraltet“ stehen. Nach einer Übergangszeit werden sie durch den
   angegebenen Ersatzwert ersetzt (leer, 0 bzw. „unbekannt“). Ältere Skripte stolpern so nicht darüber.
6. **Plattformbezogenes** steht in Untergruppen je Plattform (`profiles[].pf`, `ich[].pf`, künftig z. B. `joy: {…}`).

## Versionierte Einträge (fick, tpl)

Jeder Eintrag trägt:

| Feld | Bedeutung |
|---|---|
| `id` | stabil, unabhängig von der Plattform (poppen: `p:<uid>`, frei: `x:<zufall>`) |
| `rev` | Versionszähler, wird bei jedem Schreiben um 1 erhöht |
| `updatedAt` | Zeitpunkt der letzten Änderung (ms) |
| `updatedBy` | `{ pf, ver, acc }`: Plattform, Skriptversion, Account |
| `deleted` | `true` = gelöscht (Löschmarke statt echtem Löschen, damit andere Skripte es mitbekommen) |

**Schreiben mit Versionsprüfung:** Lesen und Schreiben passieren in *einer* IndexedDB-Transaktion. Der Schreiber
gibt die Version an, die er gelesen hat (`expect`; `null` für „neu“).
- Stimmt sie, wird geschrieben: `rev + 1`, `updatedAt`, `updatedBy`.
- Stimmt sie nicht, wird **nicht** geschrieben, und der Schreiber bekommt den aktuellen Stand zurück.
  Er mischt seine Änderung darauf (Fickliste: `mergeFick`) und versucht es mit dem neuen `rev` erneut.
  Gleichzeitige Schreiber verlieren so nichts.

**Benachrichtigung:** Nach jedem Schreiben sendet der Briefkasten-Rahmen `BroadcastChannel("opa-gemeinsam")`
die Nachricht `{ store, at, by }`. Alle Rahmen (auch die des anderen Skripts) erfahren so von der Änderung und
lesen neu.

## Ablagen

### `meta` (Schlüssel `k`)
| `k` | Inhalt |
|---|---|
| `schema` | `{ schema, minRead }` |
| `poppen_dbk` | Schlüssel der verschlüsselten poppen-Datenbank (für eine Neuinstallation) |
| `poppen_gm` | `{ at, ver, data }`: Kopie der Einstellungen und kleinen Listen des poppen-Skripts |
| `<plattform>_…` | dasselbe für andere Skripte, je mit eigenem Präfix |

### `ich` (Schlüssel `id = "<pf>:<uid>"`)
Die eigenen Profile. Jedes Skript, das in die Fickliste schreibt, trägt sich beim Start selbst ein:
`{ id, pf, uid, nick, url, at }`. Beim Import einer fremden Fickliste ist man „der Fick“, wenn ein Partner-Eintrag
eines dieser Profile enthält (ID, Nick oder Link).

### `fick` – gemeinsame Fickliste
Eine Person je Eintrag:

| Feld | Bedeutung |
|---|---|
| `status` | `null` · `"want"` (Will ich) · `"done"` (Gefickt) · `"no"` (Nein, danke!) · `"never"` (Nie wieder!) |
| `statusAt` | Zeitpunkt der Statusänderung |
| `main` | Hauptprofil `{ pf, uid, nick, url? }` |
| `profiles[]` | weitere Profile `{ pf, url, name, uid?, status?, statusAt?, sync?, dead? }` („Auch auf …“) |
| `meets[]` | Treffen `{ id, date: "JJJJ-MM-TT", time, where (Was), club (Wo), link, note, pf, at, imported? }` |
| `notes`, `notesAt`, `notesBy` | Anmerkungen (bis 8000 Zeichen) |
| `history[]` | `{ at, what }` |
| `ext` | Person ohne Plattform-Profil `{ name, … }` |
| `created`, `updated` | Anlage-/Änderungszeitpunkt (`updated` = veraltet, Ersatz: `updatedAt`) |

### `tpl` – gemeinsame Textvorlagen
`{ id, name, text, … }` plus die Versionsfelder. Eine Vorlage namens „Termine“ enthält Termine im Format
`wann - wo - was - Link` (eine Zeile je Termin).

### `arch`
Reserviert für ein gemeinsames Profil-Archiv. Das poppen-Skript führt sein Archiv derzeit verschlüsselt lokal.

## Änderungsliste
| schema | Änderung |
|---|---|
| 1 | erste Fassung (poppen 2.32) |
