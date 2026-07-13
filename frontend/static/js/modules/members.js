// Group/channel member management: roles, mute/ban, invite links, add members.
let infoKind=null,infoTargetId=null,infoActorRole=null,infoMembersCache=[],infoCanManage=false

function roleRank(role){return role==='owner'?3:role==='admin'?2:1}
function roleBadgeLabel(role){return role==='owner'?'Владелец':role==='admin'?'Админ':''}

async function showChatInfo(){
let data,type,isOwner=false
if(window.currentChatId){
  const chat=chatsList.find(c=>c.id===window.currentChatId&&!c._isChannel&&!c.is_comments)
  if(!chat)return
  data=chat;type='chat'
  infoKind='chat';infoTargetId=chat.id;infoActorRole=chat.my_role||null
  isOwner=infoActorRole==='owner'
}else if(currentChannelId){
  data=await api.getChannel(currentChannelId)
  type='channel'
  infoKind='channel';infoTargetId=currentChannelId;infoActorRole=data.role||null
  isOwner=data.is_owner
}else return

document.getElementById('info-title').textContent=type==='chat'?'Информация':'Информация о канале'
document.getElementById('info-name').textContent=data.name
document.getElementById('info-desc').textContent=data.description||''
document.getElementById('info-avatar').src=data.avatar_url||''
document.getElementById('info-avatar-edit').style.display=isOwner?'flex':'none'
document.getElementById('info-extra').textContent=type==='channel'?`${data.subscribers_count} подписчиков`:(type==='chat'&&data.is_group?'Группа':'')

const isGroupChat=type==='chat'&&data.is_group
const manageable=isGroupChat||type==='channel'
const canManage=manageable&&(infoActorRole==='owner'||infoActorRole==='admin')
const isOwnerOfManageable=manageable&&infoActorRole==='owner'
infoCanManage=canManage

document.getElementById('info-name-view').style.display=canManage?'none':'block'
document.getElementById('info-edit-fields').style.display=canManage?'block':'none'
if(canManage){
  document.getElementById('info-edit-name').value=data.name||''
  document.getElementById('info-edit-desc').value=data.description||''
}

document.getElementById('info-privacy').style.display=isOwnerOfManageable?'block':'none'
if(isOwnerOfManageable){
  document.getElementById('info-is-public').checked=!!data.is_public
  document.getElementById('info-username').value=data.username||''
}

document.getElementById('info-slowmode-section').style.display=(isGroupChat&&canManage)?'block':'none'
if(isGroupChat&&canManage)document.getElementById('info-slowmode').value=String(data.slow_mode_seconds||0)

document.getElementById('info-invites').style.display=manageable?'block':'none'
document.getElementById('info-invite-create-btn').style.display=canManage?'inline':'none'
if(manageable)loadInviteLinks()

document.getElementById('info-admins-section').style.display=canManage?'block':'none'
if(canManage)loadAdminsList()

document.getElementById('info-members-section').style.display=canManage?'block':'none'
const addBtn=document.querySelector('#info-members-section .link-btn')
if(addBtn)addBtn.style.display=(canManage&&infoKind==='chat')?'inline':'none'
if(canManage)loadMembersList()

document.getElementById('info-bans-section').style.display=canManage?'block':'none'
if(canManage)loadBansList()

document.getElementById('info-audit-section').style.display=canManage?'block':'none'
auditExpanded=false;auditLoaded=false
document.getElementById('info-audit-list').style.display='none'
document.getElementById('info-audit-chevron').classList.remove('open')

document.getElementById('info-add-members').style.display='none'
document.getElementById('info-leave-btn').style.display=(isGroupChat&&infoActorRole)?'block':'none'

showModal('modal-info')}

async function uploadInfoAvatar(input){const file=input.files[0];if(!file)return;const fd=new FormData();fd.append('file',file);try{let res;if(window.currentChatId)res=await api.uploadChatAvatar(window.currentChatId,fd);else if(currentChannelId)res=await api.uploadChannelAvatar(currentChannelId,fd);document.getElementById('info-avatar').src=res.avatar_url;showToast('Аватар обновлен');loadChats()}catch(e){showToast(e.message)}}

