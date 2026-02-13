# Analys av naturvärdesandelar (Ytandel) 🌲

Detta Python-verktyg är framtaget för att automatisera analysen av kartbilder, som är skärmdumpar från **Skogsmonitor**. 
Programmet beräknar den procentuella fördelningen av olika naturvärdesklasser baserat på färgnyanser i bilden.

## Funktioner
* **Automatisk färgseparering:** Identifierar nyanser av rosa och lila som representerar olika nivåer av naturvärden.
* **Arealberäkning:** Räknar pixlar för att fastställa andel (%) av både den totala bilden och den identifierade skogsmarken.
* **Visuell kontroll:** Genererar en ny analysbild med en resultattabell i botten.
* **Interaktivt val:** Bläddra för att välja filer.

##  Klassificeringar
Programmet mäter följande kategorier baserat på RGB-värden:

| Kategori | Beskrivning | Färg i analysbild |
| :--- | :--- | :--- |
| **Rosa** | Potentiell kontinuitetsskog | `[222, 77, 131]` |
| **Mellanlila** | Fastställda naturvärden | `[167, 47, 163]` |
| **Mörklila** | Högsta naturvärden (prioriterat) | `[84, 23, 111]` |
| **Grön** | Övrig skogsmark | `[34, 139, 34]` |

##  Kom igång
1. STARTA: Kör skriptet "Andel_naturvarde.py" i VS Code.
2. VÄLJ BILD: En fönsterruta öppnas. Bläddra fram den PNG/JPG-bild 
   du vill analysera. 
3. ANALYS: Programmet räknar pixlar för varje färgklass.
4. RESULTAT: 
   - Statistiken skrivs ut direkt i terminalen i VS Code.
   - En ny bild skapas i samma mapp med namnet "Areaanalys_[filnamn].png".
   - Denna bild innehåller ursprungliga bilden med förstärka färger, samt 
     en tabell i botten med alla beräkningar 

## Förutsättningar
* Bibliotek i Python:   numpy   Pillow  tkinter  

## Att tänka på
* Skärmklippen bör ha högsta färgstyrka på kontinuitetslagret för att färgmatchningen ska fungera.
