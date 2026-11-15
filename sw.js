/* 청실홍실 오프라인용 서비스워커 (2026-11-15)
   - 페이지(index): 인터넷 우선. 안 되거나 6초 넘게 걸리면 저장해 둔 화면을 보여 줌.
   - 책자 사진(다른 사이트 이미지): 앱의 "오프라인 저장"으로 받아 둔 것이 있으면 그것부터. 없으면 인터넷에서.
   - 아이콘·폰트·Firebase 스크립트: 인터넷 우선, 안 되면 저장본.
   - 그 밖의 요청(동기화, Claude API 등)은 건드리지 않음.
   문제가 생기면 이 파일을 "self.registration.unregister()" 만 하는 내용으로 바꿔 배포하면 꺼짐. */
var SHELL='hm-shell-v1', IMG='hm-img-v1', LIB='hm-lib-v1';
var SHELL_KEY=new URL('./offline-shell', self.location.href).href;
var LIB_HOSTS={'www.gstatic.com':1,'fonts.googleapis.com':1,'fonts.gstatic.com':1,'cdn.jsdelivr.net':1};

self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });

function timeout(ms, value){ return new Promise(function(res){ setTimeout(function(){ res(value); }, ms); }); }

function buildOf(t){ var m=/window\.__BUILD='([^']+)'/.exec(t); return m?m[1]:''; }
/* 저장본보다 오래된 화면(브라우저 캐시에서 나온 것 등)으로는 덮어쓰지 않는다. 빌드 번호는 YYYY.MM.DD.HHMM 이라 글자 비교로 충분 */
function putShell(c, t){ var b=buildOf(t); if(t.indexOf('id="hm-js"')<0) return Promise.resolve();
  return c.match(SHELL_KEY).then(function(old){ var ob=(old&&old.headers.get('x-build'))||''; if(ob && b && b<ob) return;
    return c.put(SHELL_KEY, new Response(t,{headers:{'content-type':'text/html; charset=utf-8','x-build':b}})); }).then(function(){}, function(){}); }

function navFetch(e){
  var req; try{ req=new Request(e.request,{cache:'no-store'}); }catch(x){ req=e.request; }
  return caches.open(SHELL).then(function(c){ return c.match(SHELL_KEY).then(function(cached){
    var net=fetch(req).then(function(res){
      if(res && res.ok){ return res.clone().text().then(function(t){ return putShell(c,t).then(function(){ return res; }); }, function(){ return res; }); }
      return res; });
    if(!cached) return net;
    e.waitUntil(net.then(function(){}, function(){}));
    return Promise.race([ net.then(function(res){ return (res && res.ok) ? res : cached; }, function(){ return cached; }), timeout(6000, cached) ]);
  }); });
}

/* 사진: 미리 받아 둔 것이 있으면 그것을, 없으면 그냥 인터넷에서. (볼 때마다 자동 저장은 하지 않음 — 지도 타일 등으로 저장 공간이 불어나는 것을 막기 위해) */
function imgFetch(e){
  var url=e.request.url;
  return caches.open(IMG).then(function(c){ return c.match(url,{ignoreVary:true}); }).then(function(m){ return m || fetch(e.request); }, function(){ return fetch(e.request); });
}

function libFetch(e){
  var url=e.request.url;
  return caches.open(LIB).then(function(c){ return c.match(url,{ignoreVary:true}).then(function(cached){
    var net=fetch(e.request).then(function(res){
      if(res && (res.ok || res.type==='opaque')){ try{ e.waitUntil(c.put(url, res.clone()).then(function(){}, function(){})); }catch(x){} }
      return res; });
    if(!cached) return net;
    e.waitUntil(net.then(function(){}, function(){}));
    return Promise.race([ net.then(function(res){ return (res && (res.ok || res.type==='opaque')) ? res : cached; }, function(){ return cached; }), timeout(5000, cached) ]);
  }); });
}

self.addEventListener('fetch', function(e){
  var r=e.request; if(r.method!=='GET') return;
  var u; try{ u=new URL(r.url); }catch(x){ return; }
  if(u.protocol!=='https:' && u.protocol!=='http:') return;
  var same=(u.origin===self.location.origin);
  if(r.mode==='navigate'){ if(same) e.respondWith(navFetch(e)); return; }
  if(r.destination==='image' && !same){ e.respondWith(imgFetch(e)); return; }
  if(same && /(\/|index\.html)$/.test(u.pathname)) return;   /* 페이지가 직접 받아 저장하는 요청은 그대로 통과 */
  if(same || LIB_HOSTS[u.hostname]){ e.respondWith(libFetch(e)); return; }
});
