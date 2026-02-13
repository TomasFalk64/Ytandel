import numpy as np
from PIL import Image
from pathlib import Path

def analysera_nyanser(vald_fil, mapp_stig):
    print(f"\n[process] Läser in {vald_fil.name}...")  
         
    img_raw = Image.open(vald_fil)
    img = img_raw.convert('RGB')
    data = np.array(img).astype(float)
        
    R, G, B = data[:,:,0], data[:,:,1], data[:,:,2]
    h, w = data.shape[:2] # Sparar dimensionerna för statistik

    # --- DEFINIERA GRUNDMASKER (Baserat på dina GIMP-prover) ---
    if True:
        # Grön bakgrund (d4eeb7): Grön är störst av alla kanaler.
        temp_gron = (G > R) & (G > B) & (G > 120)
        # Rosa (de4d83): Röd är dominant, minst 40 enheter över Grön.
        temp_rosa = (R > 130) & (R > G + 40) & (R > B)
        # Mellanlila (a72fa3): R och B är båda starka (över 140) och nära varandra.
        temp_mellan = (R > 130) & (B > 130) & (np.abs(R - B) < 40) & (R > G + 60)
        # Mörklila (54176f): Mörkare totalt, men B är tydligt störst.
        temp_mork = (B > 80) & (B > G + 40) & (B > R) & (R > G + 10)
    else:
        # Vi skapar tillfälliga masker för att se vad som matchar vad
        temp_mork = (B > 70) & (B > G + 30) & (B > R - 20) & (R > G + 15)
        temp_mellan = (R > 120) & (B > 120) & (np.abs(R - B) < 40) & (R > G + 50)
        temp_rosa = (R > 130) & (R > G + 40) & (R > B)
        temp_gron = (G > R) & (G > B) & (G > 100)

    # --- EXKLUDERANDE LOGIK (Viktigt!) ---
    # Vi tilldelar varje pixel till MAX en kategori
    mask_morklila = temp_mork
    mask_mellanlila = temp_mellan & ~mask_morklila
    mask_rosa = temp_rosa & ~mask_mellanlila & ~mask_morklila
    
    # Skogsmark är grön, men får inte vara någon av de lila/rosa ovan
    mask_varda = mask_morklila | mask_mellanlila | mask_rosa
    mask_gron = temp_gron & ~mask_varda

    # --- MATEMATIK (Nu blir summan max 100%) ---
    p_mork = np.sum(mask_morklila)
    p_mellan = np.sum(mask_mellanlila)
    p_rosa = np.sum(mask_rosa)
    p_gron = np.sum(mask_gron)
    
    total_varda = p_mork + p_mellan + p_rosa
    total_skog = total_varda + p_gron
    total_pixlar = img.width * img.height

    # --- KONTROLLBILD ---
    kontroll_data = np.array(img.convert('L').convert('RGB'))
    kontroll_data[mask_rosa] = [222, 77, 131]       # Rosa (de4d83)
    kontroll_data[mask_mellanlila] = [167, 47, 163] # Mellanlila (a72fa3)
    kontroll_data[mask_morklila] = [84, 23, 111]    # Mörklila (54176f)
    kontroll_data[mask_gron] = [34, 139, 34]        # Skogsgrön (Referens)
    
    kontroll_img = Image.fromarray(kontroll_data)
    kontroll_fil = mapp_stig / f"KONTROLL_{vald_fil.stem}.png"
    if kontroll_fil.exists():
        kontroll_fil.unlink() # Tar bort den gamla filen5
    kontroll_img.save(kontroll_fil)

    # --- UTSKRIFT ---
    print(f"RESULTAT FÖR: {vald_fil.name}")
    print("="*60)
    if total_skog > 0:
        print(f"Rosa (Kontinuitet):      {p_rosa:>10} px ({p_rosa/total_skog*100:>6.2f}% av skog)")
        print(f"Mellanlila (Naturvärden): {p_mellan:>10} px ({p_mellan/total_skog*100:>6.2f}% av skog)")
        print(f"Mörklila (Höga värden):   {p_mork:>10} px ({p_mork/total_skog*100:>6.2f}% av skog)")
        print("-" * 60)
        print(f"TOTAL VÄRDEAREAL:        {total_varda:>10} px ({total_varda/total_skog*100:>6.2f}% av skog)")
        print(f"TOTAL SKOGSMARK:         {total_skog:>10} px ({total_skog/total_pixlar*100:>6.2f}% av bilden)")
    else:
        print("Ingen skogsmark identifierad.")
    print("="*60)

def main():
    mapp_stig = Path(r"C:\Users\Asus\Documents\Git repos\ytandel")
    while True:
        bild_suffix = {'.png', '.jpg', '.jpeg'}
        filer = [f for f in mapp_stig.iterdir() 
                if f.suffix.lower() in bild_suffix and not f.name.startswith("KONTROLL_")]
        print('------------------------------')
        for i, f in enumerate(filer): print(f"[{i}] {f.name}")
        val = input("\nFil nummer (q för avsluta): ")
        if val.lower() == 'q': break

        try:
            index = int(val)
            if 0 <= index < len(filer):
                analysera_nyanser(filer[index], mapp_stig)
            else:
                print(f"[!] Ogiltigt nummer. Välj mellan 0 och {len(filer)-1}.")
        except ValueError:
            print("[!] Fel: Ange ett nummer eller 'q'.")
        except Exception as e:
            print(f"[  !  ] Ett oväntat fel uppstod: {e}")
        

if __name__ == "__main__":
    main()