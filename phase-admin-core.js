/**
 * 4-1. phase-admin-core.js
 * 교사 권한 기반 게임 시작, 세션 리셋 제어 및 학생 회원 정보 삭제/수정/대기실 추방 오퍼레이터
 */

window.serverKickUser = function(uid) {
    if (!currentUser || !currentUser.isAdmin) return;
    
    if (confirm("⚠️ 선택한 학생을 실시간 대기실에서 즉시 원격 추방 조치하시겠습니까?")) {
        getDb().ref(`rooms/users/${uid}`).remove().then(() => {
            alert("선택한 유저를 대기실 방 명단에서 무결하게 추방했습니다.");
        }).catch(err => alert("추방 실패 원인: " + err.message));
    }
};

window.handleDeleteAccount = function(nick) {
    if (!currentUser || !currentUser.isAdmin) return;
    
    if (confirm(`⚠️ 정말로 [ ${nick} ] 학생의 계정을 데이터베이스에서 완전히 영구 삭제하시겠습니까?`)) {
        getDb().ref(`accounts/${nick}`).remove().then(() => {
            alert(`[${nick}] 학생의 영구 회원가입 원본 데이터가 파기되었습니다.`);
        }).catch(err => alert('삭제 실패: ' + err.message));
    }
};

window.handleModifyAccount = function(nick) {
    if (!currentUser || !currentUser.isAdmin) return;
    
    const newPw = prompt(`📝 [ ${nick} ] 학생에게 부여할 새로운 비밀번호를 입력해 주세요:`);
    if (newPw === null) return; 
    
    const trimmedPw = newPw.trim();
    if (!trimmedPw) return alert('공백 문자로만 이루어진 패스워드는 주입할 수 없습니다.');

    getDb().ref(`accounts/${nick}/password`).set(trimmedPw).then(() => {
        alert(`[${nick}] 학생의 비밀번호 원격 갱신이 완료되었습니다.`);
    }).catch(err => alert('수정 실패: ' + err.message));
};

// [★버그 전면 교정] 멈춰버린 28인 직업 할당 난수 셔플 파이프라인 무결성 복구
function handleStartGame() {
    if (!currentUser || !currentUser.isAdmin) return;

    getDb().ref('rooms/users').get().then((snapshot) => {
        const users = snapshot.val() || {};
        const uids = Object.keys(users);
        const total = uids.length;

        if (total < 1) return alert('게임에 참여할 학생이 최소 1명 이상 필요합니다.');

        let rolePool = [];
        const mafiaCount = parseInt(document.getElementById('cfg-mafia').value) || 1;
        for (let i = 0; i < mafiaCount; i++) rolePool.push("mafia");

        if (document.getElementById('cfg-lovers').checked) {
            rolePool.push("lovers"); rolePool.push("lovers");
        }

        const singleRoles = ["spy", "detective", "mudang", "police", "doctor", "soldier", "assemblyman", "terrorist", "gangster"];
        singleRoles.forEach(roleId => {
            const chk = document.getElementById(`cfg-${roleId}`);
            if (chk && chk.checked) rolePool.push(roleId);
        });

        if (rolePool.length > total) {
            alert(`[알림] 특수직업 정원이 많아 접속 인원에 맞춰 분배됩니다.`);
            rolePool = rolePool.slice(0, total);
        }

        while (rolePool.length < total) {
            rolePool.push("citizen");
        }

        for (let i = rolePool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rolePool[i], rolePool[j]] = [rolePool[j], rolePool[i]];
        }

        const updates = {};
        uids.forEach((uid, index) => {
            updates[`game/players/${uid}/nickname`] = users[uid].nickname;
            updates[`game/players/${uid}/role`] = rolePool[index];
            updates[`game/players/${uid}/isAlive`] = true;
            updates[`game/players/${uid}/isAiControlled`] = false; 
            updates[`game/players/${uid}/nightTarget`] = "none";
            updates[`game/players/${uid}/suspect`] = "none";
            updates[`game/players/${uid}/dayVote`] = "none";
            updates[`game/players/${uid}/soldierLife`] = 2;
            updates[`game/players/${uid}/personalLog`] = "none";
            updates[`game/players/${uid}/deathReason`] = "none";
            updates[`game/players/${uid}/trialDecision`] = "none";
        });

        updates['game/status'] = 'day_discuss'; 
        updates['game/vote_state'] = 'none';
        updates['game/target_on_trial'] = 'none';
        updates['game/turn'] = 1;
        updates['game/morning_report'] = "첫 번째 아침이 밝았습니다. 자유롭게 토론하고 마피아를 추적하세요.";
        updates['game/quiz_score'] = 0;
        updates['game/current_hint'] = "없음";
        updates['game/last_night_suspects'] = "none";
        updates['game/history_logs'] = ["게임이 흥미진진하게 시작되었습니다!"];
        updates['game/last_night_assault'] = "none";
        updates['game/last_popup_alert_text'] = "none";
        updates['game/shaman_target_uid'] = "none";
        updates['game/shaman_ghost_votes'] = "none";
        updates['game/day_vote_retry_count'] = 0;
        updates['game/trial_retry_count'] = 0;

        adminRevealMap = {}; 
        
        getDb().ref().update(updates);
    });
}

window.handleForceStopGame = function() {
    if (!currentUser || !currentUser.isAdmin) return;
    if (confirm("진행 중인 게임을 강제로 파기하고 대기실로 리셋하시겠습니까?")) {
        handleResetToWaiting();
    }
};

function handleResetToWaiting() {
    getDb().ref('game/players').get().then((snapshot) => {
        const players = snapshot.val() || {};
        const updates = {};

        for (let id in players) {
            updates[`rooms/users/${id}`] = {
                nickname: players[id].nickname,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            };
        }

        updates['game/status'] = 'waiting';
        updates['game/players'] = null; 
        updates['game/turn'] = 1;
        updates['game/vote_state'] = 'none';
        updates['game/target_on_trial'] = 'none';
        updates['game/current_hint'] = "없음";
        updates['game/last_night_suspects'] = "none";
        updates['game/history_logs'] = ["교사에 의해 새로운 대기실 세션이 강제 리셋되었습니다."];
        updates['game/last_night_assault'] = "none";
        updates['game/last_popup_alert_text'] = "none";
        updates['game/shaman_target_uid'] = "none";
        updates['game/shaman_ghost_votes'] = "none";
        updates['game/day_vote_retry_count'] = 0;
        updates['game/trial_retry_count'] = 0;

        getDb().ref().update(updates).then(() => {
            currentQuiz = null;
            isInAdminAccountsView = false;
            if (typeof window.rerenderAllUI === 'function') {
                window.rerenderAllUI();
            }
        });
    });
}