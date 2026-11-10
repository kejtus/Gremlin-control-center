# Raport dostępności aplikacji RPilot

**Aplikacja:** RPilot (sterowanie robotem Gremlin)  
**Zakres:** ocena pod kątem *Design for All* / projektowania dla wszystkich oraz wsparcia osób z niepełnosprawnościami  
**Podstawa merytoryczna:** materiał „Projektowanie dla wszystkich” (Design4All) — WCAG, potrzeby grup użytkowników, interfejsy głosowe, audyt dostępności  
**Data:** październik 2026  

---

## 1. Cel raportu

Raport opisuje, **jak RPilot wspiera osoby z różnymi niepełnosprawnościami i szczególnymi potrzebami**, w odniesieniu do zasad Design for All oraz czterech filarów WCAG (postrzegalność, funkcjonalność, zrozumiałość, solidność).

Nie jest to pełny formalny audyt WCAG z walidatorami i testami użytkowników — to **raport aplikacyjny**: mapowanie wdrożonych funkcji dostępności, luk oraz rekomendacji dalszego rozwoju.

---

## 2. Kontekst: Design for All a RPilot

Według Design for All produkt powinien być **od początku** projektowany tak, by był dostępny i użyteczny dla możliwie szerokiego grona użytkowników — bez konieczności późniejszej „łatki” tylko dla wybranych grup.

| Składowa DfA | Znaczenie w RPilot |
| --- | --- |
| **User-Centered Design** | Panel „Dostępność” z przełącznikami, preferencje zapisywane lokalnie |
| **Dostępność + technologie asystujące** | TTS, etykiety `accessibilityLabel`, tryb zbliżony do VoiceOver (dwuklik) |
| **Projektowanie uniwersalne** | Ta sama aplikacja: sterowanie joystickiem, głosem, dużymi przyciskami, wysokim kontrastem |

RPilot jest aplikacją **sterującą urządzeniem fizycznym** (robot). Dostępność dotyczy więc zarówno **interfejsu mobilnego**, jak i **bezpiecznej, zrozumiałej interakcji** z robotem (status, kamera, program ON/OFF, STOP).

---

## 3. Grupy użytkowników i wsparcie w aplikacji

Poniżej — potrzeby wskazane w materiale Design4All oraz odpowiadające im rozwiązania (lub braki) w RPilot.

### 3.1. Osoby niewidome, ociemniałe i słabowidzące

| Potrzeba (DfA / WCAG) | Stan w RPilot |
| --- | --- |
| Synteza mowy / czytnik ekranu | **Tak** — TTS (`expo-speech`), `AccessibilityInfo.announceForAccessibility`, tryb **„Odczyt dwuklik”** (1. tap = odczyt, 2. = akcja) |
| Napisy / feedback tekstowy | **Tak** — napis (caption) na dole ekranu przy ogłoszeniach |
| Powiększenie tekstu | **Tak** — „Duży tekst” (~145% skali typografii w UI) |
| Wysoki kontrast | **Tak** — motyw żółty na czarnym (`HIGH_CONTRAST_COLORS`) |
| Kolor nie jako jedyna informacja | **Częściowo** — statusy mają tekst (ON/OFF, nazwy urządzeń); ikony zakładek mogą dostać **etykiety tekstowe** |
| Alternatywa dla obrazu (kamera) | **Częściowo** — kamera to strumień wizualny; brak pełnej audiodeskrypcji sceny; komunikaty o stanie streamu (oczekiwanie / błąd) są tekstowe i mogą być ogłaszane |
| Test syntezatora | **Tak** — przycisk „Test głosu” w panelu dostępności |

**Jak aplikacja wspiera:** użytkownik słabowidzący lub niewidomy może powiększyć UI, włączyć kontrast, odczytywać etykiety przycisków głosem i otrzymywać ogłoszenia zmian zakładki/statusu — bez osobnej „wersji dla niewidomych”.

### 3.2. Osoby niesłyszące i słabosłyszące

| Potrzeba | Stan w RPilot |
| --- | --- |
| Informacja nie tylko dźwiękiem | **Tak** — komunikaty statusu, błędy połączenia, stany urządzeń są **wizualne** (tekst, kolory + etykiety) |
| Napisy do multimediów | **N/D / luka** — brak ścieżki audio w kamerze; ewentualne dźwięki robota nie mają napisów |
| Prosty język | **Częściowo** — UI po polsku, krótkie etykiety; część komunikatów technicznych (WS, IP, porty) jest trudniejsza |

