let replyToMessage=null,editingMessage=null,currentVoicePlayers={},isLoadingMessages=false,hasMoreMessages=true,messagesOffset=0
let messagesLoadSeq=0,pendingScrollTimer=null,userTouchedMessagesAt=0
let forwardSourceMsg=null,forwardSourcePost=null

// ===== Swipe-to-Reply =====
function initSwipeOnMessage(wrapper,msg){
  if(msg._isPost)return
  let startX=0,startY=0,dx=0,dy=0,tracking=false,decided=false,touchStartedAt=0
  let icon=wrapper.querySelector('.swipe-reply-icon')
  if(!icon){icon=document.createElement('div');icon.className='swipe-reply-icon left-swipe';icon.textContent='↩';wrapper.appendChild(icon)}
  else icon.classList.add('left-swipe')
  wrapper.addEventListener('touchstart',e=>{
    if(e.touches.length!==1)return
    const t=e.touches[0];startX=t.clientX;startY=t.clientY;dx=0;dy=0;tracking=true;decided=false;touchStartedAt=Date.now()
    wrapper.style.transition='none';icon.style.transition='none'
  },{passive:true})
  wrapper.addEventListener('touchmove',e=>{
    if(!tracking||!e.touches.length)return
    const t=e.touches[0];dx=t.clientX-startX;dy=t.clientY-startY
    if(!decided){
      if(Math.abs(dx)<8&&Math.abs(dy)<8)return
      decided=true
      if(Math.abs(dy)>Math.abs(dx)*1.15){resetSwipeVisual(wrapper,icon);tracking=false;return}
    }
    // Telegram-like: swipe right-to-left anywhere on the message row opens reply.
    // Swipe left-to-right is reserved for mobile navigation back to chat list.
    if(dx<0){
      const clamped=Math.max(dx,-86)
      wrapper.style.transform=`translateX(${clamped}px)`
      icon.style.opacity=String(Math.min(1,Math.abs(clamped)/54))
      icon.style.transform=`translateX(${Math.max(clamped,-54)+26}px) translateY(-50%) scale(${Math.abs(clamped)>58?1.08:1})`
      icon.classList.toggle('active',Math.abs(clamped)>58)
    }
  },{passive:true})
  wrapper.addEventListener('touchend',e=>{
    if(!tracking)return;tracking=false
    wrapper.style.transition='transform .22s ease';icon.style.transition='opacity .18s, transform .18s'
    const absX=Math.abs(dx),absY=Math.abs(dy)
    if(dx<-58){startReply(msg.id);resetSwipeVisual(wrapper,icon);return}
    // Mobile tap on a regular message opens the same action menu with reactions.
    // Do not hijack taps on media, links, buttons, or reply preview bubbles.
    const target=e.changedTouches&&document.elementFromPoint(e.changedTouches[0].clientX,e.changedTouches[0].clientY)
    const isInteractive=target&&target.closest('button,a,video,.message-image,.message-reply-bubble,.post-reaction-badge,.reaction-badge')
    if(Date.now()-touchStartedAt<420&&absX<10&&absY<10&&!isInteractive&&window.innerWidth<=768){
      const r=wrapper.getBoundingClientRect()
      showMessageActions({clientX:r.left+r.width/2,clientY:r.top+r.height/2,preventDefault(){},stopPropagation(){}},msg)
    }
    resetSwipeVisual(wrapper,icon)
  },{passive:true})
  wrapper.addEventListener('touchcancel',()=>{tracking=false;resetSwipeVisual(wrapper,icon)},{passive:true})
}
function resetSwipeVisual(wrapper,icon){
  wrapper.style.transform=''
  if(icon){icon.style.opacity='0';icon.style.transform='translateX(26px) translateY(-50%) scale(.9)';icon.classList.remove('active')}
}

