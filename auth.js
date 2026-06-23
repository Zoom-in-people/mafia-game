/**
 * 2. auth.js
 * 로그인, 회원가입, 세션 유지 및 대기실 실시간 제어 (재접속 최적화)
 */

window.onload = function() {
    const savedUser = localStorage.getItem('mafia_session');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        
        // 자동 로그인 시에도 게임 진행 상태 및 기존 참여 여부 통합 검증
        getDb().ref('game').get().then((snap) => {
            const gameData = snap.val() || {};
            const status = gameData.status || "waiting";
            const players = gameData.players || {};
            
            if (status !== "waiting" && !currentUser.isAdmin && !players[currentUser.id]) {
                alert("이미 게임이 진행 중입니다. 다음 판을 기다려주세요.");
                clearSession();
            } else {
                enterWaitingRoom();
            }
        });
    }
};

function toggleAuthMode(mode) {
    if (mode === 'signup') {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('signup-section').style.display = 'block';
    } else {
        document.getElementById('signup-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    }
}

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

function handleLogin() {
    const id = document.getElementById('login-id').value.trim();
    const pw = document.getElementById('login-pw').value.trim();

    if (id === 'admin' && pw === 'teacherpw') {
        currentUser = { id: 'admin', nick: '선생님', isAdmin: true };
        localStorage.setItem('mafia_session', JSON.stringify(currentUser));
        enterWaitingRoom();
        return;
    }

    // 로그인 시점에 진행 중인 게임 데이터 사전 대조
    getDb().ref('game').get().then((gameSnap) => {
        const gameData = gameSnap.val() || {};
        const currentStatusVal = gameData.status || "waiting";
        const players = gameData.players || {};

        // 게임이 시작되었는데 플레이어 명단에 없는 유저가 로그인을 시도할 때만 차단
        if (currentStatusVal !== "waiting" && !players[id]) {
            alert("이미 게임이 시작되어 진입할 수 없습니다. 관전자로 대기하거나 다음 판에 참여해 주세요.");
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

function enterWaitingRoom() {
    document.getElementById('auth-view').style.display = 'none';
    document.getElementById('waiting-view').style.display = 'block';
    document.getElementById('global-exit-btn').style.display = 'block';

    if (currentUser.isAdmin) {
        document.getElementById('admin-controls').style.display = 'block';
    }

    // [★버그 박멸 핵심] 대기방 상태일 때만 유저 노드를 새로 만듭니다. (진행 중 재접속 시 기존 데이터 보존)
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

    // 실시간 명단 갱신
    getDb().ref('game/players').on('value', (snapshot) => {
        if (!currentUser) return;
        const players = snapshot.val() || {};
        
        if (!currentUser.isAdmin && !players[currentUser.id] && currentStatus === 'waiting') {
            alert("교사에 의해 대기실에서 추방되었습니다.");
            clearSession();
            return;
        }

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

    // 글로벌 상태 전이 실시간 감시 파이프라인
    getDb().ref('game/status').on('value', (snapshot) => {
        currentStatus = snapshot.val() || 'waiting';
        if (currentStatus && currentStatus !== 'waiting') {
            if (typeof triggerGameViewTransition === 'function') {
                triggerGameViewTransition();
            }
        }
    });
}

window.serverKickPlayer = function(uid) {
    if (!currentUser || !currentUser.isAdmin) return;
    if (confirm("해당 학생을 대기실에서 영구 추방하시겠습니까?")) {
        getDb().ref(`game/players/${uid}`).remove();
    }
};

function handleExit() {
    if (!currentUser) return;
    const confirmExit = confirm("정말 이 방에서 나가시겠습니까?");
    if (!confirmExit) return;

    if (!currentUser.isAdmin) {
        getDb().ref(`game/players/${currentUser.id}`).remove().then(clearSession);
    } else {
        clearSession();
    }
}

function clearSession() {
    localStorage.removeItem('mafia_session');
    currentUser = null;
    location.reload(); 
}