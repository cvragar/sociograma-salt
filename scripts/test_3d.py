"""Prova headless de les capes 3D (Chromium + SwiftShader). Requereix servidor a :8765."""
import asyncio,json
from playwright.async_api import async_playwright
B='http://localhost:8765/index.html'
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
async def quiet(pg, extra=1500):
  await pg.wait_for_function("VISOR.map && VISOR.map.loaded() && !VISOR.map.isMoving()", timeout=60000); await pg.wait_for_timeout(extra)
  await pg.wait_for_function("VISOR.map.loaded()", timeout=60000)
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch(args=ARGS)
    pg=await br.new_page(viewport={'width':1440,'height':900}); errs=[]; res={}
    pg.on('console', lambda m: errs.append((m.type,m.text)) if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append(('pageerror',str(e))))
    await pg.goto(B+'#v=actors'); await quiet(pg, 3000)
    await pg.screenshot(path='captures/3d_mapa_general.png')
    res['general']=await pg.evaluate("({pitch:VISOR.map.getPitch(), hash:location.hash, cols:VISOR.map.querySourceFeatures('columnes').length, edificis:VISOR.edificis, llegenda:document.querySelector('#llegenda').innerText.includes('Alçada = nombre de relacions documentades')})")
    await pg.evaluate("VISOR.mostra('ist',null)"); await quiet(pg)
    await pg.screenshot(path='captures/3d_ist.png')
    res['ist']=await pg.evaluate("({pitch:VISOR.map.getPitch(), vis:VISOR.map.getLayoutProperty('secc-3d','visibility'), lleg:document.querySelector('#llegenda').innerText.includes('Alçada = vulnerabilitat (IST invers)'), context:document.querySelector('#llegenda').innerText.includes('context de la secció')})")
    await pg.evaluate("VISOR.mostra('tercer',null)"); await quiet(pg)
    await pg.screenshot(path='captures/3d_arcs_relacions.png')
    res['arcs_tercer']=await pg.evaluate("VISOR.arcs.length")
    await pg.click('#calaix a[data-v="actors"]'); await quiet(pg); await pg.check('#f-arcs'); await pg.wait_for_timeout(1500)
    await pg.screenshot(path='captures/3d_arcs_mapa_general.png')
    res['arcs_general']=await pg.evaluate("({n:VISOR.arcs.length, hip:VISOR.arcs.filter(d=>d.r.estat.startsWith('hipòtesi')).length, r:location.hash.includes('r=1')})")
    await pg.uncheck('#f-arcs')
    await pg.evaluate("VISOR.obreFitxa('T02')"); await pg.wait_for_timeout(600); await quiet(pg, 2500)
    await pg.screenshot(path='captures/3d_fitxa_vol.png')
    res['fitxa']=await pg.evaluate("({zoom:VISOR.map.getZoom().toFixed(1), pitch:VISOR.map.getPitch().toFixed(0), bearing:VISOR.map.getBearing().toFixed(0), hash:location.hash, arcs:VISOR.arcs.length})")
    h=res['fitxa']['hash']
    # restauració de càmera des del hash
    pg2=await br.new_page(viewport={'width':1440,'height':900}); await pg2.goto(B+h); await quiet(pg2)
    res['restaura']=await pg2.evaluate("[VISOR.map.getPitch().toFixed(0), VISOR.map.getBearing().toFixed(0), VISOR.estat.fitxa]"); await pg2.close()
    # 2D/3D
    await pg.evaluate("document.querySelector('#fitxa .tanca').click()")
    await pg.click('#btn-3d'); await quiet(pg)
    res['mode2d']=await pg.evaluate("({pitch:VISOR.map.getPitch(), m:location.hash.includes('m=2d'), boto:document.querySelector('#btn-3d').textContent})")
    await pg.click('#btn-3d'); await quiet(pg)
    # ortofoto
    await pg.check('input[name="base"][value="orto"]'); await pg.check('#f-relleu'); await quiet(pg, 3000)
    await pg.screenshot(path='captures/3d_ortofoto.png')
    res['orto']=await pg.evaluate("[VISOR.map.getLayoutProperty('orto','visibility'), location.hash.includes('b=orto')]")
    await pg.check('input[name="base"][value="positron"]'); await pg.uncheck('#f-relleu')
    # zones es manté en 2D
    await pg.evaluate("VISOR.mostra('zones',null)"); await quiet(pg); res['zones_pitch']=await pg.evaluate("VISOR.map.getPitch()")
    # presentació
    await pg.click('#btn-pres'); await pg.wait_for_timeout(500); v1=await pg.evaluate("VISOR.estat.v"); await pg.wait_for_timeout(7500); v2=await pg.evaluate("VISOR.estat.v")
    await pg.click('#btn-pres'); res['presentacio']=[v1,v2, await pg.evaluate("document.querySelector('#btn-pres').getAttribute('aria-pressed')")]
    # PNG export in 3D
    await pg.evaluate("VISOR.mostra('actors',null)"); await quiet(pg)
    # mòbil
    pm=await br.new_page(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pm.on('pageerror', lambda e: errs.append(('pageerror-mobil',str(e))))
    await pm.goto(B+'#v=actors'); await quiet(pm, 2000); await pm.screenshot(path='captures/3d_mobil.png')
    res['mobil']=await pm.evaluate("({pitch:VISOR.map.getPitch().toFixed(0), edif:VISOR.map.getLayoutProperty('edificis-3d','visibility')})")
    print(json.dumps(res,ensure_ascii=False,indent=0)); print('ERRORS',errs)
    await br.close()
asyncio.run(main())
