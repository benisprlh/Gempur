import { DetectionNoticeTracker, detectionPresentation, escapeHtml as escape } from '/detection-inbox.mjs';

const root = document.querySelector('#app');
const state = { me:null, dashboard:null, page:'overview', role:'companion', invite:null, busy:false, error:'', privateMonitoringEnabled:false, detections:[], automation:null, detectionError:'', detectionLoadedAt:null, watching:false, browserNotices:false };
const noticeTracker = new DetectionNoticeTracker();
let pollTimer, watchEpoch=0, loadEpoch=0, detectionEpoch=0;
const openNotices = new Set();
const time = value => value ? new Date(value).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : 'Belum ada';
const pairing = () => state.me?.pairings.find(item=>item.status==='active') || state.me?.pairings.find(item=>['claimed','invited'].includes(item.status));
const participant = () => state.me?.device.role==='participant';
const labels = { call:'Bisa telepon saya?', message:'Bisa kirim pesan kepada saya?', company:'Saya butuh ditemani sebentar.' };
const statuses = { received:'Diterima server', read:'Dibaca pendamping', expired:'Sudah lewat waktu', pending:'Menunggu tinjauan', approved:'Masa tunggu', issued:'Siap diterapkan di Android', applied:'Diterapkan peserta', denied:'Tidak disetujui', cancelled:'Dibatalkan', active:'Aktif', inactive:'Tidak aktif', unknown:'Belum terverifikasi' };

async function api(path, method='GET', body) {
  const response = await fetch(`/api${path}`, { method, credentials:'same-origin', headers:{'Content-Type':'application/json','X-Gempur-Client':'web'}, ...(body===undefined?{}:{body:JSON.stringify(body)}) });
  let payload;try{payload=await response.json();}catch{throw new Error('Layanan tidak memberi respons yang valid.');}
  if(!response.ok){const error=new Error(payload.error?.message || 'Permintaan gagal.');error.status=response.status;throw error;}
  return payload;
}
let toastTimer;
function toast(message){const node=document.querySelector('#toast');node.textContent=message;node.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.hidden=true,5000);}
async function load(){
  const epoch=++loadEpoch;
  try {
    const [health,me]=await Promise.all([api('/health'),api('/me')]);
    if(epoch!==loadEpoch)return;
    const previousDevice=state.me?.device.id,previousPair=pairing()?.id;
    state.privateMonitoringEnabled=health.privateMonitoringEnabled===true;state.me=me;state.error='';
    const pair=pairing();
    // Invalidate the previous person's/pair's inbox before any further await or
    // navigation can render under the newly returned identity.
    if(previousDevice!==me.device.id||previousPair!==pair?.id||!state.privateMonitoringEnabled){
      clearDetectionState();state.dashboard=null;
      if(previousDevice&&previousDevice!==me.device.id)state.invite=null;
    }
    const dashboard=pair?.status==='active' ? await api(`/pairings/${encodeURIComponent(pair.id)}/${participant()?'activity':'dashboard'}`) : null;
    if(epoch!==loadEpoch)return;
    state.dashboard=dashboard;
    if(state.privateMonitoringEnabled&&pair?.status==='active')await refreshDetections(pair.id,epoch);
    else clearDetectionState();
  }catch(error){
    if(epoch!==loadEpoch)return;
    if(error.status===401){state.me=null;state.dashboard=null;clearDetectionState();}else state.error=error.message;
  }
  render();
}

