let replyToMessage=null,editingMessage=null,currentVoicePlayers={},isLoadingMessages=false,hasMoreMessages=true,messagesOffset=0
let messagesLoadSeq=0,pendingScrollTimer=null,userTouchedMessagesAt=0

async function loadMessages(chatId,reset=true,commentPostId=null){
const activeCommentPostId = commentPostId || window.currentCommentsPostId || null
const seq = reset ? ++messagesLoadSeq : messagesLoadSeq
const interactionAtStart=userTouchedMessagesAt
if(reset){messagesOffset=0;hasMoreMessages=true;isLoadingMessages=false}
if(isLoadingMessages||!hasMoreMessages)return;isLoadingMessages=true
try{
const offsetAtStart=messagesOffset
const msgs=await api.getMessages(chatId,50,offsetAtStart,activeCommentPostId)
// Ignore stale responses. This prevents old chat media from flashing in a newly
// opened chat while slow uploads/network requests are still finishing.
if(seq!==messagesLoadSeq || window.currentChatId!==chatId || (activeCommentPostId||null)!==(window.currentCommentsPostId||null))return
if(msgs.length<50)hasMoreMessages=false
if(reset){window.currentMessages=msgs;renderMessages(msgs);scrollToBottom({force:userTouchedMessagesAt===interactionAtStart})}
else{window.currentMessages=[...msgs,...window.currentMessages];const list=document.getElementById('messages-list');const sc=document.getElementById('messages-container');const prevH=sc.scrollHeight;msgs.slice().reverse().forEach(msg=>list.prepend(createMessageElement(msg,msg.sender_id===currentUser.id)));sc.scrollTop=sc.scrollHeight-prevH}
messagesOffset+=msgs.length
}catch(e){console.error(e)}finally{isLoadingMessages=false}}

function renderMessages(msgs){const list=document.getElementById('messages-list');list.innerHTML='';msgs.forEach(msg=>list.appendChild(createMessageElement(msg,msg.sender_id===currentUser.id)))}

