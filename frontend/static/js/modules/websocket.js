let ws=null,wsReconnectTimer=null,typingTimers={}
function connectWebSocket(){
if(ws&&ws.readyState===WebSocket.OPEN)return
const token=api.token;if(!token)return
const protocol=location.protocol==='https:'?'wss:':'ws:'
ws=new WebSocket(`${protocol}//${location.host}/ws?token=${token}`)
ws.onopen=()=>{console.log('✅ WS');clearInterval(wsReconnectTimer)
wsReconnectTimer=setInterval(()=>{if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ping'}))},30000)}
ws.onmessage=(event)=>{try{handleWsMessage(JSON.parse(event.data))}catch(e){}}
ws.onclose=()=>{clearInterval(wsReconnectTimer);setTimeout(connectWebSocket,3000)}
ws.onerror=()=>{if(ws)ws.close()}}
function handleWsMessage(d){
switch(d.type){
case'new_message':onNewMessage(d.chat_id,d.message);break
case'new_chat':onNewChat(d);break
case'typing':onTypingIndicator(d.user_id,d.chat_id);break
case'reaction':onReactionUpdate(d);break
case'message_deleted':onMessageDeleted(d.message_id,d.chat_id);break
case'message_edited':onMessageEdited(d.message_id,d.chat_id,d.content);break
case'user_online':onUserOnlineStatus(d.user_id,d.is_online);break
case'incoming_call':onIncomingCall(d.from_user_id,d.from_user_name,d.call_type,d.sdp);break
}}
function onNewChat(data){loadChats();showToast('💬 Новый чат!')}
function onNewMessage(chatId,msg){
updateChatPreview(chatId,msg)
if(window.currentChatId===chatId){
    // In filtered post-comments mode show only replies to the selected channel post.
    if(window.currentCommentsPostId){
        const rootId=window.currentCommentsRootId
        if(!msg.reply_to||String(msg.reply_to.id)!==String(rootId))return
    }
    appendMessage(msg);scrollToBottom();return
}
showToast(`💬 ${msg.sender_name}: ${msg.content||'📎 медиа'}`)}
function onTypingIndicator(uid,cid){if(window.currentChatId!==cid||uid===window.currentUser?.id)return;const el=document.getElementById('typing-indicator');if(el){el.textContent='печатает...';clearTimeout(typingTimers[uid]);typingTimers[uid]=setTimeout(()=>{el.textContent=''},3000)}}
function onReactionUpdate(d){if(window.currentChatId===d.chat_id)updateMessageReactions(d.message_id,d.emoji,d.user_id,d.added)}
function onMessageDeleted(mid,cid){if(window.currentChatId!==cid)return;const el=document.querySelector(`[data-message-id="${mid}"]`);if(el){el.style.opacity='0';el.style.transform='scale(0.8)';setTimeout(()=>el.remove(),200)}}
function onMessageEdited(mid,cid,content){if(window.currentChatId!==cid)return;const el=document.querySelector(`[data-message-id="${mid}"]`);if(el){const text=el.querySelector('.msg-text');if(text)text.textContent=content;const meta=el.querySelector('.message-meta');if(meta&&!meta.querySelector('.message-edited')){const e=document.createElement('span');e.className='message-edited';e.textContent='изм.';meta.prepend(e)}}}
function onUserOnlineStatus(uid,online){document.querySelectorAll('.chat-item').forEach(el=>{if(el.dataset.otherUserId===String(uid)){const dot=el.querySelector('.online-indicator');if(dot)dot.style.display=online?'block':'none'}});if(window.currentOtherUserId===uid){const dot=document.getElementById('chat-online-dot');const st=document.getElementById('chat-status');if(dot)dot.style.display=online?'block':'none';if(st)st.textContent=online?'в сети':'был(а) недавно'}}
function sendTypingIndicator(cid,mids){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'typing',chat_id:cid,member_ids:mids}))}
function disconnectWebSocket(){if(ws){clearInterval(wsReconnectTimer);ws.close();ws=null}}