**Jak aplikacja wspiera:** sterowanie i diagnostyka opierają się na ekranie, nie na samym dźwięku. TTS jest opcjonalny — osoby głuche mogą go wyłączyć i korzystać z napisów/caption oraz zwykłego UI.

### 3.3. Osoby z niepełnosprawnością ruchową

| Potrzeba | Stan w RPilot |
| --- | --- |
| Duże cele dotykowe | **Tak** — „Większe przyciski” (skala touch/ikony/joysticków, `hitSlop`) |
| Alternatywa dla precyzyjnego gestu | **Tak** — sterowanie głosowe (zakładka Głos / STT), gotowe ruchy, STOP |
| Obsługa klawiaturą zewnętrzną | **Częściowo** — web/Expo; nie wszystkie ścieżki joysticka są równoważne klawiaturze |
| Mniej precyzji przy drżeniu rąk | **Tak** — większe cele + komendy głosowe + przyciski zamiast wyłącznie ciągłego gestu |

**Jak aplikacja wspiera:** osoba z ograniczoną sprawnością dłoni może powiększyć przyciski, unikać precyzyjnego joysticka na rzecz głosów / padów i zatrzymać robota wyraźnym STOP.

### 3.4. Ograniczenia poznawcze, intelektualne, uwagi

| Potrzeba | Stan w RPilot |
| --- | --- |
| Prosta, przewidywalna nawigacja | **Częściowo** — stałe zakładki boczne; etykiety tekstowe pod ikonami (opcjonalnie) |
| Mniej rozpraszaczy / ruchu | **Tak** — „Mniej animacji” (`reduceMotion`, także z preferencji systemowych na web) |
| Jasne stany | **Tak** — Program ON/OFF, połączenie, status urządzeń |
| Limit czasu | **Częściowo** — brak sztucznego timeoutu UI; heartbeat do Pi jest w tle i niewidoczny |

**Jak aplikacja wspiera:** spójny układ zakładek, możliwość wyłączenia animacji i ogłaszania zmian głosem ułatwia orientację osobom z trudnościami poznawczymi lub ADHD.

### 3.5. Padaczka fotogenna / nadwrażliwość na światło

| Potrzeba | Stan w RPilot |
| --- | --- |
| Brak agresywnego migania | **Zasadniczo tak** — brak celowych błysków >3 Hz w UI |
| Kontrola ruchu | **Tak** — reduce motion; kamera to ciągły obraz (użytkownik może wyłączyć stream) |

### 3.6. Osoby starsze / mało doświadczone cyfrowo

| Potrzeba | Stan w RPilot |
| --- | --- |
| Duży tekst, kontrast, proste etykiety | **Tak** |
| Wejście do ustawień a11y | **Tak** — widoczny wpis „Dostępność” już na ekranie łączenia |
| Język polski w TTS | **Tak** — preferencja głosów `pl` |

---

## 4. Wbudowane funkcje dostępności (implementacja)

Panel **Dostępność** (`AccessibilityPanel`) — przełączniki zapisywane w `AsyncStorage` (`rpilot.a11y.prefs`):

| Funkcja | Opis | Powiązanie z WCAG / DfA |
| --- | --- | --- |
| **Duży tekst** | Skala czcionki ~1,45× w komponentach | 1.4.4 Zmiana rozmiaru tekstu |
| **Wysoki kontrast** | Żółty tekst na czarnym tle | 1.4.3 / 1.4.6 Kontrast |
| **Etykiety zakładek** | Nazwa pod ikoną | 1.3.3 / 2.4.6 — nie tylko kształt ikony |
| **Większe przyciski** | Większe cele dotyku i ikony | 2.5 (cele) / funkcjonalność ruchowa |
| **Odczyt dwuklik** | 1. tap = TTS + caption, 2. = akcja | AT / VoiceOver-like; wytyczne UI głosowego |
| **Mniej animacji** | Redukcja ruchu | 2.2.2 / 2.3 — komfort, padaczka, zawroty |
| **Ogłaszaj zmiany** | TTS + napis przy zmianie kontekstu | 4.1.2 / live regions (przybliżenie) |
| **Test głosu** | Diagnostyka syntezatora PL | Wytyczne interfejsów głosowych |

Dodatkowo w kodzie:

