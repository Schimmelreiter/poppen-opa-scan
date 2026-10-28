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
6. **Plattformbezogenes** wird über den Plattform-Code `pf` gekennzeichnet (`profiles[].pf`, `ich[].pf`, `main.pf`).
7. **Plattform-Codes** sind immer ausgeschrieben und klein: `poppen`, `joyclub`, `xhamster`, `eronity`, `spicymatch`,
   `kaufmich`, `fetish`, `gays`, `telegram`, `whatsapp`, `threema`, `signal`, `other`. Abkürzungen wie `joy`
   gibt es nicht.

## Versionierte Einträge (fick, tpl)

Jeder Eintrag trägt:

| Feld | Bedeutung |
|---|---|
| `id` | stabil; wird nie geändert. Vergeben vom anlegenden Skript: `p:<poppen-uid>` · `j:<JOYclub-Profil-ID>` · `x:<zufall>` (Person ohne Plattform-Profil). Kommt dieselbe Person später auf einer zweiten Plattform dazu, bleibt die alte `id`; das neue Profil steht in `profiles[]`. |
| `rev` | Versionszähler, wird bei jedem Schreiben um 1 erhöht |
| `updatedAt` | Zeitpunkt der letzten Änderung (ms) |
| `updatedBy` | `{ pf, ver, acc }`: Plattform-Code, Skriptversion, Account. **Veraltet:** `{ platform, account }` (Textvorlagen bis poppen 2.32) – beim Lesen `pf || platform` und `acc || account` verwenden, geschrieben wird nur noch `pf`/`ver`/`acc`. |
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
Eine Person je Eintrag. Alle Felder sind optional außer `id`.

| Feld | Bedeutung |
|---|---|
| `status` | `null` · `"want"` (Will ich) · `"done"` (Gefickt) · `"no"` (Nein, danke!) · `"never"` (Nie wieder!) |
| `statusAt` | Zeitpunkt der Statusänderung (ms) |
| `main` | Hauptprofil `{ pf, uid, nick, url? }` (bei poppen: `uid` + `nick`; bei anderen Plattformen `url`) |
| `profiles[]` | weitere Profile („Auch auf …“), siehe unten |
| `meets[]` | Treffen, siehe unten |
| `notes`, `notesAt`, `notesBy` | Anmerkungen (bis 8000 Zeichen), Zeitpunkt, `{ pf, acc }` |
| `history[]` | `{ at, what }`: Verlauf als Klartext |
| `ext` | Person ohne Plattform-Profil: `{ name, typ, city, short, texts, img (data-URL), gone }` |
| `imported` | Herkunft beim Import (Text) |
| `created` | Anlagezeitpunkt |
| `updated` | **veraltet**, Ersatz: `updatedAt` |
| `joy.notes` | **veraltet**, Ersatz: `notes` |

**`profiles[]`**

| Feld | Bedeutung |
|---|---|
| `pf` | Plattform-Code |
| `url` | Profil-Link |
| `name` | Anzeigename/Nick |
| `uid` | Plattform-ID, falls bekannt |
| `text` | statt Link nur Text (z. B. Signal-Benutzername) |
| `pfName` | Plattformname bei `pf: "other"` |
| `status`, `statusAt` | eigener Status dieses Profils (z. B. ein Paar auf JOYclub anders als auf poppen) |
| `sync` | `true` = Status folgt dem Status der Person |
| `dead` | `true` = Profil gelöscht. **Veraltet:** `deleted`, `gone`; beim Lesen gelten alle drei, geschrieben wird nur `dead`. |

**`meets[]`**

| Feld | Bedeutung |
|---|---|
| `id` | stabil (`m<zufall>`) |
| `date`, `time` | `"JJJJ-MM-TT"`, `"HH:MM"` |
| `where` | „Was“ (Party, Anlass) |
| `club` | „Wo“ (Club, Ort) |
| `link`, `pf` | Link und dessen Plattform-Code |
| `note` | Notiz |
| `at` | Zeitpunkt des Eintragens |
| `imported` | Nick des Exporteurs, wenn aus einer fremden Fickliste übernommen |

**Felder, die das JOYclub-Skript bisher evtl. nicht kennt** (mitführen, nie entfernen): `meets[].pf`, `meets[].imported`,
`profiles[].sync`, `profiles[].dead`, `profiles[].pfName`, `profiles[].text`, `notesBy`, `ext.*`, `imported`, `history[]` und die
Versionsfelder `rev`, `updatedAt`, `updatedBy`, `deleted`.

### `tpl` – gemeinsame Textvorlagen
`{ id, name, text, … }` plus die Versionsfelder. Eine Vorlage namens „Termine“ enthält Termine im Format
`wann - wo - was - Link` (eine Zeile je Termin).

### `arch`
Reserviert für ein gemeinsames Profil-Archiv. Das poppen-Skript führt sein Archiv derzeit verschlüsselt lokal.

## Import einer fremden Fickliste – Fallliste

Gilt für beide Skripte wörtlich gleich. „Exporteur“ = `{E}` (Nick aus dem Export).

**Vorbereitung**
- Übernommen wird nur, wo man selbst „der Fick“ ist: Ein Eintrag der fremden Liste enthält eines der eigenen Profile aus `ich`
  (gleiche Plattform + gleiche ID, gleicher Nick ohne Groß/Klein oder gleicher Link).
