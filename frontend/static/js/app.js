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
window.addEventListener('resize',updateAppViewportHeight)
window.visualViewport?.addEventListener('resize',updateAppViewportHeight)
document.addEventListener('DOMContentLoaded',()=>{updateAppViewportHeight();installMobilePanGuards();init()})

async function init(){const token=localStorage.getItem('token');const saved=localStorage.getItem('user');if(token&&saved){try{api.setToken(token);const user=await api.getMe();window.currentUser=user;localStorage.setItem('user',JSON.stringify(user));startApp(user)}catch(e){api.clearToken();showAuthScreen()}}else showAuthScreen()}
function showAuthScreen(){document.getElementById('auth-screen').classList.add('active');document.getElementById('main-screen').classList.remove('active')}
async function startApp(user){window.currentUser=user;document.getElementById('auth-screen').classList.remove('active');document.getElementById('main-screen').classList.add('active');document.getElementById('active-chat').style.display='none';document.getElementById('welcome-screen').style.display='flex';document.getElementById('input-area').style.display='flex';document.getElementById('join-bar').style.display='none';await loadChats();connectWebSocket();setTimeout(updateAppViewportHeight,50);console.log(`✅ Добро пожаловать, ${user.display_name}!`)}
