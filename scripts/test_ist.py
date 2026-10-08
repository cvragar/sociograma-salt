"""Comprova el join IST–secció: color, alçada, etiqueta (polylabel) i fitxa. Requereix servidor a :8765."""
import asyncio,json
from playwright.async_api import async_playwright
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
async def quiet(pg,t=2000):
  await pg.wait_for_function("VISOR.map && VISOR.map.loaded() && !VISOR.map.isMoving()",timeout=60000); await pg.wait_for_timeout(t)
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch(args=ARGS); pg=await br.new_page(viewport={'width':1440,'height':900}); errs=[]
    pg.on('console', lambda m: errs.append((m.type,m.text)) if m.type=='error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto('http://localhost:8765/index.html#v=ist'); await quiet(pg,3000)
    await pg.screenshot(path='captures/3d_ist.png')
    await pg.click('#btn-3d'); await quiet(pg,2000); await pg.screenshot(path='captures/04_ist.png')
    rows=await pg.evaluate("""()=>{const m=VISOR.map, out=[];
      for (const f of DADES.seccions.features){ const p=f.properties, px=m.project([p.lx,p.ly]);
        const hit=m.queryRenderedFeatures([px.x,px.y],{layers:['secc-fill','secc-nd']})[0];
        VISOR.fitxaSeccio ? 0 : 0;
        out.push({codi:p.codi, cusec:p.CUSEC, ist:p.ist_2023, pick:hit?hit.properties.CUSEC:null, color_pintat:hit?hit.properties.c:null, alcada:p.ist_2023==null?0:4*Math.max(8,110-p.ist_2023)}); }
      return out;}""")
    for r in rows:
      await pg.evaluate(f"VISOR.fitxaSeccio('{r['cusec']}')"); t=await pg.evaluate("document.querySelector('#fitxa').innerText")
      r['fitxa_ok']=(f"IST 2023\n{r['ist']}" in t) or (f"IST 2023\t{r['ist']}" in t) or (str(r['ist']) in t.split('IST 2024')[0])
    print(json.dumps(rows,ensure_ascii=False)); print('ERRORS',errs); await br.close()
asyncio.run(main())