async function loadMessages(chatId,reset=true,commentPostId=null){
const activeCommentPostId = commentPostId || window.currentCommentsPostId || null
const seq = reset ? ++messagesLoadSeq : messagesLoadSeq
const interactionAtStart=userTouchedMessagesAt
if(reset){messagesOffset=0;hasMoreMessages=true;isLoadingMessages=false}
if(isLoadingMessages||!hasMoreMessages)return;isLoadingMessages=true
try{
const offsetAtStart=messagesOffset
const msgs=await api.getMessages(chatId,50,offsetAtStart,activeCommentPostId)
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

// Swipe-to-reply for any regular message (swipe right)
if(!msg._isPost) initSwipeOnMessage(wrapper,msg)

// Sender name for groups/comments
if(!isOwn&&msg.sender_name&&!msg._isPost){
const n=document.createElement('div');n.className='message-sender-name';n.textContent=msg.sender_name;wrapper.appendChild(n)}

let html=''
// Reply
if(msg.reply_to){
if(msg.reply_to.message_type==='sticker'&&msg.reply_to.file_url){
html+=`<div class="message-reply-bubble" data-reply-id="${msg.reply_to.id}"><div class="reply-bubble-line"></div><div class="reply-bubble-content"><span class="reply-bubble-name">${escapeHtml(msg.reply_to.sender_name)}</span><img src="${msg.reply_to.file_url}" class="reply-sticker" alt="sticker"></div></div>`
}else{
html+=`<div class="message-reply-bubble" data-reply-id="${msg.reply_to.id}"><div class="reply-bubble-line"></div><div class="reply-bubble-content"><span class="reply-bubble-name">${escapeHtml(msg.reply_to.sender_name)}</span><span class="reply-bubble-text">${escapeHtml(msg.reply_to.content||'Медиа')}</span></div></div>`}}

// Forwarded label
if(msg.forward_from){
html+=`<button class="forwarded-label" onclick="event.stopPropagation();openForwardSource(${msg.id})">↪ ${msg.forward_from.type==='channel'?'Переслано из канала':'Переслано от'} ${escapeHtml(msg.forward_from.sender_name||msg.forward_from.channel_name||'Источник')}</button>`
}

// Content
if(msg.message_type==='sticker'){
html+=`<img src="${msg.file_url}" class="sticker-message" alt="sticker">`
}else if(msg.message_type==='image'){
html+=`<div class="msg-image-wrap"><img src="${msg.file_url}" class="message-image" onclick="openImageViewer('${msg.file_url}')" loading="lazy"></div>`
if(msg.content)html+=`<div class="msg-text" style="margin-top:4px">${formatMessageText(msg.content)}</div>`
}else if(msg.message_type==='video'){
html+=`<video src="${msg.file_url}" class="message-video" controls preload="metadata" ondblclick="this.requestFullscreen&&this.requestFullscreen()"></video>`
if(msg.content)html+=`<div class="msg-text">${formatMessageText(msg.content)}</div>`
}else if(msg.message_type==='voice'){
const vid=`voice-${msg.id}`;const dur=formatDuration(msg.duration||0);html+=`<div class="voice-message-wrap"><button class="voice-play-btn" onclick="toggleVoicePlay('${vid}')" id="${vid}-btn">▶</button><div class="voice-progress"><div class="voice-waveform">${Array.from({length:30},(_,i)=>`<div class="wave-bar" style="height:${3+Math.random()*20}px"></div>`).join('')}</div><span class="voice-duration" id="${vid}-dur">${dur}</span></div></div>`
}else if(msg.message_type==='file'){
const ext=(msg.file_name||'').split('.').pop().toUpperCase()||'FILE'
const icon=['ZIP','RAR','7Z'].includes(ext)?'📦':['PDF'].includes(ext)?'📄':['DOC','DOCX'].includes(ext)?'📝':'📁'
html+=`<div class="message-file" onclick="downloadFile('${msg.file_url}')"><div class="file-icon-wrap"><span class="file-icon">${icon}</span><span class="file-ext">${ext}</span></div><div class="file-info"><div class="file-name">${escapeHtml(msg.file_name||'Файл')}</div><div class="file-size">${formatFileSize(msg.file_size)}</div></div><span class="file-download-icon">⬇</span></div>`
}else if(msg.content){
html+=`<div class="msg-text">${formatMessageText(msg.content)}</div>`}

// Post reactions
if(msg._isPost){
const reactions=msg.reactions||{}
html+=`<div class="post-reaction-menu">${['👍','❤️','😂','😮','😢','🔥','🎉'].map(r=>`<button title="${r}" onclick="event.stopPropagation();togglePostReaction(${msg.id},'${r}')">${r}</button>`).join('')}</div>`
if(Object.keys(reactions).length>0){
html+=`<div class="post-reactions">${Object.entries(reactions).map(([em,c])=>`<span class="post-reaction-badge" onclick="event.stopPropagation();togglePostReaction(${msg.id},'${em}')">${em} ${c}</span>`).join('')}</div>`
}
}
if(msg._isPost){
html+=`<div class="post-meta-footer"><span class="post-views">👁 ${msg.views_count||0}</span><button class="post-comments-btn" onclick="event.stopPropagation();openCommentsForPost(${msg.id})">💬 ${msg.comments_count||0}</button></div>`
const bubble=document.createElement('div');bubble.className='message-bubble post-bubble';bubble.innerHTML=html;wrapper.appendChild(bubble)
const positionReactions=()=>positionPostReactionMenu(bubble)
bubble.addEventListener('mouseenter',positionReactions)
bubble.addEventListener('mousemove',positionReactions)
bubble.addEventListener('click',(e)=>{if(e.target.closest('button')||e.target.closest('.post-reaction-badge')||e.target.closest('a'))return;document.querySelectorAll('.post-bubble.show-reactions').forEach(x=>{if(x!==bubble)x.classList.remove('show-reactions')});positionPostReactionMenu(bubble);bubble.classList.toggle('show-reactions')})
bubble.oncontextmenu=(e)=>{e.preventDefault();showPostActions(e,msg)}
}else{
if(!noBubble){const bubble=document.createElement('div');bubble.className='message-bubble';bubble.innerHTML=html;wrapper.appendChild(bubble)}
else{wrapper.innerHTML=html}
if(noBubble&&msg.message_type!=='video'){
const hb=document.createElement('div');hb.className='hover-reaction-bar'
hb.style.bottom='-30px';hb.style.left='50%';hb.style.transform='translateX(-50%)'
hb.innerHTML=['👍','❤️','😂','😮','😢','🔥'].map(r=>`<button onclick="toggleReaction(${msg.chat_id},${msg.id},'${r}');event.stopPropagation()">${r}</button>`).join('')
wrapper.appendChild(hb)}}

const replyBubble=wrapper.querySelector('.message-reply-bubble')
if(replyBubble){replyBubble.addEventListener('click',(e)=>{e.stopPropagation();jumpToMessage(replyBubble.dataset.replyId)})}

// Reactions badge for non-post
if(!msg._isPost&&msg.reactions&&Object.keys(msg.reactions).length>0){
const rd=document.createElement('div');rd.className='message-reactions'
Object.entries(msg.reactions).forEach(([emoji,count])=>{
const badge=document.createElement('span');badge.className='reaction-badge'
badge.textContent=`${emoji} ${count}`
badge.onclick=(e)=>{e.stopPropagation();toggleReaction(msg.chat_id,msg.id,emoji)};rd.appendChild(badge)});wrapper.appendChild(rd)}

// Meta
const meta=document.createElement('div');meta.className='message-meta'
if(msg.is_edited){const e=document.createElement('span');e.className='message-edited';e.textContent='изм.';meta.appendChild(e)}
meta.innerHTML+=formatTime(msg.created_at);wrapper.appendChild(meta)

// Context menu
if(!msg._isPost){
const bubble=wrapper.querySelector('.message-bubble')||wrapper
bubble.oncontextmenu=(e)=>{e.preventDefault();showMessageActions(e,msg)}}
return wrapper}

async function jumpToMessage(mid){
if(!mid)return
let el=document.querySelector(`[data-message-id="${mid}"]`)
let tries=0
while(!el&&hasMoreMessages&&!isLoadingMessages&&window.currentChatId&&tries<8){
  showToast('Ищу исходное сообщение...',900)
  await loadMessages(window.currentChatId,false,window.currentCommentsPostId||null)
  await new Promise(r=>setTimeout(r,90))
  el=document.querySelector(`[data-message-id="${mid}"]`)
  tries++
}
if(!el){showToast('Исходное сообщение недоступно');return}
el.scrollIntoView({behavior:'smooth',block:'center'})
el.classList.remove('message-jump-highlight')
void el.offsetWidth
el.classList.add('message-jump-highlight')
setTimeout(()=>el.classList.remove('message-jump-highlight'),1600)
}

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

async function sendMessage(){
const input=document.getElementById('message-input');const content=input.value.trim()
if(!content)return
if(typeof currentChannelId!=='undefined'&&currentChannelId){
try{await api.createPost(currentChannelId,content);input.value='';loadChannelPosts(currentChannelId)}catch(e){showToast('Ошибка: '+e.message)};return}
if(!window.currentChatId)return
if(editingMessage){
try{await api.editMessage(window.currentChatId,editingMessage.id,content);input.value='';cancelEdit();loadMessages(window.currentChatId,true)}catch(e){showToast('Ошибка: '+e.message)};return}
try{const replyId=window.currentCommentsRootId||replyToMessage?.id||null;await api.sendMessage(window.currentChatId,content,'text',replyId);input.value='';cancelReply();loadMessages(window.currentChatId,true,window.currentCommentsPostId||null)}catch(e){showToast('Ошибка: '+e.message)}}

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
}catch(e){return file}}

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
if(event.preventDefault)event.preventDefault()
const menu=document.getElementById('message-actions-menu')
const reactions=['👍','❤️','😂','😮','😢','🔥','🎉']
let html=`<div class="context-reactions">${reactions.map(r=>`<button onclick="toggleReaction(${msg.chat_id},${msg.id},'${r}');closeMessageActions();event.stopPropagation()">${r}</button>`).join('')}</div>`
html+=`<button class="delete-menu-btn" onclick="startReply(${msg.id})">↩️ Ответить</button>`
html+=`<button class="delete-menu-btn" onclick="startForward(${msg.id})">↪️ Переслать</button>`
if(msg.sender_id===currentUser.id){
  if(msg.message_type==='text'&&!msg.forward_from)html+=`<button class="delete-menu-btn" onclick="startEditMessage(${msg.id})">✏️ Редактировать</button>`
  html+=`<button class="delete-menu-btn danger" onclick="deleteMessage(${msg.chat_id},${msg.id})">🗑 Удалить</button>`
}
menu.innerHTML=html
menu.style.display='block'
positionMessageActionsMenu(menu,msg,event)
}
function positionMessageActionsMenu(menu,msg,event){
const w=document.querySelector(`[data-message-id="${msg.id}"]`)
const rect=w?w.getBoundingClientRect():{left:event.clientX,top:event.clientY,right:event.clientX,bottom:event.clientY,width:0,height:0}
const mw=menu.offsetWidth||220,mh=menu.offsetHeight||180,pad=8
const isOwn=msg.sender_id===currentUser.id
let left=isOwn?rect.left-mw-10:rect.right+10
let top=rect.top
if(left<pad)left=pad
if(left+mw>window.innerWidth-pad)left=window.innerWidth-mw-pad
if(top+mh>window.innerHeight-pad)top=window.innerHeight-mh-pad
if(top<pad)top=pad
menu.style.left=left+'px';menu.style.top=top+'px'
}
function closeMessageActions(){const m=document.getElementById('message-actions-menu');if(m)m.style.display='none'}
function showPostActions(event,msg){
if(event.preventDefault)event.preventDefault()
const menu=document.getElementById('message-actions-menu')
const reactions=['👍','❤️','😂','😮','😢','🔥','🎉']
let html=`<div class="context-reactions">${reactions.map(r=>`<button onclick="togglePostReaction(${msg.id},'${r}');closeMessageActions();event.stopPropagation()">${r}</button>`).join('')}</div>`
html+=`<button class="delete-menu-btn" onclick="openCommentsForPost(${msg.id});closeMessageActions()">💬 Комментарии</button>`
html+=`<button class="delete-menu-btn" onclick="startForwardPost(${msg.id})">↪️ Переслать</button>`
menu.innerHTML=html
menu.style.display='block'
positionPostActionsMenu(menu,msg,event)
}
function positionPostActionsMenu(menu,msg,event){
const w=document.querySelector(`[data-message-id="${msg.id}"]`)
const rect=w?w.getBoundingClientRect():{left:event.clientX,top:event.clientY,right:event.clientX,bottom:event.clientY,width:0,height:0}
const mw=menu.offsetWidth||220,mh=menu.offsetHeight||150,pad=8
let left=rect.right+10
let top=rect.top
if(left+mw>window.innerWidth-pad)left=rect.left-mw-10
if(left<pad)left=pad
if(top+mh>window.innerHeight-pad)top=window.innerHeight-mh-pad
if(top<pad)top=pad
menu.style.left=left+'px';menu.style.top=top+'px'
}

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

