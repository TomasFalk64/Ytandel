import numpy as np
from PIL import Image, ImageDraw, ImageFont 
from pathlib import Path
import tkinter as tk
from tkinter import filedialog

def skriv_ut_resultat(filnamn, data_resultat):
    """Hanterar presentation av statistik med fokus på procentandelar."""
    p_rosa, p_mellan, p_mork, p_gron, total_varda, total_skog, total_pixlar = data_resultat
    
    print(f"\nANALYS: {filnamn}")
    print("-" * 65)
    print(f"{'Kategori':<30} {'% av Skog':<15} {'% av Totala Bilden':<15}")
    print("-" * 65)
    
    if total_skog > 0:
        # Rosa
        print(f"{'Rosa (potentiell kontinuitet)':<25} {p_rosa/total_skog*100:>6.1f} % {p_rosa/total_pixlar*100:>18.1f} %")
        print(f"{'Mellanlila (Naturvärde)':<25} {p_mellan/total_skog*100:>10.1f} % {p_mellan/total_pixlar*100:>18.1f} %")
        # Mörklila
        print(f"{'Mörklila (Högsta värde)':<25} {p_mork/total_skog*100:>10.1f} % {p_mork/total_pixlar*100:>18.1f} %")
        
        print("-" * 65)
        # Summa Värdeareal
        print(f"{'TOTAL VÄRDEAREAL':<25} {total_varda/total_skog*100:>10.1f} % {total_varda/total_pixlar*100:>18.1f} %")
        # Total Skogsmark
        print(f"{'TOTAL SKOGSMARK':<25} {'100.0 %':>12} {total_skog/total_pixlar*100:>18.1f} %")
    else:
        print("Ingen skogsmark identifierad i bilden.")
        
    print("-" * 65)


def skapa_kontrollbild(img, masker, vald_fil, data_resultat):
    """Skapar en kontrollbild med en smal vit ram och informationspanel under."""
    m_rosa, m_mellan, m_mork, m_gron = masker
    p_rosa, p_mellan, p_mork, p_gron, total_varda, total_skog, total_pixlar = data_resultat
    
    # 1. Skapa själva mask-bilden
    kontroll_data = np.array(img.convert('L').convert('RGB'))
    kontroll_data[m_rosa] = [222, 77, 131]
    kontroll_data[m_mellan] = [167, 47, 163]
    kontroll_data[m_mork] = [84, 23, 111]
    kontroll_data[m_gron] = [34, 139, 34]
    mask_img = Image.fromarray(kontroll_data)
    
    # 2. Parametrar för ram och panel
    bredd, hojd = mask_img.size
    ram = 10           # Den smala vita ramen runt bilden
    panel_hojd = 280   # Något högre för att rymma tabellen snyggt
    
    # Skapa den nya canvasen med plats för ram på sidorna/toppen och panel i botten
    ny_bredd = bredd + (ram * 2)
    ny_hojd = hojd + panel_hojd + ram
    ny_bild = Image.new('RGB', (ny_bredd, ny_hojd), 'white')
    
    # Klistra in bilden med offset för ramen
    ny_bild.paste(mask_img, (ram, ram))
    
    draw = ImageDraw.Draw(ny_bild)
    
    # 3. Teckensnitt
    try:
        font_size = max(16, int(bredd / 100))
        font = ImageFont.truetype("arial.ttf", font_size)
        font_bold = ImageFont.truetype("arialbd.ttf", font_size + 4)
    except:
        font = ImageFont.load_default()
        font_bold = font

    # 4. Skriv tabellen (startar under bilden + ram)
    start_y = hojd + ram + 25
    kolumn1 = 40 + ram
    kolumn2 = ny_bredd * 0.45
    kolumn3 = ny_bredd * 0.75

    def sa(p, ref): return f"{p/ref*100:>6.2f}%" if ref > 0 else "0.00%"

    # Titel
    draw.text((kolumn1, start_y), f"Areaanalys: {vald_fil.name}", fill="black", font=font_bold)
    
    # Tabellhuvud
    y_tabell_start = start_y + (font_size * 1) + 15
    draw.text((kolumn1, y_tabell_start), "Kategori", fill="black", font=font_bold)
    draw.text((kolumn2, y_tabell_start), "% av Skog", fill="black", font=font_bold)
    draw.text((kolumn3, y_tabell_start), "% av Total", fill="black", font=font_bold)
    
    # Rader
    y = y_tabell_start + font_size + 15
    rader = [
        ("Rosa (Potentiell kontinuitet)", sa(p_rosa, total_skog), sa(p_rosa, total_pixlar)),
        ("Mellanlila (Naturvärde)", sa(p_mellan, total_skog), sa(p_mellan, total_pixlar)),
        ("Morklila (Höga naturvärden)", sa(p_mork, total_skog), sa(p_mork, total_pixlar)),
        ("-" * 35, "-" * 10, "-" * 10),
        ("TOTAL VÄRDEAREAL", sa(total_varda, total_skog), sa(total_varda, total_pixlar)),
        ("TOTAL SKOGSMARK", "100.00%", sa(total_skog, total_pixlar))
    ]

    for text, v1, v2 in rader:
        draw.text((kolumn1, y), text, fill="black", font=font)
        draw.text((kolumn2, y), v1, fill="black", font=font)
        draw.text((kolumn3, y), v2, fill="black", font=font)
        y += font_size + 8

    # 5. Spara
    kontroll_fil = vald_fil.parent / f"Areaanalys_{vald_fil.stem}.png"
    if kontroll_fil.exists():
        kontroll_fil.unlink()
    ny_bild.save(kontroll_fil)
    print(f"[info] Analysbild med ram och tabell sparad: {kontroll_fil.name}")

    # Öppnar bilden i Windows standardprogram för bildvisning
    ny_bild.show()


