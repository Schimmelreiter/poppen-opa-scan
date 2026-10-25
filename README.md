# poppen-opa-scan

Implementiert einen Schutz vor sabbernden alten Opas auf poppen.de.

Ein Tampermonkey-Userscript für [poppen.de](https://www.poppen.de). Es findet Mitglieder, die nach einstellbaren Regeln zu alt sind (bzw. Paare mit großem Altersunterschied), und setzt sie mit einer Notiz auf die Blockierliste von poppen.de – bei Interaktionen (Likes, Sticker, Nachrichten), Profilbesuchern, in Gruppen und in der Mitgliedersuche. Dazu kommen eine private Fickliste, Figur-Badges in der Suche, eine Whitelist für Mitglieder verwalteter Gruppen und die Prüfung von Gruppen-Beitrittsanfragen.

Das Gegenstück für JOYclub: [joyclub-opa-scan](https://github.com/Schimmelreiter/joyclub-opa-scan).

Stand: Version 2.8 – Änderungen siehe [changelog.txt](changelog.txt)

---

## Installation und Updates

1. [Tampermonkey](https://www.tampermonkey.net/) im Browser installieren.
2. Diesen Link öffnen und auf „Installieren“ klicken:
   https://raw.githubusercontent.com/Schimmelreiter/poppen-opa-scan/main/poppen-opa-schutz.user.js
3. Updates holt Tampermonkey automatisch (`@updateURL`), standardmäßig einmal täglich – sofort über *Dashboard → Nach Updates suchen*.

Beim ersten Start fragt Tampermonkey nach den Rechten des Skripts (u. a. Zugriff auf `img-z.poppen.de`, um kleine Kopien von Profilbildern zu speichern).

> **Erst testen:** Auf der Seite *Opa-Schutz → Experten-Einstellungen* gibt es den **Testlauf**. Dann wird nichts blockiert oder entsperrt, nur protokolliert (Konsole, F12).

### Wo liegen die Daten?

| Was | Wo |
|---|---|
| Einstellungen, Schalter, Zustände | Tampermonkey-Speicher |
| Mitglieder-Gedächtnis (ein Eintrag je Mitglied), Profilbilder, Profil-Archiv, Warteliste, Fickliste, API-Rekorder | Datenbank des Browsers für poppen.de (IndexedDB) |

Das Mitglieder-Gedächtnis kann mit Gruppen-Scans weit über 100.000 Einträge groß werden. In der Browser-Datenbank wird jeder Eintrag einzeln gelesen und geschrieben; im Tampermonkey-Speicher würde alles bei jedem Seitenaufruf geladen. **Wer im Browser die Website-Daten von poppen.de löscht, löscht auch das Gedächtnis** – deshalb regelmäßig *Alle Daten sichern*.

---

## Regeln: Wer wird blockiert?

Die Mitglieder werden in drei **Gruppen** eingeteilt: **Männer**, **Frauen** und **Paare**. Jede Gruppe hat je **Quelle** (Interaktionen, Profilbesucher, Gruppen, Mitgliedersuche) eigene Altersgrenzen. Partygäste gibt es auf poppen.de nicht; die Zeile ist ausgeblendet und übernimmt intern die Werte der Profilbesucher.

- **Visuelle Einstufung** in drei Stufen (zwei Grenzen): bis zur ersten Grenze Stufe 1 (grün), bis zur zweiten Stufe 2 (orange), darüber Stufe 3 (rot).
- **Ignorieren ab** einem Alter.

| Gruppe | Bezeichnungen (Einzahl) | Visuell bis | Ignorieren ab | Profiltypen (Standard) | Schalter (Standard) |
|---|---|---|---|---|---|
| Männer | Jungspund / Mann / Opa | 29 / 48 | 50 | Mann | Visuell an, Ignorieren an |
| Frauen | junge Frau / Frau / Oma | 29 / 48 | 50 | Frau | aus |
| Paare | junges Paar / Paar / Geronto-Paar | 29 / 48 | 50 | Paar | aus |

- **Profiltypen** von poppen.de: Mann (`m`), Frau (`w`), Paar (`p`), Trans (`ts`), Nicht-binär (`tv`). Jeder Typ gehört zu höchstens einer Gruppe; nicht zugeordnete Typen werden nicht bearbeitet.
- **Paare:** Paar-Regel „einer über der Grenze“ oder „beide über der Grenze“; auf Wunsch getrennte Grenzen für Frau und Mann. **Sugar Daddy** und **Sugar Mom** (großer Altersabstand) mit eigenem Schalter.
- **Warnalter:** Ein Jahr vor der Grenze wird ein Mitglied dunkelorange markiert und **vorgemerkt**. Sobald es laut Geburtszeitraum sicher über der Grenze ist, kommt es auf die Warteliste.
- **Alter 99** gilt als **unklar** (meist ein Platzhalter): nicht blockieren, nur markieren; die Profiladressen lassen sich als Textdatei exportieren.

### Nie blockiert

- **Whitelist** (Namen, Präfixe, eigene Gruppen) – auf der Seite *Opa-Schutz* bearbeitbar.
- **poppen-Mitarbeiter** (`payclass: site_admin`).
- **Freunde und Favoriten** – die Listen (`friends/list`, `favourite/list`) werden täglich und beim Öffnen der Seiten eingelesen; zusätzlich fragt das Skript vor jeder Sperre die Profil-Kurzinfo ab (`friend_status`). Opa-Sperren von Freunden und Favoriten werden aufgehoben.
- **Gruppen-Leitung:** Besitzer und Moderatoren aller eigenen Gruppen (`group/profile`, `group/moderator/list`); bereits vom Opa-Schutz Blockierte werden entsperrt.
- **Mitglieder verwalteter Gruppen**, je Gruppe abschaltbar – aber nur, wenn du die Gruppe **allein leitest**: als Moderator nie (es gibt den Besitzer), als Besitzer nur ohne weitere Moderatoren; eigene Zweitprofile zählen nicht. Leitest du nicht allein, werden die Whitelist-Einträge dieser Gruppe sofort entfernt und die Mitglieder nach den Regeln geprüft. Wer aus allen verwalteten Gruppen verschwindet, bleibt noch **30 Tage** geschützt (er könnte sich nur unsichtbar geschaltet haben). Bereits vom Opa-Schutz Blockierte werden entsperrt. Über das Gruppenanfragen-Popup Aufgenommene sind sofort geschützt.

### Bezeichnungen und Notizen

Die Notiz auf der Blockierliste lautet z. B. `Opa (Likes) geblockt am 24.10.2026 um 14:01`. Die Quelle in Klammern sagt, wo das Mitglied gefunden wurde. Ältere Notizen („Alter Sack (Suche) geblockt am …“) werden weiter erkannt.

- Ist das **eigene Profil ein Mann**, heißt alles „**Oma**“ statt „Opa“.
- Liegt **genau einer** der eigenen Wohnsitze (Haupt- oder Zweitwohnsitz) im **Ruhrgebiet**, heißt es „**Oppa**“ bzw. „**Omma**“. Liegen mehrere in Gebieten mit Sonderregeln, gilt der zuerst genannte. Das Rheinland ist angelegt, hat aber noch keine Sonderregeln.

---

## Quellen und Scans

Alle Quellen außer den Profilbesuchern laufen über die Schnittstellen von poppen.de (`/v2-api/…`), ohne Profilaufrufe.

| Quelle | Woher | Notiz-Quelle |
|---|---|---|
| Interaktionen | Likes (`rates`), Sticker (`my/received/gift`), Unterhaltungen (`messenger/group/list`, ohne Nachrichtentexte) | Likes / Sticker / Nachrichten |
| Profilbesucher | Besucherliste (unsichtbar geladen und durchgescrollt) | Besucher |
| Gruppen (Whitelist) | Leitung aller Gruppen, Mitglieder verwalteter Gruppen (`group/attendee/manage/list`, siehe Whitelist); entfernt besonders böse Popsters aus verwalteten Gruppen; bei „Alle Scans“ standardmäßig an | Gruppen |
| Gruppen (Blacklist) | Mitglieder der Gruppen, in denen du Mitglied bist (`group/attendee/list`), nach den Regeln; bei „Alle Scans“ standardmäßig aus, Auswahl wird gemerkt | Gruppen |
| Mitgliedersuche | ganz Deutschland, Alter für Alter ab der Grenze (`user/search`) | Suche |
| Partygäste | gibt es auf poppen.de nicht (ausgeblendet) | – |

**Opa-Scan** (Profil-Menü → *Opa-Scan*): Popup mit allen Scans, zwei Fortschrittsbalken, Statistik und Zusammenfassung.

**Auf den Seiten selbst** (Besucher, Likes, Sticker, Posteingang, Suche, Gruppen-Mitglieder) werden die Karten markiert. Ist der Schalter *Opa-Schutz* an und die Automatik der Seite eingeschaltet, kommen Treffer auf die Warteliste.

Nebenbei merkt sich das Skript zu jedem Mitglied uid, Nick (und frühere Nicks), Alter, Geschlecht, Geburtszeitraum (aus Alter, Geburtsjahr und Sternzeichen) und – bei Likes, Stickern, Nachrichten, Besuchern und selbst geöffneten Profilen – eine kleine Kopie des Profilbilds.

---

## Blocken im Hintergrund

Scans **lesen** komplett und legen Treffer auf eine **Warteliste**. Geblockt wird **im Hintergrund**, einer nach dem anderen:

- solange der Schalter *Opa-Schutz aktiv* an ist; zwischen zwei Sperren eine zufällige Pause von **1–3 Sekunden**,
- **andere Vorgänge haben Vorrang** (Scans, Blockierliste, Gruppenanfragen, Speichern mit „Regeln geändert“, Fickliste-Import, „Trotzdem öffnen“ – auch in anderen Tabs): Das Blockieren pausiert und läuft danach weiter,
- nur ein Tab arbeitet; wird er geschlossen, übernimmt ein anderer poppen.de-Tab, sobald dieser seit einer Minute offen ist,
- nach mehreren Fehlschlägen hintereinander 5 Minuten Pause,
- Reihenfolge nach der **Rangfolge der Quellen**, innerhalb einer Quelle die Ältesten zuerst,
- vor jeder Sperre: Whitelist, Mitarbeiter, Freund, Favorit, verwaltete Gruppe, Alter 99 und aktuelle Grenzen erneut prüfen.

**Jetzt abarbeiten** (Experten-Einstellungen bzw. Opa-Scan) arbeitet die Warteliste in diesem Tab bis zum Ende ab – auch bei ausgeschaltetem Schalter.

Geblockt wird über `ignore/add`, die Notiz über `ignore/comment/add`. Die Notiz ist Pflicht und hat einen festen Text: Lässt sie sich nicht schreiben, wird die Sperre zurückgenommen und das Mitglied bleibt auf der Warteliste; nach drei Fehlversuchen fällt es heraus. Ohne bekannte Benutzer-ID trägt das Skript den Namen im unsichtbaren Rahmen über „Benutzer hinzufügen“ ein.

---

## Oberfläche

- **Kopfleiste:** Opa-Symbol mit der Zahl der Blockierten (Tooltip: „X geblockt, Y in der Warteschlange“); Klick öffnet die Einstellungen. Ein **gelber Punkt** zeigt offene Gruppenanfragen in verwalteten Gruppen; Klick öffnet die Anfragenseite.
- **Profil-Menü** (Klick auf das eigene Profilbild): *Fickliste* und *Opa-Scan* (vor „Profil bearbeiten“), *Opa-Schutz* (danach, Opa mit Stift; öffnet die Einstellungen) und der Schalter **Opa-Schutz aktiv** (vor „Unsichtbar“) für die Automatik.
- **Einstellungen:** In der linken Spalte stehen **Meine Fickliste** (nach „Meine Kontaktanzeigen“) und **Opa-Schutz** (vor „Privatsphäre“).

### Seite „Opa-Schutz“ (`/setting/profile#opa-schutz`)

- Kopfzeile: derzeit blockiert, nach Anwenden der neuen Einstellungen (derzeit blockiert − fallen weg + kommen dazu, aus dem Gedächtnis berechnet), Warteliste. Damit die Zahl stimmt, liest das Skript nach jedem Update und danach wöchentlich die Blockierliste still ins Gedächtnis ein (ohne etwas zu ändern).
- Je Gruppe: Schalter, Grenzen je Quelle (Schieberegler), „Werte der ersten Zeile übernehmen“, Bezeichnungen, Profiltypen; bei Paaren Paar-Regel, getrenntes Alter, Sugar Daddy/Mom.
- Allgemein: Warnalter, Whitelist (mit Gruppen), automatische Whitelist (nur lesbar).
- Gruppen: verwaltete Gruppen mit Schalter „Mitglieder whitelisten“, übrige Gruppen mit Haken für den Gruppen-Scan.
- Automatik, automatische Anmeldung, Wartungsseite. Die Regeln für Gruppenanfragen stehen nicht auf der Seite; sie gelten intern weiter (Quelltext bzw. Datensicherung).
- **Experten-Einstellungen** (immer zugeklappt): Debug, Testlauf, Obergrenze erster Scan, Höchstzahl der Einträge auf der Blockierliste (Standard 10.000.000), Rangfolge der Quellen (untereinander, mit ▲▼), Pause zwischen Sperren, Messdauer der Figur, Schonfrist, API-Rekorder, Datensicherung, Gedächtnis-Export/-Import, 99-Jährige, Warteliste (Anzeigen, **Jetzt abarbeiten**, Leeren).
- Wer die Seite mit ungespeicherten Änderungen verlässt, wird gefragt.
- **Regeln geändert:** Beim Speichern zeigt ein Popup, wie viele Sperren wegfallen oder dazukommen und wie viele Notizen abweichen: speichern und anwenden, nur entsperren, nur sperren, nur speichern oder verwerfen.

### Blockierliste (`/setting/privacy/ignore-list`)

Beim Öffnen passiert nichts automatisch. Unter „Benutzer hinzufügen“ stehen:

| Button | Wirkung |
|---|---|
| **Reparieren** | liest die ganze Liste über die Schnittstelle; nicht mehr Blockierte fallen aus dem Gedächtnis, Einträge mit Opa-Notiz werden übernommen, fehlende Notizen ergänzt |
| **Synchronisieren – poppen.de hat Vorrang** | übernimmt Einträge mit Opa-Notiz samt Quelle (unbekannte Quelle → „Sync“); im Skript Blockierte, die auf poppen.de fehlen, gelten als entsperrt |
| **Synchronisieren – Script hat Vorrang** | blockiert im Skript Blockierte neu und entsperrt Einträge mit Opa-Notiz, die das Skript nicht (mehr) blockieren würde – nach einer Rückfrage mit Zahlen |
| Notizen abgleichen (Haken) | passt Opa-Notizen an die aktuelle Vorlage an |

Von Hand Blockierte (ohne Opa-Notiz) werden nie angefasst. Der **Mülleimer** fragt bei vom Opa-Schutz Blockierten nach: *Trotzdem entsperren / Trotzdem entsperren & Whitelist / Abbrechen*.

### Profil eines Geblockten

Auf „Du hast diesen Popster blockiert“ kommen **Trotzdem öffnen** (einmalig entsperren, beim Verlassen wieder sperren) und **Nicht mehr ignorieren** dazu, darunter der Grund (die Notiz).

### Sichtbarkeit

Funktionen, die ein Profil aufrufen (Prüfung von Gruppenanfragen, „Trotzdem öffnen“), warnen vorher: *Unsichtbar schalten und fortfahren / Sichtbar fortfahren / Abbrechen*. Beim Unsichtbar-Schalten (`wio/state`) wartet das Skript 15 Sekunden und stellt danach den vorherigen Zustand wieder her.

---

## Blockierende Popsters

Alle 30 Minuten liest das Skript die Liste der Popsters, die dich blockieren (`ignore/be-ignored/uid/list`), und merkt sie sich als „besonders böse“. Diese Popsters werden beim Scan **Gruppen (Whitelist)** (und im täglichen Hintergrundlauf) aus deinen **verwalteten** Gruppen entfernt – vorher mit einem Vermerk am Mitglied („Ignorant (Gruppe) blockiert am … um …“).

Die Zuordnung User-ID → Nickname liegt dauerhaft im Tampermonkey-Speicher und überlebt so das Löschen der poppen.de-Browserdaten; das Profilgedächtnis dient nur als Rückfallebene. Geänderte Nicknames (gleiche ID) werden nach jedem Whitelist-Scan und einmal täglich nachgeführt. Entfernt wird anhand der ID, nicht des Namens.

Angezeigt wird die Liste unter *Datenschutzeinstellungen → **Blockierende Popsters*** (auf `/setting/privacy/home`, direkt über „Wer kann was sehen“). Die Ansicht ist **nicht änderbar**: bekannte Mitglieder mit Bild, Name (Link zum Profil) und „Geschlecht · Alter · Ort“, sonst ein Platzhalter mit der ID.

## Gruppen-Beitrittsanfragen

Auf `/groups/<Nummer>/requests` prüft **Automatische Annahme/Ablehnung** jedes Profil über die Schnittstellen (`user/info`, Galerie) statt mit einem unsichtbaren Profilaufruf; der Typ kommt als Zahl und wird über die Übersetzungen der Seite (`i18n/pull`) benannt, sonst prüft das Skript wie bisher über das Profil. Typ in der Annehmen-Liste → annehmen, in der Ablehnen-Liste → ablehnen; sonst **manuell prüfen** mit Angaben, bis zu 6 Fotos (Großansicht beim Darüberfahren) und Notizfeld.

Die **Regeln** (Gruppen-Muster, Annehmen-/Ablehnen-Liste, Zusatzregel, Fotozahl) stehen nicht im Quelltext, sondern nur in den eigenen gespeicherten Einstellungen: *Opa-Schutz → Experten-Einstellungen → Gruppenanfragen*. Ist kein Gruppen-Muster eingetragen, ist die automatische Annahme/Ablehnung aus.

---

## Fickliste

Nur für dich sichtbar.

- **Button** nach „Nachricht senden“ mit fünf Zuständen und denselben Symbolen wie im JOYclub-Skript: *Ficken?*, *Will ich*, *Gefickt*, *Nein, danke!*, *Nie wieder!*; Menü mit den anderen Zuständen, „Fickstatus zurücksetzen“ und „Treffen eintragen“.
- **Abschnitt „Fickliste“** im Profil unter „Fotos“/„Videos“: Status, Treffen (Datum, was, wo, Link, Notiz), **Anmerkungen** (freies Textfeld zur Person, bis 8000 Zeichen, mit ✎ bearbeiten), Profile auf anderen Plattformen, Profil-Archiv.
- **Meine Fickliste** (Einstellungen): Zähler je Zustand als Filter, Filter nach Mitglied, Was, Wo, Datum und Plattform (Mehrfachauswahl, „Andere / ohne“), Sortierung nach Datum oder Name; Personen ohne Treffen erscheinen ebenfalls. Gelöschte Profile sind durchgestrichen, deaktivierte rot. Hinter dem Status stehen die Plattform-Symbole.
- **Kasten im eigenen Profil** über den Statistiken: Zähler und die letzten Ficks mit drei verschiedenen Personen.
- **Profil-Archiv:** Bei jedem Profilaufruf und jeder Statusänderung wird ein Stand gespeichert; Navigation ‹ › und « » (direkt vor/nach einem Treffen).
- **Externe Ficks:** Personen ohne poppen-Profil mit eigenem Bild, Typ, Ort und Texten.
- **Andere Plattformen** (Popup **„Auch auf …“**: im Menü des Fickliste-Buttons, im Fickliste-Kasten über den Knopf **+** hinter „Auch auf:“ und in „Meine Fickliste“ je Person): JOYclub, xHamster, Eronity, SpicyMatch, Kaufmich, Fetish.com, Gays.com, Telegram (`@Name`/`t.me/Name` → `https://t.me/Name`), WhatsApp (Nummer/`wa.me` → `https://wa.me/49…`, „00“ wird „+“, ohne Vorwahl +49), Threema (`https://threema.id/ID`), Signal (Nummer → `https://signal.me/#p/+49…`, Benutzername nur als Text mit ⧉) und „Andere …“ mit eigenem Plattformnamen. Je Profil Häkchen „Profil gelöscht“ (durchgestrichen) und ✕ zum Entfernen. Als Symbole dienen die echten Favicons der Seiten, fest ins Skript eingebaut (es wird nichts nachgeladen); Eronity und „Andere“ zeigen ein Kürzel (bei „Andere“ die ersten 2 Buchstaben). Die Favicons gehören den jeweiligen Markeninhabern. **Vorschläge:** Importierte Einträge der gewählten Plattform ohne poppen-Profil lassen sich mit einem Klick zusammenführen (neuerer Status gewinnt, Treffen, Profile und Verlauf werden übernommen, Anmerkungen angehängt).
- **Links von Treffen** öffnen immer in einem neuen Tab auf der Plattform, für die sie eingetragen sind.
- **Gelöschte Konten** im Posteingang: früherer Name durchgestrichen, Link aufs Profil-Archiv, Bild aus dem Archiv.

### Austausch mit JOYclub

*Exportieren* / *Importieren* in „Meine Fickliste“. Die Datei ist mit dem eigenen Nick verschlüsselt (AES-GCM, Schlüssel per PBKDF2-SHA256 mit 150.000 Runden). Enthält ein importierter Eintrag ein poppen.de-Profil, wird er zu einem poppen-Eintrag (sofort, wenn das Mitglied bekannt ist, sonst beim nächsten Profilaufruf). Beim Import werden Einträge **automatisch verknüpft**, wenn ein Link übereinstimmt (Groß-/Kleinschreibung, `https`, `www.`, Schrägstrich am Ende und Umlaut-Kodierung spielen keine Rolle); weitere Links werden übernommen, bei mehreren Treffern wird gefragt.

```
Datei:  { format:'fickliste-enc', platform, account, alg:'AES-GCM/PBKDF2', salt, iv, data }
Inhalt: { format:'fickliste', version:1, platform, exported, persons:[
          { id, status:'want'|'done'|'no'|'never'|null, statusAt,
            main:{ pf, uid, nick, url },
            profiles:[{ pf, url, name, uid?, pfName?, dead?, text?, status?, statusAt?, sync? }],
            meets:[{ id, date:'YYYY-MM-DD', time, where, club, link, pf, uid?, note }],
            history:[{ at, what }], ext? } ] }
```

- `where` = „Was“ (Party, Anlass), `club` = „Wo“ (Club, Ort).
- `profiles[].pfName`: freier Plattformname bei `pf:'other'`; `profiles[].dead:true`: Profil gelöscht.
- `profiles[].status`/`statusAt`: eigener Status eines Profils; `sync:true` übernimmt Statuswechsel der Person.
- `meets[].uid` (mit `pf`): Profil, zu dem das Treffen gehört; ohne `uid` gehört es zu `main`.
- Unbekannte Felder werden unverändert durchgereicht.

---

## Messenger: Termine

In der rechten Spalte eines Chats steht zwischen „Aktionen“ und „Anhänge“ der Abschnitt **Termine** (nur Chrome/Edge). Er liest eine lokale Textdatei, die einmal gewählt wird (im Abschnitt selbst oder auf der Seite *Opa-Schutz* unter „Party-Termine“). Jede Zeile hat das Format `wann - wo - was - Link`; `was` und `Link` sind optional, `wann` darf ein Zeitraum sein (`14.09.-23.09.2026`, `14.-23.09.2026`, `28.12.2026 - 02.01.2027`).

- Gelesen wird von oben; vergangene Termine werden übersprungen (ein Zeitraum zählt bis zu seinem letzten Tag), nach den ersten **5 kommenden** ist Schluss. Diese stehen nach Datum sortiert (gleiches Datum: Reihenfolge der Datei).
- Jeder Termin ist eine Zeile mit „wann - wo - was“ als Beschriftung; ein Klick fügt die vollständige Zeile (mit Link) ins Eingabefeld ein. Abgeschickt wird nichts.
- Die Datei wird beim Aufklappen neu gelesen. Chrome fragt gelegentlich, ob der Zugriff weiter erlaubt ist („Zugriff auf die Datei erlauben“).

## Messenger: Textvorlagen

Eigene Textbausteine (bis **100**, je bis **8000 Zeichen**), gespeichert im Tampermonkey-Speicher.

- **Knopf** mit dem Vorlagen-Symbol links neben der Eingabezeile (`/inbox/p/<Nick>`). Ein Klick zeigt die **Namen** der Vorlagen; ein Klick darauf fügt den Text an der Schreibmarke ein (nicht gesendet).
- **Verwalten** über das Drei-Punkte-Menü des Messengers → **Textvorlagen** (nach „Nachrichtenfilter“): Liste, Bearbeiten (Name + Nachricht mit Zeichenzähler), Löschen, Export/Import.
- **Termine-Bereich:** Enthält der Name „Termin“, erscheinen im Bearbeiten-Fenster die nächsten 5 Termine aus der Termin-Datei; „Alle übernehmen“ ersetzt den Text. 
- **Termin-Kurzform:** Beim Einfügen wird eine Zeile `wann - wo - Link` ohne „was“ anhand der Termin-Datei wieder zur vollen Zeile ausgeschrieben.
- **Export/Import** per Datei oder Zwischenablage, in derselben verschlüsselten Hülle wie die Fickliste (`templates` statt `persons`). Beim Import werden Smileys zwischen JOYclub, poppen.de und Unicode übersetzt (Tabelle fest im Skript); gleiche Vorlagen bleiben unverändert, nur vorne/hinten verlängerte werden ergänzt, sonst Rückfrage. Nicht übersetzbare Smileys stehen im Bericht.

## Mitgliedersuche: Figur

- Überall heißt „Kurvig“ jetzt **„Mollig“** und „Plus-size“ **„Mastschwein“**. In der Suche gibt es zusätzlich **„Qualle“** (sucht ebenfalls „Plus-size“).
- Bei Mollig, Mastschwein und Qualle **vermisst** das Skript die Treffer über die Größen- und Gewichtsfilter der Suche (je Größe ein Mindestgewicht für BMI 30/35/40, danach ganzzahlige BMI-Bänder) – ohne Profilaufrufe.
- **Badges:** ab BMI 30 „mollig“, ab 35 „Mastschwein“, ab 40 „Qualle“, z. B. „Mastschwein · BMI 37“.
- **Ausblenden:** bei Mastschwein unter BMI 35, bei Qualle unter BMI 40; bei Mollig niemand.
- **Sortierung:** absteigend nach BMI, bei Gleichstand nach Gewicht. Fehlende Angaben zählen als niedrigster BMI der Suche und 0 kg („UNKNOWN“).
- Messungen bleiben **90 Tage** gültig, „UNKNOWN“ wird nach **30 Tagen** neu geprüft. Paare lassen sich so nicht vermessen.

---

## Sonderseiten

Wartung (neuer Versuch nach 15 Minuten), Werbe-Zwischenseiten (werden übersprungen; „Du hast die Regie!“ immer, auch bei Seitenwechseln ohne Neuladen), „Seite nicht gefunden“ (einmal neu laden) und abgemeldet. Auf der Login-Seite schaltet das Skript „Angemeldet bleiben“ ein und klickt **nur dann** auf „Anmelden“, wenn der Browser die Felder selbst ausgefüllt hat – höchstens einmal je 30 Minuten. Ein Passwort speichert das Skript nicht.

---

## Daten sichern und austauschen

| Funktion | Inhalt |
|---|---|
| Alle Daten sichern / wiederherstellen | Einstellungen, Gedächtnis, Bilder, Archiv, Warteliste; die Fickliste verschlüsselt mit dem Nick |
| Gedächtnis exportieren / importieren (mischen) | nur das Wissen über andere Mitglieder (z. B. für ein zweites Konto); Geburtszeiträume werden geschnitten, neuere Messungen gewinnen |
| 99-Jährige exportieren | Textdatei, eine Profiladresse pro Zeile |

### API-Rekorder

Schneidet die Abfragen der Seite an `/v2-api/` mit (nur neue Muster, je zwei Beispiele, Listen gekürzt) und exportiert sie als JSON. **E-Mail-Adressen, Passwörter, Zugangsschlüssel, Nachrichten- (auch eingebettete beim Senden) und Profiltexte, private Notizen, Wünsche, Interview-Antworten, Telefonnummern und Koordinaten werden geschwärzt; von Geburtstagen bleibt nur das Jahr.** Standardmäßig aus.

---

## Abgleich mit JOYclub (Briefkasten)

Fickliste und Textvorlagen gleichen sich automatisch mit dem [JOYclub-Skript](https://github.com/Schimmelreiter/joyclub-opa-scan) ab, ohne Export/Import von Hand.

- Beide Skripte betten eine leere, neutrale Seite (GitHub Pages: `schimmelreiter.github.io/joyclub-opa-scan/briefkasten.html`) unsichtbar ein und tauschen über deren lokalen Speicher aus. Der Seiten-Code von poppen.de und JOYclub kommt nicht heran.
- Auf **joyclub.de** läuft das Skript nur passiv (nur der Briefkasten, keine Oberfläche, keine Eingriffe). Volle Funktion nur auf poppen.de.
- Geändertes wird sofort gesendet; Eingänge für die Fickliste übernimmt das Skript, sobald ein poppen.de-Tab offen ist.
- **Abgleich je Feld** über einen gemerkten Stand (Dreiwege): gleich → nichts; nur eine Seite geändert → übernehmen; beide geändert → Mischregeln, sonst Rückfrage. Gelöschte Textvorlagen liegen 30 Tage im **Papierkorb**.
- Smileys werden dabei zwischen den Plattformen übersetzt.
- Status unter *Opa-Schutz → Experten-Einstellungen → „Abgleich mit JOYclub“* (zuletzt geprüft, letzter Abgleich). Blockiert eine Sicherheitsrichtlinie oder ein Werbeblocker den Briefkasten, bleiben Export/Import von Hand der Weg.

**Einrichtung:** Das JOYclub-Repo braucht die Datei `briefkasten.html` (leer) und eine leere `.nojekyll`, mit eingeschalteten GitHub Pages. Ohne diese Seite findet kein automatischer Abgleich statt.

## Lizenz

GPL-3.0, siehe [LICENSE](LICENSE).

## API

Eine Beschreibung der internen poppen.de-Schnittstellen, soweit bekannt, steht in [API.md](API.md).
