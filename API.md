# poppen.de – interne Web-API (v2-api)

Inoffizielle Beschreibung der Schnittstellen, die die Weboberfläche von poppen.de selbst benutzt, soweit sie beim Bau des Opa-Schutz-Skripts bekannt geworden sind. Grundlage sind API-Rekorder-Aufnahmen, gespeicherte Seiten und das Verhalten der Seite. **Nichts davon ist von poppen.de dokumentiert oder zugesagt**; Felder und Pfade können sich jederzeit ändern.

Stand: Skript-Version 2.9, 25.10.2026.

Legende:
- ✅ **genutzt**: Das Skript ruft den Endpunkt selbst auf (Felder geprüft).
- 👁 **beobachtet**: Das Skript liest nur die Antworten mit, die die Seite ohnehin lädt.
- 📼 **nur bekannt**: im Rekorder gesehen, vom Skript nicht verwendet.
- ❔ **unsicher**: Aufbau der Antwort nicht durch eine Aufnahme belegt; das Skript liest ihn bewusst fehlertolerant.

---

## 1. Allgemeines

**Basis-URL:** `https://www.poppen.de/v2-api/<pfad>`

**Anmeldung:** über die Cookies der angemeldeten Sitzung (`credentials: 'include'`). Die Seite schickt zusätzlich eigene Kopfzeilen mit. Das Skript übernimmt diese Kopfzeilen nur im Arbeitsspeicher (ohne `Cookie`, `Host`, `Content-Length`, `Content-Type`) und speichert sie nie. Kommen eigene Abfragen vor der ersten Abfrage der Seite und scheitern mit 401/403, wartet es bis zu 8 Sekunden auf diese Kopfzeilen und versucht es einmal neu.

**Methoden:** `GET` mit Query-Parametern, `POST` mit JSON-Body (`Content-Type: application/json`).

**Parameter `_version=2`:** Viele GET-Abfragen der Seite tragen `_version=2`; ohne ihn liefern manche Endpunkte ein älteres Format.

**Antwort-Hülle:** immer JSON

```json
{ "code": 0, "data": { … } }
```

- `code: 0` heißt Erfolg, sonst Fehler mit `msg` (bzw. `message` oder `error`).
- Ein HTTP-Fehler kann trotzdem eine solche Hülle tragen.

**Blättern:** Es gibt drei Varianten.

| Variante | Anfrage | Antwort | Ende |
|---|---|---|---|
| Seiten | `page` (ab 1) | `next_page` | `next_page` ist 0/fehlt oder gleich `page` |
| Offset | `offset` | `next` | `next` ist 0/fehlt oder gleich `offset` |
| Cursor | ohne `page` beim ersten Aufruf | `next_page` als undurchsichtiger Wert | `next_page` fehlt |

### Mitglieds-Objekt

Taucht in fast allen Listen auf (`users[]`, `list[].user`, `group_data`, `owner` …):

| Feld | Bedeutung |
|---|---|
| `uid` | Benutzer-ID, Zahl als Text (manchmal als Zahl). **Bei verschleierten Mitgliedern eine Prüfsumme statt einer Zahl** |
| `nickname` | Name. Verschleiert: erster Buchstabe + Sternchen (`p******`) |
| `is_blurry` | `true` bei verschleierten Einträgen (z. B. Freunde anderer, ausgeblendete Gruppenmitglieder) |
| `gender` | Array mit Profiltypen: `m` Mann, `w` Frau, `ts` Trans, `tv` Nicht-binär; Paar = zwei Einträge, z. B. `["w","m"]` |
| `gender_string` | `m`, `w`, `ts`, `tv` oder `p` (Paar) |
| `age` | Array, bei Paaren zwei Werte; `99` = Alter nicht angegeben, `0` = unbekannt/gelöscht |
| `birthday` | Array `YYYY-MM-DD` (nicht immer vorhanden) |
| `avatar` | Bild-URL; enthält im Dateinamen die Benutzer-ID (`…/<uid>-<hash>_350_sq.jpg`) |
| `geo_location` | `geo_id`, `country_iso`, `country_name`, `region`, `city`, `district`, `zipcode`, `lat`, `lon`, `tz`, `distance`, `distance_unit` |
| `membership` / `payclass` | z. B. `normal`, `premium`, `vip`, **`site_admin` = Mitarbeiter von poppen.de** |
| `is_active`, `last_visible_login`, `signup_date` | Zeitstempel in Millisekunden |
| `fakecheck` | z. B. `open` |
| `description` | Profiltext |

