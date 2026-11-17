# -*- coding: utf-8 -*-
"""LOADED DICE 픽셀아트 에셋 생성기 (Pillow)
- 아이콘 32x32 (16x16 드로잉 → x2 니어리스트 업스케일)
- 배경 bg_main / bg_game (240x135 → x4)
사용: python tools/gen_assets.py
"""
import os
import math
import random
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets')
os.makedirs(OUT, exist_ok=True)
random.seed(42)

INK = (42, 32, 24, 255)
PARCH = (232, 217, 176, 255)
GOLD = (232, 200, 74, 255)
RED = (212, 82, 78, 255)
GREEN = (85, 178, 79, 255)
BLUE = (78, 142, 212, 255)
WHITE = (245, 240, 225, 255)

# 3x5 픽셀 숫자/기호 폰트
TINYFONT = {
    '0': ["111", "101", "101", "101", "111"],
    '1': ["010", "110", "010", "010", "111"],
    '2': ["111", "001", "111", "100", "111"],
    '3': ["111", "001", "111", "001", "111"],
    '7': ["111", "001", "010", "010", "010"],
    '$': ["010", "111", "110", "011", "111"],
}

def tiny_text(d, x, y, ch, color, scale=2):
    rows = TINYFONT[ch]
    for r, row in enumerate(rows):
        for c, v in enumerate(row):
            if v == '1':
                d.rectangle([x + c * scale, y + r * scale,
                             x + c * scale + scale - 1, y + r * scale + scale - 1], fill=color)

def tile(bg):
    """16x16 아이콘 타일 배경"""
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([1, 1, 14, 14], fill=bg, outline=INK)
    d.rectangle([0, 0, 15, 15], outline=(0, 0, 0, 255))
    # 하이라이트/섀도
    d.line([2, 2, 13, 2], fill=tuple(min(255, c + 40) for c in bg[:3]) + (255,))
    d.line([2, 13, 13, 13], fill=tuple(max(0, c - 50) for c in bg[:3]) + (255,))
    return im, d

def pips(d, n, fg=INK, face=WHITE):
    d.rectangle([3, 3, 12, 12], fill=face, outline=INK)
    P = {1: [(7, 7)], 2: [(5, 5), (9, 9)], 3: [(4, 4), (7, 7), (10, 10)],
         4: [(5, 5), (5, 9), (9, 5), (9, 9)],
         5: [(4, 4), (4, 10), (7, 7), (10, 4), (10, 10)],
         6: [(4, 4), (4, 7), (4, 10), (10, 4), (10, 7), (10, 10)]}
    for x, y in P[n]:
        d.rectangle([x, y, x + 1, y + 1], fill=fg)

# ---------------- 아이콘 글리프 ----------------
def icon_die():
    im, d = tile((122, 90, 46, 255)); pips(d, 5); return im
def icon_six():
    im, d = tile((110, 60, 40, 255)); pips(d, 6); return im
def icon_yacht():
    im, d = tile((160, 120, 30, 255)); pips(d, 5, face=GOLD); return im
def icon_coin():
    im, d = tile((90, 70, 30, 255))
    d.ellipse([3, 3, 12, 12], fill=GOLD, outline=INK)
    tiny_text(d, 5, 4, '$', INK, 1)
    return im
def icon_bag():
    im, d = tile((90, 70, 30, 255))
    d.polygon([(7, 3), (9, 3), (10, 5), (6, 5)], fill=(150, 110, 60, 255), outline=INK)
    d.ellipse([3, 5, 12, 13], fill=(150, 110, 60, 255), outline=INK)
    tiny_text(d, 6, 7, '$', GOLD, 1)
    return im
def icon_lock():
    im, d = tile((80, 80, 90, 255))
    d.arc([4, 2, 11, 9], 180, 360, fill=INK, width=2)
    d.rectangle([3, 7, 12, 13], fill=(170, 170, 180, 255), outline=INK)
    d.rectangle([7, 9, 8, 11], fill=INK)
    return im
def icon_chain():
    im, d = tile((70, 70, 75, 255))
    for i, (x, y) in enumerate([(2, 2), (6, 6), (10, 10)]):
        d.ellipse([x, y, x + 4, y + 4], outline=(200, 200, 210, 255), width=2)
    return im
def icon_yinyang():
    im, d = tile((90, 60, 100, 255))
    d.ellipse([3, 3, 12, 12], fill=WHITE, outline=INK)
    d.pieslice([3, 3, 12, 12], 90, 270, fill=INK)
    return im
def icon_chart():
    im, d = tile((50, 90, 60, 255))
    for i, hgt in enumerate([4, 7, 10]):
        x = 3 + i * 4
        d.rectangle([x, 13 - hgt, x + 2, 13], fill=GOLD, outline=INK)
    return im
def icon_small():
    im, d = tile((70, 90, 110, 255))
    d.rectangle([6, 6, 9, 9], fill=WHITE, outline=INK)
    return im
