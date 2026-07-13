let pendingEmail=''
function showRegister(){document.getElementById('login-form').classList.remove('active');document.getElementById('verify-form').classList.remove('active');document.getElementById('register-form').classList.add('active');clearAuthError()}
function showLogin(){document.getElementById('register-form').classList.remove('active');document.getElementById('verify-form').classList.remove('active');document.getElementById('login-form').classList.add('active');clearAuthError()}
function showVerify(){document.getElementById('register-form').classList.remove('active');document.getElementById('login-form').classList.remove('active');document.getElementById('verify-form').classList.add('active');clearAuthError();setTimeout(()=>document.getElementById('c1').focus(),100)}
function showAuthError(m){document.getElementById('auth-error').textContent=m}
function clearAuthError(){document.getElementById('auth-error').textContent=''}
function setAuthLoading(s){document.getElementById('auth-loading').style.display=s?'block':'none'}
document.addEventListener('DOMContentLoaded',()=>{
const inputs=document.querySelectorAll('#verify-form .code-input')
inputs.forEach((input,index)=>{
input.addEventListener('input',(e)=>{const v=e.target.value.replace(/\D/g,'');e.target.value=v;if(v&&index<inputs.length-1)inputs[index+1].focus();if(v&&index===inputs.length-1)document.getElementById('verify-btn').click()})
input.addEventListener('keydown',(e)=>{if(e.key==='Backspace'&&!input.value&&index>0){inputs[index-1].focus();inputs[index-1].value=''}})
input.addEventListener('paste',(e)=>{e.preventDefault();const text=e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6);text.split('').forEach((c,i)=>{if(inputs[i])inputs[i].value=c});if(text.length===6)setTimeout(()=>document.getElementById('verify-btn').click(),100)})
})
document.getElementById('register-btn').addEventListener('click',async()=>{
const dn=document.getElementById('reg-name').value.trim();const un=document.getElementById('reg-username').value.trim().replace('@','')
const em=document.getElementById('reg-email').value.trim();const pw=document.getElementById('reg-password').value
if(!dn||!un||!em||!pw)return showAuthError('Заполните все поля')
if(pw.length<6)return showAuthError('Пароль должен быть не менее 6 символов')
setAuthLoading(true);clearAuthError()
try{const data=await api.register({display_name:dn,username:un,email:em,password:pw})
if(data.access_token){api.setToken(data.access_token);localStorage.setItem('user',JSON.stringify(data.user));window.currentUser=data.user;startApp(data.user);showToast('Добро пожаловать!')}
else{pendingEmail=em;showVerify();showToast('Код отправлен на '+em)}}
catch(e){showAuthError(e.message)}finally{setAuthLoading(false)}})
document.getElementById('verify-btn').addEventListener('click',async()=>{
const code=['c1','c2','c3','c4','c5','c6'].map(id=>document.getElementById(id).value).join('')
if(code.length!==6)return showAuthError('Введите 6-значный код')
setAuthLoading(true);clearAuthError()
try{const data=await api.verify(pendingEmail,code);api.setToken(data.access_token);localStorage.setItem('user',JSON.stringify(data.user));window.currentUser=data.user;startApp(data.user)}
catch(e){showAuthError(e.message);['c1','c2','c3','c4','c5','c6'].forEach(id=>{document.getElementById(id).value=''});document.getElementById('c1').focus()}
finally{setAuthLoading(false)}})
document.getElementById('login-btn').addEventListener('click',async()=>{
const em=document.getElementById('login-email').value.trim();const pw=document.getElementById('login-password').value
if(!em||!pw)return showAuthError('Введите email и пароль')
setAuthLoading(true);clearAuthError()
try{const data=await api.login(em,pw);api.setToken(data.access_token);localStorage.setItem('user',JSON.stringify(data.user));window.currentUser=data.user;startApp(data.user)}
catch(e){showAuthError(e.message)}finally{setAuthLoading(false)}})
document.getElementById('login-password').addEventListener('keydown',(e)=>{if(e.key==='Enter')document.getElementById('login-btn').click()})
document.getElementById('reg-password').addEventListener('keydown',(e)=>{if(e.key==='Enter')document.getElementById('register-btn').click()})
})