**Gelöschte Mitglieder** erscheinen in Unterhaltungen als `nickname: "Gelöschter Popster"` mit `age: [0]`.

**Bild-URLs:** `img-<x>.poppen.de/<signatur>,<ablauf>/<fsk>/…/<uid>-<hash>[_<größe>[_sq]].jpg`. Ohne Größen-Endung gibt es das Original, `_350_sq` ist das quadratische Vorschaubild. Verschwommene Platzhalter enthalten `plcblur`.

---

## 2. Eigenes Konto

### `GET user/session/info` ✅
Query: `_version=2`

Antwort: `data.account` mit `uid`, `nickname`, `gender`, `age`, `geo_location`, `secondary_location_status` (Zweitwohnsitz ja/nein) und weiteren Feldern.

> **Achtung:** Die Antwort enthält auch die E-Mail-Adresse des Kontos. Das Skript liest **nur** `uid`, `nickname`, `gender`, `geo_location` und `secondary_location_status`; alles andere wird verworfen und vom Rekorder geschwärzt.

Den Ort des Zweitwohnsitzes liefert die API nicht. Das Skript liest ihn von der Seite `/setting/profile`.

### `GET wio/state` / `POST wio/state` ✅
Sichtbarkeit („Unsichtbar surfen“).
- GET: Antwort `visible` oder `invisible` (direkt oder als `value`/`state`)
- POST: Body `{ "value": "invisible" }` bzw. `"visible"`

Das Skript schaltet damit vor Profilaufrufen auf Wunsch unsichtbar und danach zurück. Ändert sich die Sichtbarkeit sofort, erscheinen Besuche erfahrungsgemäß erst nach einigen Sekunden nicht mehr, deshalb wartet es 15 Sekunden.

### `GET messenger/backend/settings` 📼
Einstellungen der Chat-Verbindung. **Enthält Zugangsdaten für den Nachrichten-Server; vom Skript bewusst nicht verwendet** und vom Rekorder geschwärzt.

---

## 3. Blockierliste

### `POST v2/ignore/list` ✅ 👁
Body: `{ "page": 1, "nickname": "", "sort": "recently_added" }`. Mit `nickname` wird nach dem Namen gefiltert.

Antwort: `data.list[]` mit
- `ignore_id`
- `note` (eigene Notiz zur Sperre)
- `user` (Mitglieds-Objekt)

Dazu `next_page`, 30 Einträge je Seite.

### `GET ignore/uid/list` ✅
Alle gesperrten IDs auf einmal: `data.list` = Array von uid-Texten. Gelegentlich nur per `POST` mit `{}` erreichbar, das Skript versucht beides.

### `POST ignore/add` ✅
Body: `{ "uid": "123", "nickname": "Name" }`. Ist das Mitglied schon gesperrt, kommt ein Fehler mit „already“/„bereits“ im Text.

### `POST ignore/delete` ✅
Body: `{ "uid": "123", "nickname": "Name" }`

### `POST ignore/comment/add` ✅
Notiz zu einer Sperre setzen. Body: `{ "igrid": "123", "comment": "Text" }`. **`igrid` ist die uid des Gesperrten, nicht die `ignore_id`.**

### `GET ignore/be-ignored/uid/list` 📼 ❔
Liefert die IDs der Mitglieder, die einen **selbst** blockiert haben (vermutlich `data.list` als Array von uid-Texten). Vom Skript nicht verwendet.

**Sperren ohne bekannte uid:** Dafür gibt es keinen bekannten Endpunkt. Das Skript nutzt das Formular „Benutzer hinzufügen“ auf `/setting/privacy/ignore-list` in einem unsichtbaren Rahmen.

---

## 4. Interaktionen