- komponent **`A11yPressable`** — jednolite etykiety, hinty, tryb explore;
- skalowanie typografii **`a11yFont`** w zakładkach (Status, Connect, Kamera, Scratch, Footer itd.);
- rozpoznawanie mowy / STT — **alternatywny kanał sterowania** (ruch → głos), zgodny z ideą wielu sposobów osiągnięcia celu (użyteczność DfA).

---

## 5. Ocena względem zasad WCAG 2.x

Skala: **spełnione / częściowo / luka** (ocena ekspercka na podstawie kodu i zachowania aplikacji, nie pełnego audytu).

### 5.1. Postrzegalność

| Kryterium (orientacyjnie) | Ocena | Komentarz |
| --- | --- | --- |
| 1.1.1 Alternatywa tekstowa | Częściowo | Przyciski mają labele; kamera bez opisu treści obrazu |
| 1.3.3 Nie tylko zmysłowo | Częściowo | Etykiety zakładek opcjonalne; statusy tekstowe |
| 1.4.1 Kolor nie jedyny | Częściowo | HC + tekst; ikony same w sobie wymagają etykiet |
| 1.4.3 Kontrast AA | Częściowo / Tak (tryb HC) | Tryb HC celuje w wysoki kontrast; motyw bazowy — do pomiaru walidatorem |
| 1.4.4 Rozmiar tekstu | Tak (w aplikacji) | Własna skala; zależność od systemowego zoom OS — do testów |

### 5.2. Funkcjonalność

| Kryterium | Ocena | Komentarz |
| --- | --- | --- |
| 2.1 Klawiatura | Częściowo | Lepiej na web; joystick nie jest w pełni klawiaturowy |
| 2.2 Czas | Tak / Częściowo | Brak sztucznych limitów UI |
| 2.3 Błyski | Tak | Brak celowego migania UI |
| 2.4 Nawigacja / fokus | Częściowo | Zakładki stałe; widoczność fokusa zależy od platformy |
| Cele dotykowe | Tak (opcja) | „Większe przyciski” |

### 5.3. Zrozumiałość

| Kryterium | Ocena | Komentarz |
| --- | --- | --- |
| 3.1 Język | Tak | UI i TTS po polsku |
| 3.2 Przewidywalność | Częściowo | Spójne zakładki; komunikaty sieciowe bywają techniczne |
| 3.3 Błędy / etykiety | Częściowo | Błędy połączenia opisane tekstem; formularz IP ma placeholder |

### 5.4. Solidność (kompatybilność)

| Kryterium | Ocena | Komentarz |
| --- | --- | --- |
| 4.1.2 Nazwa, rola, wartość | Częściowo | Role/label na kluczowych kontrolkach; nie 100% powierzchni UI |
| Technologie asystujące | Częściowo | TTS własny + announce; pełna współpraca z TalkBack/VoiceOver — do testów urządzeń |

**Szacunkowy poziom:** elementy odpowiadające **A–AA** w zakresie kontrastu (tryb HC), rozmiaru tekstu, redukcji ruchu i etykiet; **pełne AA/AAA** wymagałoby formalnego audytu i testów z użytkownikami.

---

## 6. Wytyczne interfejsów głosowych (Design4All) a RPilot

Materiał DfA zaleca m.in.:

1. informować, **co można zrobić**,  
2. informować, **z jakiej funkcji się korzysta i jak wyjść**,  
3. podawać **przykłady intencji**,  
4. **ograniczać liczbę opcji** (≤3 naraz, gdy to możliwe),  
5. dawać **wizualne sprzężenie**, że mikrofon/TTS jest aktywny.

| Wytyczna | RPilot |
| --- | --- |
| Co można zrobić | Panel Dostępność z opisami; zakładka Głos |
| Status funkcji | Caption + TTS przy explore / announce |
| Przykłady | Test głosu; komendy STT zależne od backendu |
| Zwartość | Przełączniki a11y — krótkie tytuły + hint |
| Feedback wizualny | Napis na dole; stany połączenia i Program ON |

**Sterowanie głosowe robota** (STT) to dodatkowy kanał dostępności ruchowej — zgodny z ideą wielu dróg do celu, ale wymaga czytelnego feedbacku „nasłuchuję / rozpoznano / błąd” (warto utrzymać i rozwijać).

---

## 7. Jak aplikacja ma wspierać osoby z niepełnosprawnościami — model wsparcia

RPilot nie jest „osobną apką dla niepełnosprawnych”. W myśl Design for All:

