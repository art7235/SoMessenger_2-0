let mediaRecorder=null,recordedChunks=[],isRecording=false,voiceRecordedBlob=null,voiceTimerInterval=null,voiceSeconds=0,stickerPacks=[]
let voiceStartAt=0,voiceDuration=0,voicePreviewUrl=null,voicePreviewAudio=null,voiceAutoSendAfterStop=false,voiceCancelled=false

function voiceFmt(seconds){seconds=Number(seconds)||0;const m=Math.floor(seconds/60);const s=Math.floor(seconds%60);return `${m}:${String(s).padStart(2,'0')}`}
function setVoiceTimer(seconds){const el=document.getElementById('voice-timer');if(el)el.textContent=voiceFmt(seconds)}
function resetVoicePreview(){if(voicePreviewAudio){voicePreviewAudio.pause();voicePreviewAudio=null}if(voicePreviewUrl){URL.revokeObjectURL(voicePreviewUrl);voicePreviewUrl=null}const p=document.getElementById('voice-preview');if(p)p.style.display='none';const b=document.getElementById('voice-preview-play');if(b)b.textContent='▶'}

async function startVoiceRecord(){
// Fast Telegram-like mode: press mic again while recording -> stop and send.
if(isRecording){voiceAutoSendAfterStop=true;stopVoiceRecord();return}
// If recording is already stopped and preview is visible, pressing mic sends it too.
if(voiceRecordedBlob){sendVoiceRecord();return}
try{
const stream=await navigator.mediaDevices.getUserMedia({audio:true})
const mimeType=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'audio/webm'
mediaRecorder=new MediaRecorder(stream,{mimeType});recordedChunks=[];isRecording=true;voiceRecordedBlob=null;voiceDuration=0;voiceAutoSendAfterStop=false;voiceCancelled=false;resetVoicePreview()
mediaRecorder.ondataavailable=(e)=>{if(e.data&&e.data.size>0)recordedChunks.push(e.data)}
mediaRecorder.onstop=()=>{
const recType=mediaRecorder?.mimeType||'audio/webm'
voiceDuration=Math.max(1,(performance.now()-voiceStartAt)/1000)
const blob=new Blob(recordedChunks,{type:recType});stream.getTracks().forEach(t=>t.stop())
isRecording=false;document.getElementById('voice-btn')?.classList.remove('recording')
if(voiceCancelled){voiceCancelled=false;return}
if(blob.size>0){voiceRecordedBlob=blob;if(voiceAutoSendAfterStop){voiceAutoSendAfterStop=false;sendVoiceRecord()}else showVoiceSendUI()}
else{showToast('Запись пуста');hideVoiceUI()}}
mediaRecorder.start(200)
voiceStartAt=performance.now();voiceSeconds=0;setVoiceTimer(0)
clearInterval(voiceTimerInterval)
voiceTimerInterval=setInterval(()=>{voiceSeconds=Math.floor((performance.now()-voiceStartAt)/1000);setVoiceTimer(voiceSeconds)},250)
showVoiceRecordingUI()
}catch(e){showToast('Нет доступа к микрофону')}}

function showVoiceRecordingUI(){
document.getElementById('voice-record-bar').style.display='flex'
document.getElementById('voice-btn').classList.add('recording')
document.getElementById('attach-menu').style.display='none'
const st=document.getElementById('voice-status');if(st)st.textContent='Запись'
const pulse=document.getElementById('voice-pulse');if(pulse)pulse.style.display='block'
const stopBtn=document.getElementById('voice-stop-btn');if(stopBtn)stopBtn.style.display='flex'
const preview=document.getElementById('voice-preview');if(preview)preview.style.display='none'
}

function stopVoiceRecord(){
if(!mediaRecorder||!isRecording)return
clearInterval(voiceTimerInterval)
try{mediaRecorder.stop()}catch(e){}
}

function finishVoiceRecordForPreview(){
if(isRecording){voiceAutoSendAfterStop=false;stopVoiceRecord();return}
showVoiceSendUI()
}