async function saveInfoEdits(){
const name=document.getElementById('info-edit-name').value.trim()
const description=document.getElementById('info-edit-desc').value.trim()
if(!name)return showToast('Введите название')
try{
  if(infoKind==='chat')await api.updateChat(infoTargetId,{name,description})
  else await api.updateChannelInfo(infoTargetId,{name,description})
  document.getElementById('info-name').textContent=name
  document.getElementById('info-desc').textContent=description
  showToast('Сохранено')
  await loadChats()
}catch(e){showToast(e.message)}}

async function onInfoPrivacyToggle(){
const isPublic=document.getElementById('info-is-public').checked
try{
  if(infoKind==='chat')await api.updateChatPrivacy(infoTargetId,{is_public:isPublic})
  else await api.updateChannelPrivacy(infoTargetId,{is_public:isPublic})
  showToast(isPublic?'Теперь публичный':'Теперь приватный')
}catch(e){showToast(e.message);document.getElementById('info-is-public').checked=!isPublic}}

async function onSlowModeChange(){
const seconds=parseInt(document.getElementById('info-slowmode').value,10)||0
try{
  await api.updateSlowMode(infoTargetId,seconds)
  showToast(seconds?`Медленный режим: ${seconds} сек`:'Медленный режим выключен')
}catch(e){showToast(e.message)}}

async function onInfoUsernameChange(){
const username=document.getElementById('info-username').value.trim().replace('@','')
try{
  if(infoKind==='chat')await api.updateChatPrivacy(infoTargetId,{username:username||null})
  else await api.updateChannelInfo(infoTargetId,{username:username||null})
  showToast('Username обновлён')
}catch(e){showToast(e.message)}}

// ===== Invite links =====
async function loadInviteLinks(){
try{
  const links=infoKind==='chat'?await api.getChatInviteLinks(infoTargetId):await api.getChannelInviteLinks(infoTargetId)
  renderInviteLinks(links)
}catch(e){document.getElementById('info-invites-list').innerHTML=''}}

function renderInviteLinks(links){
document.getElementById('info-invites-list').innerHTML=links.length?links.map(l=>`
  <div class="invite-link-row">
    <div class="invite-link-code" onclick="copyInviteLink('${l.code}')">${location.origin}/#invite/${l.code}</div>
    <div class="invite-link-meta">${l.uses_count}${l.max_uses?'/'+l.max_uses:''} исп.${l.expires_at?' · до '+formatTime(l.expires_at):''}</div>
    ${infoCanManage?`<button class="link-btn danger" onclick="revokeInviteLink(${l.id})">Отозвать</button>`:''}
  </div>`).join(''):`<div class="empty-hint">Ссылка ещё не создана${infoCanManage?'':' — попросите админа'}</div>`}

function copyInviteLink(code){
const url=`${location.origin}/#invite/${code}`
if(navigator.clipboard)navigator.clipboard.writeText(url).then(()=>showToast('Ссылка скопирована')).catch(()=>showToast(url))
else showToast(url)}

async function createInviteLinkFlow(){
try{
  const link=infoKind==='chat'?await api.createChatInviteLink(infoTargetId):await api.createChannelInviteLink(infoTargetId)
  await loadInviteLinks()
  copyInviteLink(link.code)
}catch(e){showToast(e.message)}}

async function revokeInviteLink(linkId){
try{
  if(infoKind==='chat')await api.revokeChatInviteLink(infoTargetId,linkId)
  else await api.revokeChannelInviteLink(infoTargetId,linkId)
  await loadInviteLinks()
}catch(e){showToast(e.message)}}

// ===== Admins (visible to everyone) =====
async function loadAdminsList(){
try{
  const admins=infoKind==='chat'?await api.getChatAdmins(infoTargetId):await api.getChannelAdmins(infoTargetId)
  document.getElementById('info-admins-count').textContent=admins.length
  document.getElementById('info-admins-list').innerHTML=admins.map(renderMemberRow).join('')
}catch(e){}}

