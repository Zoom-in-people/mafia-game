/**
 * 2. auth.js
 * 유저 인증(로그인/회원가입), 중복 로그인 방지, 퇴장/튕김 후 재접속 세션 복구 총괄
 */

// 로그인 / 회원가입 UI 입력 탭 스위칭용 헬퍼
function switchAuthTab(type) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginBtn = document.getElementById('tab-login-btn');
    const registerBtn = document.getElementById('tab-register-btn');
    
    if (type === 'login') {
        if (loginForm) loginForm.style.display = 'block';
        if (registerForm) registerForm.style.display = 'none';
        if (loginBtn) loginBtn.classList.add('active');
        if (registerBtn) registerBtn.classList.remove('active');
    } else {
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'block';
        if (loginBtn) loginBtn.classList.remove('active');
        if (registerBtn) registerBtn.classList.add('active');
    }
}

// 회원가입 데이터베이스 등록 핸들러
function handleRegister() {
    const nickInput = document.getElementById('register-nickname');
    const pwInput = document.getElementById('register-password');
    if (!nickInput || !pwInput) return;

    const nick = nickInput.value.trim();
    const pw = pwInput.value.trim();

    if (!nick) return alert('회원가입하실 닉네임을 정확히 입력해 주세요.');
    if (nick.length > 8) return alert('닉네임은 최대 8자까지만 허용됩니다.');
    if (!pw) return alert('사용하실 패스워드를 입력해 주세요.');

    if (['교사', 'teacher', 'admin', '관리자'].includes(nick)) {
        return alert('해당 닉네임은 마스터 예약어로 회원가입할 수 없습니다.');
    }

    getDb().ref(`accounts/${nick}`).get().then((snapshot) => {
        if (snapshot.exists()) {
            return alert('이미 존재하는 닉네임입니다. 로그인 탭에서 로그인을 진행해 주세요.');
        }

        getDb().ref(`accounts/${nick}`).set({
            password: pw,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
            alert('회원가입이 정상 완료되었습니다! 로그인 탭으로 이동해 로그인해 주세요.');
            switchAuthTab('login');
            nickInput.value = '';
            pwInput.value = '';
        });
    }).catch(err => alert('회원가입 처리 중 데이터베이스 오류: ' + err.message));
}

// 정식 패스워드 대조식 로그인 및 세션 복구 처리 코어
function handleLogin() {
    const nickInput = document.getElementById('login-nickname');
    const pwInput = document.getElementById('login-password');
    if (!nickInput || !pwInput) return;

    const nick = nickInput.value.trim();
    const pw = pwInput.value.trim();

    if (!nick) return alert('닉네임을 입력해 주세요.');
    if (!pw) return alert('비밀번호를 입력해 주세요.');

    // 1. [교정 완료] 교사 마스터 권한 로그인 비밀번호 teacherpw 지정 매핑
    if (nick === '교사' || nick === 'teacher' || nick === 'admin') {
        if (pw === 'teacherpw') { 
            currentUser = { id: 'admin_master', nick: '교사(관전)', isAdmin: true };
            currentStatus = 'waiting';
            triggerGameViewTransition();
            return;
        } else {
            return alert('교사 마스터 패스워드가 올바르지 않습니다.');
        }
    }

    // 2. 일반 학생 가입 검증 및 세션 난입/튕김 방지 탐색 디텍터
    getDb().ref().get().then((rootSnap) => {
        const rootData = rootSnap.val() || {};
        const account = rootData.accounts?.[nick];
        const users = rootData.rooms?.users || {};
        const gamePlayers = rootData.game?.players || {};
        const gameStatus = rootData.game?.status || 'waiting';

        if (!account) {
            return alert('가입되지 않은 닉네임입니다. 먼저 회원가입을 완료해 주세요.');
        }
        if (account.password !== pw) {
            return alert('비밀번호가 일치하지 않습니다.');
        }

        let existingUid = null;
        let isAnActivePlayer = false;

        if (gameStatus !== 'waiting') {
            for (let uid in gamePlayers) {
                if (gamePlayers[uid].nickname === nick) {
                    existingUid = uid;
                    isAnActivePlayer = true;
                    break;
                }
            }
        }

        if (!existingUid) {
            for (let uid in users) {
                if (users[uid].nickname === nick) {
                    existingUid = uid;
                    break;
                }
            }
        }

        if (existingUid) {
            if (gameStatus !== 'waiting' && isAnActivePlayer) {
                currentUser = { id: existingUid, nick: nick, isAdmin: false };
                
                const restoreUpdates = {};
                restoreUpdates[`game/players/${existingUid}/isAiControlled`] = false; 
                restoreUpdates[`rooms/users/${existingUid}`] = { nickname: nick, joinedAt: firebase.database.ServerValue.TIMESTAMP };
                
                getDb().ref().update(restoreUpdates).then(() => {
                    console.log(`${nick} 학생 인게임 세션 원상 복구 및 난입 안착.`);
                    triggerGameViewTransition();
                });
            } else {
                alert('해당 계정은 이미 대기실에 로그인 상태로 접속 중입니다. 중복 진입은 거부됩니다.');
            }
        } else {
            if (gameStatus !== 'waiting') {
                return alert('이미 게임 세션이 가동 중이므로 새로 난입할 수 없습니다. 다음 판을 기다려 주세요.');
            }

            const newUid = 'stu_' + Math.random().toString(36).substr(2, 9);
            currentUser = { id: newUid, nick: nick, isAdmin: false };

            getDb().ref(`rooms/users/${newUid}`).set({
                nickname: nick,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            }).then(() => {
                triggerGameViewTransition();
            });
        }
    }).catch(err => alert('로그인 처리 중 데이터 통신 오류: ' + err.message));
}

// 자진 퇴장 버튼 클릭 핸들러
function handleExit() {
    if (!currentUser) return;
    const confirmExit = confirm("정말 이 방에서 나가시겠습니까? (나간 동안은 AI가 대신 진행합니다.)");
    if (!confirmExit) return;

    if (!currentUser.isAdmin) {
        const myUid = currentUser.id; 

        getDb().ref(`game/players/${myUid}`).update({
            isAiControlled: true
        }).then(() => {
            return getDb().ref(`rooms/users/${myUid}`).remove();
        }).then(() => {
            clearSession(); 
        }).catch(err => {
            console.error("퇴장 AI 이월 연산 중 예외 발생:", err);
            clearSession();
        });
    } else {
        clearSession();
    }
}

function clearSession() {
    currentUser = null;
    location.reload(); 
}