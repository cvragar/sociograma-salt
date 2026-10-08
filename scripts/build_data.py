import json,csv,math,re
from shapely.geometry import shape,mapping,Point
from shapely.ops import unary_union,polylabel
S='/workspace/sociograma_salt/'; O='/workspace/visor_sociograma_salt/data/'
A=json.load(open(S+'actors.json')); R=json.load(open(S+'relacions.json'))
CAPS={'S01':(2.7925568,41.9744843),'S02':(2.7865003,41.9698869)}
def hav(a,b):
  R_=6371000;la1,la2=map(math.radians,(a[1],b[1]));dl=math.radians(b[0]-a[0]);dp=la2-la1
  h=math.sin(dp/2)**2+math.cos(la1)*math.cos(la2)*math.sin(dl/2)**2;return 2*R_*math.asin(math.sqrt(h))
deg={i:0 for i in [a['id'] for a in A]}
for r in R:
  for k in ('origen','desti'):
    if r[k] in deg: deg[r[k]]+=1
for a in A:
  a['grau']=deg.get(a['id'],0)
  if a['lat'] not in (None,''):
    a['lat']=float(a['lat']);a['lon']=float(a['lon'])
    d={k:hav((a['lon'],a['lat']),v) for k,v in CAPS.items()}
    k=min(d,key=d.get);a['cap_mes_proper']='CAP Salt 1' if k=='S01' else 'CAP Salt 2';a['dist_cap_m']=round(d[k])
  else: a['lat']=a['lon']=None
json.dump(A,open(O+'actors.json','w'),ensure_ascii=False)
json.dump(R,open(O+'relacions.json','w'),ensure_ascii=False)
json.dump(list(csv.DictReader(open(S+'fonts.csv',encoding='utf-8-sig'))),open(O+'fonts.json','w'),ensure_ascii=False)
# seccions + IST
sec=json.load(open('/tmp/salt_secc.geojson'))
ist={}
for row in csv.DictReader(open('/workspace/fuentes-cache/salt/ist_salt_sec_series.csv')):
  ist.setdefault(row['sec'],{})[row['any']]=(float(row['IST']) if row['IST'] not in ('','..') else None,row['status'])
for f in sec['features']:
  c=f['properties']['CUSEC']; key=c[:5]+'7'+c[5:]  # INE 1715501001 -> Idescat 17155701001
  s=ist.get(key,{}); v=s.get('2023',(None,''))
  f['properties'].update(codi=f"{c[5:7]}-{c[7:]}",ist_2023=v[0],ist_2024p=s.get('2024',(None,''))[0],serie={k:x[0] for k,x in sorted(s.items())})
  ct=shape(f['geometry']).centroid; pl=polylabel(shape(f['geometry']),1e-6)  # punt interior per a l'etiqueta
  assert key in ist, key
  f['properties'].update(lx=round(pl.x,6),ly=round(pl.y,6))
  f['properties']['dist_cap_centroide_m']=round(min(hav((ct.x,ct.y),v) for v in CAPS.values()))
json.dump(sec,open(O+'seccions_ist.geojson','w'),ensure_ascii=False)
mun=unary_union([shape(f['geometry']) for f in sec['features']]).buffer(0)
json.dump({'type':'FeatureCollection','features':[{'type':'Feature','properties':{'nom':'Salt (terme municipal, unió de seccions INE 2023)'},'geometry':mapping(mun)}]},open(O+'terme_municipal.geojson','w'))
z=json.load(open(S+'mapa/zones_proximitat_no_oficials.geojson'))
json.dump(z,open(O+'zones_proximitat_hipotesi.geojson','w'),ensure_ascii=False)
print(len(A),sum(a['lat'] is not None for a in A),[ (f['properties']['codi'],f['properties']['ist_2023']) for f in sec['features']])
# bundle per funcionar també amb file://
T=json.load(open(O+'textos.json'))
nh=sum(1 for r in R if r['estat']!='documentada')
T['preguntes']=[re.sub(r'^Les \d+ relacions marcades',f'Les {nh} relacions marcades',q) for q in T['preguntes']]
json.dump(T,open(O+'textos.json','w'),ensure_ascii=False,indent=1)
B={'actors':A,'relacions':R,'fonts':json.load(open(O+'fonts.json')),'seccions':sec,
   'terme':json.load(open(O+'terme_municipal.geojson')),'zones':z,'textos':json.load(open(O+'textos.json'))}
open(O+'dades.js','w').write('window.DADES='+json.dumps(B,ensure_ascii=False)+';')