function showVoiceSendUI(){
document.getElementById('voice-record-bar').style.display='flex'
document.getElementById('voice-btn').classList.remove('recording')
const st=document.getElementById('voice-status');if(st)st.textContent='Готово'
const pulse=document.getElementById('voice-pulse');if(pulse)pulse.style.display='none'
const stopBtn=document.getElementById('voice-stop-btn');if(stopBtn)stopBtn.style.display='none'
setVoiceTimer(voiceDuration)
resetVoicePreview()
if(voiceRecordedBlob){
voicePreviewUrl=URL.createObjectURL(voiceRecordedBlob)
voicePreviewAudio=new Audio(voicePreviewUrl)
voicePreviewAudio.preload='metadata'
voicePreviewAudio.ontimeupdate=()=>{const t=document.getElementById('voice-preview-time');if(t)t.textContent=`${voiceFmt(voicePreviewAudio.currentTime)} / ${voiceFmt(voiceDuration)}`}
voicePreviewAudio.onended=()=>{const b=document.getElementById('voice-preview-play');if(b)b.textContent='▶';const t=document.getElementById('voice-preview-time');if(t)t.textContent=voiceFmt(voiceDuration)}
const preview=document.getElementById('voice-preview');if(preview)preview.style.display='flex'
const t=document.getElementById('voice-preview-time');if(t)t.textContent=voiceFmt(voiceDuration)
}
}

function toggleVoicePreview(){
if(!voicePreviewAudio)return
const btn=document.getElementById('voice-preview-play')
if(!voicePreviewAudio.paused){voicePreviewAudio.pause();if(btn)btn.textContent='▶';return}
voicePreviewAudio.currentTime=0
voicePreviewAudio.play().then(()=>{if(btn)btn.textContent='⏸'}).catch(()=>showToast('Не удалось воспроизвести запись'))
}

function hideVoiceUI(){
document.getElementById('voice-record-bar').style.display='none';voiceRecordedBlob=null;recordedChunks=[];mediaRecorder=null;isRecording=false;voiceAutoSendAfterStop=false;voiceDuration=0;clearInterval(voiceTimerInterval);resetVoicePreview()
document.getElementById('voice-btn').classList.remove('recording')}

function cancelVoiceRecord(){voiceAutoSendAfterStop=false;voiceCancelled=true;if(isRecording)stopVoiceRecord();hideVoiceUI()}

async function sendVoiceRecord(){
if(isRecording){voiceAutoSendAfterStop=true;stopVoiceRecord();return}
if(!voiceRecordedBlob||!window.currentChatId){hideVoiceUI();return}
const fd=new FormData();fd.append('file',voiceRecordedBlob,'voice.webm')
showToast('Отправка голосового...')
try{await api.uploadChatFile(window.currentChatId,fd,window.currentCommentsRootId||null,voiceDuration);loadMessages(window.currentChatId,true,window.currentCommentsPostId||null);hideVoiceUI()}catch(e){showToast('Ошибка: '+e.message);hideVoiceUI()}}

// Stickers
async function showStickerPicker(){document.getElementById('attach-menu').style.display='none';const p=document.getElementById('sticker-picker');p.style.display=p.style.display==='none'?'flex':'none';if(p.style.display==='flex'&&!stickerPacks.length)await loadStickers()}
function hideStickerPicker(){document.getElementById('sticker-picker').style.display='none'}
async function loadStickers(){try{stickerPacks=await api.getStickerPacks();renderStickers()}catch(e){}}
function renderStickers(){const c=document.getElementById('sticker-content');c.innerHTML='';if(!stickerPacks.length){c.innerHTML='<p style="text-align:center;color:var(--text-muted);padding:20px">Нет стикеров</p>';return};stickerPacks.forEach(pack=>{const n=document.createElement('div');n.className='sticker-pack-name';n.textContent=pack.name;c.appendChild(n);const grid=document.createElement('div');grid.className='stickers-grid';pack.stickers.forEach(s=>{const item=document.createElement('div');item.className='sticker-item';item.innerHTML=`<img src="${s.file_url}" alt="${escapeHtml(s.emoji||'')}" loading="lazy">`;item.addEventListener('click',()=>sendSticker(s.file_url));grid.appendChild(item)});c.appendChild(grid)})}
async function sendSticker(url){hideStickerPicker();try{
if(typeof currentChannelId!=='undefined'&&currentChannelId){await api.createPost(currentChannelId,{content:url,message_type:'sticker',file_url:url});loadChannelPosts(currentChannelId);return}
if(!window.currentChatId)return
await api.sendMessage(window.currentChatId,url,'sticker',window.currentCommentsRootId||replyToMessage?.id||null);loadMessages(window.currentChatId,true,window.currentCommentsPostId||null)
}catch(e){showToast('Ошибка отправки стикера')}}
function showStickers(){hideMenu();showToast('Откройте чат и нажмите 😊 в строке ввода')}
function startVoiceCall(){showToast('Голосовые звонки — в разработке 🚧')}
function startVideoCall(){showToast('Видеозвонки — в разработке 🚧')}
function closeAllPopups(){document.getElementById('attach-menu').style.display='none';document.getElementById('reaction-picker').style.display='none';document.getElementById('message-actions-menu').style.display='none';hideStickerPicker()}
