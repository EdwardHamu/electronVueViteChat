"""组态二维码 / 条形码编码器的交叉验证（可选，不属于冒烟测试）。

依赖：pip install qrcode python-barcode zxing-cpp pillow；node 端需要 esbuild 可 resolve（同冒烟测试）。
用法：python3 scripts/scada-smoke/verify-codes.py [组数=70]
  1. 版本 1~40 的对齐图形坐标、4 个纠错等级的数据码字数与 python qrcode 的表逐项比对
  2. 随机文本 × 4 等级：固定掩码 → 与 python qrcode（optimize=0，单模式）逐模块比对；自动掩码 → zxing 解码 + 版本一致
  3. Code 128 / EAN-13 / EAN-8：zxing 解码；EAN 校验位与序列和 python-barcode 一致、Code 128 符号数不多于 python-barcode；非法内容必须返回 null
"""
import json, os, random, subprocess, sys, tempfile
import qrcode
from qrcode import base as qb, util as qu
from qrcode.constants import ERROR_CORRECT_L, ERROR_CORRECT_M, ERROR_CORRECT_Q, ERROR_CORRECT_H
from PIL import Image
import zxingcpp
import barcode as pb

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
N = int(sys.argv[1]) if len(sys.argv) > 1 else 70
random.seed(7)
ECC = {'L': ERROR_CORRECT_L, 'M': ERROR_CORRECT_M, 'Q': ERROR_CORRECT_Q, 'H': ERROR_CORRECT_H}
ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'
CTRL_NAMES = ['NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL', 'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI', 'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US']


def rnd_text():
    kind = random.choice(['num', 'alnum', 'ascii', 'utf8', 'url', 'long'])
    if kind == 'num': return ''.join(random.choice('0123456789') for _ in range(random.randint(1, 60)))
    if kind == 'alnum': return ''.join(random.choice(ALNUM) for _ in range(random.randint(1, 50)))
    if kind == 'ascii': return ''.join(chr(random.randint(32, 126)) for _ in range(random.randint(1, 80)))
    if kind == 'utf8': return ''.join(random.choice('测径仪外径椭圆度温度批次编号αβγ日本語한국어😀') for _ in range(random.randint(1, 30)))
    if kind == 'url': return 'https://example.com/p/' + ''.join(random.choice('abcdef0123456789') for _ in range(random.randint(4, 40))) + '?v=' + str(random.randint(0, 9999))
    return ''.join(random.choice(ALNUM + 'abcxyz') for _ in range(random.randint(200, 900)))


qr_cases = []
texts = [rnd_text() for _ in range(N)] + ['1', 'A', 'HELLO WORLD', '01234567', 'https://pic.nt.local/a.png', '外径 1.523 mm', 'x' * 2953, '1' * 7089, 'A' * 4296]
for t in texts:
    for e in 'LMQH':
        qr_cases.append({'text': t, 'ecc': e, 'mask': random.randint(0, 7)})
        qr_cases.append({'text': t, 'ecc': e, 'mask': -1})
bar_cases = []
for _ in range(60):
    kind = random.choice(['digits', 'ascii', 'mixed', 'ctrl'])
    if kind == 'digits': t = ''.join(random.choice('0123456789') for _ in range(random.randint(1, 30)))
    elif kind == 'ascii': t = ''.join(chr(random.randint(32, 126)) for _ in range(random.randint(1, 30)))
    elif kind == 'mixed': t = ''.join(random.choice(['AB', '12345', '-', '9', 'xyz', '007', ' ']) for _ in range(random.randint(1, 8)))
    else: t = 'A' + ''.join(chr(random.randint(0, 31)) for _ in range(random.randint(1, 4))) + '1234'
    bar_cases.append({'text': t, 'format': 'code128'})
for _ in range(40):
    bar_cases.append({'text': ''.join(random.choice('0123456789') for _ in range(12)), 'format': 'ean13'})
    bar_cases.append({'text': ''.join(random.choice('0123456789') for _ in range(7)), 'format': 'ean8'})
bar_cases += [{'text': '5901234123457', 'format': 'ean13'}, {'text': '5901234123450', 'format': 'ean13'}, {'text': '96385074', 'format': 'ean8'}, {'text': '96385070', 'format': 'ean8'},
              {'text': 'abc', 'format': 'ean13'}, {'text': '', 'format': 'code128'}, {'text': '中', 'format': 'code128'}, {'text': '036000291452', 'format': 'ean13'}]

tmp = tempfile.mkdtemp()
req_path, res_path = os.path.join(tmp, 'req.json'), os.path.join(tmp, 'res.json')
json.dump({'qr': qr_cases, 'bars': bar_cases}, open(req_path, 'w'))
subprocess.run(['node', os.path.join(ROOT, 'scripts/scada-smoke/codes-dump.mjs'), req_path, res_path], check=True, cwd=ROOT)
res = json.load(open(res_path))
fails = []

# 1. 表
for v in range(1, 41):
    pp = list(qu.pattern_position(v))
    if pp != res['tables']['align'][str(v)]: fails.append(f'align v{v}: {pp} vs {res["tables"]["align"][str(v)]}')
    for e in 'LMQH':
        total = sum(b.data_count for b in qb.rs_blocks(v, ECC[e]))
        if total != res['tables']['dataCodewords'][f'{v}{e}']: fails.append(f'datacw v{v}{e}: {total} vs {res["tables"]["dataCodewords"][f"{v}{e}"]}')