def icon_crown():
    im, d = tile((120, 90, 20, 255))
    d.polygon([(3, 12), (3, 6), (6, 9), (8, 4), (10, 9), (13, 6), (13, 12)], fill=GOLD, outline=INK)
    return im
def icon_moon():
    im, d = tile((40, 50, 80, 255))
    d.ellipse([3, 3, 12, 12], fill=(240, 230, 180, 255))
    d.ellipse([6, 2, 15, 11], fill=(40, 50, 80, 255))
    return im
def icon_cup():
    im, d = tile((100, 60, 40, 255))
    d.polygon([(4, 3), (11, 3), (10, 11), (5, 11)], fill=(160, 110, 60, 255), outline=INK)
    d.rectangle([3, 11, 12, 13], fill=(120, 80, 45, 255), outline=INK)
    return im
def icon_scatter():
    im, d = tile((90, 60, 60, 255))
    for x, y in [(4, 4), (10, 3), (6, 8), (12, 9), (3, 11)]:
        d.rectangle([x, y, x + 1, y + 1], fill=WHITE)
    return im
def icon_triple():
    im, d = tile((60, 80, 100, 255))
    for i in range(3):
        d.rectangle([4, 3 + i * 4, 11, 5 + i * 4], fill=WHITE, outline=INK)
    return im
def icon_num(n, bg):
    def f():
        im, d = tile(bg)
        tiny_text(d, 5, 3, n, WHITE, 2)
        return im
    return f
def icon_hand():
    im, d = tile((110, 80, 50, 255))
    d.rectangle([5, 6, 11, 13], fill=(230, 190, 150, 255), outline=INK)
    for i in range(4):
        d.rectangle([5 + i * 2, 3, 5 + i * 2, 6], fill=(230, 190, 150, 255), outline=None)
    d.line([4, 6, 12, 6], fill=INK)
    return im
def icon_freeze():
    im, d = tile((50, 80, 110, 255))
    d.line([7, 2, 7, 13], fill=(200, 230, 255, 255), width=2)
    d.line([2, 7, 13, 7], fill=(200, 230, 255, 255), width=2)
    d.line([3, 3, 12, 12], fill=(200, 230, 255, 255))
    d.line([12, 3, 3, 12], fill=(200, 230, 255, 255))
    return im
def icon_eye():
    im, d = tile((80, 60, 90, 255))
    d.ellipse([2, 5, 13, 11], fill=WHITE, outline=INK)
    d.ellipse([6, 5, 10, 10], fill=BLUE, outline=INK)
    d.rectangle([7, 7, 8, 8], fill=INK)
    return im
def icon_charm():
    im, d = tile((110, 70, 40, 255))
    cx, cy = 7.5, 7.5
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        r = 6 if i % 2 == 0 else 2.6
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    d.polygon(pts, fill=GOLD, outline=INK)
    return im
def icon_straight():
    im, d = tile((60, 90, 80, 255))
    for i in range(4):
        d.rectangle([2 + i * 3, 11 - i * 3, 4 + i * 3, 13 - i * 3], fill=WHITE, outline=INK)
    return im
def icon_house():
    im, d = tile((100, 70, 50, 255))
    d.polygon([(2, 8), (7, 3), (13, 8)], fill=RED, outline=INK)
    d.rectangle([4, 8, 11, 13], fill=(220, 190, 140, 255), outline=INK)
    d.rectangle([7, 10, 8, 13], fill=INK)
    return im
def icon_recycle():
    im, d = tile((50, 90, 60, 255))
    d.arc([3, 3, 12, 12], 30, 300, fill=WHITE, width=2)
    d.polygon([(11, 2), (14, 5), (10, 6)], fill=WHITE)
    return im
def icon_list(n, bg):
    def f():
        im, d = tile(bg)
        for i in range(3):
            d.line([3, 4 + i * 3, 8, 4 + i * 3], fill=WHITE, width=1)
        tiny_text(d, 10, 5, n, GOLD, 1)
        return im
    return f

ICONS = {
    'die': icon_die, 'six': icon_six, 'yacht': icon_yacht,
    'coin': icon_coin, 'bag': icon_bag,
    'lock': icon_lock, 'chain': icon_chain,
    'yinyang': icon_yinyang, 'chart': icon_chart, 'small': icon_small, 'crown': icon_crown,
    'moon': icon_moon, 'cup': icon_cup, 'scatter': icon_scatter, 'triple': icon_triple,
    'tax1': icon_num('1', (120, 60, 50, 255)), 'tax2': icon_num('2', (60, 80, 120, 255)),
    'one': icon_num('1', (90, 70, 110, 255)), 'two': icon_num('2', (70, 100, 90, 255)),
    'three': icon_num('3', (120, 90, 40, 255)), 'seven': icon_num('7', (120, 50, 70, 255)),
    'hand': icon_hand, 'freeze': icon_freeze, 'eye': icon_eye, 'charm': icon_charm,
    'straight': icon_straight, 'house': icon_house, 'recycle': icon_recycle,
    'listodd': icon_list('1', (80, 70, 100, 255)), 'listeven': icon_list('2', (70, 90, 80, 255)),
}