// ===== Members =====
async function loadMembersList(){
try{
  const members=infoKind==='chat'?await api.getChatMembers(infoTargetId):await api.getChannelMembers(infoTargetId)
  infoMembersCache=members
  document.getElementById('info-members-count').textContent=members.length
  document.getElementById('info-members-list').innerHTML=members.map(renderMemberRow).join('')
}catch(e){}}

function renderMemberRow(m){
const badge=roleBadgeLabel(m.role)
const isMuted=m.muted_until&&new Date(m.muted_until)>new Date()
const canAct=m.user_id!==currentUser.id&&roleRank(infoActorRole)>roleRank(m.role)
return `<div class="member-row" data-user-id="${m.user_id}">
  <img class="member-avatar" src="${m.avatar_url||''}" onerror="this.style.visibility='hidden'">
  <div class="member-info">
    <div class="member-name">${escapeHtml(m.display_name)}${m.is_online?'<span class="online-dot-inline"></span>':''}</div>
    ${badge?`<span class="role-badge role-${m.role}">${badge}</span>`:''}${isMuted?'<span class="mute-badge" title="В муте">🔇</span>':''}
  </div>
  ${canAct?`<button class="member-actions-btn" onclick="showMemberActions(event,${m.user_id})">⋮</button>`:''}
</div>`}

function myPermissions(){
const me=infoMembersCache.find(x=>x.user_id===currentUser.id)
return me?(me.permissions||[]):(infoActorRole==='owner'?['change_info','ban','mute','invite','add_admins']:[])}

const PERMISSION_LABELS={change_info:'Редактировать инфо',ban:'Банить/кикать',mute:'Мутить',invite:'Инвайт-ссылки',add_admins:'Назначать админов'}

function showMemberActions(event,userId){
event.preventDefault();event.stopPropagation()
const m=infoMembersCache.find(x=>x.user_id===userId)
if(!m)return
const menu=document.getElementById('message-actions-menu')
menu._openedAt=Date.now()
const isMuted=m.muted_until&&new Date(m.muted_until)>new Date()
const myPerms=myPermissions()
let html=''
if(infoActorRole==='owner'){
  if(m.role==='admin')html+=`<button class="delete-menu-btn" onclick="changeMemberRole(${userId},'${infoKind==='chat'?'member':'subscriber'}')">⬇️ Снять админа</button>`
  else html+=`<button class="delete-menu-btn" onclick="changeMemberRole(${userId},'admin')">⬆️ Сделать админом</button>`
  if(m.role==='admin')html+=`<button class="delete-menu-btn" onclick="showPermissionsEditor(${userId})">⚙️ Права доступа</button>`
}else if(myPerms.includes('add_admins')&&(m.role==='member'||m.role==='subscriber')){
  html+=`<button class="delete-menu-btn" onclick="changeMemberRole(${userId},'admin')">⬆️ Сделать админом</button>`
}
if(myPerms.includes('mute')){
  if(isMuted)html+=`<button class="delete-menu-btn" onclick="unmuteMemberAction(${userId})">🔊 Снять мут</button>`
  else{
    html+=`<button class="delete-menu-btn" onclick="muteMemberAction(${userId},60)">🔇 Мут на 1 час</button>`
    html+=`<button class="delete-menu-btn" onclick="muteMemberAction(${userId},1440)">🔇 Мут на 1 день</button>`
    html+=`<button class="delete-menu-btn" onclick="muteMemberAction(${userId},null)">🔇 Мут навсегда</button>`
  }
}
if(myPerms.includes('ban')){
  html+=`<button class="delete-menu-btn danger" onclick="kickMemberAction(${userId})">🚪 Исключить</button>`
  html+=`<button class="delete-menu-btn danger" onclick="banMemberAction(${userId})">⛔ Заблокировать</button>`
}
menu.innerHTML=html||'<div class="empty-hint" style="padding:12px 18px">Нет доступных действий</div>'
menu.style.display='block'
positionMenuAt(menu,event)}

