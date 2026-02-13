# Analys av naturvärdesandelar (Ytandel) 🌲

Detta Python-verktyg är framtaget för att automatisera analysen av kartbilder, som är skärmdumpar från **Skogsmonitor**. 
Programmet beräknar den procentuella fördelningen av olika naturvärdesklasser baserat på färgnyanser i bilden.

## Funktioner
* Identifierar nyanser av rosa och lila som representerar olika nivåer av naturvärden.
* Räknar pixlar för att fastställa andel (%) av både den totala bilden och den identifierade skogsmarken.
* Genererar en ny analysbild med en resultattabell i botten.
* Bläddra för att välja filer.

Programmet mäter följande kategorier baserat på RGB-värden:
  **Rosa**          Potentiell äldre skog eller kontinuitetsskog
  **Mellanlila**    Troliga naturvärden
  **Mörklila**      Höga naturvärden
  **Grön**          Övrig skogsmark

##  Kom igång
1. STARTA:      Kör skriptet "Andel_naturvarde.py" i VS Code.
2. VÄLJ BILD:   Bläddra fram den PNG/JPG-bild du vill analysera. 
3. ANALYS:      Programmet räknar pixlar för varje färgklass.
4. RESULTAT: 
   - Statistiken skrivs ut direkt i terminalen i VS Code.
   - En ny bild skapas i samma mapp med namnet "Areaanalys_[filnamn].png".
   - Denna bild innehåller ursprungliga bilden med förstärka färger, samt 
     en tabell i botten med alla beräkningar 

## Förutsättningar
* Bibliotek i Python:   numpy   Pillow  tkinter  

## Att tänka på
* Skärmklippen bör ha högsta färgstyrka på kontinuitetslagret för att färgmatchningen ska fungera.
