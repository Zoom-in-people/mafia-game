/**
 * 2. auth.js
 * 로그인, 회원가입, 세션 보전 및 대기실(인원 리스너 / 강제 추방 / 나가기) 관리
 */

// 페이지 로드 시 기존 로그인 세션이 있다면 자동 대기실 진입
window.onload = function() {
    const savedUser = localStorage.getItem('mafia_session');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        enterWaitingRoom();
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

// 닉네임 중복을 원천 차단하는 회원가입 프로세스
function handleSignup() {
    const id = document.getElementById('signup-id').value.trim();
    const pw = document.getElementById('signup-pw').value.trim();
    const nick = document.getElementById('signup-nick').value.trim();

    if (!id || !pw || !nick) return alert('모든 필드를 입력해 주세요.');
    if (id === 'admin') return alert('admin 이라는 아이디는 생성 불가합니다.');

    // 전체 계정을 조회하여 닉네임 중복 체크 가드 작동
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
            // 중복 통과 시 가입 처리
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

// 로그인 처리 및 교사 마스터 권한 부여
function handleLogin() {
    const id = document.getElementById('login-id').value.trim();
    const pw = document.getElementById('login-pw').value.trim();

    // 교사용 마스터 계정 바인딩
    if (id === 'admin' && pw === 'teacherpw') {
        currentUser = { id: 'admin', nick: '선생님', isAdmin: true };
        localStorage.setItem('mafia_session', JSON.stringify(currentUser));
        enterWaitingRoom();
        return;
    }

    // 학생 계정 검증
    getDb().ref(`accounts/${id}`).get().then((snapshot) => {
        if (snapshot.exists() && snapshot.val().pw === pw) {
            currentUser = { id: id, nick: snapshot.val().nick, isAdmin: false };
            localStorage.setItem('mafia_session', JSON.stringify(currentUser));
            enterWaitingRoom();
        } else {
            alert('아이디 또는 비밀번호를 다시 확인해 주세요.');
        }
    });
}

// 대기실 진입 및 실시간 학생 명단 갱신 리스너
function enterWaitingRoom() {
    document.getElementById('auth-view').style.display = 'none';
    document.getElementById('waiting-view').style.display = 'block';
    document.getElementById('global-exit-btn').style.display = 'block';

    // 교사 로그인 시 세팅 컨트롤러 노출
    if (currentUser.isAdmin) {
        document.getElementById('admin-controls').style.display = 'block';
    }

    // 학생 로그인 시 대기실 DB 노드에 참가 기록 등록/초기화
    if (!currentUser.isAdmin) {
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

    // 실시간 접속 인원 및 명단 동적 동기화 리스너 (.on)
    getDb().ref('game/players').on('value', (snapshot) => {
        if (!currentUser) return;
        const players = snapshot.val() || {};
        
        // 실시간 추방 감지 가드 (내가 명단에서 지워졌다면 즉시 추방 처리)
        if (!currentUser.isAdmin && !players[currentUser.id]) {
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
            // 교사 계정에게만 추방 버튼 활성화 및 인라인 바인딩
            const kickElement = currentUser.isAdmin ? `<button class="kick-btn" onclick="serverKickPlayer('${id}')" style="margin-left: 10px; padding: 2px 8px; background-color: #c62828; font-size: 11px; width: auto;">추방</button>` : "";
            playerListContainer.innerHTML += `<div class="player-card" style="padding: 8px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;"><span>${player.nickname}</span>${kickElement}</div>`;
        }
        
        const countDisp = document.getElementById('player-count');
        if (countDisp) countDisp.innerText = count;
    });

    // 이미 진행 중인 게임이 있다면 도중에 새로고침해도 인게임 뷰로 강제 전환
    getDb().ref('game/status').get().then((snap) => {
        const s = snap.val();
        if (s && s !== 'waiting') {
            if (typeof triggerGameViewTransition === 'function') {
                triggerGameViewTransition();
            }
        }
    });
}

// 교사용 학생 강제 추방 액션 함수
window.serverKickPlayer = function(uid) {
    if (!currentUser || !currentUser.isAdmin) return;
    if (confirm("해당 학생을 대기실에서 영구 추방하시겠습니까?")) {
        getDb().ref(`game/players/${uid}`).remove().then(() => {
            alert("추방 처리가 완료되었습니다.");
        });
    }
};

// 방 나가기 버튼 공통 처리
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

// 로컬 세션 제거 후 새로고침 초기화
function clearSession() {
    localStorage.removeItem('mafia_session');
    currentUser = null;
    location.reload(); 
}