function showPermissionsEditor(userId){
const m=infoMembersCache.find(x=>x.user_id===userId)
if(!m)return
const menu=document.getElementById('message-actions-menu')
menu._openedAt=Date.now()
const current=new Set(m.permissions||[])
let html='<div style="padding:10px 16px 4px;font-size:13px;color:var(--text-secondary)">Права админа</div>'
html+=Object.entries(PERMISSION_LABELS).map(([key,label])=>
  `<label class="perm-row"><input type="checkbox" value="${key}" ${current.has(key)?'checked':''}>${label}</label>`).join('')
html+=`<button class="delete-menu-btn" style="color:var(--accent)" onclick="savePermissionsEditor(${userId})">Сохранить</button>`
menu.innerHTML=html
menu.style.display='block'}

async function savePermissionsEditor(userId){
const menu=document.getElementById('message-actions-menu')
const perms=Array.from(menu.querySelectorAll('input[type="checkbox"]:checked')).map(i=>i.value)
closeMessageActions()
try{
  if(infoKind==='chat')await api.setChatMemberPermissions(infoTargetId,userId,perms)
  else await api.setChannelMemberPermissions(infoTargetId,userId,perms)
  showToast('Права обновлены')
  await loadMembersList()
}catch(e){showToast(e.message)}}

async function changeMemberRole(userId,role){
closeMessageActions()
try{
  if(infoKind==='chat')await api.setChatMemberRole(infoTargetId,userId,role)
  else await api.setChannelMemberRole(infoTargetId,userId,role)
  await loadMembersList()
}catch(e){showToast(e.message)}}

async function muteMemberAction(userId,minutes){
closeMessageActions()
try{
  if(infoKind==='chat')await api.muteChatMember(infoTargetId,userId,minutes)
  else await api.muteChannelMember(infoTargetId,userId,minutes)
  showToast('Пользователь замучен')
  await loadMembersList()
}catch(e){showToast(e.message)}}

async function unmuteMemberAction(userId){
closeMessageActions()
try{
  if(infoKind==='chat')await api.unmuteChatMember(infoTargetId,userId)
  else await api.unmuteChannelMember(infoTargetId,userId)
  await loadMembersList()
}catch(e){showToast(e.message)}}

async function kickMemberAction(userId){
closeMessageActions()
try{
  if(infoKind==='chat')await api.removeChatMember(infoTargetId,userId)
  else await api.removeChannelMember(infoTargetId,userId)
  showToast('Участник исключён')
  await loadMembersList()
}catch(e){showToast(e.message)}}

async function banMemberAction(userId){
closeMessageActions()
try{
  if(infoKind==='chat')await api.banChatMember(infoTargetId,userId)
  else await api.banChannelMember(infoTargetId,userId)
  showToast('Пользователь заблокирован')
  await loadMembersList();await loadBansList()
}catch(e){showToast(e.message)}}

// ===== Bans =====
async function loadBansList(){
try{
  const bans=infoKind==='chat'?await api.getChatBans(infoTargetId):await api.getChannelBans(infoTargetId)
  document.getElementById('info-bans-list').innerHTML=bans.length?bans.map(b=>`
    <div class="member-row">
      <img class="member-avatar" src="${b.avatar_url||''}" onerror="this.style.visibility='hidden'">
      <div class="member-info"><div class="member-name">${escapeHtml(b.display_name)}</div></div>
      <button class="link-btn" onclick="unbanMemberAction(${b.user_id})">Разбанить</button>
    </div>`).join(''):'<div class="empty-hint">Нет заблокированных</div>'
}catch(e){document.getElementById('info-bans-list').innerHTML=''}}

async function unbanMemberAction(userId){
try{
  if(infoKind==='chat')await api.unbanChatMember(infoTargetId,userId)
  else await api.unbanChannelMember(infoTargetId,userId)
  await loadBansList()
}catch(e){showToast(e.message)}}