print('tables checked, fails so far =', len(fails))


# 2. QR
def py_matrix(text, e, mask):
    q = qrcode.QRCode(version=None, error_correction=ECC[e], mask_pattern=(None if mask < 0 else mask), border=0)
    q.add_data(text, optimize=0)
    q.make(fit=True)
    pm = mask if mask >= 0 else q.best_mask_pattern()
    q.makeImpl(False, pm)  # best_mask_pattern() 会把 modules 留在掩码 7，这里重建
    return q.version, pm, [''.join('1' if c else '0' for c in row) for row in q.get_matrix()]


def to_img(rows, scale=6, border=4):
    n = len(rows); img = Image.new('L', ((n + 2 * border) * scale, (n + 2 * border) * scale), 255); px = img.load()
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c == '1':
                for dy in range(scale):
                    for dx in range(scale): px[(x + border) * scale + dx, (y + border) * scale + dy] = 0
    return img


exact = decoded = mask_agree = mask_total = 0
for case, r in zip(qr_cases, res['qr']):
    t, e, mk = case['text'], case['ecc'], case['mask']
    try:
        v, pm, rows = py_matrix(t, e, mk)
    except Exception as ex:
        if r is None: continue
        fails.append(f'python failed but ours encoded: {ex} {t[:20]!r}'); continue
    if r is None: fails.append(f'ours returned null: {t[:20]!r} {e} {mk}'); continue
    if mk >= 0:
        if r['version'] != v or r['rows'] != rows: fails.append(f'matrix mismatch: {t[:30]!r} {e} mask {mk} ver {r["version"]}/{v}')
        else: exact += 1
    else:
        mask_total += 1
        if r['mask'] == pm: mask_agree += 1
        if r['version'] != v: fails.append(f'version mismatch (auto): {t[:30]!r} {e} {r["version"]}/{v}')
        found = zxingcpp.read_barcodes(to_img(r['rows']), formats=zxingcpp.BarcodeFormat.QRCode)
        got = found[0].text if found else None
        if got != t: fails.append(f'qr decode mismatch: {t[:30]!r} {e} got {(got or "")[:30]!r}')
        else: decoded += 1
print(f'qr: exact match (fixed mask) = {exact}, decoded (auto mask) = {decoded}, same mask as python = {mask_agree}/{mask_total} (罚分实现不同，不要求一致)')


# 3. 条码
def bar_img(mods, scale=3, h=80, quiet=12):
    w = (len(mods) + 2 * quiet) * scale; img = Image.new('L', (w, h), 255); px = img.load()
    for x, c in enumerate(mods):
        if c == '1':
            for dx in range(scale):
                for y in range(h): px[(x + quiet) * scale + dx, y] = 0
    return img


def ean_valid(t, n):
    if not (t.isdigit() and len(t) in (n - 1, n)): return False
    if len(t) == n - 1: return True
    w = (1, 3) if n == 13 else (3, 1)
    s = sum(int(d) * w[i % 2] for i, d in enumerate(t[:-1]))
    return (10 - s % 10) % 10 == int(t[-1])


def zx_text(s):  # zxing 把控制字符显示成 <DC4> 这类名字
    for i, name in enumerate(CTRL_NAMES): s = s.replace(f'<{name}>', chr(i))
    return s


bar_ok = 0
for case, r in zip(bar_cases, res['bars']):
    t, f = case['text'], case['format']
    valid = ean_valid(t, 13) if f == 'ean13' else ean_valid(t, 8) if f == 'ean8' else (len(t) > 0 and all(ord(c) < 128 for c in t))
    if r is None:
        if valid: fails.append(f'barcode null for valid {f} {t!r}')
        continue
    if not valid: fails.append(f'barcode encoded invalid {f} {t!r}'); continue
    fmt = {'code128': zxingcpp.BarcodeFormat.Code128, 'ean13': zxingcpp.BarcodeFormat.EAN13, 'ean8': zxingcpp.BarcodeFormat.EAN8}[f]
    found = zxingcpp.read_barcodes(bar_img(r['modules']), formats=fmt)
    got = zx_text(found[0].text) if found else None
    if got != r['text']: fails.append(f'barcode decode {f} {t!r}: expected {r["text"]!r} got {got!r}')
    else: bar_ok += 1
    if f == 'code128':  # 码集切换策略可以不同，但符号数不能比 python-barcode 多
        ref = pb.get_barcode_class('code128')(t).build()[0]
        if len(r['modules']) > len(ref): fails.append(f'code128 longer than python-barcode: {t!r} {len(r["modules"])} > {len(ref)}')
    else:
        ref = pb.get_barcode_class(f)(t if len(t) in (12, 7) else t[:-1])
        if ref.get_fullcode() != r['text']: fails.append(f'{f} fullcode {t}: python {ref.get_fullcode()} ours {r["text"]}')
        if ref.build()[0] != r['modules']: fails.append(f'{f} sequence differs from python-barcode: {t!r}')
print('barcodes decoded ok =', bar_ok)
print('FAILS', len(fails))
for x in fails[:25]: print(' -', x)
sys.exit(1 if fails else 0)
