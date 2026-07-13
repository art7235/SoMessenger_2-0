const API_BASE='/api'
const api={
token:localStorage.getItem('token'),
setToken(t){this.token=t;localStorage.setItem('token',t)},
clearToken(){this.token=null;localStorage.removeItem('token');localStorage.removeItem('user')},
async request(method,path,body=null,isFormData=false){
const headers={};if(this.token)headers['Authorization']=`Bearer ${this.token}`
if(!isFormData&&body)headers['Content-Type']='application/json'
const opts={method,headers};if(body)opts.body=isFormData?body:JSON.stringify(body)
const res=await fetch(`${API_BASE}${path}`,opts)
if(res.status===401){this.clearToken();location.reload();return}
const text=await res.text()
let d=null
try{d=text?JSON.parse(text):null}catch(e){d={detail:text||`HTTP ${res.status}`}}
if(!res.ok)throw new Error(d?.detail||'Ошибка сервера')
return d},
get(p){return this.request('GET',p)},post(p,b){return this.request('POST',p,b)},
put(p,b){return this.request('PUT',p,b)},del(p){return this.request('DELETE',p)},
upload(p,fd){return this.request('POST',p,fd,true)},
register(d){return this.post('/auth/register',d)},
verify(e,c){return this.post('/auth/verify',{email:e,code:c})},
login(e,p){return this.post('/auth/login',{email:e,password:p})},
getMe(){return this.get('/users/me')},
updateMe(d){return this.put('/users/me',d)},
uploadAvatar(f){return this.upload('/users/me/avatar',f)},
searchUsers(q){return this.get(`/users/search?q=${encodeURIComponent(q)}`)},
getUser(id){return this.get(`/users/${id}`)},
getChats(){return this.get('/chats/')},
createPrivateChat(uid){return this.post('/chats/private',{user_id:uid})},
createGroupChat(n,i){return this.post('/chats/group',{name:n,member_ids:i})},
getMessages(cid,l=50,o=0,commentPostId=null){let url=`/chats/${cid}/messages?limit=${l}&offset=${o}`;if(commentPostId)url+=`&comment_post_id=${commentPostId}`;return this.get(url)},
sendMessage(cid,c,t='text',r=null){return this.post(`/chats/${cid}/messages`,{content:c,message_type:t,reply_to_id:r})},
uploadChatFile(cid,fd,replyToId=null,duration=null){const p=new URLSearchParams();if(replyToId)p.set('reply_to_id',replyToId);if(duration)p.set('duration',Math.max(1,Math.round(duration)));const q=p.toString()?`?${p.toString()}`:'';return this.upload(`/chats/${cid}/upload${q}`,fd)},
reactToMessage(cid,mid,em){return this.post(`/chats/${cid}/messages/${mid}/react`,{emoji:em})},
deleteMessage(cid,mid){return this.del(`/chats/${cid}/messages/${mid}`)},
editMessage(cid,mid,c){return this.put(`/chats/${cid}/messages/${mid}`,{content:c})},
markChatRead(cid){return this.post(`/chats/${cid}/read`,{})},
forwardMessage(sourceChatId,messageId,targetChatId){return this.post(`/chats/${sourceChatId}/messages/${messageId}/forward`,{target_chat_id:targetChatId})},
changePassword(oldPw,newPw){return this.post('/auth/change-password',{current_password:oldPw,new_password:newPw})},
requestPasswordReset(email){return this.post('/auth/request-password-reset',{email})},
verifyPasswordReset(email,code,newPw){return this.post('/auth/reset-password',{email,code,new_password:newPw})},
searchMessages(cid,q){return this.get(`/chats/${cid}/search?q=${encodeURIComponent(q)}`)},
getChannels(){return this.get('/channels/')},
getMyChannels(){return this.get('/channels/my')},
createChannel(d){return this.post('/channels/',d)},
getChannel(id){return this.get(`/channels/${id}`)},
searchChannels(q){return this.get(`/channels/search?q=${encodeURIComponent(q)}`)},
getChannelPosts(cid){return this.get(`/channels/${cid}/posts`)},
subscribeToChannel(cid){return this.post(`/channels/${cid}/subscribe`,{})},
unsubscribeFromChannel(cid){return this.post(`/channels/${cid}/unsubscribe`,{})},
uploadChannelAvatar(cid,fd){return this.upload(`/channels/${cid}/avatar`,fd)},
uploadChatAvatar(cid,fd){return this.upload(`/chats/${cid}/avatar`,fd)},
getJoinedChannels(){return this.get('/channels/joined')},
createPost(cid,c){const body=(c&&typeof c==='object')?c:{content:c};return this.post(`/channels/${cid}/posts`,body)},
uploadPostMedia(cid,pid,fd){return this.upload(`/channels/${cid}/posts/${pid}/upload`,fd)},
getCommentsChat(cid,pid){return this.get(`/channels/${cid}/posts/${pid}/comments-chat`)},
reactToPost(cid,pid,em){return this.post(`/channels/${cid}/posts/${pid}/react`,{emoji:em})},
getStickerPacks(){return this.get('/stickers/')},
}
