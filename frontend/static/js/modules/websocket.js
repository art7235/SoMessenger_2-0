let ws=null,wsReconnectTimer=null,typingTimers={}
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
case'typing':onTypingIndicator(d.user_id,d.chat_id);break
case'reaction':onReactionUpdate(d);break
case'message_deleted':onMessageDeleted(d.message_id,d.chat_id);break
case'message_edited':onMessageEdited(d.message_id,d.chat_id,d.content);break
case'user_online':onUserOnlineStatus(d.user_id,d.is_online);break
case'unread_update':onUnreadUpdate(d);break
case'incoming_call':onIncomingCall(d.from_user_id,d.from_user_name,d.call_type);break
}}
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
function onTypingIndicator(uid,cid){if(window.currentChatId!==cid||uid===window.currentUser?.id)return;const el=document.getElementById('typing-indicator');if(el){el.textContent='печатает...';clearTimeout(typingTimers[uid]);typingTimers[uid]=setTimeout(()=>{el.textContent=''},3000)}}
function onReactionUpdate(d){
    if(window.currentChatId===d.chat_id || (d.post_id && typeof currentChannelId !== 'undefined' && currentChannelId)) {
        updateMessageReactions(d.message_id || d.post_id, d.emoji, d.user_id, d.added, d.removed_emoji)
    }
}
function onMessageDeleted(mid,cid){if(window.currentChatId!==cid)return;const el=document.querySelector(`[data-message-id="${mid}"]`);if(el){el.style.opacity='0';el.style.transform='scale(0.8)';setTimeout(()=>el.remove(),200)}}
function onMessageEdited(mid,cid,content){if(window.currentChatId!==cid)return;const el=document.querySelector(`[data-message-id="${mid}"]`);if(el){const text=el.querySelector('.msg-text');if(text)text.textContent=content;const meta=el.querySelector('.message-meta');if(meta&&!meta.querySelector('.message-edited')){const e=document.createElement('span');e.className='message-edited';e.textContent='изм.';meta.prepend(e)}}}
function onUserOnlineStatus(uid,online){document.querySelectorAll('.chat-item').forEach(el=>{if(el.dataset.otherUserId===String(uid)){const dot=el.querySelector('.online-indicator');if(dot)dot.style.display=online?'block':'none'}});if(window.currentOtherUserId===uid){const dot=document.getElementById('chat-online-dot');const st=document.getElementById('chat-status');if(dot)dot.style.display=online?'block':'none';if(st)st.textContent=online?'в сети':'был(а) недавно'}}
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
function sendTypingIndicator(cid,mids){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'typing',chat_id:cid,member_ids:mids}))}
function disconnectWebSocket(){if(ws){clearInterval(wsReconnectTimer);ws.close();ws=null}}
