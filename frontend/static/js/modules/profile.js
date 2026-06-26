function showProfile(){
    const u=window.currentUser
    if(!u)return
    hideMenu()
    closeAllPopups?.()
    const panel=document.getElementById('profile-panel')
    document.getElementById('profile-name').value=u.display_name||''
    document.getElementById('profile-bio').value=u.bio||''
    document.getElementById('profile-username').textContent='@'+(u.username||'')
    const av=document.getElementById('profile-avatar')
    av.src=u.avatar_url||''
    panel.style.display='flex'
    panel.style.zIndex='1400'
}
function hideProfile(){document.getElementById('profile-panel').style.display='none'}
async function saveProfile(){const dn=document.getElementById('profile-name').value.trim();const bio=document.getElementById('profile-bio').value.trim();if(!dn)return showToast('Введите имя');try{await api.updateMe({display_name:dn,bio});window.currentUser.display_name=dn;window.currentUser.bio=bio;localStorage.setItem('user',JSON.stringify(window.currentUser));showToast('Профиль сохранён ✓')}catch(e){showToast('Ошибка: '+e.message)}}
async function uploadAvatar(input){const file=input.files[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type))return showToast('Только JPEG, PNG, WEBP');const fd=new FormData();fd.append('file',file);showToast('Загрузка...');try{const data=await api.uploadAvatar(fd);window.currentUser.avatar_url=data.avatar_url;localStorage.setItem('user',JSON.stringify(window.currentUser));document.getElementById('profile-avatar').src=data.avatar_url;showToast('Аватар обновлён ✓')}catch(e){showToast('Ошибка: '+e.message)};input.value=''}
