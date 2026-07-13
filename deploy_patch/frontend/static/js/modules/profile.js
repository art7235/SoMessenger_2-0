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

// ===== Change Password =====
function showChangePassword(){
    hideProfile()
    showModal('modal-password')
    document.getElementById('pw-old').value=''
    document.getElementById('pw-new').value=''
    document.getElementById('pw-confirm').value=''
    document.getElementById('pw-error').textContent=''
}
async function changePassword(){
    const oldPw=document.getElementById('pw-old').value
    const newPw=document.getElementById('pw-new').value
    const confirmPw=document.getElementById('pw-confirm').value
    const errEl=document.getElementById('pw-error')
    errEl.textContent=''
    if(!oldPw||!newPw)return errEl.textContent='Заполните все поля'
    if(newPw.length<6)return errEl.textContent='Минимум 6 символов'
    if(newPw!==confirmPw)return errEl.textContent='Пароли не совпадают'
    try{
        await api.changePassword(oldPw,newPw)
        showToast('Пароль изменён ✓')
        closeModal()
    }catch(e){errEl.textContent=e.message}
}

// ===== Password Reset =====
let resetEmail=''
function showPasswordReset(){
    closeModal()
    document.getElementById('reset-email-input').value=''
    document.getElementById('reset-code-inputs').querySelectorAll('input').forEach(i=>i.value='')
    document.getElementById('reset-new-password').value=''
    document.getElementById('reset-error').textContent=''
    document.getElementById('reset-step-1').style.display='block'
    document.getElementById('reset-step-2').style.display='none'
    showModal('modal-reset')
}
async function requestResetCode(){
    const email=document.getElementById('reset-email-input').value.trim()
    if(!email)return document.getElementById('reset-error').textContent='Введите email'
    try{
        await api.requestPasswordReset(email)
        resetEmail=email
        document.getElementById('reset-step-1').style.display='none'
        document.getElementById('reset-step-2').style.display='block'
        document.getElementById('reset-error').textContent=''
        showToast('Код отправлен')
    }catch(e){document.getElementById('reset-error').textContent=e.message}
}
async function verifyResetCode(){
    const inputs=document.getElementById('reset-code-inputs').querySelectorAll('input')
    const code=Array.from(inputs).map(i=>i.value).join('')
    const newPw=document.getElementById('reset-new-password').value
    if(code.length<6)return document.getElementById('reset-error').textContent='Введите код'
    if(newPw.length<6)return document.getElementById('reset-error').textContent='Пароль мин. 6 символов'
    try{
        await api.verifyPasswordReset(resetEmail,code,newPw)
        showToast('Пароль восстановлен! Войдите заново')
        closeModal()
        logout()
    }catch(e){document.getElementById('reset-error').textContent=e.message}
}

// Init code-input auto-advance for reset
document.addEventListener('DOMContentLoaded',()=>{
    const container=document.getElementById('reset-code-inputs')
    if(!container)return
    const inputs=container.querySelectorAll('input')
    inputs.forEach((input,index)=>{
        input.addEventListener('input',(e)=>{
            const v=e.target.value.replace(/\D/g,'');e.target.value=v
            if(v&&index<inputs.length-1)inputs[index+1].focus()
        })
        input.addEventListener('keydown',(e)=>{
            if(e.key==='Backspace'&&!input.value&&index>0){inputs[index-1].focus();inputs[index-1].value=''}
        })
    })
})