- Steht man mehrfach in der fremden Liste, werden die Einträge zusammengefasst: Treffen vereint, Status = der höchste
  (Rangfolge `no` < `want` < `done` < `never`).
- Fremder Eintrag ohne Status, aber mit Treffen, zählt als `done`. Fremd `no` oder ohne Status und ohne Treffen → nichts tun.
- Eigener Eintrag = die Person `{E}` in der eigenen Liste (wird bei Bedarf angelegt).
- **Neue Treffen** = fremde Treffen, die es beim eigenen `{E}` noch nicht gibt (gleiches Datum + gleicher Ort/Link).
- **Termine** = zukünftige Zeilen der fremden Vorlage „Termine“ (`wann - wo - was - Link`), Links in neuem Tab.
- **Treffen-Liste** (nur wo unten genannt): je neues Treffen ein Schalter.
  - An, wenn man an dem Tag laut eigener Liste kein Treffen hat oder am selben Ort war.
  - Am selben Ort (mit einer anderen Person) zeigt die Zeile live, wie das neue Treffen mit `{E}` aussähe:
    Leere Felder werden aus dem eigenen Treffen ergänzt, Ergänzungen sind markiert. Das eigene Treffen mit der anderen
    Person bleibt unverändert.
  - War man laut eigener Liste woanders: Schalter **aus** (nicht ausgegraut), darunter rot
    „Laut Deiner Fickliste warst Du an dem Tag woanders (Ort, mit wem).“
  - Übernommene Treffen werden eigene Treffen-Datensätze mit `{E}` als Partner.

**Knopf-Sätze**
- **K4:** [Ja, gerne wieder] → Treffen laut Schaltern + Status `done` · [Ja, einmal ist keinmal] → Treffen + `never` ·
  [Im Leben nicht] → keine Treffen, Status `no` · [Stimmt nicht] → nichts.

| Fall | Eigen | Fremd | Titel | Untertitel | Inhalt | Knöpfe → Wirkung |
|---|---|---|---|---|---|---|
| A | kein Status / nicht in der Liste | want | „{E} will Dich ficken! 😁“ | „Du hast {E} noch nicht in Deiner Fickliste.“ | Termine: „Hier hättet Ihr die Gelegenheit dazu:“ | [Will ich auch!] → `want` · [Nein, danke!] → `no` · [Mal sehen] → nichts |
| — | want | want | **„{E} will Dich auch ficken! 😁“** (fett) | – | Termine: „Hier hättet Ihr die Gelegenheit dazu:“ | [OK] |
| C1 | done | want | „{E} will Dich ficken! 😁“ | „Ihr hattet laut Deiner Fickliste schon das Vergnügen – {E} hat es offenbar noch nicht eingetragen.“ | Termine: „Hier hättet Ihr erneut die Gelegenheit dazu:“ | [OK] |
| C2 | never | want | „{E} will Dich ficken! 😳“ | „... aber eine Wiederholung ist eigentlich überflüssig.“ | Termine: „Hier hättet Ihr erneut die Gelegenheit dazu:“ | [OK] |
| E | no | want | „{E} will Dich ficken! 😳“ | „... das beruht nicht auf Gegenseitigkeit.“ | Termine: „Hier hättet Ihr die Gelegenheit dazu:“ | [Doch, will ich!] → `want` · [Bleibt dabei] → nichts |
| B | kein Status | done oder never | „{E} hat wohl schon mit Dir gefickt!?“ | „{E} hat diese Treffen mit Dir eingetragen. Ausgewählte werden als eigene Treffen mit {E} übernommen.“ | Treffen-Liste; Termine: „Hier hättet Ihr erneut die Gelegenheit dazu:“ | K4 |
| — | want | done | wie B | wie B | wie B | K4 |
| D | want | never | wie B | „... fand es aber nicht so toll.“ | wie B | K4 |
| F | no | done oder never | „{E} hat wohl schon mit Dir gefickt!? 😳“ | „Dabei steht {E} bei Dir auf ‚Nein, danke!‘.“ | wie B | K4 |
| — | done oder never | done oder never | „Erneut gelandet!“ | beide never: „{E} fand es auch nicht so toll.“ · eigen done/fremd never: „Beim nächsten Mal mehr Mühe geben!“ · eigen never/fremd done: „Hätte aber nicht sein müssen ...“ · beide done: „Immer wieder gerne 😁“ | Treffen-Liste (nur neue); Termine: „{E} wäre hier wieder fickbar:“ | mit neuen Treffen: [Ja, gerne wieder] → Treffen + `done` · [Ja, wieder nicht aufgepasst] → Treffen + `never` · [Im Leben nicht] → `no` · [Stimmt nicht] → nichts. Nur Termine: [OK]. Weder neue Treffen noch Termine: kein Dialog. |
| G | beliebig | no | – | – | – | kein Dialog |
| H | beliebig | ohne Status, mit Treffen | wie fremd `done` | | | |
| I | – | mehrfach eingetragen | zusammenfassen (s. o.) | | | |

Smileys: 😁 = breit grinsend, 😳 = große, ungläubige Augen.

## Änderungsliste
| schema | Änderung |
|---|---|
| 1 | erste Fassung (poppen 2.32); Ergänzungen 2.33: IDs `j:`, Plattform-Codes, `updatedBy`-Felder, Feldlisten, Fallliste des Imports (keine Formatänderung) |
