import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DetectionNoticeTracker, detectionPresentation, escapeHtml } from '../web/detection-inbox.mjs';

const now = Date.parse('2026-11-09T05:00:00Z');
const grant = { enabled:true, version:1, scopes:['domain','app'] };
const event = (id, changes={}) => ({ id, kind:'domain', verdict:'suspected', reason:'name_heuristic', action:'blocked', occurredAt:new Date(now-30_000).toISOString(), receivedAt:new Date(now-1000).toISOString(), readAt:null, ...changes });

test('watch baseline suppresses backlog and coalesced event IDs do not repeatedly notify', () => {
  const tracker = new DetectionNoticeTracker();
  assert.deepEqual(tracker.observe('pair-a',grant,[event('old')],now),[]);
  assert.deepEqual(tracker.observe('pair-a',grant,[event('new'),event('old')],now).map(item=>item.id),['new']);
  assert.deepEqual(tracker.observe('pair-a',grant,[event('new',{count:99})],now),[]);
});
test('pair/grant/scope changes and disabled sharing reset the notice baseline', () => {
  const tracker = new DetectionNoticeTracker();
  tracker.observe('pair-a',grant,[],now);
  assert.equal(tracker.observe('pair-a',grant,[event('one')],now).length,1);
  assert.deepEqual(tracker.observe('pair-b',grant,[event('two')],now),[]);
  assert.deepEqual(tracker.observe('pair-b',{...grant,version:2},[event('three')],now),[]);
  assert.deepEqual(tracker.observe('pair-b',{...grant,version:2,scopes:['app']},[event('four')],now),[]);
  assert.deepEqual(tracker.observe('pair-b',{...grant,enabled:false},[],now),[]);
  assert.equal(tracker.seen.size,0);
  assert.deepEqual(tracker.observe('pair-b',grant,[event('five')],now),[]);
});
test('delayed offline, already-read, malformed and future records stay out of fresh notices', () => {
  const tracker = new DetectionNoticeTracker(); tracker.observe('pair-a',grant,[],now);
  const records = [event('delayed',{occurredAt:new Date(now-6*60_000).toISOString()}),event('read',{readAt:new Date(now).toISOString()}),event('invalid',{receivedAt:'invalid'}),event('future',{occurredAt:new Date(now+61_000).toISOString()}),event('fresh')];
  assert.deepEqual(tracker.observe('pair-a',grant,records,now).map(item=>item.id),['fresh']);
});
test('notice memory is bounded and an explicit stop cannot replay prior backlog as new', () => {
  const tracker = new DetectionNoticeTracker(); tracker.observe('pair-a',grant,[],now);
  tracker.observe('pair-a',grant,Array.from({length:1200},(_,i)=>event(`id-${i}`)),now);
  assert.equal(tracker.seen.size,1000);
  tracker.reset();
  assert.deepEqual(tracker.observe('pair-a',grant,[event('id-1199')],now),[]);
});
test('classification wording preserves uncertainty and app interruption is not a network-firewall claim', () => {
  assert.match(detectionPresentation(event('x')).verdict,/Diduga/);
  assert.match(detectionPresentation(event('x')).reason,/belum diverifikasi/);
  assert.equal(detectionPresentation(event('x',{kind:'app'})).action,'Pembukaan aplikasi diinterupsi');
  assert.equal(detectionPresentation(event('x',{verdict:'unrecognized'})).verdict,'Belum terverifikasi');
  assert.equal(escapeHtml('<script>"a" & \'b\'</script>'),'&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;');
});

