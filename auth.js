/**
 * 2. auth.js
 * 유저 인증(로그인/회원가입), 중복 로그인 방지, 퇴장/튕김 후 재접속 세션 복구 총괄 (설명 가이드 완결판)
 */

// [★기능 교정 완결] 임의 안내 문구를 철폐하고 시스템 백엔드와 100% 일치하는 정식 규칙 일람표를 전역 사출합니다.
window.showRoleDescriptions = function() {
    const guideText = `🕵️‍♂️ [교실 마피아 인게임 직업 가이드] 🕵️‍♂️\n\n` +
        `🔴 마피아 진영\n` +
        `- 마피아: 밤마다 저격 대상을 지목하여 처단합니다.\n` +
        `- 스파이: 밤에 지목한 유저의 정체를 조사하며, 마피아를 조사하면 비밀 무전 채널이 성공적으로 연결됩니다.\n\n` +
        `⚪ 시민 과학 탐정단 진영\n` +
        `- 선량한 시민: 특별한 고유 능력은 없으나 투표를 통해 마피아를 검거합니다.\n` +
        `- 명의사: 밤마다 마피아의 공격으로부터 생존자 1명을 지정하여 수호(치료)합니다.\n` +
        `- 열혈경찰: 밤마다 지목한 유저가 마피아 진영(레드)인지 시민 진영(화이트)인지 판별합니다.\n` +
        `- 사립탐정: 밤마다 지목한 대상 학생이 누구에게 고유 능력을 발동했는지 그 동선을 역추적합니다.\n` +
        `- 신내림 무당: 밤에 기도를 올릴 대상을 지목하면, 다음 날 낮에 사망한 유령들이 해당 대상의 진짜 진영을 감별 투표해 줍니다.\n` +
        `- 강철군인: 마피아의 공격을 최초 1회 완전히 무력화(방어)할 수 있는 면역 목숨(총 2라이프)을 가집니다.\n` +
        `- 국회의원: 낮 투표 처형대에 소환되어 처형 판결을 받아도 면책특권이 자동 발동하여 1회 즉시 무죄 부활합니다.\n` +
        `- 테러리스트: 낮에 억울하게 투표 처형당하거나 밤에 마피아에게 저격당할 때, 자신을 해한 대상 풀 중 1명을 무작위로 추첨해 길동무 자폭 처단합니다.\n` +
        `- 뒷골목 건달: 밤에 지목한 대상을 협박 폭행하여 다음 날 낮 투표 시간 동안 투표권을 완전히 박탈합니다.\n` +
        `- 사랑꾼 연인: 항상 2명이 고정 배정되며, 연인 중 한 명이 마피아에게 저격을 받으면 다른 연인이 대신 몸을 던져 대리 사망 희생을 합니다.`;
    alert(guideText);
};

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

function handleLogin() {
    const nickInput = document.getElementById('login-nickname');
    const pwInput = document.getElementById('login-password');
    if (!nickInput || !pwInput) return;

    const nick = nickInput.value.trim();
    const pw = pwInput.value.trim();

    if (!nick) return alert('닉네임을 입력해 주세요.');
    if (!pw) return alert('비밀번호를 입력해 주세요.');

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
                if (uid !== 'admin_master' && users[uid] && users[uid].nickname === nick) {
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