/**
 * 2. auth.js
 * 로그인, 회원가입, 세션 보전 및 대기실 실시간 제어 (재접속 최적화 엔진)
 */

// 페이지 로드 시 기존 로그인 세션이 있다면 자동 대기실 진입
window.onload = function() {
    const savedUser = localStorage.getItem('mafia_session');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        
        // 자동 로그인 시 현재 게임 진행 상황 선행 검증
        getDb().ref('game').get().then((snap) => {
            const gameData = snap.val() || {};
            const status = gameData.status || "waiting";
            const players = gameData.players || {};
            
            // 이미 시작된 게임인데 내 참가 정보가 완전히 누락되어 있다면 난입 차단
            if (status !== "waiting" && !currentUser.isAdmin && !players[currentUser.id]) {
                alert("이미 게임이 진행 중입니다. 다음 판을 기다려주세요.");
                clearSession();
            } else {
                enterWaitingRoom();
            }
        });
    }
};

// 로그인 <-> 회원가입 UI 화면 전환
function toggleAuthMode(mode) {
    if (mode === 'signup') {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('signup-section').style.display = 'block';
    } else {
        document.getElementById('signup-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    }
}

// [원본 연동] 회원가입 시 닉네임 중복 검사 로직 완벽 매핑
function handleSignup() {
    const id = document.getElementById('signup-id').value.trim();
    const pw = document.getElementById('signup-pw').value.trim();
    const nick = document.getElementById('signup-nick').value.trim();

    if (!id || !pw || !nick) return alert('모든 필드를 입력해 주세요.');
    if (id === 'admin') return alert('admin 이라는 아이디는 생성 불가합니다.');

    getDb().ref(`accounts`).get().then((snapshot) => {
        const accounts = snapshot.val() || {};
        
        for (let accId in accounts) {
            if (accounts[accId].nick === nick) {
                throw new Error("이미 사용 중인 닉네임입니다. 다른 닉네임을 입력하세요.");
            }
        }
        return getDb().ref(`accounts/${id}`).get();
    }).then((snapId) => {
        if (snapId.exists()) {
            alert('이미 누군가 사용 중인 아이디입니다.');
        } else {
            getDb().ref(`accounts/${id}`).set({ pw, nick }).then(() => {
                alert('회원가입 완료! 로그인 화면으로 이동합니다.');
                document.getElementById('signup-id').value = '';
                document.getElementById('signup-pw').value = '';
                document.getElementById('signup-nick').value = '';
                toggleAuthMode('login');
            });
        }
    }).catch(err => alert(err.message));
}

// 로그인 처리 및 교사 계정 식별
function handleLogin() {
    const id = document.getElementById('login-id').value.trim();
    const pw = document.getElementById('login-pw').value.trim();

    if (id === 'admin' && pw === 'teacherpw') {
        currentUser = { id: 'admin', nick: '선생님', isAdmin: true };
        localStorage.setItem('mafia_session', JSON.stringify(currentUser));
        enterWaitingRoom();
        return;
    }

    getDb().ref('game').get().then((gameSnap) => {
        const gameData = gameSnap.val() || {};
        const currentStatusVal = gameData.status || "waiting";
        const players = gameData.players || {};

        // 게임 진행 중인데 참가자 명단에 없다면 난입 가드 차단
        if (currentStatusVal !== "waiting" && !players[id]) {
            alert("이미 게임이 시작되어 진입할 수 없습니다. 다음 판에 참여해 주세요.");
            return;
        }

        getDb().ref(`accounts/${id}`).get().then((snapshot) => {
            if (snapshot.exists() && snapshot.val().pw === pw) {
                currentUser = { id: id, nick: snapshot.val().nick, isAdmin: false };
                localStorage.setItem('mafia_session', JSON.stringify(currentUser));
                enterWaitingRoom();
            } else {
                alert('아이디 또는 비밀번호를 다시 확인해 주세요.');
            }
        });
    });
}

// 대기실 진입 및 실시간 튕김 방지 라이브 스캔
function enterWaitingRoom() {
    document.getElementById('auth-view').style.display = 'none';
    document.getElementById('waiting-view').style.display = 'block';
    document.getElementById('global-exit-btn').style.display = 'block';

    if (currentUser.isAdmin) {
        document.getElementById('admin-controls').style.display = 'block';
    }

    // [★재접속 완전 동기화 핵심] 대기방(waiting) 상태일 때만 데이터를 새로 초기화 생성합니다.
    // 만약 낮/밤 게임 도중 튕겨서 들어온 상태라면 기존의 데이터 노드를 건드리지 않고 그대로 상속 보존합니다.
    getDb().ref('game/status').get().then((statusSnap) => {
        const currentStat = statusSnap.val() || "waiting";
        if (currentStat === "waiting" && !currentUser.isAdmin) {
            getDb().ref(`game/players/${currentUser.id}`).set({
                nickname: currentUser.nick,
                isAlive: true,
                role: "none",
                nightTarget: "none",
                suspect: "none",
                dayVote: "none",
                deathReason: "none"
            });
        }
    });

// auth.js 내부의 enterWaitingRoom() 내 플레이어 감시 부분 수정 스니펫
getDb().ref('game/players').on('value', (snapshot) => {
    if (!currentUser) return;
    const players = snapshot.val() || {};
    
    // [수정사항 6] 내 계정이 목록엔 없는데, 세션이 살아있고 현재 방이 대기실('waiting')인 경우에만 교사 추방 팝업 활성화
    // 스스로 나가기 버튼(handleExit)을 누른 경우에는 clearSession()이 먼저 돌기 때문에 이 팝업창이 뜨지 않습니다.
    if (!currentUser.isAdmin && !players[currentUser.id] && currentStatus === 'waiting' && localStorage.getItem('mafia_session')) {
        alert("교사에 의해 대기실에서 추방되었습니다.");
        clearSession();
        return;
    }
    // ... 하단 생략 (기존 리스너 구성 유지)

        const playerListContainer = document.getElementById('player-list');
        if (!playerListContainer) return;
        
        playerListContainer.innerHTML = '';
        let count = 0;
        for (let id in players) {
            count++;
            const player = players[id];
            const kickElement = currentUser.isAdmin ? `<button class="kick-btn" onclick="serverKickPlayer('${id}')">추방</button>` : "";
            playerListContainer.innerHTML += `<div class="player-card"><span>${player.nickname}</span>${kickElement}</div>`;
        }
        const countDisp = document.getElementById('player-count');
        if (countDisp) countDisp.innerText = count;
    });

    // 글로벌 상태 전이 실시간 감시 파이프라인 (.on 작동으로 무인 즉각 화면 전환 보장)
    getDb().ref('game/status').on('value', (snapshot) => {
        currentStatus = snapshot.val() || 'waiting';
        if (currentStatus && currentStatus !== 'waiting') {
            if (typeof triggerGameViewTransition === 'function') {
                triggerGameViewTransition();
            }
        }
    });
}

// [요청사항 7 반영] 대기실 내 실시간 학생 강제 추방(Kick) 함수 원본 복구
window.serverKickPlayer = function(uid) {
    if (!currentUser || !currentUser.isAdmin) return;
    if (confirm("해당 학생을 대기실에서 영구 추방하시겠습니까?")) {
        getDb().ref(`game/players/${uid}`).remove().then(() => {
            alert("추방 처리가 완료되었습니다.");
        });
    }
};

// auth.js 내부의 handleExit() 함수 수정 반영본
function handleExit() {
    if (!currentUser) return;
    const confirmExit = confirm("정말 이 방에서 나가시겠습니까? (나간 동안은 AI가 대신 진행합니다.)");
    if (!confirmExit) return;

    if (!currentUser.isAdmin) {
        // [수정] remove() 대신 AI 대타 상태로 전환시키고 세션을 클리어합니다.
        getDb().ref(`game/players/${currentUser.id}`).update({
            isAiControlled: true
        }).then(clearSession);
    } else {
        clearSession();
    }
}

function clearSession() {
    localStorage.removeItem('mafia_session');
    currentUser = null;
    location.reload(); 
}