// Controller unit harness: it exercises the real module logic with minimal DOM
// and HTTP fakes, not layout, browser permissions, a service worker or phone QA.
async function controller({ privateMode=true, initial=[] }={}) {
  const calls=[],nodes=[],timers=new Map();let timerId=0,nextDetection=null,nextDashboard=null,dashboardEntered=null,current=initial,deviceId='companion-a';
  function element(){const node={dataset:{},children:[],textContent:'',innerHTML:'',hidden:true,append(...children){this.children.push(...children);},replaceChildren(...children){this.children=[...children];},addEventListener(){},click(){}};nodes.push(node);return node;}
  const elements=Object.fromEntries(['#app','#toast','#detection-events','#detection-status'].map(key=>[key,element()]));
  const document={visibilityState:'visible',querySelector:key=>elements[key]||null,addEventListener(){},createElement:()=>element()};
  const pair={id:'pair-a',status:'active',participant:{name:'Peserta'},companion:{name:'Pendamping'},automation:grant};
  const fetch=async(path,options={})=>{
    calls.push({path,method:options.method||'GET',body:options.body});let body;
    if(path==='/api/health')body={privateMonitoringEnabled:privateMode};
    else if(path==='/api/me')body={device:{id:deviceId,role:'companion',name:'Pendamping'},pairings:[{...pair}]};
    else if(path.includes('/dashboard')){if(nextDashboard){const pending=nextDashboard;nextDashboard=null;dashboardEntered();return await pending;}body={snapshot:null,supports:[],exceptions:[]};}
    else if(path.startsWith('/api/detections?')){if(nextDetection){const pending=nextDetection;nextDetection=null;return await pending;}body={automation:grant,detections:current};}
    else throw new Error(`Unexpected HTTP call: ${path}`);
    return {ok:true,status:200,json:async()=>body};
  };
  const Notification=class {static permission='granted';static async requestPermission(){return 'granted';}constructor(title,options){this.title=title;this.options=options;}close(){}};
  const window={Notification,isSecureContext:true,focus(){},scrollTo(){}};
  const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const module=await new AsyncFunction('document','window','fetch','Notification','navigator','confirm','setTimeout','clearTimeout','DetectionNoticeTracker','detectionPresentation','escape',source+'\nreturn {state,load,refreshDetections,clearDetectionState,startWatching,stopWatching,enableBrowserNotices,renderDetections};')(
    document,window,fetch,Notification,{},()=>true,(callback)=>{timers.set(++timerId,callback);return timerId;},id=>timers.delete(id),DetectionNoticeTracker,detectionPresentation,escapeHtml);
  return {...module,calls,nodes,elements,setEvents(value){current=value;},setPairId(value){pair.id=value;},setDeviceId(value){deviceId=value;},
    deferDetection(){let done;nextDetection=new Promise(resolve=>done=payload=>resolve({ok:true,status:200,json:async()=>payload}));return done;},
    deferDashboard(){let done;const entered=new Promise(resolve=>dashboardEntered=resolve);nextDashboard=new Promise(resolve=>done=()=>resolve({ok:true,status:200,json:async()=>({snapshot:null,supports:[],exceptions:[]})}));return {entered,complete:done};},
    deferPermission(){let done;Notification.requestPermission=()=>new Promise(resolve=>done=resolve);return permission=>done(permission);}};
}

test('ordinary server capability never fetches private detections or starts notification polling',async()=>{
  const ui=await controller({privateMode:false});
  assert.equal(ui.state.privateMonitoringEnabled,false);assert.equal(ui.state.watching,false);
  assert.equal(ui.calls.some(call=>call.path.startsWith('/api/detections')),false);
  assert.equal(ui.elements['#app'].innerHTML.includes('data-page="detections"'),false);
  assert.throws(()=>ui.startWatching(),/belum diaktifkan/);
});
test('loading and refreshing detections never automatically marks them read; targets remain text',async()=>{
  const ui=await controller({initial:[event('server-event',{target:'<img src=x onerror=alert(1)>',kind:'app'})]});
  ui.state.page='detections';ui.renderDetections();
  assert.equal(ui.nodes.some(node=>node.textContent==='<img src=x onerror=alert(1)>'),true);
  assert.equal(ui.elements['#app'].innerHTML.includes('<img src=x'),false);
  ui.startWatching();await ui.refreshDetections('pair-a');
  assert.equal(ui.calls.some(call=>call.method!=='GET'),false);
});
test('a revoked/cleared inbox ignores an already-in-flight successful detection response',async()=>{
  const ui=await controller({initial:[event('before',{target:'target.example.org'})]});
  ui.startWatching();const complete=ui.deferDetection(),pending=ui.refreshDetections('pair-a');
  ui.clearDetectionState();complete({automation:grant,detections:[event('late',{target:'late.example.org'})]});await pending;
  assert.deepEqual(ui.state.detections,[]);assert.equal(ui.state.automation,null);assert.equal(ui.state.watching,false);
});
test('account and pair transitions clear old detections synchronously before dashboard loading completes',async()=>{
  for(const change of ['account','pair']){
    const ui=await controller({initial:[event('old-target',{target:'private.example.org'})]});ui.startWatching();
    if(change==='account')ui.setDeviceId('companion-b');else ui.setPairId('pair-b');
    const paused=ui.deferDashboard(),loading=ui.load();await paused.entered;
    assert.deepEqual(ui.state.detections,[]);assert.equal(ui.state.automation,null);assert.equal(ui.state.watching,false);
    ui.setEvents([]);paused.complete();await loading;
  }
});
test('a pending browser permission response cannot restart notices after watching stops',async()=>{
  const ui=await controller();ui.startWatching();const permission=ui.deferPermission(),pending=ui.enableBrowserNotices();
  ui.stopWatching();permission('granted');await pending;
  assert.equal(ui.state.browserNotices,false);assert.equal(ui.state.watching,false);
});
