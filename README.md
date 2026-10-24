# poppen-opa-scan

Implementiert einen Schutz vor sabbernden alten Opas auf poppen.de.

Ein Tampermonkey-Userscript für [poppen.de](https://www.poppen.de). Es findet Mitglieder, die nach einstellbaren Regeln zu alt sind (bzw. Paare mit großem Altersunterschied), und setzt sie mit einer Notiz auf die Blockierliste von poppen.de – bei Interaktionen (Likes, Sticker, Nachrichten), Profilbesuchern, in Gruppen und in der Mitgliedersuche. Dazu kommen eine private Fickliste, Figur-Badges in der Suche, eine Whitelist für Mitglieder verwalteter Gruppen und die Prüfung von Gruppen-Beitrittsanfragen.

Das Gegenstück für JOYclub: [joyclub-opa-scan](https://github.com/Schimmelreiter/joyclub-opa-scan).

Stand: Version 2.1 – Änderungen siehe [changelog.txt](changelog.txt)

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

Die Mitglieder werden in drei **Gruppen** eingeteilt: **Männer**, **Frauen** und **Paare**. Jede Gruppe hat je **Quelle** (Interaktionen, Profilbesucher, Partygäste, Gruppen, Mitgliedersuche) eigene Altersgrenzen:

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
- **Freunde** – vor jeder Sperre fragt das Skript die Profil-Kurzinfo ab (`friend_status`).
- **Mitglieder verwalteter Gruppen** (Eigentümerin oder Moderatorin), je Gruppe abschaltbar. Wer aus allen verwalteten Gruppen verschwindet, bleibt noch **30 Tage** geschützt (er könnte sich nur unsichtbar geschaltet haben). Bereits vom Opa-Schutz Blockierte werden entsperrt. Über das Gruppenanfragen-Popup Aufgenommene sind sofort geschützt.

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
| Gruppen | alle eigenen Gruppen (`group/my`, `group/attendee/list`), standardmäßig komplett | Gruppen |
| Mitgliedersuche | ganz Deutschland, Alter für Alter ab der Grenze (`user/search`) | Suche |
| Partygäste | gibt es auf poppen.de nicht (ausgegraut) | – |

**Opa-Scan** (Profil-Menü → *Opa-Scan*): Popup mit allen Scans, zwei Fortschrittsbalken, Statistik und Zusammenfassung.

**Auf den Seiten selbst** (Besucher, Likes, Sticker, Posteingang, Suche, Gruppen-Mitglieder) werden die Karten markiert. Ist der Schalter *Opa-Schutz* an und die Automatik der Seite eingeschaltet, kommen Treffer auf die Warteliste.

Nebenbei merkt sich das Skript zu jedem Mitglied uid, Nick (und frühere Nicks), Alter, Geschlecht, Geburtszeitraum (aus Alter, Geburtsjahr und Sternzeichen) und – bei Likes, Stickern, Nachrichten, Besuchern und selbst geöffneten Profilen – eine kleine Kopie des Profilbilds.

---

## Blocken in Etappen

Scans **lesen** komplett und legen Treffer auf eine **Warteliste**. Geblockt wird in **Etappen**:

- höchstens **50** je Etappe, zwischen zwei Sperren eine zufällige Pause von **1–3 Sekunden**,
- alle **5 Minuten** eine Etappe, solange ein poppen.de-Tab offen und der Schalter *Opa-Schutz* an ist (nur ein Tab arbeitet),
- Reihenfolge nach der **Rangfolge der Quellen**, innerhalb einer Quelle die Ältesten zuerst,
- vor jeder Sperre: Whitelist, Mitarbeiter, Freund, verwaltete Gruppe, Alter 99 und aktuelle Grenzen erneut prüfen.

Geblockt wird über `ignore/add`, die Notiz über `ignore/comment/add`. Ohne bekannte Benutzer-ID trägt das Skript den Namen im unsichtbaren Rahmen über „Benutzer hinzufügen“ ein.

---

## Oberfläche

- **Kopfleiste:** Opa-Symbol mit der Zahl der Blockierten (Tooltip: „X geblockt, Y in der Warteschlange“); Klick öffnet die Einstellungen. Ein **gelber Punkt** zeigt offene Gruppenanfragen in verwalteten Gruppen; Klick öffnet die Anfragenseite.
- **Profil-Menü** (Klick auf das eigene Profilbild): *Opa-Scan* (vor „Profil bearbeiten“), *Opa-Schutz konfigurieren* (danach) und der Schalter **Opa-Schutz** (vor „Unsichtbar“) für die Automatik.
- **Einstellungen:** In der linken Spalte stehen **Meine Fickliste** (nach „Meine Kontaktanzeigen“) und **Opa-Schutz** (vor „Privatsphäre“).

### Seite „Opa-Schutz“ (`/setting/profile#opa-schutz`)

- Kopfzeile: derzeit blockiert, nach Anwenden der neuen Einstellungen (aus dem Gedächtnis berechnet), Warteliste.
- Je Gruppe: Schalter, Grenzen je Quelle (Schieberegler), „Werte der ersten Zeile übernehmen“, Bezeichnungen, Profiltypen; bei Paaren Paar-Regel, getrenntes Alter, Sugar Daddy/Mom.
- Allgemein: Warnalter, Whitelist (mit Gruppen), automatische Whitelist (nur lesbar).
- Gruppen: verwaltete Gruppen mit Schalter „Mitglieder whitelisten“, übrige Gruppen mit Haken für den Gruppen-Scan.
- Automatik, automatische Anmeldung, Wartungsseite, Gruppenanfragen.
- **Experten-Einstellungen** (immer zugeklappt): Debug, Testlauf, Obergrenze erster Scan, Limit (Standard 10.000.000), Rangfolge der Quellen, Notiz schreiben/Text/Pflicht, Etappen, Messdauer der Figur, Schonfrist, API-Rekorder, Datensicherung, Gedächtnis-Export/-Import, 99-Jährige, Warteliste.
- Abweichungen vom Quelltext sind mit „°“ markiert; „Quelltext-Wert“ setzt zurück. Wer die Seite mit ungespeicherten Änderungen verlässt, wird gefragt.
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

## Gruppen-Beitrittsanfragen

Auf `/groups/<Nummer>/requests` (nur Gruppen, deren Name auf das Muster passt) prüft **Automatische Annahme/Ablehnung** jedes Profil unsichtbar: Typ in der Annehmen-Liste → annehmen, in der Ablehnen-Liste → ablehnen, sonst **manuell prüfen** mit Angaben, bis zu 6 Fotos (Großansicht beim Darüberfahren) und Notizfeld.

---

## Fickliste

Nur für dich sichtbar.

- **Button** nach „Nachricht senden“ mit fünf Zuständen: *Ficken?*, *Will ich*, *Gefickt*, *Nein, danke!*, *Nie wieder!*; Menü mit den anderen Zuständen, „Fickstatus zurücksetzen“ und „Treffen eintragen“.
- **Abschnitt „Fickliste“** im Profil unter „Fotos“/„Videos“: Status, Treffen (Datum, was, wo, Link, Notiz), Profile auf anderen Plattformen, Profil-Archiv.
- **Meine Fickliste** (Einstellungen): Zähler je Zustand als Filter, Filter nach Mitglied, Was, Wo, Datum und Plattform, Sortierung nach Datum oder Name; Personen ohne Treffen erscheinen ebenfalls. Gelöschte Profile sind durchgestrichen, deaktivierte rot.
- **Kasten im eigenen Profil** über den Statistiken: Zähler und die letzten Ficks mit drei verschiedenen Personen.
- **Profil-Archiv:** Bei jedem Profilaufruf und jeder Statusänderung wird ein Stand gespeichert; Navigation ‹ › und « » (direkt vor/nach einem Treffen).
- **Externe Ficks:** Personen ohne poppen-Profil mit eigenem Bild, Typ, Ort und Texten.
- **Andere Plattformen:** JOYclub, xHamster, Eronity, SpicyMatch, Kaufmich, Fetish.com, Gays.com, Telegram (`@name` → `https://t.me/name`), WhatsApp (Nummer → `https://wa.me/49…`), Threema (`https://threema.id/ID`), Signal (Nummer → `https://signal.me/#p/+49…`, Benutzername nur als Text) und andere.
- **Links von Treffen** öffnen immer in einem neuen Tab auf der Plattform, für die sie eingetragen sind.
- **Gelöschte Konten** im Posteingang: früherer Name durchgestrichen, Link aufs Profil-Archiv, Bild aus dem Archiv.

### Austausch mit JOYclub

*Exportieren* / *Importieren* in „Meine Fickliste“. Die Datei ist mit dem eigenen Nick verschlüsselt (AES-GCM, Schlüssel per PBKDF2-SHA256 mit 150.000 Runden). Beim Import werden Einträge **automatisch verknüpft**, wenn ein Link übereinstimmt (Groß-/Kleinschreibung, `https`, `www.`, Schrägstrich am Ende und Umlaut-Kodierung spielen keine Rolle); weitere Links werden übernommen, bei mehreren Treffern wird gefragt.

```
Datei:  { format:'fickliste-enc', platform, account, alg:'AES-GCM/PBKDF2', salt, iv, data }
Inhalt: { format:'fickliste', version:1, platform, exported, persons:[
          { id, status:'want'|'done'|'no'|'never'|null, statusAt,
            main:{ pf, uid, nick, url },
            profiles:[{ pf, url, name, uid?, text?, status?, statusAt?, sync? }],
            meets:[{ id, date:'YYYY-MM-DD', time, where, club, link, pf, uid?, note }],
            history:[{ at, what }], ext? } ] }
```

- `where` = „Was“ (Party, Anlass), `club` = „Wo“ (Club, Ort).
- `profiles[].status`/`statusAt`: eigener Status eines Profils; `sync:true` übernimmt Statuswechsel der Person.
- `meets[].uid` (mit `pf`): Profil, zu dem das Treffen gehört; ohne `uid` gehört es zu `main`.
- Unbekannte Felder werden unverändert durchgereicht.

---

## Mitgliedersuche: Figur

- Überall heißt „Kurvig“ jetzt **„Mollig“** und „Plus-size“ **„Mastschwein“**. In der Suche gibt es zusätzlich **„Qualle“** (sucht ebenfalls „Plus-size“).
- Bei Mollig, Mastschwein und Qualle **vermisst** das Skript die Treffer über die Größen- und Gewichtsfilter der Suche (je Größe ein Mindestgewicht für BMI 30/35/40, danach ganzzahlige BMI-Bänder) – ohne Profilaufrufe.
- **Badges:** ab BMI 30 „mollig“, ab 35 „Mastschwein“, ab 40 „Qualle“, z. B. „Mastschwein · BMI 37“.
- **Ausblenden:** bei Mastschwein unter BMI 35, bei Qualle unter BMI 40; bei Mollig niemand.
- **Sortierung:** absteigend nach BMI, bei Gleichstand nach Gewicht. Fehlende Angaben zählen als niedrigster BMI der Suche und 0 kg („UNKNOWN“).
- Messungen bleiben **90 Tage** gültig, „UNKNOWN“ wird nach **30 Tagen** neu geprüft. Paare lassen sich so nicht vermessen.

---

## Sonderseiten

Wartung (neuer Versuch nach 15 Minuten), Werbe-Zwischenseiten (werden übersprungen), „Seite nicht gefunden“ (einmal neu laden) und abgemeldet. Auf der Login-Seite schaltet das Skript „Angemeldet bleiben“ ein und klickt **nur dann** auf „Anmelden“, wenn der Browser die Felder selbst ausgefüllt hat – höchstens einmal je 30 Minuten. Ein Passwort speichert das Skript nicht.

---

## Daten sichern und austauschen

| Funktion | Inhalt |
|---|---|
| Alle Daten sichern / wiederherstellen | Einstellungen, Gedächtnis, Bilder, Archiv, Warteliste; die Fickliste verschlüsselt mit dem Nick |
| Gedächtnis exportieren / importieren (mischen) | nur das Wissen über andere Mitglieder (z. B. für ein zweites Konto); Geburtszeiträume werden geschnitten, neuere Messungen gewinnen |
| 99-Jährige exportieren | Textdatei, eine Profiladresse pro Zeile |

### API-Rekorder

Schneidet die Abfragen der Seite an `/v2-api/` mit (nur neue Muster, je zwei Beispiele, Listen gekürzt) und exportiert sie als JSON. **E-Mail-Adressen, Passwörter, Zugangsschlüssel, Nachrichten- und Profiltexte, Telefonnummern und Koordinaten werden geschwärzt.** Standardmäßig aus.

---

## Lizenz

GPL-3.0, siehe [LICENSE](LICENSE).
