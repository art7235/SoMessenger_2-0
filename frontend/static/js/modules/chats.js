window.currentChatId=null;window.currentOtherUserId=null;window.currentChatMembers=[];window.currentCommentsPostId=null;window.currentCommentsRootId=null
let chatsList=[],searchTimeout=null

function debouncedSearch(q){clearTimeout(searchTimeout);searchTimeout=setTimeout(()=>searchUsers(q),300)}

async function loadChats(){
try{
const[chats,channels]=await Promise.all([api.getChats().catch(()=>[]),loadChannelsList().catch(()=>[])])
chatsList=[...chats,...channels.map(c=>({...c,_isChannel:true}))]
renderChatsList()
}catch(e){console.error('loadChats',e)}}

function renderChatsList(){
const container=document.getElementById('chats-list')
container.innerHTML=''
if(chatsList.length===0){container.innerHTML='<div style="padding:40px;text-align:center;color:var(--text-muted)">Нет диалогов<br><small>Найдите пользователя через поиск 🔍</small></div>';return}
const channels=chatsList.filter(x=>x._isChannel).sort((a,b)=>(a.name||'').localeCompare(b.name||''))
const chats=chatsList.filter(x=>!x._isChannel).sort((a,b)=>{const ta=a.last_message?a.last_message.created_at:'';const tb=b.last_message?b.last_message.created_at:'';return tb.localeCompare(ta)})
const sorted=[...channels,...chats]
sorted.forEach(ch=>container.appendChild(createChatItem(ch)))}

function createChatItem(chat){
const div=document.createElement('div');div.className='chat-item'
div.dataset.chatId=chat.id;div.dataset.isChannel=chat._isChannel?'1':'0'
div.dataset.isComments=chat.is_comments?'1':'0';div.dataset.otherUserId=chat.other_user_id||''
let preview='',name=chat.name
if(chat._isChannel){preview=chat.description||'📢 Канал';name='📢 '+name}
else if(chat.is_discussion){preview='💬 Общий чат канала';name=chat.name||'💬 Обсуждение'}
else if(chat.is_comments){preview='💬 Ветка комментариев';name=chat.name||'💬 Комментарии'}
else if(chat.last_message){
const t=chat.last_message.message_type
if(t==='sticker')preview='😊 Стикер'
else if(t==='image')preview='🖼 Фото'
else if(t==='voice')preview='🎤 Голосовое'
else if(t==='video')preview='🎬 Видео'
else if(t==='file')preview='📁 Файл'
else preview=chat.last_message.content||''}
const onlineHtml=chat.other_user_online&&!chat.is_group&&!chat._isChannel?'<div class="online-indicator"></div>':''
div.innerHTML=`<div class="chat-item-avatar-wrap">${chat.avatar_url?`<img src="${chat.avatar_url}" class="chat-item-img">`:`<div class="chat-avatar-placeholder">${getInitials(name)}</div>`}${onlineHtml}</div><div class="chat-item-info"><div class="chat-item-header"><span class="chat-item-name">${escapeHtml(name)}</span><span class="chat-item-time">${chat.last_message?formatTime(chat.last_message.created_at):''}</span></div><div class="chat-item-preview">${escapeHtml(preview)}</div></div>`
div.addEventListener('click',()=>{
if(chat._isChannel)openChannel(chat.id)
else if(chat.is_comments)openCommentsChat(chat)
else openChat(chat)})
return div}

async function openChat(chat){
window.currentChatId=chat.id;window.currentOtherUserId=chat.other_user_id||null;window.currentCommentsPostId=null;window.currentCommentsRootId=null
if(typeof currentChannelId!=='undefined')currentChannelId=null
if(typeof window.currentChannelId!=='undefined')window.currentChannelId=null
showChatUI(chat.name,chat.avatar_url,chat.is_group,chat.other_user_online,chat.is_discussion)
if(window.innerWidth<=768)document.getElementById('sidebar').classList.add('hidden')
document.querySelectorAll('.chat-item').forEach(el=>el.classList.remove('active'))
const item=document.querySelector(`[data-chat-id="${chat.id}"][data-is-channel="0"]`)
if(item)item.classList.add('active')
window.currentMessages=[];document.getElementById('messages-list').innerHTML=''
await loadMessages(chat.id)}

