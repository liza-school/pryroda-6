"""Нарізає малюнки з PDF підручника в course/img. Запуск з кореня репозиторію:
   PYTHONIOENCODING=utf-8 python course/tools/figs.py [назва ...]
Прямокутники — у пунктах PDF (сторінка PDF = стор. книжки + 2)."""
import sys, os, fitz
from PIL import Image

PDF = "Piznaemo-prirodu-6-kl.pdf"
OUT = "course/img"
# назва: (сторінка PDF, x0, y0, x1, y1)
FIGS = {
    "zvuk-kolyvannya":  (55, 66, 274, 392, 367),
    "zvuk-model":       (57, 36, 72, 420, 152),
    "thrust":           (57, 281, 236, 418, 346),
    "mushlya":          (57, 39, 518, 419, 620),
    "vukho":            (58, 58, 390, 276, 520),
    "navushnyky":       (59, 36, 170, 246, 263),
    "metoryt":          (60, 298, 400, 439, 572),
    "sklad-kory":       (61, 218, 466, 420, 624),
    "sklad-hidro-atm":  (62, 58, 222, 430, 352),
    "sumishi":          (63, 36, 426, 406, 607),
    "splavy":           (64, 246, 256, 438, 337),
    "magnit":           (65, 36, 192, 266, 276),
    "pisok-voda":       (65, 232, 300, 404, 440),
    "zoloto":           (65, 274, 468, 420, 558),
    "solyanyy":         (66, 58, 277, 440, 391),
    "zvorotni":         (68, 58, 349, 440, 443),
    "yayechnya":        (69, 184, 72, 420, 159),
    "statuya":          (69, 242, 314, 420, 485),
    "plisnyava":        (70, 56, 70, 442, 222),
    "ahregatni":        (70, 57, 412, 422, 524),
    "horinnya":         (71, 38, 168, 214, 271),
    "horinnya-model":   (71, 196, 217, 364, 268),
    # § 17 — рухи Землі й Місяця
    "den-nich":         (73, 86, 329, 371, 452),
    "pory-roku":        (76, 60, 385, 437, 583),
    "misyachni-fazy":   (77, 40, 325, 263, 478),
    "zatemnennya-tin":  (79, 39, 187, 162, 303),
    "pryplyvy":         (79, 40, 527, 243, 620),
    # § 18 — живлення організмів
    "sklad-organizmiv": (82, 58, 360, 437, 575),
    "avto-hetero":      (83, 37, 248, 420, 308),
    "fotosyntez":       (84, 60, 325, 432, 406),
    "zmishane-zhyvl":   (85, 38, 505, 440, 598),
}

def main(names):
    d = fitz.open(PDF)
    for n in names or FIGS:
        pno, x0, y0, x1, y1 = FIGS[n]
        pix = d[pno - 1].get_pixmap(matrix=fitz.Matrix(3, 3), clip=fitz.Rect(x0, y0, x1, y1))
        im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        im.thumbnail((1000, 1000))
        im.save(os.path.join(OUT, n + ".jpg"), "JPEG", quality=86)
        print(n, im.size)

if __name__ == "__main__":
    main(sys.argv[1:])