function createMessageElement(msg,isOwn){
const wrapper=document.createElement('div')
wrapper.className=`message-wrapper ${isOwn?'outgoing':'incoming'}`
wrapper.dataset.messageId=msg.id
const noBubbleTypes=['sticker','image','video'];const noBubble=noBubbleTypes.includes(msg.message_type)

// Sender name for groups/comments
if(!isOwn&&msg.sender_name&&!msg._isPost){
const n=document.createElement('div');n.className='message-sender-name';n.textContent=msg.sender_name;wrapper.appendChild(n)}

let html=''
// Reply
if(msg.reply_to){
if(msg.reply_to.message_type==='sticker'&&msg.reply_to.file_url){
html+=`<div class="message-reply-bubble"><div class="reply-bubble-line"></div><div class="reply-bubble-content"><span class="reply-bubble-name">${escapeHtml(msg.reply_to.sender_name)}</span><img src="${msg.reply_to.file_url}" class="reply-sticker" alt="sticker"></div></div>`
}else{
html+=`<div class="message-reply-bubble"><div class="reply-bubble-line"></div><div class="reply-bubble-content"><span class="reply-bubble-name">${escapeHtml(msg.reply_to.sender_name)}</span><span class="reply-bubble-text">${escapeHtml(msg.reply_to.content||'Медиа')}</span></div></div>`}}

// Content - no bubble for stickers/images/video
if(msg.message_type==='sticker'){
html+=`<img src="${msg.file_url}" class="sticker-message" alt="sticker">`
}else if(msg.message_type==='image'){
html+=`<div class="msg-image-wrap"><img src="${msg.file_url}" class="message-image" onclick="openImageViewer('${msg.file_url}')" loading="lazy"></div>`
if(msg.content)html+=`<div class="msg-text" style="margin-top:4px">${formatMessageText(msg.content)}</div>`
}else if(msg.message_type==='video'){
html+=`<video src="${msg.file_url}" class="message-video" controls preload="metadata"></video>`
if(msg.content)html+=`<div class="msg-text">${formatMessageText(msg.content)}</div>`
}else if(msg.message_type==='voice'){
const vid=`voice-${msg.id}`;const dur=formatDuration(msg.duration||0);html+=`<div class="voice-message-wrap"><button class="voice-play-btn" onclick="toggleVoicePlay('${vid}')" id="${vid}-btn">▶</button><div class="voice-progress"><div class="voice-waveform">${Array.from({length:30},(_,i)=>`<div class="wave-bar" style="height:${3+Math.random()*20}px"></div>`).join('')}</div><span class="voice-duration" id="${vid}-dur">${dur}</span></div></div>`
}else if(msg.message_type==='file'){
const ext=(msg.file_name||'').split('.').pop().toUpperCase()||'FILE'
const icon=['ZIP','RAR','7Z'].includes(ext)?'📦':['PDF'].includes(ext)?'📄':['DOC','DOCX'].includes(ext)?'📝':'📁'
html+=`<div class="message-file" onclick="downloadFile('${msg.file_url}')"><div class="file-icon-wrap"><span class="file-icon">${icon}</span><span class="file-ext">${ext}</span></div><div class="file-info"><div class="file-name">${escapeHtml(msg.file_name||'Файл')}</div><div class="file-size">${formatFileSize(msg.file_size)}</div></div><span class="file-download-icon">⬇</span></div>`
}else if(msg.content){
html+=`<div class="msg-text">${formatMessageText(msg.content)}</div>`}

// Post reactions for channel posts: always available, even when no one reacted yet.
if(msg._isPost){
const reactions=msg.reactions||{}
html+=`<div class="post-reaction-menu">${['👍','❤️','😂','😮','😢','🔥','🎉'].map(r=>`<button title="${r}" onclick="event.stopPropagation();togglePostReaction(${msg.id},'${r}')">${r}</button>`).join('')}</div>`
if(Object.keys(reactions).length>0){
html+=`<div class="post-reactions">${Object.entries(reactions).map(([em,c])=>`<span class="post-reaction-badge" onclick="event.stopPropagation();togglePostReaction(${msg.id},'${em}')">${em} ${c}</span>`).join('')}</div>`
}
}
// Post footer
if(msg._isPost){
html+=`<div class="post-meta-footer"><span class="post-views">👁 ${msg.views_count||0}</span><button class="post-comments-btn" onclick="event.stopPropagation();openCommentsForPost(${msg.id})">💬 ${msg.comments_count||0}</button></div>`
// Wrap post in bubble always
const bubble=document.createElement('div');bubble.className='message-bubble post-bubble';bubble.innerHTML=html;wrapper.appendChild(bubble)
const positionReactions=()=>positionPostReactionMenu(bubble)
bubble.addEventListener('mouseenter',positionReactions)
bubble.addEventListener('mousemove',positionReactions)
bubble.addEventListener('click',(e)=>{if(e.target.closest('button')||e.target.closest('.post-reaction-badge')||e.target.closest('a'))return;document.querySelectorAll('.post-bubble.show-reactions').forEach(x=>{if(x!==bubble)x.classList.remove('show-reactions')});positionPostReactionMenu(bubble);bubble.classList.toggle('show-reactions')})
}else{
// Regular message - wrap in bubble unless it's a media type
if(!noBubble){const bubble=document.createElement('div');bubble.className='message-bubble';bubble.innerHTML=html;wrapper.appendChild(bubble)}
else{wrapper.innerHTML=html}
// Add hover reaction bar for desktop (images, stickers)
if(noBubble&&msg.message_type!=='video'){
const hb=document.createElement('div');hb.className='hover-reaction-bar'
// Position: bottom-center for images, bottom for stickers
hb.style.bottom='-30px';hb.style.left='50%';hb.style.transform='translateX(-50%)'
hb.innerHTML=['👍','❤️','😂','😮','😢','🔥'].map(r=>`<button onclick="toggleReaction(${msg.chat_id},${msg.id},'${r}');event.stopPropagation()">${r}</button>`).join('')
wrapper.appendChild(hb)}}

// Reactions badge for non-post messages
if(!msg._isPost&&msg.reactions&&Object.keys(msg.reactions).length>0){
const rd=document.createElement('div');rd.className='message-reactions'
Object.entries(msg.reactions).forEach(([emoji,count])=>{
const badge=document.createElement('span');badge.className='reaction-badge'
badge.textContent=`${emoji} ${count}`
badge.onclick=(e)=>{e.stopPropagation();toggleReaction(msg.chat_id,msg.id,emoji)};rd.appendChild(badge)})
wrapper.appendChild(rd)}

// Meta
const meta=document.createElement('div');meta.className='message-meta'
if(msg.is_edited){const e=document.createElement('span');e.className='message-edited';e.textContent='изм.';meta.appendChild(e)}
meta.innerHTML+=formatTime(msg.created_at);wrapper.appendChild(meta)

// Context menu (right click / double click)
if(!msg._isPost){
const bubble=wrapper.querySelector('.message-bubble')||wrapper
bubble.oncontextmenu=(e)=>{e.preventDefault();showMessageActions(e,msg)}
bubble.ondblclick=(e)=>{showReactionPicker(e,msg)}}
return wrapper}