### `GET rates` ✅ 👁
Likes auf eigene Bilder. Query: `_version=2`, ab Seite 2 zusätzlich `page=<next_page>` (Cursor).

Antwort: `data.rates[]` mit
- `uid` (wer geliked hat)
- `user` (Mitglieds-Objekt)
- `timestemp` (sic, Millisekunden)
- `image` (`media_id`, `media_type`, `media_data.source_url`/`preview_url`, `is_private`, `is_avatar`, `owner`)

### `GET my/received/gift` ✅ 👁
Empfangene Sticker. Query: `uid=<eigene uid>`, `limit=30`, ab Seite 2 `page`.

Antwort: `data.list[]` mit `id` (fortlaufend, eignet sich zum Erkennen neuer Einträge), `uid` und `user`. Dazu `next_page`.

### `POST messenger/group/list` ✅ 👁
Liste der Unterhaltungen, **ohne Nachrichtentexte**. Body: `{ "offset": 0, "filter": 0 }`.

Antwort: `data.list[]` mit
- `group_type`: `1` = Einzelchat
- `group_data`: Mitglieds-Objekt, zusätzlich `payclass`
- `last_updated` (Millisekunden)

Dazu `data.next` als nächster Offset.

### `POST messenger/p2p/profile/display` ✅
Kurzprofil zu einem Chatpartner, ohne Profilbesuch. Body: `{ "nickname": "Name" }`.

Antwort: `age`, `city`, `friend_status` (`friend`/`none` …) und `note` (eigene private Notiz).

### `messenger/message/list` 📼
Nachrichten einer Unterhaltung. Vom Skript nicht verwendet; der Rekorder schwärzt Inhalte.

### Profilbesucher
Dafür hat sich **kein** Endpunkt finden lassen. Das Skript lädt `/connection/visitors` unsichtbar und liest die Karten aus. Die uid kommt dabei aus der Avatar-URL, Alter und Profiltyp aus dem Kartentext.

---

## 5. Freunde und Favoriten

### `POST friends/list` ✅ 👁
### `POST favourite/list` ✅ 👁
Beide haben denselben Aufbau. Body: `{ "sort": "online", "page": 1 }`.

Antwort: `data.users[]` (Mitglieds-Objekte), `next_page`, `total_count`.

- Mit `uid` im Body: Freunde **eines anderen** Mitglieds. Diese Einträge sind teils verschleiert (`is_blurry`, Prüfsumme statt uid).
- In der Oberfläche sehen Freunde und Favoriten gleich aus (`/friends/1`, `/favourite/1`); unterscheiden lassen sie sich nur über den Endpunkt.

---

## 6. Profile

### `GET user/info/<nickname>` ✅ 👁
Name in Kleinbuchstaben, URL-kodiert. Query: `_version=2`.

Antwort:
- `data.userInfo`: `uid`, `nickname`, `gender` (Text), `age` (Array), `avatar`, `userClass`
- `data.user_trait`, jeweils als Arrays:
  - `gender`
  - `size` (cm)
  - `weight` (kg)
  - `figure_name` (Zahl)
  - `ethnicity` (Zahl, siehe `i18n/pull`)
  - `spoken_language` (verschachteltes Array mit Sprachkürzeln, z. B. `[["de","en"]]`)

Wird ohne sichtbaren Profilbesuch abgerufen.

### `GET v3/profile/gallery` ✅
Query: `_version=2`, `nickname=<name klein>`, `page=1`, `limit=<n>`.

Antwort: `data.items[]` mit
- `media_type` (`image` …)
- `is_private` (private Bilder sind für Fremde verschwommene Platzhalter)
- `media_data.source_url` / `preview_url`

Dazu `total`, `next_page`.

### `POST i18n/pull` ✅
Übersetzungstexte der Oberfläche. Body: `{ "locale": "de-DE", "module": "<modul>" }`, z. B. `profile`, `user`, `search`, `common`.

Antwort: flaches Objekt aus Schlüssel und Text, z. B. `"ethnicity.1": "Afroamerikanisch"`. Das Skript sucht Schlüssel nach dem Muster `ethnic…<trenner><zahl>`, um die Zahlen aus `user_trait.ethnicity` zu benennen.