async function openForwardSource(messageId){
const msg=window.currentMessages?.find(m=>m.id===messageId);const src=msg?.forward_from;if(!src)return
try{
  if(src.type==='channel'&&src.channel_id){openChannel(src.channel_id);return}
  if(src.chat_id){
    await loadChats()
    const ch=chatsList.find(c=>!c._isChannel&&c.id===src.chat_id)
    if(ch){await openChat(ch);setTimeout(()=>{const el=document.querySelector(`[data-message-id="${src.message_id}"]`);if(el)el.scrollIntoView({behavior:'smooth',block:'center'})},400);return}
  }
  if(src.sender_id){const res=await api.createPrivateChat(src.sender_id);await loadChats();const ch=chatsList.find(c=>!c._isChannel&&c.id===res.chat_id);if(ch)openChat(ch)}
}catch(e){showToast('Источник недоступен')}
}

// ===== FORWARD =====
function startForward(mid){
document.getElementById('message-actions-menu').style.display='none'
const msg=window.currentMessages?.find(m=>m.id===mid);if(!msg)return
forwardSourceMsg=msg
showModal('modal-forward')
loadForwardChats()
}

function startForwardPost(postId){
document.getElementById('message-actions-menu').style.display='none'
const post=window.currentMessages?.find(m=>m._isPost&&m.id===postId);if(!post)return
forwardSourceMsg=null
forwardSourcePost=post
showModal('modal-forward')
loadForwardChats()
}