function toggleVoicePlay(vid){
const btn=document.getElementById(`${vid}-btn`);if(!btn)return
const durEl=document.getElementById(`${vid}-dur`)
if(currentVoicePlayers[vid]){currentVoicePlayers[vid].pause();currentVoicePlayers[vid]=null;btn.textContent='▶';return}
Object.keys(currentVoicePlayers).forEach(id=>{if(currentVoicePlayers[id]){currentVoicePlayers[id].pause();currentVoicePlayers[id]=null;const b=document.getElementById(`${id}-btn`);if(b)b.textContent='▶'}})
const el=document.querySelector(`#${vid}-btn`).closest('.message-wrapper'),mid=el?el.dataset.messageId:null
const msg=window.currentMessages?.find(m=>m.id==mid);if(!msg||!msg.file_url)return
const total=Number(msg.duration)||0
const audio=new Audio(msg.file_url);audio.preload='metadata';currentVoicePlayers[vid]=audio;btn.textContent='⏸'
audio.onloadedmetadata=()=>{if(durEl&&isFinite(audio.duration)&&audio.duration>0&&!total)durEl.textContent=formatDuration(audio.duration)}
audio.ontimeupdate=()=>{if(durEl){const d=total||(isFinite(audio.duration)?audio.duration:0);durEl.textContent=d?`${formatDuration(audio.currentTime)} / ${formatDuration(d)}`:formatDuration(audio.currentTime)}}
audio.onended=()=>{currentVoicePlayers[vid]=null;btn.textContent='▶';if(durEl)durEl.textContent=formatDuration(total||(isFinite(audio.duration)?audio.duration:0))}
audio.onerror=()=>{currentVoicePlayers[vid]=null;btn.textContent='▶';if(durEl)durEl.textContent=formatDuration(total)}
audio.play().catch(()=>{currentVoicePlayers[vid]=null;btn.textContent='▶';if(durEl)durEl.textContent=formatDuration(total)})}

function downloadFile(url){if(url)window.open(url,'_blank')}

// sendMessage - handles channel posts and regular messages
async function sendMessage(){
const input=document.getElementById('message-input');const content=input.value.trim()
if(!content)return
// If we're in channel mode (currentChannelId set), create a post
if(typeof currentChannelId!=='undefined'&&currentChannelId){
try{await api.createPost(currentChannelId,content);input.value='';loadChannelPosts(currentChannelId)}catch(e){showToast('Ошибка: '+e.message)};return}
if(!window.currentChatId)return
if(editingMessage){
try{await api.editMessage(window.currentChatId,editingMessage.id,content);input.value='';cancelEdit();loadMessages(window.currentChatId,true)}catch(e){showToast('Ошибка: '+e.message)};return}
try{const replyId=window.currentCommentsRootId||replyToMessage?.id||null;await api.sendMessage(window.currentChatId,content,'text',replyId);input.value='';cancelReply();loadMessages(window.currentChatId,true,window.currentCommentsPostId||null)}catch(e){showToast('Ошибка: '+e.message)}}

// uploadFile - handles channel and chat uploads
async function uploadFile(input){
const originalFile=input.files[0];if(!originalFile)return
const targetChannelId=(typeof currentChannelId!=='undefined'&&currentChannelId)?currentChannelId:null
const targetChatId=window.currentChatId||null
const targetCommentPostId=window.currentCommentsPostId||null
const uploadReplyId=window.currentCommentsRootId||replyToMessage?.id||null
showToast(originalFile.type?.startsWith('image/')?'Подготовка фото...':'Загрузка...')
try{
const file=await prepareUploadFile(originalFile)
const fd=new FormData();fd.append('file',file,file.name)
showToast('Загрузка...')
if(targetChannelId){
const res=await api.createPost(targetChannelId,"")
await api.uploadPostMedia(targetChannelId,res.id,fd)
if(currentChannelId===targetChannelId)loadChannelPosts(targetChannelId)
}else if(targetChatId){
await api.uploadChatFile(targetChatId,fd,uploadReplyId)
if(window.currentChatId===targetChatId&&(window.currentCommentsPostId||null)===(targetCommentPostId||null))loadMessages(targetChatId,true,targetCommentPostId)
}
}catch(e){showToast('Ошибка: '+e.message)}
input.value='';document.getElementById('attach-menu').style.display='none';cancelReply()}

