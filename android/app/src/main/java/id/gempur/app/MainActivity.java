package id.gempur.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.VpnService;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Visible, owner-operated app. Private automation requires separately compiled build and separate consent. */
public final class MainActivity extends Activity {
    private static final int INK=0xff142c2a, ORANGE=0xffe85d2a, PAPER=0xfff6f5ef, MUTED=0xff5b6d68;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private LocalStore store;
    private CompanionClient api;
    private LinearLayout page;
    private int tab=0;
    private boolean busy=false;
    private JSONArray privateRemoteDetections=new JSONArray();
    private JSONArray privateExceptions=new JSONArray();
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try{store=new LocalStore(this);api=new CompanionClient(store);}
        catch(Exception e){
            new AlertDialog.Builder(this).setTitle("Data lokal belum dapat dibuka")
                .setMessage("Vault terenkripsi tidak dapat dibaca. Data tidak dihapus otomatis. Periksa kunci perangkat atau hubungi pengembang.")
                .setCancelable(false).setPositiveButton("Tutup",(d,w)->finish()).show();return;
        }
        if(BuildConfig.PRIVATE_BUILD&&getIntent().getBooleanExtra("private_tab",false))tab=4;
        if(store.get("consent").isEmpty())onboarding();else render();
    }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(BuildConfig.PRIVATE_BUILD&&intent.getBooleanExtra("private_tab",false)){tab=4;render();}}
    @Override protected void onResume(){super.onResume();if(store!=null&&!store.get("consent").isEmpty())render();}
    @Override protected void onDestroy(){worker.shutdown();super.onDestroy();}
    private int dp(int n){return (int)(getResources().getDisplayMetrics().density*n+0.5f);}
    private GradientDrawable bg(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    private TextView text(String value,int size,int color,boolean bold){
        TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);
        if(bold)t.setTypeface(Typeface.create("sans-serif",Typeface.BOLD));t.setLineSpacing(dp(3),1);return t;
    }
    private void label(LinearLayout parent,String value,int size,int color,boolean bold){TextView t=text(value,size,color,bold);parent.addView(t);gap(parent,8);}
    private void gap(LinearLayout parent,int n){View v=new View(this);parent.addView(v,new LinearLayout.LayoutParams(1,dp(n)));}
    private LinearLayout card(){
        LinearLayout c=new LinearLayout(this);c.setOrientation(LinearLayout.VERTICAL);c.setPadding(dp(20),dp(20),dp(20),dp(20));c.setBackground(bg(Color.WHITE,20));
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.setMargins(0,0,0,dp(16));page.addView(c,lp);return c;
    }
    private Button button(LinearLayout parent,String title,Runnable action,boolean primary){
        Button b=new Button(this);b.setText(title);b.setAllCaps(false);b.setTextColor(primary?Color.WHITE:INK);
        b.setTextSize(15);b.setTypeface(Typeface.DEFAULT,Typeface.BOLD);b.setBackground(bg(primary?ORANGE:0xffeaf0eb,12));b.setPadding(dp(12),dp(12),dp(12),dp(12));
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.setMargins(0,dp(8),0,dp(4));parent.addView(b,lp);
        b.setOnClickListener(v->action.run());return b;
    }
    private void render(){
        if(isFinishing()||isDestroyed()||store==null)return;
        LinearLayout outer=new LinearLayout(this);outer.setOrientation(LinearLayout.VERTICAL);outer.setBackgroundColor(PAPER);
        outer.setOnApplyWindowInsetsListener((v,insets)->{
            if(Build.VERSION.SDK_INT>=30){android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);}
            else v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());return insets;
        });
        LinearLayout header=new LinearLayout(this);header.setOrientation(LinearLayout.HORIZONTAL);header.setPadding(dp(24),dp(18),dp(24),dp(16));header.setBackgroundColor(INK);
        TextView brand=text("GEMPUR",23,Color.WHITE,true);header.addView(brand,new LinearLayout.LayoutParams(0,-2,1));
        header.addView(text(BuildConfig.PRIVATE_BUILD?"PRIVAT · ALPHA":"ALPHA  0.2",11,0xffa8c6b8,true));outer.addView(header);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);page=new LinearLayout(this);page.setOrientation(LinearLayout.VERTICAL);page.setPadding(dp(20),dp(22),dp(20),dp(20));
        scroll.addView(page);outer.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        if(tab==0)home();else if(tab==1)notes();else if(tab==2)companion();else if(tab==4&&BuildConfig.PRIVATE_BUILD){
            try{privateAutomation();}catch(Exception unavailable){LinearLayout error=card();label(error,"Data deteksi privat belum dapat dibaca",21,INK,true);label(error,"Data tidak direset atau dihapus otomatis. Hentikan layanan privat dan periksa penyimpanan/kunci perangkat. Filter DNS dasar tetap terpisah.",14,MUTED,false);button(error,"Hentikan layanan privat",()->{stopPrivateLocally();info("Pengiriman lokal dihentikan","Izin server tetap perlu dicabut atau disinkronkan. Data lokal yang tidak dapat dibaca tetap disimpan.");},false);}
        }else settings();
        LinearLayout nav=new LinearLayout(this);nav.setPadding(dp(10),dp(8),dp(10),dp(8));nav.setBackgroundColor(Color.WHITE);
        String[] tabs=BuildConfig.PRIVATE_BUILD?new String[]{"Beranda","Catatan","Pendamping","Aturan","Deteksi"}:new String[]{"Beranda","Catatan","Pendamping","Aturan"};
        for(int i=0;i<tabs.length;i++){final int index=i;TextView b=text(tabs[i],12,tab==i?ORANGE:MUTED,tab==i);b.setGravity(android.view.Gravity.CENTER);b.setPadding(0,dp(15),0,dp(15));nav.addView(b,new LinearLayout.LayoutParams(0,-2,1));b.setOnClickListener(v->{tab=index;render();});}
        outer.addView(nav);setContentView(outer);outer.requestApplyInsets();
    }
    private void home(){
        label(page,"Lawan judol.\nJaga langkahmu.",30,INK,true);
        label(page,"Satu keputusan baik, dimulai dari sekarang.",15,MUTED,false);
        gap(page,12);
        LinearLayout status=card();boolean active=ProtectionService.isRunning();
        label(status,active?"●  FILTER DNS AKTIF":"○  PROTEKSI BELUM AKTIF",13,active?0xff24694e:MUTED,true);
        label(status,active?"Ada penghalang sebelum akses.":"Bangun batas untuk dirimu.",23,INK,true);
        label(status,"Membatasi domain pada daftar melalui DNS lokal. Secure DNS/DoH, IP langsung, dan perangkat lain belum tercakup.",14,MUTED,false);
        if(active)button(status,"Hentikan proteksi",this::stopProtection,false);
        else button(status,"Aktifkan proteksi",this::startProtection,true);
        SharedPreferences prefs=getSharedPreferences("gempur-protection",MODE_PRIVATE);
        label(status,prefs.getLong("blocked_count",0)+" koneksi dibatasi · bukan jumlah taruhan",12,MUTED,false);
        String error=prefs.getString("last_error","");if(!error.isEmpty())label(status,"Perlu diperiksa: "+error,12,ORANGE,false);
        LinearLayout support=card();
        label(support,"Dorongan sedang naik?",21,INK,true);
        label(support,"Ambil jeda. Hubungi orang yang kamu percaya atau lakukan kegiatan yang sudah kamu pilih.",14,MUTED,false);
        button(support,"Saya butuh ditemani",this::supportDialog,true);
        button(support,"Buka rencana pengalihan",this::planDialog,false);
        LinearLayout next=card();label(next,"Hari ini, satu langkah dulu.",21,INK,true);
        button(next,"Catat kondisi saya",this::checkIn,false);
        button(next,"Jalankan tes proteksi aman",()->{
            if(busy)return;busy=true;
            worker.execute(()->{boolean result=ProtectionService.selfTest();runOnUiThread(()->{busy=false;info(result?"Tes lokal berhasil":"Tes lokal belum berhasil",result?"Resolver lokal merespons domain uji sesuai aturan. Ini menguji jalur DNS sintetis, bukan seluruh browser, DoH, atau semua situs judi.":"Aktifkan proteksi, periksa Private DNS/VPN lain, lalu coba kembali. Tidak ada situs judi yang dibuka.");});});
        },false);
        label(next,BuildConfig.PRIVATE_BUILD?"Uji privat: deteksi tambahan dan berbagi otomatis hanya setelah pilihan terpisah di tab Deteksi. Bukan perlindungan menyeluruh.":"Versi awal: belum layak sebagai satu-satunya perlindungan judol. Tidak ada pemantauan tersembunyi atau unggahan aktivitas otomatis.",12,MUTED,false);
    }
    private void startProtection(){
        new AlertDialog.Builder(this).setTitle("Aktifkan filter DNS lokal?")
            .setMessage("Gempur menggunakan slot VPN Android untuk memeriksa nama domain secara lokal. VPN lain dapat tergantikan. Isi browsing tidak diunggah ke server Gempur."+(BuildConfig.PRIVATE_BUILD?" Pada uji privat, metadata target yang terdeteksi hanya dibagikan jika kamu mengaktifkan persetujuan otomatis terpisah di tab Deteksi.":"")+"\n\nNama domain yang diizinkan diteruskan melalui DNS UDP biasa ke resolver jaringan perangkat. Ini bukan VPN untuk mengenkripsi browsing. Private DNS ketat yang terdeteksi membuat layanan menolak aktif.\n\nFilter ini belum menutup DoH/DoT, IP langsung, atau semua aplikasi. Always-on dan lockdown belum didukung versi ini. Kamu tetap dapat menghentikan layanan dan mencabut izin.")
            .setNegativeButton("Batal",null).setPositiveButton("Saya setuju",(d,w)->{
                if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},3);
                Intent prepare=VpnService.prepare(this);
                if(prepare!=null)startActivityForResult(prepare,41);else launchService();
            }).show();
    }
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==41&&result==RESULT_OK)launchService();}
    private void launchService(){try{startForegroundService(new Intent(this,ProtectionService.class).setAction(ProtectionService.ACTION_START));page.postDelayed(this::render,800);}catch(Exception e){info("Proteksi belum aktif","Android belum dapat memulai layanan. Periksa izin VPN dan coba kembali.");}}
    private void stopProtection(){startService(new Intent(this,ProtectionService.class).setAction(ProtectionService.ACTION_STOP));page.postDelayed(this::render,400);}
    private void onboarding(){
        LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(24),dp(24),dp(24),dp(12));
        label(content,"Lawan judol.\nLindungi masa depan.",28,INK,true);
        label(content,"Gempur membantu membatasi akses domain judi yang dikenal, mencatat kondisi secara pribadi, dan meminta dukungan.",16,MUTED,false);
        label(content,"Versi alpha: cakupan terbatas. Bukan terapi atau jaminan berhenti berjudi. Semua aktivitas tetap lokal kecuali kamu memilih membagikannya.",14,MUTED,false);
        CheckBox adult=new CheckBox(this);adult.setText(R.string.consent_adult);content.addView(adult);
        CheckBox consent=new CheckBox(this);consent.setText(R.string.consent_limits);content.addView(consent);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Selamat datang di Gempur").setView(content).setCancelable(false).setNegativeButton("Keluar",(d,w)->finish()).setPositiveButton("Mulai",null).create();
        dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            if(!adult.isChecked()||!consent.isChecked()){info("Konfirmasi diperlukan","Centang kedua pilihan jika sesuai dengan kondisimu.");return;}
            try{store.put("consent","v1:"+Instant.now());dialog.dismiss();render();}catch(Exception e){info("Belum tersimpan","Persetujuan belum dapat disimpan.");}
        }));dialog.show();
    }
    private void notes(){
        label(page,"Catatan pribadi",28,INK,true);label(page,"Tersimpan terenkripsi di HP ini. Tidak dibagikan otomatis.",14,MUTED,false);
        LinearLayout top=card();button(top,"Tambah check-in",this::checkIn,true);
        try{
            JSONArray notes=store.notes();for(int i=notes.length()-1;i>=Math.max(0,notes.length()-30);i--){
                JSONObject n=notes.getJSONObject(i);LinearLayout c=card();
                label(c,format(n.getString("createdAt")),12,MUTED,false);
                label(c,"Dorongan "+n.getInt("urge")+" / 10",21,INK,true);
                label(c,outcomeLabel(n.getString("outcome")),14,MUTED,false);
            }
            if(notes.length()==0){LinearLayout c=card();label(c,"Belum ada catatan.",20,INK,true);label(c,"Kamu bisa mencatat tanpa harus menjawab semua hal atau membagikannya.",14,MUTED,false);}
        }catch(Exception e){info("Catatan belum dapat dibaca","Data tidak dihapus otomatis.");}
        LinearLayout privacy=card();
        button(privacy,"Ekspor catatan",()->{try{String data=store.notesExport();new AlertDialog.Builder(this).setTitle("Ekspor data pribadi?").setMessage("File teks berisi catatan kondisi. Pilih penerima dengan hati-hati. Token dan pengaturan server tidak disertakan.").setNegativeButton("Batal",null).setPositiveButton("Pilih tujuan",(d,w)->shareText(data)).show();}catch(Exception e){info("Ekspor gagal","Coba kembali.");}},false);
        button(privacy,"Hapus seluruh catatan",()->confirm("Hapus catatan lokal?","Tindakan ini tidak dapat dibatalkan.",()->{try{store.clearNotes();render();}catch(Exception e){info("Gagal menghapus","Coba kembali.");}}),false);
    }
    private String outcomeLabel(String value){return "no".equals(value)?"Menurut catatan saya: tidak berjudi.":"yes".equals(value)?"Saya mencatat kejadian berjudi. Masih ada langkah berikutnya.":"Saya memilih tidak menjawab tentang kejadian berjudi.";}
    private void checkIn(){
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(dp(24),dp(8),dp(24),0);
        TextView score=text("Dorongan saat ini: 0 / 10",18,INK,true);form.addView(score);
        SeekBar slider=new SeekBar(this);slider.setMax(10);form.addView(slider);
        slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onProgressChanged(SeekBar b,int p,boolean user){score.setText(getString(R.string.urge_score,p));}public void onStartTrackingTouch(SeekBar b){}public void onStopTrackingTouch(SeekBar b){}});
        label(form,"Apakah hari ini ada kejadian berjudi?",14,MUTED,false);
        Spinner answer=new Spinner(this);answer.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,new String[]{"Lewati pertanyaan","Tidak","Ya"}));form.addView(answer);
        new AlertDialog.Builder(this).setTitle("Check-in untuk dirimu").setView(form).setNegativeButton("Batal",null).setPositiveButton("Simpan lokal",(d,w)->{
            try{String[] values={"skip","no","yes"};store.checkIn(slider.getProgress(),values[answer.getSelectedItemPosition()]);tab=1;render();}catch(Exception e){info("Belum tersimpan","Coba kembali. Tidak ada data yang diunggah.");}
        }).show();
    }
    private void planDialog(){
        EditText input=new EditText(this);input.setText(store.get("plan").isEmpty()?"Letakkan HP. Minum air. Jalan 5 menit. Hubungi pendamping.":store.get("plan"));
        input.setMinLines(4);input.setPadding(dp(24),dp(16),dp(24),dp(16));
        new AlertDialog.Builder(this).setTitle("Rencana saat dorongan muncul").setView(input).setNegativeButton("Tutup",null).setPositiveButton("Simpan",(d,w)->{
            try{String s=input.getText().toString().trim();if(s.length()>1000)throw new Exception();store.put("plan",s);}catch(Exception e){info("Belum tersimpan","Gunakan maksimal 1.000 karakter.");}
        }).show();
    }
    private void supportDialog(){
        String[] options={"Bagikan pesan ke orang tepercaya","Kirim permintaan ke dashboard pendamping","Buka rencana pengalihan"};
        new AlertDialog.Builder(this).setTitle("Pilih dukungan yang kamu butuhkan").setItems(options,(d,w)->{
            if(w==0)shareText("Saya sedang ingin berjudi dan butuh ditemani. Bisa telepon atau berbicara dengan saya?");
            else if(w==1){if(store.get("pairingId").isEmpty()){info("Belum terhubung","Hubungkan pendamping pada tab Pendamping. Kamu tetap bisa membagikan pesan secara manual.");return;}
                confirm("Kirim permintaan dukungan?","Pesan: Bisa telepon saya? Hanya dikirim setelah kamu menekan Kirim. Pendamping belum tentu sedang tersedia.",()->remote(()->api.request("POST","/api/support",new JSONObject().put("pairingId",store.get("pairingId")).put("message","call")),r->info("Diterima server","Permintaan tersimpan di dashboard. Ini belum berarti pendamping telah membaca. Jika mendesak, hubungi langsung.")));
            }else planDialog();
        }).show();
    }
    private void companion(){
        if(BuildConfig.PRIVATE_BUILD&&"companion".equals(store.get("role"))){privateCompanionSetup();return;}
        label(page,"Ada teman di sisimu.",28,INK,true);
        label(page,"Berbagi atas pilihanmu. Pendamping tidak melihat layar, chat, atau histori browsing.",14,MUTED,false);
        LinearLayout c=card();
        label(c,store.get("endpoint").isEmpty()?"Mode lokal":"Server: "+store.get("endpoint"),14,MUTED,false);
        label(c,store.get("pairingId").isEmpty()?"Belum ada pendamping aktif":"Pendamping terhubung",21,INK,true);
        button(c,"Atur server pendamping",this::configureServer,false);
        button(c,"Buat undangan pendamping",this::createInvitation,true);
        button(c,"Konfirmasi kode pendamping",this::confirmPairing,false);
        button(c,"Perbarui koneksi pendamping",this::refreshPairings,false);
        if(!store.get("pairingId").isEmpty()){
            button(c,"Pratinjau & kirim ringkasan",this::sendSnapshot,true);
            button(c,"Koreksi situs salah blok",this::requestCorrection,false);
            button(c,"Berhenti berbagi",this::revokePairing,false);
        }
        if(!store.get("pendingRevocation").isEmpty()){
            label(c,"Berbagi dihentikan lokal. Server belum menerima pencabutan.",14,ORANGE,true);
            button(c,"Sinkronkan pencabutan",this::syncRevocation,true);
        }
        LinearLayout about=card();label(about,"Dari HP pendamping",20,INK,true);
        label(about,"Pendamping membuka alamat server yang sama di browser, membuat profil pendamping, lalu memasukkan kode undangan. Kamu harus mengonfirmasi identitasnya.",14,MUTED,false);
        button(about,"Buka dashboard web",()->{
            if(store.get("endpoint").isEmpty())configureServer();else openUrl(store.get("endpoint"));
        },false);
        label(about,"Tidak ada server bawaan yang telah dihosting. Fitur jarak jauh memerlukan server HTTPS milikmu; proteksi lokal dapat dipakai tanpa server.",12,MUTED,false);
    }
    private void configureServer(){
        if(!store.get("pendingRevocation").isEmpty()){info("Pencabutan belum selesai","Sinkronkan pencabutan sebelum mengganti server.");return;}
        if(!store.get("token").isEmpty()){info("Akun server masih terhubung","Hapus akun server dari tab Aturan sebelum mengganti endpoint agar akses lama tidak tertinggal.");return;}
        prompt("Alamat server","https://server-milikmu.example",store.get("endpoint"),s->{
            String valid=CompanionClient.validateEndpoint(s,BuildConfig.DEBUG);store.put("endpoint",valid);render();
        });
    }
    private void ensureAccount(CheckedAction next){
        ensureAccountFor("participant",next);
    }
    private void ensureAccountFor(String role,CheckedAction next){
        if(store.get("endpoint").isEmpty()){configureServer();return;}
        if(!store.get("token").isEmpty()){if(!role.equals(store.get("role").isEmpty()?"participant":store.get("role"))){info("Peran berbeda","Profil yang ada memakai peran lain. Hapus akun server secara sengaja sebelum mengganti peran; akun tidak direset otomatis.");return;}try{next.run();}catch(Exception e){info("Permintaan gagal",e.getMessage());}return;}
        prompt("Nama yang dilihat pendamping","Nama panggilan","",s->{
            if(s.trim().isEmpty()||s.length()>60)throw new Exception("Gunakan nama 1–60 karakter.");
            remote(()->api.request("POST","/api/devices",new JSONObject().put("role",role).put("name",s)),r->{
                try{store.put("token",r.getString("token"));store.put("deviceId",r.getJSONObject("device").getString("id"));store.put("role",role);next.run();}
                catch(Exception e){info("Akun belum tersimpan",e.getMessage());}
            });
        });
    }
    private void createInvitation(){ensureAccount(()->remote(()->api.request("POST","/api/pairings",new JSONObject()),r->{
        try{store.put("pendingPairingId",r.getString("pairingId"));info("Undangan 10 menit","Kode: "+r.getString("invitationCode")+"\n\nPendamping memasukkan kode di dashboard. Setelah itu cocokkan kode verifikasi dan konfirmasikan di HP ini. Kode hanya untuk orang yang kamu pilih.");}catch(Exception e){info("Undangan gagal",e.getMessage());}
    }));}
    private void refreshPairings(){
        if(store.get("token").isEmpty()){info("Belum terhubung","Buat undangan untuk memulai.");return;}
        remote(()->api.request("GET","/api/me",null),r->{
            try{
                rememberPrivateConnection(r);JSONArray pairs=r.getJSONArray("pairings");String active=store.get("pairingId");String claimed="";String code="";
                for(int i=0;i<pairs.length();i++){JSONObject p=pairs.getJSONObject(i);if("claimed".equals(p.getString("status"))){claimed=p.getString("id");code=p.optString("verificationCode");}}
                if(!claimed.isEmpty())store.put("pendingPairingId",claimed);
                render();info("Status koneksi",!active.isEmpty()?"Pasangan aktif. Ringkasan tetap manual; berbagi otomatis privat memerlukan pilihan terpisah.":!claimed.isEmpty()?"Undangan diklaim. Cocokkan kode verifikasi: "+code:"Belum ada pasangan aktif.");
            }catch(Exception e){info("Status belum diperbarui",e.getMessage());}
        });
    }
    private void confirmPairing(){
        String id=store.get("pendingPairingId");if(id.isEmpty()){info("Belum ada undangan","Buat undangan terlebih dahulu.");return;}
        remote(()->api.request("GET","/api/me",null),r->{
            try{
                JSONArray pairs=r.getJSONArray("pairings");JSONObject target=null;for(int i=0;i<pairs.length();i++)if(id.equals(pairs.getJSONObject(i).getString("id")))target=pairs.getJSONObject(i);
                if(target==null||!"claimed".equals(target.optString("status")))throw new Exception("Pendamping belum mengklaim undangan. Minta ia memasukkan kode terlebih dahulu.");
                JSONObject companion=target.optJSONObject("companion");String name=companion==null?"Pendamping":companion.optString("name");
                prompt("Konfirmasi: "+name,"Masukkan kode yang ditampilkan pada HP pendamping","",s->remote(
                    ()->api.request("POST","/api/pairings/"+id+"/confirm",new JSONObject().put("verificationCode",s)),
                    accepted->{try{store.put("pairingId",id);store.put("pendingPairingId","");render();info("Terhubung","Pendamping dapat menerima informasi yang kamu pilih untuk dikirim.");}catch(Exception e){info("Penyimpanan gagal",e.getMessage());}}));
            }catch(Exception e){info("Konfirmasi belum bisa dilakukan",e.getMessage());}
        });
    }
    private void sendSnapshot(){
        long count=getSharedPreferences("gempur-protection",MODE_PRIVATE).getLong("blocked_count",0);String protection=ProtectionService.isRunning()?"active":"inactive";
        String observedAt=Instant.now().toString();
        confirm("Kirim ringkasan ini?","Status saat ini: "+protection+"\nKoneksi dibatasi: "+count+"\nCatatan pribadi, domain, dan histori browsing tidak disertakan. Ini bukan bukti berhenti berjudi.",()->remote(
            ()->api.request("POST","/api/snapshots",new JSONObject().put("pairingId",store.get("pairingId")).put("protection",protection).put("rulesVersion","starter-2026-11-09").put("blockedRequests",count).put("observedAt",observedAt)),
            r->info("Ringkasan diterima server","Pendamping melihat waktu ringkasan ini dibuat. Tidak ada pembaruan otomatis.")));
    }
    private void revokePairing(){
        confirm("Berhenti berbagi?","Pengiriman baru di HP ini akan dihentikan segera. Saat offline, server baru mengetahui pencabutan ketika kamu menyinkronkannya. Proteksi lokal tetap bisa dipakai.",()->{
            try{synchronized(store){stopPrivateLocally();String id=store.get("pairingId");store.put("pendingRevocation",id);store.put("pairingId","");RuleRepository.clearTemporaryAllowances(this);store.put("exceptionId","");}render();syncRevocation();}catch(Exception e){info("Belum tersimpan","Coba kembali.");}
        });
    }
    private void syncRevocation(){
        String id=store.get("pendingRevocation");if(id.isEmpty())return;
        JSONObject pending=pendingPrivateOff();
        final JSONObject account;try{account=store.remoteContext();}catch(Exception e){info("Akun belum terbaca",e.getMessage());return;}
        remote(()->api.requestPinned("DELETE","/api/pairings/"+id,null,account),r->{try{acknowledgePrivateEnd(pending,account,id);if(!sameRemoteAccount(account)){info("Akses lama dicabut","Profil lokal telah berubah; data profil baru tidak diubah.");return;}if(id.equals(store.get("pendingRevocation")))store.put("pendingRevocation","");store.put("pendingPairingId","");if(id.equals(store.get("pendingAutomationOffPairing")))store.put("pendingAutomationOffPairing","");render();info("Akses dicabut","Server telah menerima pencabutan. Informasi yang sudah dilihat atau disalin penerima tidak dapat ditarik kembali.");}catch(Exception e){info("Penyimpanan gagal",e.getMessage());}});
    }
    private void requestCorrection(){
        prompt("Situs normal salah terblokir?","contoh.org","",target->remote(
            ()->api.request("POST","/api/exceptions",new JSONObject().put("pairingId",store.get("pairingId")).put("target",target).put("reason","false_positive")),
            r->{
                try{String id=r.getJSONObject("exception").getString("id");store.put("exceptionId",id);info("Koreksi diajukan","Pendamping meninjau di dashboard. Periksa hasil pada tab Aturan. Ini tidak membuka seluruh proteksi.");}
                catch(Exception e){info("Koreksi belum tersimpan",e.getMessage());}
            }));
    }
    private void settings(){
        label(page,"Batas yang kamu pilih.",28,INK,true);label(page,"Aturan lokal untuk menjaga langkahmu.",14,MUTED,false);
        LinearLayout rules=card();
        try{label(rules,RuleRepository.bundledCount(this)+" domain dalam daftar awal",21,INK,true);
            label(rules,"Daftar awal terbatas, bukan seluruh judol Indonesia. Domain uji gempur-block.test tidak berisi konten judi.",13,MUTED,false);
            for(String domain:RuleRepository.list(this)){TextView row=text(domain+"  ×",15,INK,false);row.setPadding(0,dp(10),0,dp(10));rules.addView(row);row.setOnClickListener(v->confirm("Hapus aturan pribadi?",domain,()->{try{RuleRepository.remove(this,domain);render();}catch(Exception e){info("Gagal",e.getMessage());}}));}
        }catch(Exception e){label(rules,"Daftar belum dapat dibaca.",14,ORANGE,false);}
        button(rules,"Tambah domain yang diblokir",()->prompt("Tambah domain","contoh.org","",s->{RuleRepository.add(this,s);render();}),true);
        button(rules,"Periksa permintaan koreksi",this::inspectCorrection,false);
        button(rules,"Laporkan domain judi terlewat",()->{
            if(store.get("token").isEmpty()){info("Server belum terhubung","Tambahkan domain ke aturan lokal terlebih dahulu. Laporan kurasi memerlukan akun server pada tab Pendamping.");return;}
            prompt("Laporkan domain terlewat","contoh.org","",s->{
                String target=id.gempur.engine.DomainRules.normalize(s);
                confirm("Kirim laporan domain?",target+"\nHanya nama domain dikirim. Laporan masuk tinjauan; tidak otomatis mengubah aturan semua pengguna.",()->remote(()->api.request("POST","/api/reports",new JSONObject().put("target",target)),r->info("Laporan diterima","Pengelola perlu meninjau kategori dan risiko salah blok sebelum daftar global berubah.")));
            });
        },false);
        LinearLayout p=card();label(p,"Privasi & data",21,INK,true);
        label(p,"Tanpa lokasi, SMS, chat, isi rekening, atau pemantauan layar. Catatan terenkripsi di perangkat. Snapshot dan permintaan bantuan dikirim hanya setelah kamu memilihnya.",14,MUTED,false);
        button(p,"Hapus akun server",()->{
            if(store.get("token").isEmpty()){info("Tidak ada akun server","Mode lokal tidak membuat akun.");return;}
            confirm("Hapus akun dan data server?","Tindakan ini memutus pendampingan. Catatan lokal tetap disimpan.",()->{try{stopPrivateLocally();JSONObject pending=pendingPrivateOff();JSONObject account=store.remoteContext();remote(()->api.requestPinned("DELETE","/api/me",null,account),r->{try{acknowledgePrivateEnd(pending,account,"");if(!sameRemoteAccount(account)){info("Akun lama dihapus","Profil lokal telah berubah; profil baru tidak diubah.");return;}store.clearRemote();store.put("role","");store.put("endpoint","");store.put("pendingPairingId","");store.put("exceptionId","");store.put("pendingAutomationOffPairing","");RuleRepository.clearTemporaryAllowances(this);render();}catch(Exception e){info("Gagal",e.getMessage());}});}catch(Exception e){info("Akun belum terbaca",e.getMessage());}});
        },false);
        button(p,"Tentang proteksi & batasnya",()->info("Gempur "+BuildConfig.VERSION_NAME,"Filter DNS lokal dengan daftar domain terbatas. DoH/DoT, IP langsung, profil lain, VPN lain, dan perangkat lain dapat melewati batas ini. Tidak mendukung always-on/lockdown.\n\nGempur bukan terapi atau layanan darurat. Bantuan profesional dapat berjalan bersama pendampingan keluarga.\n\nSource dan perkembangan: github.com/benisprlh/Gempur"),false);
    }
    private void inspectCorrection(){
        String id=store.get("exceptionId");if(id.isEmpty()){info("Belum ada koreksi","Ajukan dari tab Pendamping.");return;}
        remote(()->api.request("GET","/api/exceptions/"+id,null),r->{
            JSONObject e=r.optJSONObject("exception");if(e==null){info("Belum tersedia","Tidak ada koreksi yang dapat ditampilkan.");return;}
            String state=e.optString("state");
            if("approved".equals(state)){
                String target=e.optString("target");
                String targetKind=e.optString("targetKind","domain");
                if(!BuildConfig.PRIVATE_BUILD&&RuleRepository.isBundledDomain(this,target)){info("Target tidak dapat dikecualikan","Domain ini masuk daftar judi yang dikenal. Koreksi perlu ditinjau pengelola daftar, bukan membuka akses melalui pendamping.");return;}
                confirm("Terapkan koreksi untuk "+target+"?","Hanya target yang dinilai salah blok. Persetujuan bukan verifikasi bahwa target aman. Masa tunggu 10 menit tetap berlaku; izin berakhir paling lambat 30 menit setelah masa tunggu. Target lain tetap dibatasi.",()->remote(()->{
                    String permittedPairing=store.get("pairingId");
                    JSONObject permit=api.request("POST","/api/exceptions/"+id+"/permit",new JSONObject());
                    JSONObject applied=api.request("POST","/api/exceptions/"+id+"/apply",new JSONObject().put("permitToken",permit.getString("permitToken")));
                    synchronized(store){
                        if(permittedPairing.isEmpty()||!permittedPairing.equals(store.get("pairingId"))||!store.get("pendingRevocation").isEmpty())throw new Exception("Izin berbagi telah dicabut; koreksi tidak diterapkan lokal.");
                        if(!targetKind.equals(applied.optString("targetKind","domain"))||!target.equals(applied.getString("target")))throw new Exception("Target izin tidak cocok.");
                        long expiry=Instant.parse(applied.getString("expiresAt")).toEpochMilli();
                        if("app".equals(targetKind)&&BuildConfig.PRIVATE_BUILD)AppRiskRepository.temporaryAllow(this,target,expiry);
                        else RuleRepository.temporaryAllow(this,target,expiry);
                    }return applied;
                },result->info("Koreksi diterapkan","Pengecualian hanya untuk target ini, maksimal 30 menit. Proteksi lain tetap aktif.")));
            }else info("Status koreksi",e.optString("target")+"\nStatus: "+state+"\nTidak ada pembukaan seluruh proteksi.");
        });
    }
    private void rememberPrivateConnection(JSONObject result) throws Exception {
        JSONObject device=result.getJSONObject("device");store.put("role",device.getString("role"));
        JSONArray pairs=result.getJSONArray("pairings");JSONObject chosen=null;String selected=store.get("pairingId");
        for(int i=0;i<pairs.length();i++){JSONObject p=pairs.getJSONObject(i);if("active".equals(p.optString("status"))&&(chosen==null||selected.equals(p.optString("id"))))chosen=p;}
        String active=chosen==null?"":chosen.getString("id");
        if(BuildConfig.PRIVATE_BUILD){
            JSONObject grant=PrivateMonitoring.sharing(this);
            JSONObject serverGrant=chosen==null?null:chosen.optJSONObject("automation");
            if(!selected.equals(active)||(grant.optBoolean("enabled")&&(serverGrant==null||!serverGrant.optBoolean("enabled")||grant.optInt("automationVersion")!=serverGrant.optInt("version")))){
                PrivateMonitoring.disableSharing(this);AppRiskRepository.clearTemporaryAllowances(this);RuleRepository.clearTemporaryAllowances(this);privateRemoteDetections=new JSONArray();privateExceptions=new JSONArray();
                if(active.isEmpty())PrivateMonitoring.setCompanionWatching(this,false);
            }
            if("participant".equals(device.optString("role"))&&serverGrant!=null&&serverGrant.optBoolean("enabled")&&!grant.optBoolean("enabled")&&!active.isEmpty())store.put("pendingAutomationOffPairing",active);
        }
        store.put("pairingId",active);store.put("consentVersion",chosen==null?"":String.valueOf(chosen.getInt("consentVersion")));
    }
    private void stopPrivateLocally(){
        if(!BuildConfig.PRIVATE_BUILD)return;
        PrivateMonitoring.stop(this);AppRiskRepository.clearTemporaryAllowances(this);
        privateRemoteDetections=new JSONArray();privateExceptions=new JSONArray();
    }
    private JSONObject pendingPrivateOff(){try{return PrivateMonitoring.pendingServerOff(this);}catch(Exception unreadable){return new JSONObject();}}
    private boolean sameRemoteAccount(JSONObject expected) throws Exception {JSONObject current=store.remoteContext();return current.optString("endpoint").equals(expected.optString("endpoint"))&&current.optString("deviceId").equals(expected.optString("deviceId"))&&current.optString("token").equals(expected.optString("token"));}
    private void acknowledgePrivateEnd(JSONObject pending,JSONObject account,String pairing){
        if(BuildConfig.PRIVATE_BUILD&&pending.optString("endpoint").equals(account.optString("endpoint"))&&pending.optString("deviceId").equals(account.optString("deviceId"))&&(pairing.isEmpty()||pairing.equals(pending.optString("pairingId"))))PrivateMonitoring.acknowledgeServerOff(this,pending);
    }
    private boolean privateNotificationsReady(){
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},83);info("Izin notifikasi diperlukan","Izinkan notifikasi agar layanan privat selalu terlihat. Setelah itu pilih fitur ini kembali.");return false;}
        if(!getSystemService(android.app.NotificationManager.class).areNotificationsEnabled()){info("Notifikasi dimatikan","Aktifkan notifikasi Gempur pada pengaturan Android, lalu pilih fitur ini kembali. Deteksi privat tidak dijalankan diam-diam.");return false;}
        return true;
    }
    private void privateAutomation(){
        label(page,"Deteksi · uji privat",27,INK,true);
        label(page,"Bukan klasifikasi seluruh isi internet. Aturan dikenal, aturan pribadi, dan dugaan nama dipisahkan. Koneksi yang cocok tidak membuktikan peserta sengaja berjudi.",14,MUTED,false);
        if("companion".equals(store.get("role"))){privateCompanionInbox();return;}
        LinearLayout local=card();boolean enabled=PrivateMonitoring.localEnabled(this);
        label(local,enabled?"Deteksi lokal tambahan aktif":"Deteksi tambahan belum aktif",21,INK,true);
        if(!ProtectionService.isRunning())label(local,"Filter DNS belum aktif. Aktifkan proteksi pada Beranda agar permintaan domain pada jalur yang didukung dapat diperiksa.",13,ORANGE,true);
        label(local,"Aturan domain dikenal tetap otomatis diblokir lewat filter DNS. Opsi ini menambahkan pencatatan lokal dan karantina pola nama kuat yang masih berstatus diduga. Bisa salah blok; situs baru tanpa pola tetap belum diketahui.",14,MUTED,false);
        if(enabled)button(local,"Hentikan deteksi dan berbagi privat",()->disableAutomaticSharing(true),false);
        else button(local,"Pilih deteksi tambahan lokal",()->{
            if(!privateNotificationsReady())return;
            confirm("Aktifkan deteksi lokal tambahan?","Nama domain dan nama/paket aplikasi dianalisis di HP ini. Kombinasi nama berindikasi kuat dapat dibatasi sementara sebagai dugaan. Bukan pemeriksaan isi website atau aplikasi. Aplikasi sistem, Gempur, launcher, telepon, SMS, pengaturan, dan pemasang paket dikecualikan. Aplikasi penting lain masih perlu diuji. Tidak ada pengiriman ke pendamping sebelum persetujuan berbagi terpisah. Kamu bisa menghentikannya kapan saja.",()->{
                try{PrivateMonitoring.setLocalEnabled(this,true);PrivateMonitoring.start(this);render();page.postDelayed(this::render,700);}catch(Exception e){PrivateMonitoring.setLocalEnabled(this,false);info("Belum aktif",e.getMessage());}
            });
        },true);
        button(local,"Pengaturan aksesibilitas untuk aplikasi",()->{
            confirm("Izin penghalang aplikasi opsional","Layanan Gempur hanya melihat nama paket saat jendela berganti. Dengan deteksi lokal aktif, target yang dicurigai diarahkan kembali ke Beranda Android. Tidak membaca teks layar, screenshot, atau pesan. Ini bukan suspend aplikasi atau firewall seluruh trafik dan bisa dimatikan di Android kapan saja.",()->startActivity(new Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        },false);
        button(local,"Pindai indikasi aplikasi secara lokal",()->{
            if(!PrivateMonitoring.localEnabled(this)){info("Deteksi belum aktif","Pilih deteksi lokal tambahan terlebih dahulu.");return;}
            remote(()->new JSONObject().put("findings",AppRiskRepository.scan(this)),r->{
                JSONArray findings=r.optJSONArray("findings");StringBuilder message=new StringBuilder("Hanya hasil dugaan nama; bukan inventaris semua aplikasi atau verifikasi isi.\n\n");
                if(findings==null||findings.length()==0)message.append("Tidak ada pola kuat ditemukan. Ini tidak membuktikan semua aplikasi aman.");
                else for(int i=0;i<Math.min(findings.length(),30);i++){JSONObject f=findings.optJSONObject(i);if(f!=null)message.append(f.optString("label")).append("\n").append(f.optString("target")).append(" — perlu ditinjau\n\n");}
                info("Hasil lokal",message.toString());
            });
        },false);
        LinearLayout sharing=card();JSONObject grant=PrivateMonitoring.sharing(this);
        label(sharing,grant.optBoolean("enabled")?"Berbagi temuan otomatis aktif":"Berbagi temuan otomatis mati",21,INK,true);
        label(sharing,"Hanya target yang terdeteksi sesuai cakupan yang disetujui, alasan/dugaan, tindakan, waktu, dan hitungan gabungan. Tidak mengirim seluruh histori, isi layar, URL lengkap, atau daftar semua aplikasi. Perlu server HTTPS mode privat milikmu.",14,MUTED,false);
        if(store.get("token").isEmpty()){
            button(sharing,"Atur server",this::configureServer,false);
            button(sharing,"Saya peserta: buat profil",()->ensureAccountFor("participant",()->{render();info("Profil dibuat","Buat dan konfirmasi pasangan pada tab Pendamping.");}),true);
            button(sharing,"Saya pendamping: buat profil",()->ensureAccountFor("companion",()->{render();info("Profil pendamping dibuat","Terima undangan dari tab Pendamping.");}),false);
        }else{
            button(sharing,"Perbarui pasangan dan izin server",this::refreshPairings,false);
            if(grant.optBoolean("enabled"))button(sharing,"Hentikan berbagi otomatis",()->disableAutomaticSharing(false),false);
            else button(sharing,"Pilih cakupan berbagi otomatis",this::automaticSharingConsent,true);
        }
        if(!store.get("pendingAutomationOffPairing").isEmpty()||!PrivateMonitoring.pendingServerOff(this).optString("pairingId").isEmpty()){label(sharing,"Pengiriman lokal dihentikan. Izin otomatis dan temuan lama di server masih perlu sinkronisasi; penghentian lokal belum membuktikan pencabutan server.",13,ORANGE,true);button(sharing,"Sinkronkan penghentian",this::syncAutomationOff,false);}
        label(sharing,PrivateMonitoring.isRunning()?"Layanan privat sedang berjalan dengan notifikasi terlihat.":"Layanan privat belum berjalan. Tidak ada janji pemantauan 24/7.",12,MUTED,false);
        JSONObject serviceStatus=PrivateMonitoring.status(this);if(!serviceStatus.optString("message").isEmpty())label(sharing,"Status terakhir: "+serviceStatus.optString("message"),13,MUTED,false);if(serviceStatus.optInt("overflowCount")>0)label(sharing,"Antrean pernah mencapai batas. Sebagian temuan tidak disimpan; ketiadaan laporan bukan bukti tidak ada kejadian.",13,ORANGE,false);
        button(sharing,"Muat temuan yang diterima server",this::loadPrivateInbox,false);
        button(sharing,"Hapus riwayat deteksi lokal",()->confirm("Hapus riwayat deteksi lokal?","Layanan privat akan dihentikan dan riwayat deteksi HP ini dihapus. Catatan check-in tetap ada. Izin server dicabut terpisah; penanda penghentian yang belum tersinkron dipertahankan.",()->{try{disableAutomaticSharing(true);PrivateMonitoring.clear(this);render();}catch(Exception e){info("Belum dapat dihapus",e.getMessage());}}),false);
        renderPrivateDetections(false);
        LinearLayout inbox=card();label(inbox,"Temuan lokal terbaru",20,INK,true);
        try{JSONArray events=PrivateMonitoring.events(this);if(events.length()==0)label(inbox,"Belum ada temuan lokal. Domain diagnostik tidak dikirim sebagai temuan judi.",13,MUTED,false);
            for(int i=0;i<Math.min(events.length(),15);i++){JSONObject event=events.getJSONObject(i);String target=event.optString("target"),kind=event.optString("kind","domain");label(inbox,kind+" · "+target+"\n"+privateVerdict(event.optString("verdict"))+" · "+privateAction(kind,event.optString("action"))+" · "+event.optInt("count",1)+" koneksi/kejadian",13,INK,false);button(inbox,"Ajukan salah blok: "+target,()->requestPrivateCorrection(kind,target,""),false);}
        }catch(Exception e){label(inbox,"Temuan lokal belum dapat dibaca; data tidak dihapus otomatis.",13,ORANGE,false);}
    }
    private void automaticSharingConsent(){
        if(!privateNotificationsReady())return;
        if(!PrivateMonitoring.localEnabled(this)){info("Aktifkan deteksi lokal","Persetujuan deteksi lokal dan berbagi otomatis adalah dua pilihan terpisah.");return;}
        if(store.get("pairingId").isEmpty()||store.get("consentVersion").isEmpty()){info("Pasangan belum siap","Konfirmasikan pasangan pada tab Pendamping lalu Perbarui pasangan dan izin server.");return;}
        if(!store.get("pendingRevocation").isEmpty()||!store.get("pendingAutomationOffPairing").isEmpty()||!PrivateMonitoring.pendingServerOff(this).optString("pairingId").isEmpty()){info("Pencabutan belum sinkron","Selesaikan penghentian yang tertunda terlebih dahulu.");return;}
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(dp(20),dp(12),dp(20),dp(12));
        label(form,"Temuan baru akan dikirim otomatis ke pasangan yang telah kamu konfirmasi: nama domain/paket aplikasi, alasan, status dugaan, tindakan, waktu dan hitungan gabungan. Tidak ada URL lengkap, isi layar, atau inventaris aplikasi. Antrean offline maksimal 24 jam. Informasi yang sudah dibaca tidak bisa ditarik kembali. Kamu bisa berhenti berbagi kapan saja.",14,INK,false);
        CheckBox domains=new CheckBox(this);domains.setText(R.string.private_share_domains);form.addView(domains);CheckBox apps=new CheckBox(this);apps.setText(R.string.private_share_apps);form.addView(apps);
        CheckBox agree=new CheckBox(this);agree.setText(R.string.private_share_consent);form.addView(agree);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Persetujuan berbagi otomatis privat").setView(form).setNegativeButton("Batal",null).setPositiveButton("Aktifkan",null).create();
        dialog.setOnShowListener(v->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(b->{
            if(!agree.isChecked()||(!domains.isChecked()&&!apps.isChecked())){info("Pilihan diperlukan","Pilih sedikitnya satu cakupan dan centang persetujuan jika sesuai.");return;}
            final String pairing=store.get("pairingId");final long epoch=PrivateMonitoring.sharingEpoch(this);final int consent=Integer.parseInt(store.get("consentVersion"));final JSONArray scopes=new JSONArray();if(domains.isChecked())scopes.put("domain");if(apps.isChecked())scopes.put("app");
            dialog.dismiss();remote(()->api.request("PUT","/api/pairings/"+pairing+"/automation",new JSONObject().put("enabled",true).put("scopes",scopes)),r->{
                try{JSONObject accepted=r.getJSONObject("automation");
                    if(!pairing.equals(store.get("pairingId"))||!store.get("pendingRevocation").isEmpty()||!accepted.optBoolean("enabled")||!PrivateMonitoring.enableSharingIfCurrent(this,epoch,pairing,consent,accepted.getInt("version"),scopes))throw new Exception("Pilihan lokal berubah; berbagi tidak diaktifkan kembali. Sinkronkan penghentian bila perlu.");
                    PrivateMonitoring.start(this);render();info("Berbagi otomatis aktif","Hanya temuan baru sesuai cakupan ini yang diantrikan. Diterima server belum berarti telah dibaca pendamping.");
                }catch(Exception e){PrivateMonitoring.disableSharing(this);try{store.put("pendingAutomationOffPairing",pairing);}catch(Exception ignored){}render();info("Belum aktif",e.getMessage());}
            });
        }));dialog.show();
    }
    private void disableAutomaticSharing(boolean localToo){
        String pairing=store.get("pairingId");try{pairing=PrivateMonitoring.sharing(this).optString("pairingId",pairing);}catch(Exception unreadable){/* Stop remains available when the private vault cannot be read. */}
        PrivateMonitoring.disableSharing(this);AppRiskRepository.clearTemporaryAllowances(this);RuleRepository.clearTemporaryAllowances(this);
        if(localToo){PrivateMonitoring.setLocalEnabled(this,false);PrivateMonitoring.stop(this);}
        try{if(!pairing.isEmpty())store.put("pendingAutomationOffPairing",pairing);}catch(Exception e){info("Perlu sinkronisasi","Pengiriman lokal berhenti; catat pasangan server yang perlu dinonaktifkan.");}
        privateRemoteDetections=new JSONArray();render();if(!pairing.isEmpty())syncAutomationOff();
    }
    private void syncAutomationOff(){
        final JSONObject pending,account;final String pairing;
        try{pending=PrivateMonitoring.pendingServerOff(this);account=store.remoteContext();pairing=pending.optString("pairingId").isEmpty()?account.optString("pendingAutomationOffPairing"):pending.getString("pairingId");
            if(pairing.isEmpty())return;
            if(!pending.optString("pairingId").isEmpty()&&(!pending.optString("endpoint").equals(account.optString("endpoint"))||!pending.optString("deviceId").equals(account.optString("deviceId")))){info("Izin terkait profil sebelumnya","Koneksi server/profil berbeda. Jangan kirim credential profil baru ke server lama; periksa pencabutan dengan pengelola server sebelumnya.");return;}
        }catch(Exception e){info("Status penghentian belum terbaca","Data tidak dihapus otomatis. Hentikan layanan dan periksa penyimpanan.");return;}
        remote(()->{try{return api.requestPinned("PUT","/api/pairings/"+pairing+"/automation",new JSONObject().put("enabled",false).put("scopes",new JSONArray()),account);}catch(CompanionClient.ApiException e){
            if(e.status==404||e.status==409){JSONObject current=api.requestPinned("GET","/api/me",null,account);JSONArray pairs=current.getJSONArray("pairings");boolean active=false;for(int i=0;i<pairs.length();i++){JSONObject p=pairs.getJSONObject(i);if(pairing.equals(p.optString("id"))&&"active".equals(p.optString("status")))active=true;}if(!active&&account.optString("deviceId").equals(current.getJSONObject("device").getString("id")))return new JSONObject().put("inactive",true);}
            throw e;
        }},r->{try{PrivateMonitoring.acknowledgeServerOff(this,pending);if(pairing.equals(store.get("pendingAutomationOffPairing")))store.put("pendingAutomationOffPairing","");render();info("Penghentian diterima","Izin otomatis server dinonaktifkan atau pasangan telah terbukti tidak aktif. Salinan yang telah diterima pihak lain tidak bisa ditarik kembali.");}catch(Exception e){info("Belum tersimpan",e.getMessage());}});
    }
    private void privateCompanionSetup(){
        label(page,"HP pendamping · privat",27,INK,true);LinearLayout c=card();label(c,"Pasangkan dua HP secara terbuka. Peserta harus mengonfirmasi identitas dan memberi persetujuan berbagi otomatis terpisah.",14,MUTED,false);
        button(c,"Terima kode undangan",()->ensureAccountFor("companion",()->prompt("Undangan dari peserta","Kode undangan","",code->remote(()->api.request("POST","/api/pairings/claim",new JSONObject().put("invitationCode",code)),r->info("Cocokkan kode di HP peserta",r.optString("verificationCode")+"\nPeserta perlu mengonfirmasinya. Setelah itu perbarui pasangan.")))),true);
        button(c,"Perbarui pasangan",this::refreshPairings,false);button(c,"Buka kotak deteksi",()->{tab=4;render();},true);
        if(!store.get("pairingId").isEmpty())button(c,"Akhiri pasangan",this::revokePairing,false);
    }
    private void privateCompanionInbox(){
        LinearLayout c=card();label(c,"Notifikasi HP pendamping",21,INK,true);label(c,"Pemeriksaan server setiap sekitar 30 detik dengan layanan Android yang terlihat. Memerlukan HTTPS, koneksi dan izin notifikasi. Android dapat menunda/menutup layanan; pemberitahuan dapat tertunda.",14,MUTED,false);
        button(c,"Perbarui pasangan",this::refreshPairings,false);
        if(PrivateMonitoring.companionWatching(this))button(c,"Hentikan pemeriksaan notifikasi",()->{PrivateMonitoring.setCompanionWatching(this,false);PrivateMonitoring.stop(this);render();},false);
        else button(c,"Mulai notifikasi pendamping",()->{
            if(store.get("pairingId").isEmpty()){info("Belum ada pasangan aktif","Terima undangan pada tab Pendamping lalu perbarui pasangan setelah peserta mengonfirmasi.");return;}
            if(!privateNotificationsReady())return;
            confirm("Mulai pemeriksaan server?","HP ini akan mengambil temuan dan permintaan koreksi pasangan setiap sekitar 30 detik. Notifikasi layar kunci bersifat umum; detail hanya ditampilkan di aplikasi. Membuka daftar tidak otomatis menandai dibaca.",()->{try{PrivateMonitoring.setCompanionWatching(this,true);PrivateMonitoring.start(this);render();}catch(Exception e){PrivateMonitoring.setCompanionWatching(this,false);info("Belum aktif",e.getMessage());}});
        },true);
        button(c,"Muat temuan dan permintaan koreksi",this::loadPrivateInbox,true);renderPrivateDetections(true);
        for(int i=0;i<privateExceptions.length();i++){JSONObject e=privateExceptions.optJSONObject(i);if(e==null)continue;LinearLayout review=card();label(review,"Koreksi "+e.optString("targetKind","domain")+" · "+e.optString("target"),18,INK,true);label(review,"Status: "+e.optString("state")+". Setuju hanya jika telah meninjau salah blok; bukan membuka semua proteksi.",13,MUTED,false);if("pending".equals(e.optString("state"))){String id=e.optString("id");button(review,"Setujui target ini",()->decidePrivateCorrection(id,true),true);button(review,"Tolak",()->decidePrivateCorrection(id,false),false);}}
    }
    private void loadPrivateInbox(){
        if(store.get("pairingId").isEmpty()){info("Belum ada pasangan","Perbarui pasangan dahulu.");return;}
        final String pairing=store.get("pairingId");final boolean companion="companion".equals(store.get("role"));
        remote(()->{JSONObject detections=api.request("GET","/api/detections?pairingId="+pairing,null);if(companion)detections.put("exceptions",api.request("GET","/api/pairings/"+pairing+"/dashboard",null).getJSONArray("exceptions"));return detections;},r->{
            if(!pairing.equals(store.get("pairingId")))return;privateRemoteDetections=r.optJSONArray("detections");if(privateRemoteDetections==null)privateRemoteDetections=new JSONArray();privateExceptions=r.optJSONArray("exceptions");if(privateExceptions==null)privateExceptions=new JSONArray();tab=4;render();
        });
    }
    private void renderPrivateDetections(boolean companion){
        for(int i=0;i<Math.min(privateRemoteDetections.length(),30);i++){JSONObject event=privateRemoteDetections.optJSONObject(i);if(event==null)continue;String id=event.optString("id"),kind=event.optString("kind"),target=event.optString("target");LinearLayout c=card();label(c,target,18,INK,true);label(c,kind+" · "+privateVerdict(event.optString("verdict"))+" · "+event.optString("reason")+"\n"+privateAction(kind,event.optString("action"))+" · "+event.optInt("count",1)+" kejadian digabung\nWaktu temuan: "+format(event.optString("occurredAt"))+"\nDiterima: "+format(event.optString("receivedAt"))+"\nDibaca: "+(event.isNull("readAt")?"belum ditandai":format(event.optString("readAt"))),13,MUTED,false);
            if(companion)button(c,"Tandai saya telah membaca",()->remote(()->api.request("POST","/api/detections/"+id+"/read",new JSONObject()),r->loadPrivateInbox()),false);
            else button(c,"Ajukan koreksi salah blok",()->requestPrivateCorrection(kind,target,id),false);
        }
    }
    private void requestPrivateCorrection(String kind,String target,String detectionId){
        if(store.get("pairingId").isEmpty()){info("Pasangan belum aktif","Permintaan membutuhkan pasangan terkonfirmasi. Proteksi lokal tetap bisa dihentikan sendiri.");return;}
        confirm("Ajukan salah blok untuk "+target+"?","Hanya target dan jenis "+kind+" dikirim kepada pendamping. Akses tetap dibatasi sambil menunggu keputusan. Persetujuan menunggu 10 menit dan berlaku terbatas; target lain tetap diblokir.",()->remote(()->{JSONObject payload=new JSONObject().put("pairingId",store.get("pairingId")).put("target",target).put("targetKind",kind).put("reason","false_positive");if(!detectionId.isEmpty())payload.put("detectionId",detectionId);return api.request("POST","/api/exceptions",payload);},r->{try{store.put("exceptionId",r.getJSONObject("exception").getString("id"));info("Diajukan ke pendamping","Periksa keputusan dan terapkan izin pada tab Aturan → Periksa permintaan koreksi. Sampai itu dilakukan target tetap dibatasi.");}catch(Exception e){info("Belum tersimpan",e.getMessage());}}));
    }
    private String privateVerdict(String verdict){return "suspected".equals(verdict)?"Diduga · perlu ditinjau":"personal".equals(verdict)?"Aturan pilihan peserta":"known".equals(verdict)?"Cocok daftar aturan":"Status belum diketahui";}
    private String privateAction(String kind,String action){if(!"blocked".equals(action))return "Ditandai untuk tinjauan";return "app".equals(kind)?"Diarahkan ke Beranda Android; jaringan aplikasi tidak diputus":"Permintaan DNS diblokir";}
    private void decidePrivateCorrection(String id,boolean approve){
        confirm(approve?"Setujui salah blok target ini?":"Tolak permintaan?",approve?"Persetujuan hanya untuk target yang ditampilkan, dengan masa tunggu 10 menit dan durasi maksimum 30 menit. Pastikan telah ditinjau; persetujuan tidak membuktikan target aman.":"Target tetap dibatasi. Peserta masih mengendalikan perangkat dan dapat menghentikan layanan sendiri.",()->remote(()->api.request("POST","/api/exceptions/"+id+"/decision",new JSONObject().put("decision",approve?"approve":"deny")),r->loadPrivateInbox()));
    }
    private String format(String raw){try{return Instant.parse(raw).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("dd MMM yyyy · HH:mm"));}catch(Exception e){return raw;}}
    private void openUrl(String url){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception e){info("Browser tidak tersedia","Buka alamat tersebut pada browser pilihanmu.");}}
    private void shareText(String value){Intent i=new Intent(Intent.ACTION_SEND);i.setType("text/plain");i.putExtra(Intent.EXTRA_TEXT,value);startActivity(Intent.createChooser(i,"Pilih tujuan berbagi"));}
    private void info(String title,String message){if(!isFinishing()&&!isDestroyed())new AlertDialog.Builder(this).setTitle(title).setMessage(message).setPositiveButton("Mengerti",null).show();}
    private void confirm(String title,String message,Runnable action){new AlertDialog.Builder(this).setTitle(title).setMessage(message).setNegativeButton("Batal",null).setPositiveButton("Lanjutkan",(d,w)->action.run()).show();}
    interface CheckedAction{void run() throws Exception;}
    interface Work{JSONObject run() throws Exception;}
    interface Done{void accept(JSONObject value);}
    interface Input{void accept(String value) throws Exception;}
    private void prompt(String title,String hint,String initial,Input action){
        EditText field=new EditText(this);field.setSingleLine();field.setHint(hint);field.setText(initial);field.setPadding(dp(24),dp(16),dp(24),dp(16));
        AlertDialog d=new AlertDialog.Builder(this).setTitle(title).setView(field).setNegativeButton("Batal",null).setPositiveButton("Lanjutkan",null).create();
        d.setOnShowListener(v->d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(b->{try{action.accept(field.getText().toString().trim());d.dismiss();}catch(Exception e){field.setError(e.getMessage());}}));d.show();
    }
    private void remote(Work work,Done done){
        if(busy)return;busy=true;Toast.makeText(this,"Memproses permintaan…",Toast.LENGTH_SHORT).show();
        worker.execute(()->{try{JSONObject r=work.run();runOnUiThread(()->{busy=false;if(!isFinishing()&&!isDestroyed())done.accept(r);});}
            catch(Exception e){runOnUiThread(()->{busy=false;
                if(isFinishing()||isDestroyed())return;
                if(e instanceof CompanionClient.ApiException&&((CompanionClient.ApiException)e).status==401){
                    new AlertDialog.Builder(this).setTitle("Sesi server tidak berlaku").setMessage("Sesi mungkin kedaluwarsa atau tidak lagi valid. Kamu dapat melepas koneksi lokal lalu membuat akun perangkat baru. Ini bukan konfirmasi bahwa seluruh data server telah dihapus; hubungi pengelola bila diperlukan.")
                        .setNegativeButton("Tutup",null).setPositiveButton("Lepas koneksi lokal",(d,w)->{try{stopPrivateLocally();store.clearRemote();store.put("role","");store.put("pendingRevocation","");store.put("pendingPairingId","");store.put("exceptionId","");RuleRepository.clearTemporaryAllowances(this);render();}catch(Exception ignored){info("Belum tersimpan","Coba kembali.");}}).show();
                }else info("Permintaan belum berhasil",e.getMessage()==null?"Periksa koneksi dan coba kembali. Tidak ada pengiriman ulang otomatis.":e.getMessage());
            });}});
    }
}

