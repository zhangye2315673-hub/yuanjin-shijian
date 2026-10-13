import base64,re
D='/workspace/projects/1efe0ee4-9b30-4cc4-bfac-fd83752d3208/work/scene/'
ui=open(D+'ui.html').read()
ui=re.sub(r'<title>.*?</title>','<title>远近即时间 · 秋日的风</title>',ui)
ui=ui.replace('</style>','#hud,#dev{display:none!important}\n</style>',1)
three=open(D+'three.min.js').read()
gl=open('/workspace/work/3d/bundle/gltf.iife.js').read()
import os
_H=['girl','gma','house']; _P=[n for n in ['tree','bush','rock','sun','fence','cat','mail','lamp','bench','ytree','flowers','gull','sign','kite','rockA','rockC','stone','leaves','grass','clod'] if os.path.exists('/workspace/work/3d/tripo/props/%s_q.glb'%n)]
_T='/workspace/work/3d/tripo/'
def _f(n,ext): return (_T+'%s_%s'%(n,ext)) if n in _H else (_T+'props/%s_%s'%(n,ext))
_b=lambda f: base64.b64encode(open(f,'rb').read()).decode()
glb='window.__GLB={'+','.join('%s:"%s"'%(n,_b(_T+'m/%s.glb'%n)) for n in _H+_P)+'};window.__TEX={'+','.join('%s:"data:image/jpeg;base64,%s"'%(n,_b(_f(n,'base.jpeg'))) for n in _H+_P)+'};'
sc=open(D+'scene.js').read()
out=ui.replace('<!--THREE-->','<script>'+three+'</script>\n<script>'+gl+'</script>\n<script>'+glb+'</script>').replace('<!--SCENE-->','<script>'+sc+'</script>')
open(D+'index.html','w').write(out); print(len(out))
