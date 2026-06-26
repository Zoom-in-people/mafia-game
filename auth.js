/**
 * 2. auth.js
 * 유저 인증, 중복 로그인 방지 가드 및 자진 퇴장 시 AI 대타 스위칭 총괄 (오류 교정 완결판)
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
            saveSessionToLocal(currentUser);
            triggerGameViewTransition();
            return;
        } else {
            return alert('비밀번호가 일치하지 않습니다.');
        }
    }

    // 2. [교정] 진행 중인 게임 명단(game/players)과 대기실 명단(rooms/users)을 모두 조회하여 세션 복구 및 난입을 제어합니다.
    getDb().ref().get().then((rootSnap) => {
        const rootData = rootSnap.val() || {};
        const users = rootData.rooms?.users || {};
        const gamePlayers = rootData.game?.players || {};
        const gameStatus = rootData.game?.status || 'waiting';

        let existingUid = null;
        let isAnActivePlayer = false;

        // 진행 중인 게임 명단에서 먼저 닉네임 검색 (나가기 눌렀던 유저 세션 복구 타겟팅)
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
            // [버그 2 해결] 나갔던 유저가 동일 닉네임 재접속 시 정확하게 대타 해제 후 인게임 싱크 복귀
            if (gameStatus !== 'waiting' && isAnActivePlayer) {
                currentUser = { id: existingUid, nick: nick, isAdmin: false };
                saveSessionToLocal(currentUser);
                
                const restoreUpdates = {};
                restoreUpdates[`game/players/${existingUid}/isAiControlled`] = false;
                restoreUpdates[`rooms/users/${existingUid}`] = { nickname: nick, joinedAt: firebase.database.ServerValue.TIMESTAMP };
                
                getDb().ref().update(restoreUpdates).then(() => {
                    console.log(`${nick} 학생 인게임 복귀 및 AI 대타 제어권 회수 완료.`);
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
            saveSessionToLocal(currentUser);

            getDb().ref(`rooms/users/${newUid}`).set({
                nickname: nick,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            }).then(() => {
                triggerGameViewTransition();
            });
        }
    }).catch(err => alert('접속 처리 오류: ' + err.message));
}

// 자진 퇴장 버튼 클릭 시 중복 분열 원천 차단 핸들러
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

function saveSessionToLocal(userObj) {
    try {
        localStorage.setItem('mafia_user_session', JSON.stringify(userObj));
    } catch (e) {
        console.error("로컬 스토리지 저장 실패:", e);
    }
}

// [★버그 1 해결] 자동 로그인 체크 시 대기실 단계와 인게임 단계를 분기하여 새로고침 튕김 현상 전면 박멸
function checkAutoLogin() {
    const saved = localStorage.getItem('mafia_user_session');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.id) {
                currentUser = parsed;
                
                if (currentUser.isAdmin) {
                    triggerGameViewTransition();
                    return;
                }

                // 현재 게임 세션 상태(status)를 선제적으로 긁어와 대조합니다.
                getDb().ref('game/status').get().then((statusSnap) => {
                    const gameStatus = statusSnap.val() || 'waiting';

                    if (gameStatus === 'waiting') {
                        // 1. 게임 시작 전 대기실 상태라면 rooms/users에 내가 여전히 유효한지 검증
                        getDb().ref(`rooms/users/${currentUser.id}`).get().then((userSnap) => {
                            if (userSnap.exists()) {
                                triggerGameViewTransition();
                            } else {
                                clearSession();
                            }
                        });
                    } else {
                        // 2. 게임이 진행 중이라면 game/players에서 내 카드를 복원하고 대타 해제
                        getDb().ref(`game/players/${currentUser.id}`).get().then((snap) => {
                            if (snap.exists()) {
                                getDb().ref(`game/players/${currentUser.id}`).update({
                                    isAiControlled: false
                                }).then(() => {
                                    triggerGameViewTransition();
                                });
                            } else {
                                clearSession();
                            }
                        });
                    }
                }).catch(() => clearSession());
            }
        } catch (e) {
            clearSession();
        }
    }
}

function clearSession() {
    localStorage.removeItem('mafia_user_session');
    currentUser = null;
    location.reload(); 
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof checkAutoLogin === 'function') {
        checkAutoLogin();
    }
});