async function openCommentsChat(chat){
window.currentChatId=chat.id;window.currentOtherUserId=null;window.currentCommentsPostId=chat.comment_post_id||chat._commentPostId||chat.post_id||null;window.currentCommentsRootId=chat.root_message_id||chat._commentRootId||null
if(typeof currentChannelId!=='undefined')currentChannelId=null
if(typeof window.currentChannelId!=='undefined')window.currentChannelId=null
document.getElementById('input-area').style.display='flex';document.getElementById('join-bar').style.display='none'
document.getElementById('welcome-screen').style.display='none';document.getElementById('active-chat').style.display='flex'
document.getElementById('chat-title').textContent=chat.name||'💬 Комментарии'
document.getElementById('chat-avatar').src='';document.getElementById('chat-online-dot').style.display='none'
document.getElementById('chat-status').textContent=chat.post_content?`Комментарии к: ${chat.post_content.slice(0,60)}`:'Комментарии к посту'
document.getElementById('call-btn').style.display='none';document.getElementById('vcall-btn').style.display='none'
document.getElementById('channel-menu-btn').style.display='none'
if(window.innerWidth<=768)document.getElementById('sidebar').classList.add('hidden')
document.querySelectorAll('.chat-item').forEach(el=>el.classList.remove('active'))
const item=document.querySelector(`[data-chat-id="${chat.id}"]`)
if(item)item.classList.add('active')
window.currentMessages=[];document.getElementById('messages-list').innerHTML=''
await loadMessages(chat.id,true,window.currentCommentsPostId)}

function showChatUI(name,avatar,isGroup,isOnline,isDiscussion=false){
document.getElementById('input-area').style.display='flex';document.getElementById('join-bar').style.display='none'
document.getElementById('welcome-screen').style.display='none';document.getElementById('active-chat').style.display='flex'
document.getElementById('chat-title').textContent=name
document.getElementById('chat-avatar').src=avatar||''
const dot=document.getElementById('chat-online-dot');const st=document.getElementById('chat-status')
if(isDiscussion){dot.style.display='none';st.textContent='Общий чат канала'}
else if(isGroup||!isOnline){dot.style.display='none';st.textContent=isGroup?'Группа':'был(а) недавно'}
else{dot.style.display='block';st.textContent='в сети'}
document.getElementById('call-btn').style.display='';document.getElementById('vcall-btn').style.display=''
document.getElementById('channel-menu-btn').style.display='none'}

function closeChat(){
window.currentChatId=null;window.currentOtherUserId=null;window.currentCommentsPostId=null;window.currentCommentsRootId=null
document.getElementById('active-chat').style.display='none';document.getElementById('welcome-screen').style.display='flex'
if(window.innerWidth<=768)document.getElementById('sidebar').classList.remove('hidden')}

async function searchUsers(q){
const container=document.getElementById('search-results')
if(!q||q.length<1){container.innerHTML='';return}
try{
const[users,channels]=await Promise.all([api.searchUsers(q).catch(()=>[]),api.searchChannels(q).catch(()=>[])])
container.innerHTML=''
if(!channels.length&&!users.length){container.innerHTML='<div style="padding:12px;text-align:center;color:var(--text-muted)">Ничего не найдено</div>';return}
channels.forEach(c=>{const el=document.createElement('div');el.className='search-result-item';el.innerHTML=`📢 <b>${escapeHtml(c.name)}</b>`;el.onclick=()=>{container.innerHTML='';document.getElementById('search-input').value='';document.getElementById('search-bar').style.display='none';openChannel(c.id)};container.appendChild(el)})
users.forEach(u=>{const el=document.createElement('div');el.className='search-result-item'
el.innerHTML=`${u.avatar_url?`<img src="${u.avatar_url}" style="width:30px;height:30px;border-radius:50%">`:`<div style="width:30px;height:30px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">${getInitials(u.display_name)}</div>`} ${escapeHtml(u.display_name)}`
el.onclick=()=>{container.innerHTML='';document.getElementById('search-input').value='';document.getElementById('search-bar').style.display='none';startPrivateChat(u)};container.appendChild(el)})}catch(e){}}

async function startPrivateChat(u){
try{const res=await api.createPrivateChat(u.id);await loadChats();const chat=chatsList.find(c=>c.id===res.chat_id&&!c._isChannel);if(chat)openChat(chat);else closeChat()}
catch(e){showToast('Ошибка: '+e.message)}}

function showSearch(){const bar=document.getElementById('search-bar');bar.style.display=bar.style.display==='none'?'block':'none';if(bar.style.display==='block')document.getElementById('search-input').focus();else document.getElementById('search-results').innerHTML=''}

function updateChatPreview(chatId,msg){
const item=document.querySelector(`[data-chat-id="${chatId}"]`)
if(item){const p=item.querySelector('.chat-item-preview');const t=item.querySelector('.chat-item-time')
if(p){if(msg.message_type==='sticker')p.textContent='😊 Стикер';else if(msg.message_type==='image')p.textContent='🖼 Фото';else if(msg.message_type==='voice')p.textContent='🎤 Голосовое';else p.textContent=msg.content||'📎 Медиа'}
if(t)t.textContent=formatTime(msg.created_at);const parent=item.parentElement;if(parent)parent.prepend(item)}}
