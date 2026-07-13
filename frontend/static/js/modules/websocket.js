let ws=null,wsReconnectTimer=null,typingTimers={},typingUsers={}
function connectWebSocket(){
if(ws&&ws.readyState===WebSocket.OPEN)return
const token=api.token;if(!token)return
const protocol=location.protocol==='https:'?'wss:':'ws:'
ws=new WebSocket(`${protocol}//${location.host}/ws?token=${token}`)
ws.onopen=()=>{console.log('✅ WS');clearInterval(wsReconnectTimer)
if("Notification" in window && Notification.permission === "default") Notification.requestPermission();
wsReconnectTimer=setInterval(()=>{if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ping'}))},30000)}
ws.onmessage=(event)=>{try{handleWsMessage(JSON.parse(event.data))}catch(e){}}
ws.onclose=()=>{clearInterval(wsReconnectTimer);setTimeout(connectWebSocket,3000)}
ws.onerror=()=>{if(ws)ws.close()}}
function handleWsMessage(d){
switch(d.type){
case'new_message':onNewMessage(d.chat_id,d.message);break
case'new_post':onNewPost(d.channel_id,d.post);break
case'new_chat':onNewChat(d);break
case'typing':onTypingIndicator(d.user_id,d.chat_id,d.user_name);break
case'reaction':onReactionUpdate(d);break
case'message_deleted':onMessageDeleted(d.message_id,d.chat_id);break
case'message_edited':onMessageEdited(d.message_id,d.chat_id,d.content);break
case'user_online':onUserOnlineStatus(d.user_id,d.is_online);break
case'unread_update':onUnreadUpdate(d);break
case'chat_read':onChatRead(d);break
case'incoming_call':onIncomingCall(d.from_user_id,d.from_user_name,d.call_type);break
case'member_kicked':onMemberKicked(d);break
case'member_banned':onMemberBanned(d);break
case'member_muted':onMemberMuted(d);break
case'member_unmuted':onMemberUnmuted(d);break
case'role_changed':onRoleChanged(d);break
case'chat_updated':onChatUpdated(d);break
case'channel_updated':onChannelUpdated(d);break
case'removed_from_chat':onRemovedFromChat(d);break
case'removed_from_channel':onRemovedFromChannel(d);break
}}
function refreshInfoMembersIfOpen(kind,targetId){
if(typeof infoKind!=='undefined'&&infoKind===kind&&infoTargetId===targetId&&document.getElementById('modal-info').style.display==='block'){
    loadMembersList();loadBansList()
    if(typeof auditLoaded!=='undefined'&&auditLoaded)loadAuditLog()
}}
function onMemberKicked(d){if(d.chat_id)refreshInfoMembersIfOpen('chat',d.chat_id);loadChats()}
function onMemberBanned(d){if(d.chat_id)refreshInfoMembersIfOpen('chat',d.chat_id);loadChats()}
function onMemberMuted(d){
if(d.user_id===undefined||d.user_id===window.currentUser?.id)showToast('Вас замутили'+(d.muted_until?' до '+formatTime(d.muted_until):''))
if(d.chat_id)refreshInfoMembersIfOpen('chat',d.chat_id)}
function onMemberUnmuted(d){if(d.chat_id)refreshInfoMembersIfOpen('chat',d.chat_id)}
function onRoleChanged(d){
if(d.user_id===undefined||d.user_id===window.currentUser?.id){showToast(d.role==='admin'?'Вас назначили админом':'Ваша роль изменена');loadChats()}
if(d.chat_id)refreshInfoMembersIfOpen('chat',d.chat_id)}
function onChatUpdated(d){
loadChats()
if(window.currentChatId===d.chat_id&&d.name)document.getElementById('chat-title').textContent=d.name
if(typeof infoKind!=='undefined'&&infoKind==='chat'&&infoTargetId===d.chat_id&&d.slow_mode_seconds!==undefined&&document.getElementById('modal-info').style.display==='block')
    document.getElementById('info-slowmode').value=String(d.slow_mode_seconds)}
function onChannelUpdated(d){
loadChats();if(typeof loadChannelsList==='function')loadChannelsList()
if(typeof currentChannelId!=='undefined'&&currentChannelId===d.channel_id&&d.name)document.getElementById('chat-title').textContent=d.name}
function onRemovedFromChat(d){
if(window.currentChatId===d.chat_id){closeModal();closeChat();showToast(d.banned?'Вы заблокированы в этой группе':'Вас исключили из группы')}
loadChats()}
function onRemovedFromChannel(d){
if(typeof currentChannelId!=='undefined'&&currentChannelId===d.channel_id){closeModal();closeChannel();showToast(d.banned?'Вы заблокированы в этом канале':'Вас исключили из канала')}
loadChats()}
function onNewPost(channelId, post){
    updateChatPreview(channelId, post, true);
    if(typeof currentChannelId !== 'undefined' && currentChannelId === channelId) {
        if(typeof appendPost === 'function') appendPost(post);
        else if(typeof loadChannelPosts === 'function') loadChannelPosts(channelId);
    }
}
function onNewChat(data){loadChats();showToast('💬 Новый чат!')}
function onNewMessage(chatId,msg){
const chat = chatsList.find(c => !c._isChannel && c.id === chatId);
updateChatPreview(chatId,msg, false)
if(window.currentChatId===chatId&&typingUsers[msg.sender_id]){
    clearTimeout(typingTimers[msg.sender_id]);delete typingUsers[msg.sender_id];renderTypingIndicator()
}
// Increment unread badge if chat is not currently open
if(window.currentChatId!==chatId){
    const item=document.querySelector(`[data-chat-id="${chatId}"]`)
    if(item){
        let badge=item.querySelector('.unread-badge')
        if(!badge){badge=document.createElement('span');badge.className='unread-badge';badge.textContent='0';item.appendChild(badge)}
        badge.textContent=parseInt(badge.textContent||'0')+1
    }
    showPushNotification(msg, chatId)
}else{
    if(document.visibilityState === 'hidden') showPushNotification(msg, chatId)
    appendMessage(msg);scrollToBottom();markChatReadIfNeeded();return
}
showToast(`💬 ${msg.sender_name}: ${msg.content||'📎 медиа'}`)}

function showPushNotification(msg, chatId) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const chat = chatsList.find(c => c.id === chatId && !c._isChannel);
    const title = chat ? chat.name : msg.sender_name;
    const body = msg.message_type === 'text' ? msg.content : "📎 Медиа-файл";
    const n = new Notification(title, {
        body: `${msg.sender_name}: ${body}`,
        tag: `chat_${chatId}`,
        silent: false
    });
    n.onclick = () => {
        window.focus();
        if (chat) openChat(chat);
        n.close();
    };
}
function onTypingIndicator(uid,cid,name){
if(window.currentChatId!==cid||uid===window.currentUser?.id)return
typingUsers[uid]=name||'Кто-то'
clearTimeout(typingTimers[uid])
typingTimers[uid]=setTimeout(()=>{delete typingUsers[uid];renderTypingIndicator()},3000)
renderTypingIndicator()}

function renderTypingIndicator(){
const el=document.getElementById('typing-indicator');if(!el)return
const names=Object.values(typingUsers)
if(names.length===0){el.innerHTML='';el.classList.remove('active');return}
let text
if(names.length===1)text=`${names[0]} печатает`
else if(names.length===2)text=`${names[0]} и ${names[1]} печатают`
else text=`${names.length} человек печатают`
el.innerHTML=`<span class="typing-text">${escapeHtml(text)}</span><span class="typing-dots"><span></span><span></span><span></span></span>`
el.classList.add('active')}

function resetTypingIndicator(){
Object.values(typingTimers).forEach(t=>clearTimeout(t))
typingTimers={};typingUsers={}
const el=document.getElementById('typing-indicator');if(el){el.innerHTML='';el.classList.remove('active')}}
function onReactionUpdate(d){
    if(window.currentChatId===d.chat_id || (d.post_id && typeof currentChannelId !== 'undefined' && currentChannelId)) {
        updateMessageReactions(d.message_id || d.post_id, d.emoji, d.user_id, d.added, d.removed_emoji)
    }
}
function onMessageDeleted(mid,cid){if(window.currentChatId!==cid)return;const el=document.querySelector(`[data-message-id="${mid}"]`);if(el){el.style.opacity='0';el.style.transform='scale(0.8)';setTimeout(()=>el.remove(),200)}}
function onMessageEdited(mid,cid,content){if(window.currentChatId!==cid)return;const el=document.querySelector(`[data-message-id="${mid}"]`);if(el){const text=el.querySelector('.msg-text');if(text)text.textContent=content;const meta=el.querySelector('.message-meta');if(meta&&!meta.querySelector('.message-edited')){const e=document.createElement('span');e.className='message-edited';e.textContent='изм.';meta.prepend(e)}}}
function onUserOnlineStatus(uid,online){document.querySelectorAll('.chat-item').forEach(el=>{if(el.dataset.otherUserId===String(uid)){const dot=el.querySelector('.online-indicator');if(dot)dot.style.display=online?'block':'none'}});if(window.currentOtherUserId===uid){const dot=document.getElementById('chat-online-dot');const st=document.getElementById('chat-status');if(dot)dot.style.display=online?'block':'none';if(st)st.textContent=online?'в сети':'был недавно'}}
function onUnreadUpdate(d){
if(d.chat_id){
    const item=document.querySelector(`[data-chat-id="${d.chat_id}"]`)
    if(item){
        let badge=item.querySelector('.unread-badge')
        if(d.unread_count>0){
            if(!badge){badge=document.createElement('span');badge.className='unread-badge';item.appendChild(badge)}
            badge.textContent=d.unread_count
        }else if(badge){badge.remove()}
    }
}}
function onChatRead(d){
const item=chatsList.find(c=>!c._isChannel&&c.id===d.chat_id)
if(item){if(!item.read_map)item.read_map={};item.read_map[String(d.user_id)]=d.last_read_message_id}
if(window.currentChatId!==d.chat_id)return
if(!window.currentChatReadMap)window.currentChatReadMap={}
window.currentChatReadMap[String(d.user_id)]=d.last_read_message_id
refreshMessageStatuses()}
let lastTypingSentAt=0
function sendTypingIndicator(cid){
if(!cid||!ws||ws.readyState!==WebSocket.OPEN)return
const now=Date.now();if(now-lastTypingSentAt<2500)return
lastTypingSentAt=now
ws.send(JSON.stringify({type:'typing',chat_id:cid}))}
function disconnectWebSocket(){if(ws){clearInterval(wsReconnectTimer);ws.close();ws=null}}
