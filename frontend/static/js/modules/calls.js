(function() {
    let ls, pc, ws, targetId, pendingOffer;
    const getTok = () => localStorage.getItem('token') || (window.api && window.api.token);

    function createUI() {
        if (document.getElementById('so-call-ui')) return;
        const ui = document.createElement('div');
        ui.id = 'so-call-ui';
        ui.innerHTML = `
            <div id="so-call-box">
                <div id="call-info">Инициализация...</div>
                <div id="ice-status" style="position:absolute; top:80px; width:100%; text-align:center; color:#aaa; font-size:12px;">ICE: starting</div>
                <video id="remote-v" autoplay playsinline style="width:100%; height:100%; object-fit:cover;"></video>
                <video id="local-v" autoplay playsinline muted style="width:100px; position:absolute; bottom:100px; right:20px; border:2px solid #fff; border-radius:10px;"></video>
                <div style="position:absolute; bottom:30px; width:100%; text-align:center;">
                    <button id="hangup-btn" style="background:#dc3545; color:#fff; border:none; padding:15px 40px; border-radius:30px; font-weight:bold; cursor:pointer;">ЗАВЕРШИТЬ</button>
                    <button id="accept-btn" style="display:none; background:#28a745; color:#fff; border:none; padding:15px 40px; border-radius:30px; font-weight:bold; cursor:pointer; margin-left:10px;">ПРИНЯТЬ</button>
                </div>
            </div>
            <style>
                #so-call-ui { position:fixed; top:0; left:0; width:100%; height:100%; background:#000; z-index:10000; display:none; flex-direction:column; font-family:sans-serif; }
                #so-call-box { position:relative; width:100%; height:100%; }
                #call-info { position:absolute; top:40px; width:100%; text-align:center; color:#fff; font-size:24px; z-index:11; }
            </style>`;
        document.body.appendChild(ui);
        document.getElementById('hangup-btn').onclick = () => window.endCall();
        document.getElementById('accept-btn').onclick = () => window.acceptCall();
    }

    async function connect() {
        if (ws?.readyState === 1) return;
        ws = new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws/call?token=${getTok()}`);
        ws.onmessage = async (e) => {
            const d = JSON.parse(e.data);
            if (d.type === 'incoming_call') {
                pendingOffer = d.sdp; targetId = d.from_user_id;
                createUI(); document.getElementById('so-call-ui').style.display = 'flex';
                document.getElementById('accept-btn').style.display = 'inline-block';
                document.getElementById('call-info').innerText = "Входящий звонок";
            } else if ((d.type === 'call_answer' || d.type === 'call_answered') && pc) {
                await pc.setRemoteDescription(new RTCSessionDescription({type:'answer', sdp:d.sdp}));
                document.getElementById('call-info').innerText = "Разговор";
            } else if (d.type === 'ice_candidate' && pc) {
                await pc.addIceCandidate(new RTCIceCandidate(d.candidate)).catch(()=>{});
            } else if (d.type === 'call_ended') window.endCall();
        };
    }

    function setupPC(iceConfig) {
        pc = new RTCPeerConnection(iceConfig);
        pc.oniceconnectionstatechange = () => {
            const s = pc.iceConnectionState;
            document.getElementById('ice-status').innerText = "Связь: " + s;
            if (s === 'connected') document.getElementById('call-info').innerText = "На связи";
        };
        ls.getTracks().forEach(t => pc.addTrack(t, ls));
        pc.onicecandidate = e => e.candidate && ws.send(JSON.stringify({type:'ice_candidate', to_user_id:targetId, candidate:e.candidate}));
        pc.ontrack = e => {
            console.log("🔊 Поток получен");
            document.getElementById('remote-v').srcObject = e.streams[0];
        };
    }

    window.initCalls = () => { createUI(); connect(); };
    window.startVoiceCall = () => start();
    window.startVideoCall = () => start();

    async function start() {
        targetId = window.currentOtherUserId;
        if (!targetId) return alert("Выберите чат");
        createUI(); document.getElementById('so-call-ui').style.display = 'flex';
        document.getElementById('call-info').innerText = "Вызов...";
        try {
            ls = await navigator.mediaDevices.getUserMedia({audio:true, video:true});
            document.getElementById('local-v').srcObject = ls;
            await connect();
            const ice = await fetch('/api/call/ice-servers', {headers:{'Authorization':`Bearer ${getTok()}`}}).then(r=>r.json());
            setupPC(ice);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({type:'call_offer', to_user_id:targetId, sdp:offer.sdp, call_type:'video'}));
        } catch (e) { alert("Ошибка камеры"); window.endCall(); }
    }

    window.acceptCall = async () => {
        document.getElementById('accept-btn').style.display = 'none';
        document.getElementById('call-info').innerText = "Соединение...";
        try {
            ls = await navigator.mediaDevices.getUserMedia({audio:true, video:true});
            document.getElementById('local-v').srcObject = ls;
            const ice = await fetch('/api/call/ice-servers', {headers:{'Authorization':`Bearer ${getTok()}`}}).then(r=>r.json());
            setupPC(ice);
            await pc.setRemoteDescription(new RTCSessionDescription({type:'offer', sdp:pendingOffer}));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({type:'call_answer', to_user_id:targetId, sdp:answer.sdp}));
        } catch (e) { window.endCall(); }
    };

    window.endCall = () => {
        if (ws?.readyState === 1) ws.send(JSON.stringify({type:'call_end', to_user_id:targetId}));
        ls?.getTracks().forEach(t => t.stop()); pc?.close();
        document.getElementById('so-call-ui').style.display = 'none';
        ls = null; pc = null;
    };
})();
