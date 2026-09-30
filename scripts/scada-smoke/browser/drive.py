"""
Playwright 驱动示例（真 Chromium）：python3 scripts/scada-smoke/browser/drive.py [页面地址] [截图目录]
先按 README.md 打包并用 `python3 -m http.server 8765` 托管输出目录。演示：进入编辑模式、建几个组件、Ctrl 多选、拖八点手柄、打开颜色浮层并截图。
"""
import sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/index.html'
SHOTS = (sys.argv[2] if len(sys.argv) > 2 else '/tmp') + '/'


def center(page, sel, idx=0):
    return page.evaluate("([s, i]) => { const r = document.querySelectorAll(s)[i].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }", [sel, idx])


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1600, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_function('window.__t && window.__t.scada.loaded', timeout=20000)
    time.sleep(1.2)  # 语言包是异步 fetch 的
    ids = page.evaluate("""() => {
      const { scada } = window.__t
      scada.startEdit()
      const mk = (type, x, y, w, h) => { const wd = scada.addWidget(type); scada.updateWidgetRect(wd.id, { x, y, w, h }); return wd.id }
      const ids = { rect: mk('rect', 100, 100, 160, 90), card: mk('valueCard', 340, 160, 170, 100), gauge: mk('gauge', 600, 120, 200, 200) }
      scada.select(null)
      return ids
    }""")
    time.sleep(0.5)
    c = center(page, f'[data-widget-id="{ids["rect"]}"]'); page.mouse.click(c['x'], c['y'])
    page.keyboard.down('Control')
    for k in ('card', 'gauge'):
        c = center(page, f'[data-widget-id="{ids[k]}"]'); page.mouse.click(c['x'], c['y'])
    page.keyboard.up('Control')
    time.sleep(0.3)
    page.screenshot(path=SHOTS + 'multi-select.png')
    page.evaluate("(id) => window.__t.scada.select(id)", ids['gauge']); time.sleep(0.3)
    h = center(page, '[data-handle="se"]')
    page.mouse.move(h['x'], h['y']); page.mouse.down(); page.mouse.move(h['x'] + 60, h['y'] + 40, steps=6); page.mouse.up()
    t = center(page, '[data-color-trigger]'); page.mouse.click(t['x'], t['y']); time.sleep(0.4)
    page.screenshot(path=SHOTS + 'color-popup.png')
    print('页面错误:', errors or '无')
    browser.close()