### `v2/comment/list` 📼
Kommentare (z. B. Gästebuch/Bilder). Vom Skript nicht verwendet.

### `GET global/emojis` 📼
Liste der Smileys/Emojis der Seite (Kürzel und Bild). Grundlage der Tabelle `smiley-map.json`.

---

## 7. Gruppen

### `GET group/my` ✅
Query: `_version=2`, `page`, `subset`, `limit=25`, bei `managed` zusätzlich `sort=pending_count`.
- `subset=managed`: Gruppen, die man verwaltet
- `subset=attended`: Gruppen, in denen man Mitglied ist (enthält teils auch die verwalteten)

Antwort: `data.cms_list[]` mit
- `cms_id` (Gruppen-ID)
- `name`
- `profile_url`
- `attendee_count`
- `pending_count` (offene Beitrittsanfragen)
- `creator_status`: **eigene** Rolle, `owner`, `moderator` oder `normal`

Dazu `next_page`, `total`.

### `GET group/attendee/list` ✅ 👁
Mitglieder einer Gruppe. Query: `_version=2`, `page`, `cms_id`, `limit=30`.

Antwort: `data.users[]`, `total`, `invisible_count` (unsichtbar geschaltete Mitglieder, nicht in der Liste), `next_page`.

- In fremden Gruppen können **alle** Einträge verschleiert sein (`is_blurry`, Prüfsumme, Sternchen-Name). Dann ist die Mitgliederliste nicht einsehbar.
- Verschwindet ein Mitglied aus der Liste und steigt `invisible_count` um genau so viele, hat es sich vermutlich nur unsichtbar geschaltet.

### `GET group/profile` ✅ ❔
Gruppenprofil. Query: `_version=2`, `cms_id`. Enthält die Angaben zum **Besitzer** (Ersteller). Den genauen Ort des Besitzer-Objekts belegt keine Aufnahme; das Skript sucht unter Schlüsseln mit `creator`/`owner` nach einem Mitglieds-Objekt.

### `GET group/moderator/list` ✅ ❔
Moderatoren einer Gruppe. Query: `_version=2`, `cms_id`. **Der Abrufende selbst fehlt in der Liste.** Als Besitzer sieht man also nur die anderen Moderatoren, als Moderator nicht sich selbst. Das Skript sucht in der Antwort fehlertolerant nach Mitglieds-Objekten.

### `group/attendee/specific/pending/list` 📼
Offene Beitrittsanfragen einer Gruppe. Das Skript liest die Anfragen bislang aus der Seite `/groups/<cms_id>/requests`.

### `POST group/attendee/deny` 📼
Body: `{ "cms_id": "…", "uid": "…" }`. Lehnt eine Beitrittsanfrage ab. Das Skript nutzt stattdessen die Knöpfe „Akzeptieren“/„Ablehnen“ der Anfragenseite. Ein Endpunkt zum **Annehmen** ist nicht bekannt.

**Mitglieder aus einer Gruppe entfernen:** Dafür ist kein Endpunkt bekannt.

---

## 8. Mitgliedersuche

### `POST user/search` ✅ 👁
Body (wie die Suchseite, ergänzt um `page` und `limit=20`):

```json
{
  "location": { "geo_id": "…", "country_iso": "DE", "country_name": "Germany", "…": "…", "distance": 0, "distance_unit": "km" },
  "genders": ["m"], "age_min": 60, "age_max": 60,
  "size_min": 130, "size_max": 220, "weight_min": 0, "weight_max": 300,
  "has_image": 0, "online": false, "enable_search_gender": false, "enable_fakecheck_status": false,
  "sort": ["last_riseup"], "order": ["desc"],
  "preference_conjunction": "or", "second_preference_conjunction": "or",
  "page": 1, "limit": 20
}
```

- `distance: 0` = ganzes Land.
- Antwort: `data.users[]`, `total`, `next_page`.
- Die Trefferzahl ist je Suche begrenzt. Das Skript sucht deshalb Alter für Alter und für die Figur-Badges Größe für Größe.
- Die Seite selbst lädt die Ergebnisse auch über diesen Endpunkt; das Skript sortiert dabei auf Wunsch die Antwort um.

