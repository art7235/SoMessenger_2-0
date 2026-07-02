function showToast(m,d=3000){const t=document.getElementById('toast');t.textContent=m;t.style.display='block';clearTimeout(t._timer);t._timer=setTimeout(()=>t.style.display='none',d)}
function showModal(id){document.getElementById('modal-overlay').style.display='flex';document.querySelectorAll('.modal').forEach(m=>m.style.display='none');document.getElementById(id).style.display='block'}
function closeModal(){document.getElementById('modal-overlay').style.display='none';document.querySelectorAll('.modal').forEach(m=>m.style.display='none')}
document.getElementById('modal-overlay')?.addEventListener('click',(e)=>{if(e.target===document.getElementById('modal-overlay')){closeModal();closeAllPopups()}})
function showMenu(){const m=document.getElementById('sidebar-menu');m.style.display=m.style.display==='none'?'block':'none'}
function hideMenu(){document.getElementById('sidebar-menu').style.display='none'}
document.getElementById('chats-list')?.addEventListener('scroll',hideMenu,{passive:true})
document.addEventListener('click',(e)=>{const m=document.getElementById('sidebar-menu');if(m&&!m.contains(e.target)&&!e.target.closest('[onclick*="showMenu"]'))m.style.display='none';const am=document.getElementById('attach-menu');if(am&&am.style.display==='block'&&!am.contains(e.target)&&!e.target.closest('.attach-btn'))am.style.display='none'})

async function showChatInfo(){
let data,type,isOwner=false
if(window.currentChatId){const chat=chatsList.find(c=>c.id===window.currentChatId&&!c._isChannel&&!c.is_comments);if(!chat)return;data=chat;type='chat';isOwner=chat.is_group}
else if(currentChannelId){data=await api.getChannel(currentChannelId);type='channel';isOwner=data.is_owner}
else return
document.getElementById('info-title').textContent=type==='chat'?'Информация':'Информация о канале'
document.getElementById('info-name').textContent=data.name;document.getElementById('info-desc').textContent=data.description||''
const av=document.getElementById('info-avatar');av.src=data.avatar_url||''
document.getElementById('info-avatar-edit').style.display=isOwner?'flex':'none'
document.getElementById('info-extra').textContent=type==='channel'?`${data.subscribers_count} подписчиков`:type==='chat'&&data.is_group?'Группа':''
showModal('modal-info')}

async function uploadInfoAvatar(input){const file=input.files[0];if(!file)return;const fd=new FormData();fd.append('file',file);try{let res;if(window.currentChatId)res=await api.uploadChatAvatar(window.currentChatId,fd);else if(currentChannelId)res=await api.uploadChannelAvatar(currentChannelId,fd);document.getElementById('info-avatar').src=res.avatar_url;showToast('Аватар обновлен');loadChats()}catch(e){showToast(e.message)}}

let groupMembers=[]
function showGroupModal(){hideMenu();document.getElementById('group-name').value='';document.getElementById('group-search').value='';document.getElementById('group-search-results').innerHTML='';groupMembers=[];renderGroupMembers();showModal('modal-group')}
function renderGroupMembers(){document.getElementById('group-members-list').innerHTML=groupMembers.map(m=>`<span class="member-tag">${escapeHtml(m.display_name)} <button onclick="removeGroupMember(${m.id})">✕</button></span>`).join('')}
function removeGroupMember(id){groupMembers=groupMembers.filter(m=>m.id!==id);renderGroupMembers()}
async function searchForGroup(q){if(!q||q.length<1){document.getElementById('group-search-results').innerHTML='';return}try{const users=await api.searchUsers(q);document.getElementById('group-search-results').innerHTML=users.filter(u=>!groupMembers.find(m=>m.id===u.id)).map(u=>`<div class="search-result-item" onclick="addGroupMember(${u.id},'${escapeHtml(u.display_name)}')">${escapeHtml(u.display_name)}</div>`).join('')}catch(e){}}
function addGroupMember(id,name){if(groupMembers.find(m=>m.id===id))return;groupMembers.push({id,display_name:name});renderGroupMembers();document.getElementById('group-search').value='';document.getElementById('group-search-results').innerHTML=''}
async function createGroup(){const name=document.getElementById('group-name').value.trim();if(!name)return showToast('Введите название');if(!groupMembers.length)return showToast('Добавьте участников');try{const data=await api.createGroupChat(name,groupMembers.map(m=>m.id));closeModal();await loadChats();const chat=chatsList.find(c=>c.id===data.chat_id);if(chat)openChat(chat);showToast('Группа создана!')}catch(e){showToast(e.message)}}
function openDonate(){hideMenu();window.open('https://dalink.to/somessenger','_blank')}
function logout(){disconnectWebSocket();api.clearToken();window.currentUser=null;document.getElementById('main-screen').classList.remove('active');document.getElementById('auth-screen').classList.add('active');showLogin();document.getElementById('chats-list').innerHTML='';chatsList=[]}

// ===== Chat Search =====
let chatSearchTimeout=null
function toggleChatSearch(){
const bar=document.getElementById('chat-search-bar')
bar.style.display=bar.style.display==='none'?'block':'none'
if(bar.style.display==='block')document.getElementById('chat-search-input').focus()
else{document.getElementById('chat-search-input').value='';highlightChatSearchResults('')}
}
function debouncedChatSearch(q){clearTimeout(chatSearchTimeout);chatSearchTimeout=setTimeout(()=>searchInChat(q),300)}
async function searchInChat(q){
if(!window.currentChatId)return
highlightChatSearchResults(q)
if(q.length<2)return
try{
const results=await api.searchMessages(window.currentChatId,q)
// Scroll to first match
if(results&&results.length>0){
  const firstId=results[0].id
  const el=document.querySelector(`[data-message-id="${firstId}"]`)
  if(el)el.scrollIntoView({behavior:'smooth',block:'center'})
  highlightChatSearchResults(q)
}
}catch(e){console.error('Chat search error:',e)}
}
function highlightChatSearchResults(q){
document.querySelectorAll('.msg-search-highlight').forEach(el=>{el.classList.remove('msg-search-highlight')})
if(!q||q.length<2)return
document.querySelectorAll('.msg-text').forEach(el=>{
  if(el.textContent.toLowerCase().includes(q.toLowerCase()))el.classList.add('msg-search-highlight')
})
}
function escapeHtml(str){if(!str)return'';return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
function getInitials(name){if(!name)return'?';return name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}
function formatTime(isoString){if(!isoString)return'';const d=new Date(isoString),n=new Date();if(d.toDateString()===n.toDateString())return d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});const y=new Date(n);y.setDate(y.getDate()-1);if(d.toDateString()===y.toDateString())return'вчера '+d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});return d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'})}
function formatFileSize(b){if(!b)return'';if(b<1024)return b+' Б';if(b<1048576)return(b/1024).toFixed(1)+' КБ';return(b/1048576).toFixed(1)+' МБ'}
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'){closeModal();closeAllPopups();if(document.getElementById('edit-preview').style.display==='flex')cancelEdit();if(document.getElementById('reply-preview').style.display==='flex')cancelReply()}})
