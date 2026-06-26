/**
 * 4-1. phase-admin-core.js
 * 교사 권한 기반 게임 시작(직업 난수 분배) 및 세션 리셋 제어기 (동기화 버그 완결판)
 */

// 교사 게임 시작 버튼 클릭 시 직업 난수 분배 및 게임 세션 개시
function handleStartGame() {
    if (!currentUser || !currentUser.isAdmin) return;

    // [★버그 1 해결] 대기실에 정상 접속해 있는 학생 명단(rooms/users)을 기준으로 게임을 개시합니다.
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

        // Fisher-Yates 무작위 직업 셔플 알고리즘
        for (let i = rolePool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rolePool[i], rolePool[j]] = [rolePool[j], rolePool[i]];
        }

        const updates = {};
        uids.forEach((uid, index) => {
            // [★닉네임 연동] 대기실 유저의 닉네임을 인게임 노드로 1:1 안전하게 복사 이월합니다.
            updates[`game/players/${uid}/nickname`] = users[uid].nickname;
            updates[`game/players/${uid}/role`] = rolePool[index];
            updates[`game/players/${uid}/isAlive`] = true;
            updates[`game/players/${uid}/isAiControlled`] = false; // 최초 시작 시에는 본인 제어
            updates[`game/players/${uid}/nightTarget`] = "none";
            updates[`game/players/${uid}/suspect`] = "none";
            updates[`game/players/${uid}/dayVote`] = "none";
            updates[`game/players/${uid}/soldierLife`] = 2;
            updates[`game/players/${uid}/personalLog`] = "none";
            updates[`game/players/${uid}/deathReason`] = "none";
            updates[`game/players/${uid}/trialDecision`] = "none";
        });

        updates['game/status'] = 'day_discuss'; // 정순 타임라인에 따라 첫 낮 토론으로 진입
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

// 교사 권한 기반 게임방 강제 정지 및 대기실 원상복구 초기화 라우터
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

        // [★버그 2 해결] 대기실 리셋 시, 현재 인게임에 접속해 있는 유저들을 대기방 명단으로 다시 원상복구 이월합니다.
        // 이 처리가 선행되어야 auth.js의 자동 리스토어 엔진이 작동하여 로그인창으로 강제 탈출당하지 않습니다.
        for (let id in players) {
            updates[`rooms/users/${id}`] = {
                nickname: players[id].nickname,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            };
        }

        // 기존 판의 인게임 라이브 데이터 아카이브 초기 청소
        updates['game/status'] = 'waiting';
        updates['game/players'] = null; // 인게임 데이터 트리 초기화
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
            location.reload(); // 싱크를 완벽히 일치시키기 위해 전체 클라이언트 강제 리비전
        });
    });
}