async function loadForwardChats(){
const container=document.getElementById('forward-chats-list')
container.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-muted)"><div class="spinner" style="margin:0 auto 10px"></div>Загрузка...</div>'
try{
const chats=await api.getChats()
container.innerHTML=''
chats.filter(ch=>!ch.is_comments).forEach(ch=>{
const el=document.createElement('div');el.className='forward-chat-item'
const title=ch.name||'Чат'
el.innerHTML=`${ch.avatar_url?`<img src="${ch.avatar_url}" class="forward-chat-avatar">`:`<div class="forward-chat-avatar placeholder">${getInitials(title)}</div>`}<div class="forward-chat-name">${escapeHtml(title)}</div>`
el.onclick=()=>doForward(ch.id)
container.appendChild(el)
})
if(!container.children.length)container.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-muted)">Нет доступных чатов</div>'
}catch(e){container.innerHTML='<div style="padding:20px;text-align:center;color:var(--danger)">Ошибка загрузки</div>'}
}

async function doForward(targetChatId){
closeModal()
showToast('Пересылка...')
try{
if(forwardSourcePost){
  if(!currentChannelId)throw new Error('Канал не выбран')
  const data=await api.getCommentsChat(currentChannelId,forwardSourcePost.id)
  await api.forwardMessage(data.chat_id,data.root_message_id,targetChatId)
  forwardSourcePost=null
  showToast('Переслано ✓')
  return
}
if(!forwardSourceMsg||!window.currentChatId)return
await api.forwardMessage(window.currentChatId,forwardSourceMsg.id,targetChatId)
showToast('Переслано ✓')
}catch(e){showToast('Ошибка: '+e.message)}
forwardSourceMsg=null;forwardSourcePost=null
}

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
    if(!force && Date.now()-userTouchedMessagesAt<900)return
    sc.scrollTop=sc.scrollHeight
},30)}
function appendMessage(msg){document.getElementById('messages-list').appendChild(createMessageElement(msg,msg.sender_id===currentUser.id));markChatReadIfNeeded()}
function openImageViewer(url){document.getElementById('image-viewer-img').src=url;document.getElementById('image-viewer').style.display='flex'}
function closeImageViewer(){document.getElementById('image-viewer').style.display='none'}
const messagesScroller=document.getElementById('messages-container')
messagesScroller?.addEventListener('wheel',markMessagesUserInteraction,{passive:true})
messagesScroller?.addEventListener('touchstart',markMessagesUserInteraction,{passive:true})
messagesScroller?.addEventListener('pointerdown',markMessagesUserInteraction,{passive:true})
messagesScroller?.addEventListener('scroll',function(){if(this.scrollTop<50&&hasMoreMessages&&!isLoadingMessages&&window.currentChatId)loadMessages(window.currentChatId,false);markChatReadIfNeeded()})