function stopWatching(){
  state.watching=false;state.browserNotices=false;watchEpoch+=1;clearTimeout(pollTimer);noticeTracker.reset();
  for(const notice of openNotices)notice.close();openNotices.clear();
}
function clearDetectionState(){detectionEpoch+=1;stopWatching();state.detections=[];state.automation=null;state.detectionLoadedAt=null;state.detectionError='';}
function announceDetections(items){
  if(!items.length||participant()||!state.watching)return;
  toast('Ada temuan baru untuk ditinjau. Kecocokan aturan bukan bukti peserta berjudi.');
  if(!state.browserNotices||!('Notification' in window)||Notification.permission!=='granted'||document.visibilityState!=='visible')return;
  try{
    const notice=new Notification('Gempur · Temuan perlu ditinjau',{body:'Buka ruang pendamping untuk memeriksa temuan baru. Jangan menarik kesimpulan hanya dari peringatan.',tag:'gempur-private-detection'});
    openNotices.add(notice);notice.onclose=()=>openNotices.delete(notice);
    notice.onclick=()=>{window.focus();state.page='detections';render();notice.close();};
  }catch{state.browserNotices=false;toast('Notifikasi browser tidak tersedia. Temuan tetap tampil di kotak masuk.');}
}
async function refreshDetections(pairId,epoch=loadEpoch){
  const requestEpoch=detectionEpoch;
  try{
    const result=await api(`/detections?pairingId=${encodeURIComponent(pairId)}`);
    if(requestEpoch!==detectionEpoch||epoch!==loadEpoch||pairing()?.id!==pairId||!state.privateMonitoringEnabled)return;
    state.automation=result.automation;state.detections=result.detections||[];state.detectionLoadedAt=new Date().toISOString();state.detectionError='';
    const fresh=noticeTracker.observe(pairId,state.automation,state.detections);
    if(state.watching)announceDetections(fresh);
    if(!state.automation?.enabled){stopWatching();state.detections=[];}
  }catch(error){
    if(requestEpoch!==detectionEpoch||epoch!==loadEpoch||pairing()?.id!==pairId)return;
    if([401,403,404,409].includes(error.status)){clearDetectionState();if(error.status===401){state.me=null;state.dashboard=null;}throw error;}
    state.detectionError=error.message;
  }
}
function schedulePoll(){
  clearTimeout(pollTimer);
  if(!state.watching||document.visibilityState!=='visible')return;
  const epoch=watchEpoch;
  pollTimer=setTimeout(async()=>{
    if(epoch!==watchEpoch||!state.watching)return;
    if(state.busy){schedulePoll();return;}
    try{
      const me=await api('/me');
      if(epoch!==watchEpoch||!state.watching)return;
      const priorPair=pairing()?.id;state.me=me;const pair=pairing();
      if(!pair||pair.status!=='active'||pair.id!==priorPair){clearDetectionState();render();return;}
      await refreshDetections(pair.id);
    }catch(error){
      if(epoch!==watchEpoch)return;
      if([401,403,404,409].includes(error.status)){clearDetectionState();if(error.status===401){state.me=null;state.dashboard=null;}render();return;}
      state.detectionError=error.message;
    }
    if(epoch===watchEpoch&&state.watching){updateDetectionView();schedulePoll();}
  },30_000);
}
function startWatching(){
  if(!state.privateMonitoringEnabled||pairing()?.status!=='active'||!state.automation?.enabled)throw new Error('Berbagi otomatis belum diaktifkan peserta pada APK privat.');
  stopWatching();state.watching=true;noticeTracker.observe(pairing().id,state.automation,state.detections);schedulePoll();
}
async function enableBrowserNotices(){
  if(participant())throw new Error('Notifikasi ini untuk pendamping.');
  if(!('Notification' in window)||!window.isSecureContext)throw new Error('Notifikasi browser memerlukan dukungan browser dan koneksi aman. Kotak masuk tetap dapat digunakan.');
  if(!state.watching)startWatching();
  const epoch=watchEpoch,deviceId=state.me?.device.id,pairId=pairing()?.id;
  const permission=await Notification.requestPermission();
  if(epoch!==watchEpoch||!state.watching||state.me?.device.id!==deviceId||pairing()?.id!==pairId)return;
  state.browserNotices=permission==='granted';toast(state.browserNotices?'Notifikasi generik diaktifkan selama tab terlihat.':'Izin notifikasi belum diberikan. Temuan tetap tampil di kotak masuk.');
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')clearTimeout(pollTimer);else if(state.watching)schedulePoll();updateDetectionView();});
function badge(label,kind='gray'){return `<span class="badge ${kind}">${escape(label)}</span>`;}
function button(action,label,kind='',data=''){return `<button class="button ${kind}" data-action="${action}" ${data} ${state.busy?'disabled':''}>${label}</button>`;}
function empty(icon,title,description){return `<div class="empty"><span class="empty-icon" aria-hidden="true">${icon}</span><h3>${title}</h3><p>${description}</p></div>`;}
function footer(){return '<footer class="footer"><span>GEMPUR · Lawan judol. Lindungi keluarga.</span><a href="/privacy">Privasi &amp; batas layanan</a></footer>';}
function renderAuth(){
  root.innerHTML=`<div class="auth"><section class="auth-story"><div class="brand"><span class="brand-mark">G</span>GEMPUR</div><div><p class="eyebrow">Satu langkah, bersama.</p><h1>Lawan judol.<br><em>Jaga yang<br>berharga.</em></h1><p>Ruang untuk meminta dukungan, menjaga komitmen, dan mengambil kembali kendali. Bersama orang yang Anda percaya.</p></div><p class="manifesto">Pilihan ada pada peserta. Dukungan ada pada kita.<br>Tanpa pemantauan tersembunyi.</p></section><main class="auth-form"><p class="eyebrow">Ruang pendamping · Versi pengembangan</p><h2>Mulai dari saling percaya.</h2><p class="muted small">${state.privateMonitoringEnabled?'Pilih peran Anda. APK privat dapat berbagi temuan otomatis hanya setelah peserta mengonfirmasi pasangan dan mengaktifkan persetujuan terpisah.':'Pilih peran Anda. Informasi hanya dibagikan setelah peserta mengonfirmasi pasangan dan mengirimnya sendiri.'}</p><div class="role-picker"><button class="role-choice ${state.role==='companion'?'selected':''}" data-action="role" data-role="companion" aria-pressed="${state.role==='companion'}">✦<strong>Saya pendamping</strong><span>Mendengarkan dan memberi dukungan.</span></button><button class="role-choice ${state.role==='participant'?'selected':''}" data-action="role" data-role="participant" aria-pressed="${state.role==='participant'}">◈<strong>Saya peserta</strong><span>Mengatur siapa yang mendampingi.</span></button></div><form data-form="register"><div class="form-field"><label for="display-name">Nama panggilan</label><input id="display-name" name="name" maxlength="60" autocomplete="nickname" placeholder="Nama yang dikenali pasangan Anda" required></div><label class="consent"><input type="checkbox" name="consent" required><span>Saya berusia 18 tahun atau lebih dan memahami bahwa ruang ini untuk pendampingan sukarela. <a href="/privacy">Lihat privasi.</a></span></label><button class="button orange full" ${state.busy?'disabled':''}>${state.busy?'Menyiapkan…':'Buat ruang saya'} <span aria-hidden="true">↗</span></button></form>${state.error?`<div class="error-box">${escape(state.error)}</div>`:''}<p class="hint mt18">Akun terikat sesi browser ini (30 hari). Tidak ada pemulihan akun pada versi pengembangan. Proteksi Android bekerja terpisah; dashboard ini tidak memblokir situs pada HP Anda.</p>${footer()}</main></div>`;
}
function shell(content){
  const device=state.me.device;
  root.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">G</span>GEMPUR</div><nav class="nav" aria-label="Navigasi utama"><button data-action="page" data-page="overview" class="${state.page==='overview'?'active':''}"><span class="icon">◫</span>Ringkasan</button><button data-action="page" data-page="support" class="${state.page==='support'?'active':''}"><span class="icon">♡</span>Ruang dukungan</button>${state.privateMonitoringEnabled?`<button data-action="page" data-page="detections" class="${state.page==='detections'?'active':''}"><span class="icon">◉</span>Temuan privat</button>`:''}<button data-action="page" data-page="privacy" class="${state.page==='privacy'?'active':''}"><span class="icon">◇</span>Privasi &amp; akses</button></nav><div class="sidebar-note"><strong>Dampingi, tanpa menghakimi.</strong>Setiap langkah kecil tetap berarti. Percakapan yang baik dimulai dari mendengarkan.</div></aside><main class="main"><header class="topbar"><span class="crumb">Ruang ${participant()?'peserta':'pendamping'} <span aria-hidden="true">/</span> ${state.page==='privacy'?'Privasi & akses':state.page==='support'?'Dukungan':state.page==='detections'?'Temuan privat':'Ringkasan'}</span><div class="profile"><span class="avatar">${escape(device.name.slice(0,1).toUpperCase())}</span><div><strong>${escape(device.name)}</strong><span class="muted role">${participant()?'Peserta':'Pendamping'}</span></div></div></header>${state.error?`<div class="error-box">${escape(state.error)} ${button('refresh','Coba lagi','small outline')}</div>`:''}${content}${footer()}</main></div>`;
}
function pairCard(){
  const pair=pairing();
  if(!pair){
    return `<section class="card"><div class="card-head"><h2>${participant()?'Pilih orang tepercaya':'Terhubung dengan peserta'}</h2>${badge('Belum terhubung')}</div><p class="muted small">${participant()?'Buat undangan dan bagikan secara pribadi. Anda tetap memutuskan kapan informasi dikirim.':'Masukkan kode undangan yang dikirim peserta. Setelah itu, cocokkan kode verifikasi melalui percakapan langsung.'}</p>${participant()?`<div class="actions">${button('invite','Buat undangan','orange')}</div>`:`<form data-form="claim"><div class="form-field"><label for="invite-code">Kode undangan</label><input id="invite-code" name="invitationCode" autocomplete="off" maxlength="80" required placeholder="Tempel kode dari peserta"></div><button class="button full" ${state.busy?'disabled':''}>Terima undangan</button></form>`}</section>`;
  }
  if(pair.status==='invited')return `<section class="card"><div class="card-head"><h2>Undangan siap dibagikan</h2>${badge('Menunggu','orange')}</div><p class="muted small">Kirim kode ini secara pribadi kepada pendamping pilihan Anda. Berlaku sampai ${escape(time(pair.expiresAt))}.</p>${state.invite?.pairingId===pair.id?`<div class="code">${escape(state.invite.invitationCode)}</div><div class="actions">${button('copy-invite','Salin kode','secondary')}</div>`:'<p class="hint">Kode tidak disimpan server. Jika kode hilang, akhiri undangan ini lalu buat yang baru.</p>'}<div class="actions">${button('refresh','Periksa penerimaan','outline')}${button('revoke','Akhiri undangan','danger',`data-id="${pair.id}"`)}</div></section>`;
  if(pair.status==='claimed')return `<section class="card"><div class="card-head"><h2>Cocokkan identitas dahulu</h2>${badge('Perlu konfirmasi','orange')}</div><p class="small">${participant()?`<strong>${escape(pair.companion?.name)}</strong> menerima undangan Anda. Pastikan ini orang yang Anda pilih.`:`Minta <strong>${escape(pair.participant.name)}</strong> mencocokkan kode ini sebelum berbagi dimulai.`}</p><div class="code verification">${escape(pair.verificationCode || state.invite?.verificationCode || '••••••')}</div>${participant()?`<form data-form="confirm" data-id="${pair.id}"><label class="consent"><input type="checkbox" required><span>Saya sudah mencocokkan identitas dan kode dengan pendamping melalui percakapan langsung.</span></label><button class="button orange full" ${state.busy?'disabled':''}>Konfirmasi pendamping</button></form>`:`<div class="actions">${button('refresh','Periksa konfirmasi','outline')}</div>`}<div class="actions">${button('revoke','Batalkan pasangan','danger',`data-id="${pair.id}"`)}</div></section>`;
  return `<section class="card"><div class="card-head"><h2>Lingkaran dukungan</h2>${badge('Terhubung')}</div><div class="list-item"><span class="avatar">${escape((participant()?pair.companion?.name:pair.participant.name)?.slice(0,1).toUpperCase())}</span><div class="list-body"><strong>${escape(participant()?pair.companion?.name:pair.participant.name)}</strong><p>${participant()?'Pendamping pilihan Anda':'Peserta yang Anda dampingi'}</p></div></div><p class="hint mt16">${state.privateMonitoringEnabled&&pair.automation?.enabled?'Peserta mengaktifkan berbagi temuan otomatis pada APK privat. Hanya cakupan yang disetujui dibagikan; ini bukan seluruh aktivitas HP.':'Terhubung tidak berarti memantau HP. Ringkasan dan permintaan baru terlihat ketika peserta sengaja mengirimnya.'}</p></section>`;
}
function snapshotCard(){
  const snapshot=state.dashboard?.snapshot;
  const status=snapshot?statuses[snapshot.protection]:'Belum ada ringkasan';
  return `<section class="card protection"><div class="card-head"><p class="eyebrow">Laporan proteksi terakhir</p>${badge(snapshot?'Laporan peserta':'Menunggu data',snapshot?'':'gray')}</div><div class="shield" aria-hidden="true">◇</div><h2 class="big-state">${escape(status)}</h2><p>${snapshot?'Kondisi yang dilaporkan pada waktu pengiriman. Kondisi HP saat ini mungkin sudah berubah.':'Peserta belum mengirim ringkasan dari aplikasi Android. Tidak ada aktivitas yang diasumsikan.'}</p><div class="meta"><span>Dikirim: ${escape(time(snapshot?.receivedAt))}</span><span>Aturan: ${escape(snapshot?.rulesVersion || '—')}</span></div></section>`;
}
function supportList(){
  const supports=state.dashboard?.supports||[];
  return `<section class="card"><div class="card-head"><h2>Permintaan dukungan</h2><span class="eyebrow">${supports.length} permintaan</span></div>${supports.length?`<div class="list">${supports.map(item=>`<article class="list-item"><span class="list-icon">♡</span><div class="list-body"><strong>${escape(labels[item.message])}</strong><p>${escape(time(item.createdAt))} · ${escape(statuses[item.status]||item.status)}</p>${!participant()&&item.status==='received'?`<div class="actions">${button('read','Tandai sudah dibaca','small secondary',`data-id="${item.id}"`)}</div>`:''}</div></article>`).join('')}</div>`:empty('♡','Ruang untuk hadir','Belum ada permintaan dukungan. Tidak ada laporan bukan berarti tidak ada kebutuhan untuk berbicara.')}</section>`;
}
function exceptionList(){
  const exceptions=state.dashboard?.exceptions||[];
  return `<section class="card"><div class="card-head"><h2>Koreksi salah blok</h2><span class="eyebrow">Target terbatas</span></div><p class="hint">Koreksi hanya untuk target normal yang salah diblokir. Bukan persetujuan membuka akses judi. Izin terbatas pada satu target, setelah masa tunggu, maksimal 30 menit.</p>${exceptions.length?`<div class="list">${exceptions.map(item=>`<article class="list-item"><span class="list-icon">↗</span><div class="list-body"><strong>${escape(item.target)}</strong><p>${item.targetKind==='app'?'Aplikasi':'Domain'} · ${escape(statuses[item.state]||item.state)}${item.readyAt?` · Siap setelah ${escape(time(item.readyAt))}`:''}</p>${item.state==='pending'&&!participant()?`<label class="consent"><input id="review-${item.id}" type="checkbox"><span>Saya sudah meninjau target ini dan memiliki alasan bahwa ini layanan normal yang salah terdeteksi, bukan permintaan membuka akses judi.</span></label><div class="actions">${button('approve','Setujui koreksi','small secondary',`data-id="${item.id}"`)}${button('deny','Tolak','small outline',`data-id="${item.id}"`)}</div>`:''}${participant()&&['approved','issued'].includes(item.state)?'<p class="hint">Penerapan dilakukan melalui konfirmasi lokal di Android; browser tidak mengubah proteksi.</p>':''}</div></article>`).join('')}</div>`:empty('◇','Belum ada koreksi','Jika layanan normal terblokir, peserta dapat meminta tinjauan untuk satu domain tertentu.')}</section>`;
}
function renderOverview(){
  const pair=pairing(),snapshot=state.dashboard?.snapshot;
  const active=pair?.status==='active';
  const name=participant()?state.me.device.name:pair?.participant?.name;
  shell(`<div class="hero-heading"><div><p class="eyebrow">Satu langkah, bersama</p><h1>${participant()?`Langkah baik hari ini,<br>${escape(name)}.`:name?`Hadir untuk ${escape(name)}.`:'Dukungan dimulai<br>dari Anda.'}</h1><p class="muted small">${participant()?'Pegang kendali atas proteksi dan informasi yang Anda bagikan.':'Bantu menjaga komitmen melalui percakapan yang hangat dan dukungan yang nyata.'}</p></div><span class="date">${escape(new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long'}))}</span></div><div class="banner"><span aria-hidden="true">ⓘ</span><div>${state.privateMonitoringEnabled&&pair?.automation?.enabled?'APK privat berbagi temuan otomatis sesuai persetujuan peserta. <strong>Kecocokan aturan bukan bukti seseorang berjudi.</strong>':'Ruang ini menerima informasi yang dikirim peserta secara sukarela. <strong>Tidak ada pemantauan HP secara langsung.</strong>'}</div></div><div class="grid"><div class="stack">${snapshotCard()}<div class="metric-row"><section class="metric"><span class="eyebrow">Koneksi diblokir</span><div class="value">${snapshot?escape(snapshot.blockedRequests):'—'}</div><p>${snapshot?'Menurut ringkasan terakhir; bukan jumlah taruhan.':'Menunggu ringkasan Android.'}</p></section><section class="metric"><span class="eyebrow">Dukungan tersedia</span><div class="value">${active?'Terhubung':'Belum'}</div><p>${active?'Kirim atau tanggapi permintaan bersama.':'Cocokkan undangan terlebih dahulu.'}</p></section></div>${supportList()}</div><div class="stack">${pairCard()}<section class="card support-card"><p class="eyebrow">Percakapan kecil, arti besar</p><h2>${participant()?'Tidak perlu melewati<br>ini sendirian.':'Tanyakan kabarnya.<br>Dengarkan ceritanya.'}</h2><p>${participant()?'Saat dorongan terasa kuat, beri ruang untuk jeda dan minta ditemani.':'Dukungan tidak harus menunggu peringatan. Kehadiran Anda tetap berarti.'}</p>${button('page',participant()?'Saya butuh dukungan':'Buka ruang dukungan','orange','data-page="support"')}</section><div class="actions">${button('refresh','↻ Perbarui ringkasan','outline full')}</div></div></div>`);
}
function reportCard(){
  if(!participant())return '';
  return `<section class="card"><h2>Judol belum terblokir?</h2><p class="hint mt10">Kirim domain untuk ditinjau pengelola. Laporan tidak otomatis mengubah daftar global. Jangan sertakan tautan lengkap, isi akun, atau data pribadi.</p><form data-form="report"><div class="form-field"><label for="report-domain">Domain yang ingin dilaporkan</label><input id="report-domain" name="target" placeholder="contoh.org" maxlength="253" autocomplete="off" required></div><label class="consent"><input type="checkbox" required><span>Saya memilih mengirim domain ini untuk ditinjau.</span></label><button class="button outline full" ${state.busy?'disabled':''}>Kirim laporan domain</button></form></section>`;
}
function renderSupport(){
  const active=pairing()?.status==='active';
  shell(`<div class="hero-heading"><div><p class="eyebrow">Ada ruang untuk berbicara</p><h1>Jangan berjalan sendiri.</h1><p class="muted small">Sampaikan kebutuhan yang jelas. Pendamping tidak selalu tersedia; gunakan komunikasi langsung bila perlu.</p></div></div><div class="grid"><div class="stack">${participant()?`<section class="card support-card"><h2>Saya ingin ditemani.</h2><p>Pilih pesan singkat. Saat dikirim, pesan diterima server dan terlihat di ruang pendamping. Tidak ada notifikasi push atau janji respons instan pada versi ini.</p><form data-form="support"><div class="form-field"><label for="support-message">Apa yang Anda butuhkan?</label><select id="support-message" name="message"><option value="call">Bisa telepon saya?</option><option value="message">Bisa kirim pesan kepada saya?</option><option value="company">Saya butuh ditemani sebentar.</option></select></div><button class="button orange full" ${!active||state.busy?'disabled':''}>Kirim permintaan</button></form>${!active?'<p class="hint mt12">Hubungkan pendamping terlebih dahulu.</p>':''}</section>`:'<section class="card support-card"><h2>Hadir, tanpa menghakimi.</h2><p>Mulai dengan “Kamu butuh ditemani seperti apa?”. Permintaan yang sudah dibaca bukan berarti bantuan telah selesai diberikan.</p><div class="actions">'+button('refresh','Periksa permintaan','orange')+'</div></section>'}${supportList()}<section class="card"><h2>Ambil satu jeda.</h2><div class="list"><div class="list-item"><span class="list-icon">01</span><div class="list-body"><strong>Jauhkan HP sebentar</strong><p>Pindah ke ruang lain atau duduk bersama orang tepercaya.</p></div></div><div class="list-item"><span class="list-icon">02</span><div class="list-body"><strong>Pilih kegiatan yang sudah direncanakan</strong><p>Berjalan sebentar, minum air, atau menghubungi pendamping.</p></div></div><div class="list-item"><span class="list-icon">03</span><div class="list-body"><strong>Cari bantuan profesional bila diperlukan</strong><p>Aplikasi ini alat bantu, bukan layanan terapi atau layanan darurat.</p></div></div></div></section></div><div class="stack">${exceptionList()}${reportCard()}${participant()?`<section class="card"><h2>Domain normal ikut terblokir?</h2><p class="hint mt10">Ajukan satu domain. Jangan masukkan data akun atau tautan yang memuat informasi pribadi.</p><form data-form="exception"><div class="form-field"><label for="domain-target">Domain normal</label><input id="domain-target" name="target" placeholder="contoh.org" maxlength="253" autocomplete="off" required></div><label class="consent"><input type="checkbox" required><span>Ini layanan normal yang salah terblokir, bukan permintaan membuka akses judi.</span></label><button class="button full" ${!active||state.busy?'disabled':''}>Ajukan koreksi</button></form></section>`:''}</div></div>`);
}
function renderPrivacy(){
  const pair=pairing();
  shell(`<div class="hero-heading"><div><p class="eyebrow">Pilihan Anda tetap utama</p><h1>Privasi &amp; akses.</h1><p class="muted small">Pahami apa yang dibagikan dan siapa yang dapat melihatnya.</p></div></div><div class="grid"><div class="stack"><section class="card"><h2>Berbagi seperlunya.</h2>${state.privateMonitoringEnabled?`<p class="small muted mt12">Server uji privat mendukung temuan otomatis yang diaktifkan peserta melalui APK privat. Domain atau paket aplikasi target, alasan, kategori, tindakan, waktu dan hitungan dibagikan hanya dalam cakupan persetujuan. Tidak ada unggahan daftar seluruh aplikasi. Temuan disimpan maksimal 7 hari dan dihapus saat persetujuan dihentikan; catatan yang sudah dibaca tidak dapat ditarik kembali.</p>`:''}<div class="list"><div class="list-item"><span class="list-icon">◇</span><div class="list-body"><strong>Ringkasan dikirim peserta sendiri</strong><p>Dashboard tidak mengambil riwayat browsing lengkap, chat, OTP, lokasi, layar, atau transaksi rekening. Pada APK privat, temuan target dapat dibagikan otomatis setelah persetujuan terpisah.</p></div></div><div class="list-item"><span class="list-icon">↗</span><div class="list-body"><strong>Koreksi membagikan domain target</strong><p>Hanya agar pendamping dapat meninjau apakah ada blok yang keliru.</p></div></div><div class="list-item"><span class="list-icon">◷</span><div class="list-body"><strong>Data berbagi disimpan hingga 14 hari</strong><p>Data aktif dibersihkan saat permintaan berikutnya diproses. Backup dan penyimpanan disk bergantung konfigurasi operator.</p></div></div></div><div class="actions"><a class="button outline" href="/privacy">Baca penjelasan lengkap</a>${button('export','Unduh data saya','secondary')}</div></section><section class="card"><h2>Akun perangkat pengembangan</h2><p class="muted small mt12">Sesi browser ini berlaku maksimal 30 hari. Versi ini belum menyediakan pemulihan akun. Keluar mengakhiri akses berbagi dan menonaktifkan sesi perangkat ini. Metadata akun mengikuti masa retensi; hapus akun untuk menghapus data aktifnya.</p><div class="actions">${button('logout','Keluar dari browser','outline')}${button('delete','Hapus akun dan data aktif','danger')}</div></section></div><div class="stack">${pairCard()}${pair?`<section class="card"><h2>Akhiri akses berbagi</h2><p class="muted small mt12">Server langsung menutup akses pasangan dan menghapus snapshot serta permintaan dukungan terkait. Informasi yang sudah dibaca atau disalin tidak dapat ditarik kembali.</p><div class="actions">${button('revoke','Akhiri pasangan ini','danger',`data-id="${pair.id}"`)}</div></section>`:''}</div></div>`);
}
function detectionStatus(){
  if(state.detectionError)return `Pembaruan gagal: ${state.detectionError}. Yang tampil adalah data terakhir, bukan status HP saat ini.`;
  if(!state.automation?.enabled)return 'Berbagi temuan otomatis belum aktif. Peserta mengaturnya melalui APK privat dengan persetujuan terpisah.';
  if(!state.watching)return `Pembaruan manual · terakhir diperiksa ${time(state.detectionLoadedAt)}.`;
  if(document.visibilityState!=='visible')return 'Pembaruan dijeda karena tab tidak terlihat. Tidak ada layanan push browser.';
  return `Pembaruan setiap sekitar 30 detik selama tab terlihat · terakhir ${time(state.detectionLoadedAt)}${state.browserNotices?' · notifikasi browser diizinkan':''}.`;
}
function renderDetectionRows(){
  const list=document.querySelector('#detection-events');if(!list)return;list.replaceChildren();
  if(!state.automation?.enabled||!state.detections.length){
    list.innerHTML=empty('◉','Belum ada temuan yang dibagikan','Tidak ada laporan bukan bukti tidak ada aktivitas. Data hanya tersedia untuk cakupan yang disetujui peserta.');return;
  }
  for(const item of state.detections){
    const view=detectionPresentation(item),article=document.createElement('article');article.className='detection-item';
    const title=document.createElement('h3');title.className='scroll-domain';title.textContent=item.target;
    const verdict=document.createElement('p');verdict.className=`detection-verdict ${item.verdict==='suspected'?'suspected':''}`;verdict.textContent=`${view.kind} · ${view.verdict}`;
    const reason=document.createElement('p');reason.textContent=`${view.reason}. ${view.action}. ${Number.isSafeInteger(item.count)?item.count:1} permintaan tercatat, bukan jumlah kunjungan atau taruhan.`;
    const dates=document.createElement('p');dates.className='hint';dates.textContent=`Waktu temuan: ${time(item.occurredAt)} · Diterima server: ${time(item.receivedAt)} · ${item.readAt?`Ditandai dibaca: ${time(item.readAt)}`:'Belum ditandai dibaca pendamping'}`;
    const actions=document.createElement('div');actions.className='actions';
    if(participant()||!item.readAt){
      const control=document.createElement('button');control.className='button small secondary';control.type='button';control.dataset.action=participant()?'detection-correction':'detection-read';control.dataset.id=item.id;control.disabled=state.busy;
      control.textContent=participant()?'Minta tinjauan salah blok':'Tandai sudah dibaca';actions.append(control);
    }
    article.append(title,verdict,reason,dates,actions);list.append(article);
  }
}
function updateDetectionView(){
  const status=document.querySelector('#detection-status');if(status)status.textContent=detectionStatus();
  renderDetectionRows();
}
function renderDetections(){
  const active=pairing()?.status==='active',enabled=state.automation?.enabled;
  shell(`<div class="hero-heading"><div><p class="eyebrow">APK uji privat · persetujuan terpisah</p><h1>Temuan untuk ditinjau.</h1><p class="muted small">Baca alasan dan waktunya sebelum menarik kesimpulan. Temuan dapat berasal dari koneksi latar belakang atau salah deteksi.</p></div></div><div class="banner"><span aria-hidden="true">ⓘ</span><div>Ini bukan riwayat seluruh aktivitas HP. Hanya domain atau paket aplikasi yang terdeteksi dalam cakupan persetujuan. Nama yang mencurigakan tetap berstatus <strong>diduga</strong>.</div></div><div class="grid"><div class="stack"><section class="card"><div class="card-head"><h2>Kotak masuk temuan</h2>${badge(enabled?'Berbagi diaktifkan peserta':'Tidak aktif',enabled?'orange':'gray')}</div><p id="detection-status" class="hint" role="status"></p><div class="actions">${button('refresh','Periksa sekarang','outline')}${state.watching?button('watch-stop','Hentikan pembaruan','danger'):button('watch-start','Perbarui otomatis saat tab terlihat','secondary',!active||!enabled?'disabled':'')}${!participant()&&enabled?button('watch-notices',state.browserNotices?'Notifikasi browser aktif':'Izinkan notifikasi browser','outline'):''}</div><div id="detection-events" class="detection-list mt18"></div></section></div><div class="stack"><section class="card"><h2>Peringatan yang perlu konteks.</h2><p class="small muted mt12">Diblokir bukan berarti peserta sengaja berjudi. Indikasi nama bukan pemeriksaan isi website atau aplikasi. Bicarakan temuan dan tinjau salah blok bersama.</p><p class="hint mt12">Pembaruan browser berhenti ketika tab tidak terlihat atau ditutup. Notifikasi memerlukan izin browser dan tidak dijamin muncul. Untuk notifikasi HP pendamping, gunakan layanan pendamping yang dinyalakan secara terlihat di APK privat; layanan itu juga memakai polling, bukan push.</p></section><section class="card"><h2>Jika terdeteksi keliru</h2><p class="small muted mt12">Peserta memilih satu temuan lalu mengirim permintaan koreksi. Pendamping meninjau target domain atau paket aplikasi tersebut. Persetujuan melewati masa tunggu 10 menit, berlaku maksimal 30 menit, dan tidak membuka seluruh proteksi.</p><div class="actions">${button('page','Buka daftar koreksi','outline','data-page="support"')}</div></section>${participant()?`<section class="card"><h2>Kendalikan berbagi dari HP</h2><p class="small muted mt12">Aktifkan atau hentikan persetujuan otomatis di APK privat. Pasangan yang sudah ada tetap manual sampai Anda memilih mengaktifkannya. Menghentikan persetujuan menghapus temuan aktif di server; data yang sudah dibaca tidak dapat ditarik kembali.</p></section>`:''}</div></div>`);
  updateDetectionView();
}
function render(){if(!state.me)return renderAuth();if(state.page==='privacy')renderPrivacy();else if(state.page==='support')renderSupport();else if(state.page==='detections'&&state.privateMonitoringEnabled)renderDetections();else renderOverview();}
async function run(action){if(state.busy)return;state.busy=true;try{await action();}catch(error){toast(error.message);}finally{state.busy=false;render();}}
root.addEventListener('click',event=>{
  const node=event.target.closest('[data-action]');if(!node)return;
  const action=node.dataset.action;
  if(action==='role'){state.role=node.dataset.role;return render();}
  if(action==='page'){state.page=node.dataset.page;render();window.scrollTo(0,0);return;}
  run(async()=>{
    if(action==='refresh')await load();
    if(action==='watch-start'){startWatching();toast('Pembaruan aktif selama tab terlihat. Data lama tidak diumumkan sebagai temuan baru.');}
    if(action==='watch-stop'){stopWatching();toast('Pembaruan dan notifikasi browser dihentikan. Persetujuan berbagi di HP tidak berubah.');}
    if(action==='watch-notices'){
      if(participant())throw new Error('Notifikasi ini untuk pendamping.');
      if(state.browserNotices){state.browserNotices=false;toast('Notifikasi browser dihentikan.');}
      else await enableBrowserNotices();
    }
    if(action==='detection-read'){
      const item=state.detections.find(item=>item.id===node.dataset.id);if(!item||participant())throw new Error('Temuan tidak tersedia.');
      await api(`/detections/${encodeURIComponent(item.id)}/read`,'POST',{});await load();toast('Ditandai sudah dibaca, bukan bukti masalah sudah selesai.');
    }
    if(action==='detection-correction'){
      const item=state.detections.find(item=>item.id===node.dataset.id);if(!item||!participant()||pairing()?.status!=='active')throw new Error('Temuan tidak tersedia.');
      if(!confirm(`Ajukan koreksi untuk ${item.kind==='app'?'paket aplikasi':'domain'} ${item.target}? Target ini akan ditinjau pendamping. Persetujuan bukan pembukaan seluruh proteksi.`))return;
      await api('/exceptions','POST',{pairingId:pairing().id,target:item.target,targetKind:item.kind,detectionId:item.id,reason:'false_positive'});await load();toast('Koreksi target dikirim. Blok tetap berlaku sambil menunggu tinjauan.');
    }
    if(action==='invite'){state.invite=await api('/pairings','POST',{});await load();toast('Undangan dibuat. Bagikan secara pribadi.');}
    if(action==='copy-invite'){await navigator.clipboard.writeText(state.invite.invitationCode);toast('Kode disalin. Kirim hanya kepada pendamping pilihan.');}
    if(action==='revoke'&&confirm('Akhiri pasangan/undangan ini? Akses data server akan dicabut.')){clearDetectionState();await api(`/pairings/${node.dataset.id}`,'DELETE');state.invite=null;await load();toast('Akses berbagi sudah berakhir.');}
    if(action==='read'){await api(`/support/${node.dataset.id}/read`,'POST',{});await load();toast('Ditandai sudah dibaca, bukan berarti bantuan sudah selesai.');}
    if(action==='approve'||action==='deny'){
      if(action==='approve'&&!document.getElementById(`review-${node.dataset.id}`)?.checked)throw new Error('Tinjau target dan konfirmasi alasan salah deteksi terlebih dahulu.');
      await api(`/exceptions/${node.dataset.id}/decision`,'POST',{decision:action==='approve'?'approve':'deny'});await load();toast('Keputusan disimpan. Proteksi HP belum berubah.');
    }
    if(action==='export'){const payload=await api('/me/export');const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='gempur-data-saya.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    if(action==='logout'&&confirm('Keluar akan mengakhiri semua pasangan dan akses berbagi, serta menonaktifkan sesi ini. Versi ini belum menyediakan pemulihan akun. Lanjutkan?')){await api('/session','DELETE');state.me=null;state.dashboard=null;clearDetectionState();toast('Sesi dan akses berbagi diakhiri.');}
    if(action==='delete'&&confirm('Hapus akun serta data pasangan dari database aktif? Tindakan ini tidak dapat dibatalkan.')){await api('/me','DELETE');state.me=null;state.dashboard=null;clearDetectionState();toast('Akun dan data aktif terkait dihapus.');}
  });
});
root.addEventListener('submit',event=>{
  const form=event.target.closest('[data-form]');if(!form)return;event.preventDefault();const fields=new FormData(form);
  run(async()=>{
    const kind=form.dataset.form;
    if(kind==='register'){await api('/devices','POST',{role:state.role,name:fields.get('name')});await load();toast('Ruang siap. Hubungkan hanya orang yang Anda percaya.');}
    if(kind==='claim'){state.invite=await api('/pairings/claim','POST',{invitationCode:fields.get('invitationCode').trim()});await load();toast('Cocokkan kode dengan peserta sebelum mulai berbagi.');}
    if(kind==='confirm'){await api(`/pairings/${form.dataset.id}/confirm`,'POST',{verificationCode:pairing().verificationCode});await load();toast('Pendamping dikonfirmasi. Data belum dikirim otomatis.');}
    if(kind==='support'){await api('/support','POST',{pairingId:pairing().id,message:fields.get('message')});await load();toast('Diterima server. Belum tentu dibaca pendamping.');}
    if(kind==='report'){const target=fields.get('target').trim();if(!confirm(`Kirim domain ${target} untuk ditinjau? Laporan tidak otomatis mengaktifkan blok global.`))return;await api('/reports','POST',{target});form.reset();toast('Domain diterima untuk tinjauan. Daftar blok belum berubah.');}
    if(kind==='exception'){await api('/exceptions','POST',{pairingId:pairing().id,target:fields.get('target').trim(),reason:'false_positive'});await load();toast('Koreksi dikirim untuk ditinjau.');}
  });
});
await load();