async function prepareUploadFile(file){
if(!file.type?.startsWith('image/')||file.type==='image/gif'||file.size<900000)return file
try{
const bitmap=await createImageBitmap(file)
const maxSide=1600
let {width,height}=bitmap
const scale=Math.min(1,maxSide/Math.max(width,height))
if(scale>=1)return file
width=Math.round(width*scale);height=Math.round(height*scale)
const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,width,height)
const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.82))
if(!blob||blob.size>=file.size)return file
const name=(file.name||'photo').replace(/\.[^.]+$/,'.jpg')
return new File([blob],name,{type:'image/jpeg',lastModified:Date.now()})
}catch(e){return file}
}

async function toggleReaction(cid,mid,em){try{await api.reactToMessage(cid,mid,em)}catch(e){}}

function showReactionPicker(event,msg){
const picker=document.getElementById('reaction-picker')
picker.innerHTML=['👍','❤️','😂','😮','😢','🔥'].map(r=>`<button class="reaction-picker-btn" onclick="toggleReaction(${msg.chat_id},${msg.id},'${r}');closeReactionPicker()">${r}</button>`).join('')
picker.style.left=Math.min(event.clientX,window.innerWidth-320)+'px';picker.style.top=Math.min(event.clientY,window.innerHeight-60)+'px';picker.style.display='flex'}
function closeReactionPicker(){document.getElementById('reaction-picker').style.display='none'}

function updateMessageReactions(mid,emoji,uid,added){
const w=document.querySelector(`[data-message-id="${mid}"]`);if(!w)return
let rd=w.querySelector('.message-reactions')
if(!rd){rd=document.createElement('div');rd.className='message-reactions';const meta=w.querySelector('.message-meta');if(meta)w.insertBefore(rd,meta);else w.appendChild(rd)}
const exist=rd.querySelector(`[data-emoji="${emoji}"]`)
if(exist){const c=exist.querySelector('.rc');let cnt=parseInt(c.textContent);c.textContent=added?cnt+1:cnt-1;if(!added&&cnt-1<=0)exist.remove()}
else if(added){const b=document.createElement('span');b.className='reaction-badge';b.dataset.emoji=emoji;b.innerHTML=`${emoji} <span class="rc">1</span>`;b.onclick=(e)=>{e.stopPropagation();const msg=window.currentMessages?.find(m=>m.id==mid);if(msg)toggleReaction(msg.chat_id,mid,emoji)};rd.appendChild(b)}
if(rd.children.length===0)rd.remove()}

function showMessageActions(event,msg){
const menu=document.getElementById('message-actions-menu')
let html=''
if(msg.sender_id===currentUser.id){if(msg.message_type==='text')html+=`<button class="delete-menu-btn" onclick="startEditMessage(${msg.id})">✏️ Редактировать</button>`;html+=`<button class="delete-menu-btn danger" onclick="deleteMessage(${msg.chat_id},${msg.id})">🗑 Удалить</button>`}
html+=`<button class="delete-menu-btn" onclick="startReply(${msg.id})">↩️ Ответить</button>`
menu.innerHTML=html;menu.style.left=Math.min(event.clientX,window.innerWidth-200)+'px';menu.style.top=Math.min(event.clientY,window.innerHeight-150)+'px';menu.style.display='block'}
document.addEventListener('click',(e)=>{const m=document.getElementById('message-actions-menu');const p=document.getElementById('reaction-picker');if(m&&!m.contains(e.target))m.style.display='none';if(p&&!p.contains(e.target))p.style.display='none'})

async function deleteMessage(cid,mid){document.getElementById('message-actions-menu').style.display='none';try{await api.deleteMessage(cid,mid);loadMessages(cid,true)}catch(e){showToast(e.message)}}

function startReply(mid){
document.getElementById('message-actions-menu').style.display='none';const msg=window.currentMessages?.find(m=>m.id===mid);if(!msg)return
replyToMessage=msg;document.getElementById('reply-preview').style.display='flex'
document.getElementById('reply-name').textContent=msg.sender_name||'Пользователь'
const rt=document.getElementById('reply-text')
if(msg.message_type==='sticker'&&msg.file_url){rt.innerHTML=`<img src="${msg.file_url}" class="reply-sticker" alt="sticker">`}
else{rt.innerHTML=escapeHtml(msg.content||(msg.message_type==='sticker'?'😊 Стикер':'📎 Медиа'))}
document.getElementById('message-input').focus()}
function cancelReply(){replyToMessage=null;document.getElementById('reply-preview').style.display='none';document.getElementById('reply-text').innerHTML=''}