def analysera_nyanser(vald_fil):
    """  Färgseparation  """
    print(f"\n[process] Analyserar {vald_fil.name}...") 
    
    img_raw = Image.open(vald_fil)
    img = img_raw.convert('RGB')
    data = np.array(img).astype(float)
    
    R, G, B = data[:,:,0], data[:,:,1], data[:,:,2]
    total_pixlar = img.width * img.height

    # --- DIN MASK-LOGIK (Bevarad exakt) ---
    temp_gron = (G > R) & (G > B) & (G > 120)
    temp_rosa = (R > 130) & (R > G + 40) & (R > B)
    temp_mellan = (R > 130) & (B > 130) & (np.abs(R - B) < 40) & (R > G + 60)
    temp_mork = (B > 80) & (B > G + 40) & (B > R) & (R > G + 10)

    mask_morklila = temp_mork
    mask_mellanlila = temp_mellan & ~mask_morklila
    mask_rosa = temp_rosa & ~mask_mellanlila & ~mask_morklila
    mask_varda = mask_morklila | mask_mellanlila | mask_rosa
    mask_gron = temp_gron & ~mask_varda

    p_mork = np.sum(mask_morklila)
    p_mellan = np.sum(mask_mellanlila)
    p_rosa = np.sum(mask_rosa)
    p_gron = np.sum(mask_gron)
    
    total_varda = p_mork + p_mellan + p_rosa
    total_skog = total_varda + p_gron

    masker = (mask_rosa, mask_mellanlila, mask_morklila, mask_gron)
    resultat = (p_rosa, p_mellan, p_mork, p_gron, total_varda, total_skog, total_pixlar)

    skapa_kontrollbild(img, masker, vald_fil, resultat)   
    skriv_ut_resultat(vald_fil.name, resultat)

def valj_fil_1(mapp_stig, bild_suffix):
    """Hanterar filtrering av filer och användargränssnittet för val."""

    filer = [f for f in mapp_stig.iterdir() 
            if f.suffix.lower() in bild_suffix and not f.name.startswith("KONTROLL_")]
    
    if not filer:
        print(f"\n[!] Inga bildfiler hittades i {mapp_stig}")
        return None

    print('\n' + '-'*30)
    for i, f in enumerate(filer): print(f"[{i}] {f.name}")
        
    val = input("\nFil nummer (q för avsluta): ").lower()
    if val == 'q':  return None

    try:
        index = int(val)
        if 0 <= index < len(filer):
            return filer[index]
        else:
            print(f"[!] Ogiltigt nummer. Välj 0-{len(filer)-1}.")
    except ValueError:
        print("[!] Ange ett nummer eller 'q'.")
    
    return None

def valj_fil():
    """Öppnar en bläddraruta med en förinställd standardmapp och specifika filtyper."""
    standard_mapp = Path(r"C:\Users\Asus\Documents\Git repos\ytandel")
    
    # Kontrollera om mappen finns, annars använd nuvarande arbetskatalog
    start_stig = standard_mapp if standard_mapp.exists() else Path.cwd()

    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)

    # Här begränsar vi till bara png och jpg/jpeg
    filsokvag = filedialog.askopenfilename(
        initialdir=start_stig,
        title="Välj skogsbild för analys",
        filetypes=[
            ("Bildfiler", "*.png *.jpg *.jpeg")
        ]
    )
    
    root.destroy()
    return Path(filsokvag) if filsokvag else None


def main():

    print('\nAnalysera bild -  hur stor del är skog med låga eller höga naturvärden')
    print('Välj bild från skogsmonitor, med högsta färg på kontinuitetslagret')
    while True:

        if input("\nNy  bild? (j/n): ").lower() != 'j':     break

        vald_fil = valj_fil()
        
        if not vald_fil:
            print("Programmet avslutas.")
            break
            
        if vald_fil and isinstance(vald_fil, Path):         analysera_nyanser(vald_fil) 
        
            

if __name__ == "__main__":
    main()