/**
 * 2. auth.js
 * 유저 인증 및 중복 로그인 방지, 퇴장/튕김 후 재로그인 시 세션 연동 총괄 (자동로그인 전면 폐지 버전)
 */

// 대기실 진입 및 로그인 처리 코어
function enterWaitingRoom() {
    const nicknameInput = document.getElementById('user-nickname');
    if (!nicknameInput) return;
    
    const nick = nicknameInput.value.trim();
    if (!nick) return alert('사용하실 닉네임을 입력해 주세요.');
    if (nick.length > 8) return alert('닉네임은 최대 8자까지만 가능합니다.');

    // 1. 교사 계정 특수 진입 가드
    if (nick === '교사' || nick === 'teacher' || nick === 'admin') {
        const password = prompt('교사 패널 진입 비밀번호를 입력하세요:');
        if (password === '1234') { 
            currentUser = { id: 'admin_master', nick: '교사(관전)', isAdmin: true };
            currentStatus = 'waiting';
            triggerGameViewTransition();
            return;
        } else {
            return alert('비밀번호가 일치하지 않습니다.');
        }
    }

    // 2. 일반 학생 진영 중복 검증 및 재로그인 복구 체인
    getDb().ref().get().then((rootSnap) => {
        const rootData = rootSnap.val() || {};
        const users = rootData.rooms?.users || {};
        const gamePlayers = rootData.game?.players || {};
        const gameStatus = rootData.game?.status || 'waiting';

        let existingUid = null;
        let isAnActivePlayer = false;

        // 진행 중인 게임 명단에서 먼저 닉네임 검색 (튕겨서 첫 화면에서 다시 로그인하려는 학생 유저 타겟팅)
        if (gameStatus !== 'waiting') {
            for (let uid in gamePlayers) {
                if (gamePlayers[uid].nickname === nick) {
                    existingUid = uid;
                    isAnActivePlayer = true;
                    break;
                }
            }
        }

        // 게임 중이 아니라면 대기실 명단에서 중복 검색
        if (!existingUid) {
            for (let uid in users) {
                if (users[uid].nickname === nick) {
                    existingUid = uid;
                    break;
                }
            }
        }

        if (existingUid) {
            // [교정] 튕긴 아이가 첫 화면에서 기존 본인 닉네임을 치고 '다시 로그인' 했을 때 게임 정보를 복구하여 난입시키는 로직
            if (gameStatus !== 'waiting' && isAnActivePlayer) {
                currentUser = { id: existingUid, nick: nick, isAdmin: false };
                
                const restoreUpdates = {};
                restoreUpdates[`game/players/${existingUid}/isAiControlled`] = false;
                restoreUpdates[`rooms/users/${existingUid}`] = { nickname: nick, joinedAt: firebase.database.ServerValue.TIMESTAMP };
                
                getDb().ref().update(restoreUpdates).then(() => {
                    console.log(`${nick} 학생 재로그인을 통한 인게임 복귀 완료.`);
                    triggerGameViewTransition();
                });
            } else {
                // 게임 시작 전 대기실 상태에서 중복인 경우
                alert('이미 대기실에 존재하는 닉네임입니다. 다른 이름으로 접속해 주세요.');
            }
        } else {
            // 완전히 새로운 유저 등록 시 중간 난입 차단 가드
            if (gameStatus !== 'waiting') {
                return alert('이미 게임이 시작되어 새로 참여할 수 없습니다. 다음 판을 기다려주세요.');
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
    }).catch(err => alert('접속 처리 오류: ' + err.message));
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
            console.log(`${currentUser.nick} 학생 AI 대타 모드 전환 성공.`);
            return getDb().ref(`rooms/users/${myUid}`).remove();
        }).then(() => {
            clearSession(); 
        }).catch(err => {
            console.error("퇴장 AI 전환 중 예외 발생:", err);
            clearSession();
        });
    } else {
        clearSession();
    }
}

// 세션 파기 및 첫 화면(로그인) 리셋
function clearSession() {
    currentUser = null;
    // 브라우저 기억 장치(localStorage)를 쓰지 않으므로, 새로고침 시 무조건 첫 로그인 화면이 깨끗하게 뜨게 됩니다.
    location.reload(); 
}