function startEditMessage(mid){document.getElementById('message-actions-menu').style.display='none';const msg=window.currentMessages?.find(m=>m.id===mid);if(!msg)return;editingMessage=msg;document.getElementById('edit-preview').style.display='flex';document.getElementById('edit-text').textContent=msg.content;document.getElementById('message-input').value=msg.content;document.getElementById('message-input').focus();handleInputChange()}
function cancelEdit(){editingMessage=null;document.getElementById('edit-preview').style.display='none';document.getElementById('message-input').value='';handleInputChange()}
function handleInputKeydown(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}}
function handleInputChange(){const input=document.getElementById('message-input');const sendBtn=document.getElementById('send-btn');const voiceBtn=document.getElementById('voice-btn');sendBtn.style.display=input.value.trim().length>0?'flex':'none';voiceBtn.style.display=input.value.trim().length>0?'none':'flex';input.style.height='auto';input.style.height=Math.min(input.scrollHeight,120)+'px'}
function showAttachMenu(){const m=document.getElementById('attach-menu');m.style.display=m.style.display==='none'?'block':'none'}
function markMessagesUserInteraction(){userTouchedMessagesAt=Date.now();if(pendingScrollTimer){clearTimeout(pendingScrollTimer);pendingScrollTimer=null}}
function scrollToBottom(opts={}){
const force=!!opts.force
if(pendingScrollTimer)clearTimeout(pendingScrollTimer)
pendingScrollTimer=setTimeout(()=>{
    const sc=document.getElementById('messages-container');if(!sc)return
    // Do not fight the first manual wheel/swipe after opening a chat.
    if(!force && Date.now()-userTouchedMessagesAt<900)return
    sc.scrollTop=sc.scrollHeight
},30)}
function appendMessage(msg){document.getElementById('messages-list').appendChild(createMessageElement(msg,msg.sender_id===currentUser.id))}
function openImageViewer(url){document.getElementById('image-viewer-img').src=url;document.getElementById('image-viewer').style.display='flex'}
function closeImageViewer(){document.getElementById('image-viewer').style.display='none'}
const messagesScroller=document.getElementById('messages-container')
messagesScroller?.addEventListener('wheel',markMessagesUserInteraction,{passive:true})
messagesScroller?.addEventListener('touchstart',markMessagesUserInteraction,{passive:true})
messagesScroller?.addEventListener('pointerdown',markMessagesUserInteraction,{passive:true})
messagesScroller?.addEventListener('scroll',function(){if(this.scrollTop<50&&hasMoreMessages&&!isLoadingMessages&&window.currentChatId)loadMessages(window.currentChatId,false)})
function formatMessageText(t){if(!t)return'';return escapeHtml(t).replace(/(https?:\/\/[^\s]+)/g,'<a href="$1" target="_blank" class="msg-link">$1</a>')}
function formatDuration(seconds){seconds=Number(seconds)||0;const m=Math.floor(seconds/60);const s=Math.floor(seconds%60);return `${m}:${String(s).padStart(2,'0')}`}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function positionPostReactionMenu(bubble){
const menu=bubble?.querySelector('.post-reaction-menu');if(!menu)return
// Fixed positioning keeps the reaction menu outside the scroll container clipping.
// Prefer below the post; if the post is near the bottom, clamp to visible viewport
// instead of moving above the first message or outside the screen.
const rect=bubble.getBoundingClientRect();const vw=window.innerWidth;const vh=window.innerHeight
menu.style.visibility='hidden';menu.style.opacity='0';menu.style.pointerEvents='none'
const mw=menu.offsetWidth||260;const mh=menu.offsetHeight||42
let left=clamp(rect.right-mw,8,vw-mw-8)
let top=rect.bottom+8
if(top+mh>vh-8)top=clamp(rect.bottom-mh-8,8,vh-mh-8)
menu.style.setProperty('--reaction-left',`${left}px`)
menu.style.setProperty('--reaction-top',`${top}px`)
menu.style.visibility=''
menu.style.opacity=''
menu.style.pointerEvents=''
}
window.addEventListener('resize',()=>document.querySelectorAll('.post-bubble:hover,.post-bubble.show-reactions').forEach(positionPostReactionMenu))
document.getElementById('messages-container')?.addEventListener('scroll',()=>document.querySelectorAll('.post-bubble:hover,.post-bubble.show-reactions').forEach(positionPostReactionMenu))