1. **Jedna aplikacja, wiele trybów** — użytkownik sam dobiera kontrast, tekst, cele dotyku, odczyt i głos.  
2. **Wielokanałowość sterowania** — joystick / pad / głos / STOP — osoba wybiera kanał dopasowany do sprawności.  
3. **Informacja zwrotna wielozmysłowa** — wzrok (UI, kamera) + słuch (TTS) + tekst (caption, statusy).  
4. **Bezpieczeństwo jako dostępność** — czytelny STOP, status Program ON/OFF, komunikaty o utracie połączenia chronią też użytkowników, którzy wolniej reagują lub gorzej widzą.  
5. **Wejście bez bariery** — ustawienia dostępności dostępne **przed** połączeniem z robotem (ekran Connect).

```
                    ┌─────────────────────────┐
                    │   Preferencje a11y      │
                    │  tekst · kontrast · TTS │
                    └───────────┬─────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
   Wejście wzrokowe      Wejście głosowe         Wejście ruchowe
   (UI, kamera, HC)      (STT, TTS)              (duże cele, pad)
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                ▼
                     Sterowanie robotem Gremlin
                     (WS · program ON · STOP)
```

---

## 8. Luki i rekomendacje (kolejne iteracje)

Priorytet zgodny z DfA / WCAG AA:

| Priorytet | Rekomendacja |
| --- | --- |
| Wysoki | Testy z **TalkBack** (Android) i **VoiceOver** (iOS) — kolejność fokusa, role, ogłoszenia |
| Wysoki | Pomiar kontrastu motywu bazowego (nie tylko HC) walidatorem (np. Contrast Checker) |
| Wysoki | Pełne etykiety `accessibilityLabel` na joysticku, wszystkich przyciskach padów i Scratch |
| Średni | Prostszy język komunikatów sieciowych + krótki przewodnik „pierwsze uruchomienie” w UI |
| Średni | Audiodeskrypcja / status głosowy kamery („stream działa”, „brak klatek”) — bez opisu sceny |
| Średni | Równoważna obsługa klawiaturą wybranych akcji (STOP, start/stop stream, zmiana zakładki) |
| Niski | Deklaracja dostępności (wzór z ustawy o dostępności cyfrowej) — jeśli produkt trafi do podmiotu publicznego |
| Niski | Formalny audyt + sesje z użytkownikami (niewidomi, ruchowo, poznawczo) |

---

## 9. Podsumowanie

RPilot wdraża **świadome funkcje Design for All**: wysoki kontrast, duży tekst, większe cele dotykowe, etykiety zakładek, redukcję animacji, syntezę mowy z trybem dwukliku oraz ogłaszanie zmian — uzupełnione o **sterowanie głosowe** jako alternatywę dla precyzyjnych gestów.

Aplikacja **wspiera osoby z niepełnosprawnościami** przede wszystkim przez:

- **dostosowanie warstwy prezentacji** (wzrok),  
- **alternatywne kanały sterowania** (ruch / głos),  
- **sprzężenie zwrotne tekstowe i głosowe** (słuch / poznanie),  
- **bezpieczeństwo operacyjne** zrozumiałe także przy ograniczeniach sensorycznych i ruchowych.

Pełna zgodność z poziomem **WCAG 2.x AA** wymaga jeszcze systematycznych testów z technologiami asystującymi oraz domknięcia etykiet i kontrastu w motywie domyślnym. Obecny kierunek — **funkcje dostępności wbudowane w produkt**, a nie doklejone później — jest zgodny z ideą *Projektowania dla wszystkich*.

---

## 10. Załączniki / odniesienia

- Materiał źródłowy: *Projektowanie dla wszystkich* (Design4All) — DfA, wykluczenie cyfrowe, WCAG, audyt, UI głosowe  
- Kod: `mobile/src/accessibility.tsx`, `mobile/src/components/AccessibilityPanel.tsx`, `mobile/src/theme.ts`  
- WCAG 2.0 / 2.1 — zasady POUR (postrzegalność, funkcjonalność, zrozumiałość, solidność)  
- Kontekst prawny (DfA): m.in. ustawa o dostępności cyfrowej (podmioty publiczne), Konwencja ONZ o prawach osób niepełnosprawnych  

---

*Dokument wewnętrzny projektu RPilot / mobile-rpi-robot-ctrl. Nie zastępuje formalnego Raportu Dostępności Cyfrowej z pełnego audytu.*