---

## 9. Weitere bekannte, ungenutzte Endpunkte

### Übersicht aller ungenutzten Endpunkte

Diese Endpunkte sind bekannt, das Skript ruft sie aber nicht auf.

| Endpunkt | Abschnitt | Zweck |
|---|---|---|
| `messenger/backend/settings` | 2 | Chat-Verbindung (enthält Zugangsdaten, bewusst ungenutzt) |
| `ignore/be-ignored/uid/list` | 3 | IDs der Mitglieder, die einen selbst blockiert haben |
| `messenger/message/list` | 4 | Nachrichten einer Unterhaltung |
| `v2/comment/list` | 6 | Kommentare |
| `global/emojis` | 6 | Smiley-/Emoji-Liste |
| `group/attendee/specific/pending/list` | 7 | offene Beitrittsanfragen |
| `group/attendee/deny` | 7 | Beitrittsanfrage ablehnen |

### Allgemeine Abfragen der Seite

Die Seite ruft außerdem laufend allgemeine Endpunkte auf, die nichts mit einzelnen Mitgliedern zu tun haben. Der Rekorder erkennt sie an ihrem Pfad-Anfang und gibt für sie keinen Funktionshinweis. Ihr Zweck ist nur aus dem Namen erschlossen, Parameter und Antworten sind nicht ausgewertet.

| Pfad-Anfang | vermuteter Zweck |
|---|---|
| `i18n/…` | Übersetzungstexte (siehe `i18n/pull`) |
| `global/…` | allgemeine Daten der Seite (z. B. `global/emojis`) |
| `messenger/status…`, `messenger/irc…`, `messenger/backend…` | Zustand und Verbindung des Chats |
| `wio/…` | Sichtbarkeit / „Wer ist online“ |
| `dino…` | Zählung und Verfolgung durch die Seite (Kopfzeilen wie `dino_client` werden geschwärzt) |
| `user/gaclient…` | Statistik (Analytics-Kennung) |
| `fakecheck…` | Fake-Check-Status |
| `fsk18…` | Altersverifikation / FSK-18-Freigabe |
| `feedback…` | Rückmeldungen an poppen.de |
| `browser-notification…` | Browser-Benachrichtigungen |
| `tooltip…` | Hinweisblasen der Oberfläche |
| `points…` | Punkte-/Belohnungssystem |
| `egg-hunt…` | Aktions-Spiel (z. B. Ostern) |

Weitere Endpunkte lassen sich mit dem API-Rekorder finden (Abschnitt 11): Die gesuchte Funktion einmal von Hand auslösen und danach den Rekorder exportieren.

---

## 10. Seiten ohne API-Weg

| Aufgabe | Lösung im Skript |
|---|---|
| Profilbesucher lesen | Seite `/connection/visitors` unsichtbar laden und auslesen |
| Sperren ohne uid | Formular auf `/setting/privacy/ignore-list` |
| Beitrittsanfragen annehmen | Knopf „Akzeptieren“ auf `/groups/<id>/requests` |
| Ort des Zweitwohnsitzes | Seite `/setting/profile` |
| Zwischenseite „Du hast die Regie!“ | `/view/announcement/page/1236` wird übersprungen |

---

## 11. Rekorder

Mit *Experten-Einstellungen → API-Rekorder* schneidet das Skript die Abfragen der Seite mit: je Muster aus Pfad und Parametern zwei Beispiele, Listen auf zwei Einträge gekürzt.

Vor dem Speichern wird geschwärzt:
- E-Mail-Adressen, Passwörter, Token, Sitzungs-IDs, Telefonnummern
- Nachrichten-, Profil- und Notiztexte, Interview-Antworten
- genaue Koordinaten und Postleitzahl (die Stadt bleibt)
- beim Geburtstag alles außer dem Jahr

Unbekannte Endpunkte werden markiert. So lassen sich neue Funktionen einmal von Hand auslösen und danach nachbauen.
