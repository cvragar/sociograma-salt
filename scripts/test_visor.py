import asyncio,sys,json
from playwright.async_api import async_playwright
B='http://localhost:8765/index.html'
VIEWS=['portada','actors','salut','tercer','educatiu','diversitat','ist','zones','distancia','xarxa','validar']
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await br.new_page(viewport={'width':1440,'height':900}, accept_downloads=True)
    errs=[]
    pg.on('console', lambda m: errs.append(('console',m.type,m.text)) if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append(('pageerror',str(e))))
    pg.on('requestfailed', lambda r: errs.append(('reqfail',r.url[:100],r.failure)))
    await pg.goto(B+'#v=portada'); await pg.wait_for_timeout(800)
    await pg.screenshot(path='captures/01_portada.png')
    res={}
    for v in VIEWS[1:]:
      await pg.evaluate(f"VISOR.mostra('{v}',null)"); await pg.wait_for_timeout(2500 if v=='actors' else 1200)
      ok=await pg.evaluate("""v=>{const l=document.querySelector('#llegenda');return {hash:location.hash, llegenda:!l.hidden?l.innerText.slice(0,60):null, maploaded: VISOR.map? VISOR.map.loaded():null, feats: VISOR.map&&VISOR.map.getSource('actors')? VISOR.map.querySourceFeatures('actors').length:null, cy: VISOR.cy? VISOR.cy.nodes().length:null}}""",v)
      res[v]=ok
      if v=='actors': await pg.screenshot(path='captures/02_mapa_general.png')
      if v=='educatiu': await pg.screenshot(path='captures/03_educatiu.png')
      if v=='ist': await pg.screenshot(path='captures/04_ist.png')
      pass
      if v=='xarxa':
        await pg.screenshot(path='captures/05_sociograma_xarxa.png')
        await pg.evaluate("VISOR.obreFitxa('S03')"); await pg.wait_for_timeout(600)
        await pg.screenshot(path='captures/06_fitxa_oberta.png')
        await pg.evaluate("document.querySelector('#fitxa .tanca').click()")
        await pg.evaluate("document.querySelector('#analisi details[open]').scrollIntoView()"); await pg.wait_for_timeout(300)
        await pg.screenshot(path='captures/07_panell_buits.png')
        res['verificar']=await pg.evaluate("document.querySelectorAll('#analisi .etq.verificar').length")
    # ctrl+k
    await pg.keyboard.press('Control+k'); await pg.keyboard.type('caritas'); await pg.wait_for_timeout(200)
    n=await pg.evaluate("document.querySelectorAll('#cerca-res [data-i]').length"); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(1500)
    res['cerca']={'resultats':n,'hash':await pg.evaluate('location.hash')}
    # hash restore
    await pg.goto(B+'#v=distancia&c=2.79,41.975,15.2'); await pg.wait_for_timeout(2500)
    res['restaura']=await pg.evaluate("[VISOR.estat.v, VISOR.map.getZoom().toFixed(2)]")
    # exports
    async with pg.expect_download() as d: await pg.click('#btn-png')
    dl=await d.value; await dl.save_as('/tmp/exp_distancia.png')
    async with pg.expect_download() as d: await pg.click('#btn-csv')
    dl=await d.value; await dl.save_as('/tmp/exp.csv')
    await pg.evaluate("VISOR.mostra('xarxa',null)"); await pg.wait_for_timeout(800)
    async with pg.expect_download() as d: await pg.click('#btn-png')
    dl=await d.value; await dl.save_as('/tmp/exp_xarxa.png')
    print(json.dumps(res,ensure_ascii=False,indent=0)); print('ERRORS',errs)
    await br.close()
asyncio.run(main())