// ===== UNREAD: mark as read =====
let lastReadChatId=null,readMarkTimer=null
function markChatReadIfNeeded(){
if(!window.currentChatId)return
if(readMarkTimer)clearTimeout(readMarkTimer)
readMarkTimer=setTimeout(async()=>{
  if(window.currentChatId&&window.currentChatId!==lastReadChatId){
    try{await api.markChatRead(window.currentChatId);lastReadChatId=window.currentChatId;clearUnreadBadge(window.currentChatId)}catch(e){}
  }else if(window.currentChatId){
    try{await api.markChatRead(window.currentChatId);clearUnreadBadge(window.currentChatId)}catch(e){}
  }
},1500)
}

function clearUnreadBadge(chatId){
const item=document.querySelector(`[data-chat-id="${chatId}"]`)
if(item){const badge=item.querySelector('.unread-badge');if(badge)badge.remove()}
}

function formatMessageText(t){if(!t)return'';return escapeHtml(t).replace(/(https?:\/\/[^\s]+)/g,'<a href="$1" target="_blank" class="msg-link">$1</a>')}
function formatDuration(seconds){seconds=Number(seconds)||0;const m=Math.floor(seconds/60);const s=Math.floor(seconds%60);return `${m}:${String(s).padStart(2,'0')}`}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function positionPostReactionMenu(bubble){
const menu=bubble?.querySelector('.post-reaction-menu');if(!menu)return
const rect=bubble.getBoundingClientRect();const vw=window.innerWidth;const vh=window.innerHeight
menu.style.visibility='hidden';menu.style.opacity='0';menu.style.pointerEvents='none'
const mw=menu.offsetWidth||260;const mh=menu.offsetHeight||42
let left=clamp(rect.right-mw,8,vw-mw-8)
let top=rect.bottom+8
if(top+mh>vh-8)top=clamp(rect.bottom-mh-8,8,vh-mh-8)
menu.style.setProperty('--reaction-left',`${left}px`)
menu.style.setProperty('--reaction-top',`${top}px`)
menu.style.visibility='';menu.style.opacity='';menu.style.pointerEvents=''}
window.addEventListener('resize',()=>document.querySelectorAll('.post-bubble:hover,.post-bubble.show-reactions').forEach(positionPostReactionMenu))
document.getElementById('messages-container')?.addEventListener('scroll',()=>document.querySelectorAll('.post-bubble:hover,.post-bubble.show-reactions').forEach(positionPostReactionMenu))
