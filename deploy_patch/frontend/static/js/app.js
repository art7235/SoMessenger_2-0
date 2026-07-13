window.currentUser=null

function updateAppViewportHeight(){
    const h=(window.visualViewport?.height||window.innerHeight)
    document.documentElement.style.setProperty('--app-height',`${h}px`)
}
function installMobilePanGuards(){
    // Block only clearly horizontal swipes (page pan / back-swipe).
    // Vertical scrolling must stay fully native (passive) so the browser
    // can apply inertia / momentum without waiting for JS.
    const guardedSelectors=['#messages-container','#active-chat','#chat-area','.chats-list']
    guardedSelectors.forEach(sel=>{
        const el=document.querySelector(sel);if(!el)return
        let sx=0,sy=0,decided=false,isHorizontal=false
        el.addEventListener('touchstart',e=>{
            const t=e.touches[0];sx=t.clientX;sy=t.clientY
            decided=false;isHorizontal=false
        },{passive:true})
        el.addEventListener('touchmove',e=>{
            if(!e.touches.length)return
            const t=e.touches[0],dx=Math.abs(t.clientX-sx),dy=Math.abs(t.clientY-sy)
            // Wait for enough movement to decide direction (8px threshold)
            if(!decided){
                if(dx<8&&dy<8)return          // too little movement — do nothing yet
                decided=true
                isHorizontal=(dx>dy*2.0&&dx>20) // clearly horizontal
            }
            // Only block horizontal swipes; let vertical scroll pass untouched
            if(isHorizontal)e.preventDefault()
        },{passive:false})
    })
}

function installMobileBackSwipe(){
    const el=document.getElementById('active-chat');if(!el)return
    let sx=0,sy=0,tracking=false,decided=false
    el.addEventListener('touchstart',e=>{
        if(window.innerWidth>768||!e.touches.length)return
        if(document.getElementById('modal-overlay')?.style.display==='flex')return
        if(e.target.closest('input,textarea,button,video,a,.delete-menu,.reaction-picker,.sticker-picker,.attach-menu'))return
        const t=e.touches[0];sx=t.clientX;sy=t.clientY;tracking=true;decided=false
    },{passive:true})
    el.addEventListener('touchmove',e=>{
        if(!tracking||!e.touches.length)return
        const t=e.touches[0],dx=t.clientX-sx,dy=t.clientY-sy
        if(!decided){
            if(Math.abs(dx)<12&&Math.abs(dy)<12)return
            decided=true
            if(Math.abs(dy)>Math.abs(dx)*1.1||dx<=0){tracking=false;return}
        }
        if(dx>0)e.preventDefault()
    },{passive:false})
    el.addEventListener('touchend',e=>{
        if(!tracking)return;tracking=false
        const t=e.changedTouches&&e.changedTouches[0];if(!t)return
        const dx=t.clientX-sx,dy=t.clientY-sy
        if(dx>90&&Math.abs(dy)<70){
            if(typeof currentChannelId!=='undefined'&&currentChannelId&&typeof closeChannel==='function')closeChannel()
            else if(typeof closeChat==='function')closeChat()
        }
    },{passive:true})
}

window.addEventListener('resize',updateAppViewportHeight)
window.visualViewport?.addEventListener('resize',updateAppViewportHeight)
document.addEventListener('DOMContentLoaded',()=>{updateAppViewportHeight();installMobilePanGuards();installMobileBackSwipe();init()})

async function init(){const token=localStorage.getItem('token');const saved=localStorage.getItem('user');if(token&&saved){try{api.setToken(token);const user=await api.getMe();window.currentUser=user;localStorage.setItem('user',JSON.stringify(user));startApp(user)}catch(e){api.clearToken();showAuthScreen()}}else showAuthScreen()}
function showAuthScreen(){document.getElementById('auth-screen').classList.add('active');document.getElementById('main-screen').classList.remove('active')}
async function startApp(user){window.currentUser=user;document.getElementById('auth-screen').classList.remove('active');document.getElementById('main-screen').classList.add('active');document.getElementById('active-chat').style.display='none';document.getElementById('welcome-screen').style.display='flex';document.getElementById('input-area').style.display='flex';document.getElementById('join-bar').style.display='none';await loadChats();connectWebSocket();setTimeout(updateAppViewportHeight,50);console.log(`✅ Добро пожаловать, ${user.display_name}!`)}