// ===== Audit log =====
function describeAuditEntry(e){
const actor=escapeHtml(e.actor_name),target=e.target_name?escapeHtml(e.target_name):null
switch(e.action){
  case'kick':return `${actor} исключил ${target} из группы`
  case'ban':return `${actor} заблокировал ${target}`+(e.details?` · причина: ${escapeHtml(e.details)}`:'')
  case'unban':return `${actor} разблокировал ${target}`
  case'mute':return `${actor} замутил ${target}`
  case'unmute':return `${actor} снял мут с ${target}`
  case'role_change':return e.details==='admin'?`${actor} назначил ${target} админом`:`${actor} снял права админа у ${target}`
  case'info_update':return `${actor} изменил информацию`
  case'privacy_update':return `${actor} изменил настройки приватности`
  case'invite_created':return `${actor} создал инвайт-ссылку`
  case'invite_revoked':return `${actor} отозвал инвайт-ссылку`
  case'slow_mode_update':return e.details&&e.details!=='0'?`${actor} включил медленный режим · ${e.details} сек`:`${actor} выключил медленный режим`
  case'permissions_update':return `${actor} изменил права ${target}`
  default:return `${actor}: ${e.action}`
}}

let auditExpanded=false,auditLoaded=false
function toggleAuditLog(){
auditExpanded=!auditExpanded
document.getElementById('info-audit-list').style.display=auditExpanded?'block':'none'
document.getElementById('info-audit-chevron').classList.toggle('open',auditExpanded)
if(auditExpanded&&!auditLoaded){auditLoaded=true;loadAuditLog()}}

async function loadAuditLog(){
try{
  const entries=infoKind==='chat'?await api.getChatAuditLog(infoTargetId):await api.getChannelAuditLog(infoTargetId)
  document.getElementById('info-audit-list').innerHTML=entries.length?entries.map(e=>
    `<div class="audit-row"><span>${describeAuditEntry(e)}</span><span class="audit-time">${formatTime(e.created_at)}</span></div>`).join('')
    :'<div class="empty-hint">Пока нет записей</div>'
}catch(e){document.getElementById('info-audit-list').innerHTML=''}}

// ===== Add members (groups only) =====
function showAddMembersFlow(){
if(infoKind!=='chat')return
document.getElementById('info-add-members').style.display='block'
document.getElementById('info-add-search').value=''
document.getElementById('info-add-results').innerHTML=''
document.getElementById('info-add-search').focus()}

async function searchForAddMember(q){
if(!q||q.length<1){document.getElementById('info-add-results').innerHTML='';return}
try{
  const users=await api.searchUsers(q)
  const existingIds=new Set(infoMembersCache.map(m=>m.user_id))
  document.getElementById('info-add-results').innerHTML=users.filter(u=>!existingIds.has(u.id)).map(u=>
    `<div class="search-result-item" onclick="addMemberToGroup(${u.id})">${escapeHtml(u.display_name)}</div>`).join('')
}catch(e){}}

async function addMemberToGroup(userId){
try{
  await api.addChatMembers(infoTargetId,[userId])
  document.getElementById('info-add-search').value=''
  document.getElementById('info-add-results').innerHTML=''
  document.getElementById('info-add-members').style.display='none'
  showToast('Участник добавлен')
  await loadMembersList()
}catch(e){showToast(e.message)}}

// ===== Leave group =====
async function leaveCurrentChat(){
if(infoKind!=='chat')return
if(!confirm('Покинуть группу?'))return
try{
  await api.leaveChat(infoTargetId)
  closeModal()
  closeChat()
  await loadChats()
  showToast('Вы покинули группу')
}catch(e){showToast(e.message)}}

// ===== Invite link join flow (#invite/<code>) =====
async function handleInviteHash(){
const m=location.hash.match(/^#invite\/(.+)$/)
if(!m)return
const code=m[1]
history.replaceState(null,'',location.pathname+location.search)
if(!api.token)return
try{
  const result=await api.joinByCode(code)
  await loadChats()
  showToast(`Вы присоединились: ${result.name}`)
  if(result.kind==='chat'){const chat=chatsList.find(c=>c.id===result.id);if(chat)openChat(chat)}
  else openChannel(result.id)
}catch(e){showToast(e.message)}}
window.addEventListener('hashchange',handleInviteHash)