for name, fn in ICONS.items():
    im = fn().resize((32, 32), Image.NEAREST)
    im.save(os.path.join(OUT, f'icon_{name}.png'))
print(f'icons: {len(ICONS)}')

# ---------------- 배경 ----------------
def bg_main():
    W, H = 240, 135
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    # 어두운 선술집 그라데이션
    for y in range(H):
        t = y / H
        d.line([0, y, W, y], fill=(int(20 + 26 * t), int(14 + 18 * t), int(10 + 12 * t)))
    # 벽 판자
    for x in range(0, W, 24):
        d.line([x, 0, x, 86], fill=(28, 20, 14))
    # 랜턴 글로우 2개
    for cx, cy, r0, col in [(40, 30, 34, (90, 60, 20)), (200, 26, 28, (80, 50, 18))]:
        for r in range(r0, 0, -2):
            a = (r0 - r) / r0
            d.ellipse([cx - r, cy - r, cx + r, cy + r],
                      fill=(int(col[0] * (0.4 + 0.6 * a) + 20), int(col[1] * (0.4 + 0.6 * a) + 14), int(col[2] * (0.4 + 0.6 * a) + 8)))
        d.rectangle([cx - 3, cy - 5, cx + 3, cy + 4], fill=(240, 190, 90), outline=(30, 20, 10))
        d.line([cx - 3, cy - 1, cx + 3, cy - 1], fill=(255, 230, 150))
    # 테이블 (하단)
    d.rectangle([0, 86, W, 135], fill=(74, 50, 28))
    for y in range(86, 135, 7):
        d.line([0, y, W, y], fill=(58, 38, 20))
    d.line([0, 86, W, 86], fill=(100, 70, 40))
    # 주사위 두 개 (픽셀)
    def draw_die(x, y, s, face, tilt=False):
        d.rectangle([x, y, x + s, y + s], fill=(235, 225, 200), outline=(30, 22, 14))
        d.rectangle([x + 1, y + 1, x + s - 1, y + 2], fill=(255, 250, 235))
        d.rectangle([x, y + s - 2, x + s, y + s], fill=(180, 165, 135))
        pp = {1: [(.5, .5)], 3: [(.25, .25), (.5, .5), (.75, .75)],
              5: [(.25, .25), (.25, .75), (.5, .5), (.75, .25), (.75, .75)]}[face]
        for fx, fy in pp:
            px, py = x + fx * s, y + fy * s
            d.rectangle([px - 1, py - 1, px + 1, py + 1], fill=(40, 30, 24))
    draw_die(96, 95, 22, 5)
    draw_die(128, 100, 18, 3)
    draw_die(80, 108, 14, 1)
    # 금화 몇 개
    for cx, cy in [(160, 112), (168, 116), (155, 120)]:
        d.ellipse([cx - 4, cy - 2, cx + 4, cy + 3], fill=(220, 180, 70), outline=(60, 44, 16))
    # 비네트
    vin = Image.new('L', (W, H), 0)
    dv = ImageDraw.Draw(vin)
    dv.ellipse([-50, -40, W + 50, H + 60], fill=90)
    black = Image.new('RGB', (W, H), (5, 3, 2))
    im = Image.composite(im, black, vin.point(lambda p: min(255, p * 3)))
    return im

def bg_game():
    W, H = 240, 135
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = abs(y - H / 2) / (H / 2)
        base = (44 - 18 * t, 30 - 12 * t, 18 - 8 * t)
        d.line([0, y, W, y], fill=tuple(int(c) for c in base))
    # 나무 판자
    for y in range(0, H, 12):
        d.line([0, y, W, y], fill=(30, 20, 12))
        for seg in range(random.randint(2, 4)):
            x = random.randint(0, W)
            d.line([x, y, x, y + 12], fill=(32, 22, 13))
    # 나뭇결 노이즈
    for _ in range(600):
        x, y = random.randint(0, W - 1), random.randint(0, H - 1)
        v = random.randint(-8, 8)
        px = im.getpixel((x, y))
        im.putpixel((x, y), tuple(max(0, min(255, c + v)) for c in px))
    # 비네트
    vin = Image.new('L', (W, H), 0)
    dv = ImageDraw.Draw(vin)
    dv.ellipse([-60, -50, W + 60, H + 50], fill=95)
    black = Image.new('RGB', (W, H), (8, 5, 3))
    im = Image.composite(im, black, vin.point(lambda p: min(255, p * 3)))
    return im

bg_main().resize((960, 540), Image.NEAREST).save(os.path.join(OUT, 'bg_main.png'))
bg_game().resize((960, 540), Image.NEAREST).save(os.path.join(OUT, 'bg_game.png'))
print('backgrounds: 2')
print('done →', os.path.abspath(OUT))
