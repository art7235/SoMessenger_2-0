let channelsList=[],currentChannelId=null,isSubscribed=false,channelLoadSeq=0

async function loadChannelsList(){
try{const[my,joined]=await Promise.all([api.getMyChannels().catch(()=>[]),api.getJoinedChannels().catch(()=>[])]);const map=new Map();[...my,...joined].forEach(c=>map.set(c.id,c));channelsList=Array.from(map.values());return channelsList}catch(e){return[]}}

async function openChannel(channelId){
window.currentChannelId=null;window.currentChatId=null;window.currentCommentsPostId=null;window.currentCommentsRootId=null
currentChannelId=channelId;window.currentChannelId=channelId;window.currentOtherUserId=null
document.getElementById('welcome-screen').style.display='none';document.getElementById('active-chat').style.display='flex'
if(window.innerWidth<=768)document.getElementById('sidebar').classList.add('hidden')
document.querySelectorAll('.chat-item').forEach(el=>el.classList.remove('active'))
const it=document.querySelector(`[data-chat-id="${channelId}"][data-is-channel="1"]`)
if(it)it.classList.add('active')
window.currentMessages=[];document.getElementById('messages-list').innerHTML=''
try{
const ch=await api.getChannel(channelId);const joined=await api.getJoinedChannels()
isSubscribed=joined.some(c=>c.id===channelId)||ch.is_owner
document.getElementById('chat-title').textContent=ch.name;document.getElementById('chat-avatar').src=ch.avatar_url||''
document.getElementById('chat-status').textContent=`${ch.subscribers_count} подписчиков`
document.getElementById('chat-online-dot').style.display='none'
const inputArea=document.getElementById('input-area');const joinBar=document.getElementById('join-bar')
if(ch.is_owner){inputArea.style.display='flex';joinBar.style.display='none'}
else{inputArea.style.display='none';joinBar.style.display='block';document.getElementById('join-btn-text').textContent=isSubscribed?'ОТПИСАТЬСЯ':'ПОДПИСАТЬСЯ'}
document.getElementById('call-btn').style.display='none';document.getElementById('vcall-btn').style.display='none'
document.getElementById('channel-menu-btn').style.display=''
await loadChannelPosts(channelId)
}catch(e){showToast('Ошибка загрузки канала')}}

function showChannelMenu(){showToast('Настройки канала — в разработке 🚧')}

async function toggleSubscription(){
if(!currentChannelId)return
try{if(isSubscribed){await api.unsubscribeFromChannel(currentChannelId);showToast('Вы отписались')}else{await api.subscribeToChannel(currentChannelId);showToast('Вы подписаны!')};await openChannel(currentChannelId);await loadChats()}
catch(e){showToast(e.message)}}

async function loadChannelPosts(channelId){
const seq=++channelLoadSeq
try{
const posts=await api.getChannelPosts(channelId)
if(seq!==channelLoadSeq||currentChannelId!==channelId)return
posts.forEach(p=>api.post(`/channels/${channelId}/posts/${p.id}/view`).catch(()=>{}))
const msgs=posts.map(p=>({id:p.id,chat_id:channelId,sender_id:p.author_id,
sender_name:document.getElementById('chat-title').textContent,content:p.content,
message_type:p.message_type,file_url:p.file_url,created_at:p.created_at,
views_count:p.views_count,comments_count:p.comments_count,reactions:p.reactions||{},_isPost:true}))
window.currentMessages=msgs;renderMessages(msgs);scrollToBottom()
}catch(e){console.error(e)}}

async function openCommentsForPost(postId){
try{
const data=await api.getCommentsChat(currentChannelId,postId)
await loadChats()
openCommentsChat({
    id:data.chat_id,
    name:`💬 Комментарии`,
    channel_id:data.channel_id,
    comment_post_id:data.post_id,
    root_message_id:data.root_message_id,
    post_content:data.post_content||''
})
}catch(e){showToast('Ошибка: '+e.message)}}

async function togglePostReaction(postId,emoji){
try{await api.reactToPost(currentChannelId,postId,emoji);loadChannelPosts(currentChannelId)}catch(e){}}

function showCreateChannel(){hideMenu();document.getElementById('channel-name').value='';document.getElementById('channel-username').value='';document.getElementById('channel-desc').value='';showModal('modal-channel')}
async function createChannel(){const name=document.getElementById('channel-name').value.trim();const username=document.getElementById('channel-username').value.trim().replace('@','');const desc=document.getElementById('channel-desc').value.trim();if(!name)return showToast('Введите название');try{const data=await api.createChannel({name,username:username||null,description:desc||null,is_public:true});closeModal();await loadChats();openChannel(data.id)}catch(e){showToast(e.message)}}
function closeChannel(){currentChannelId=null;window.currentChannelId=null;document.getElementById('active-chat').style.display='none';document.getElementById('welcome-screen').style.display='flex';if(window.innerWidth<=768)document.getElementById('sidebar').classList.remove('hidden')}
