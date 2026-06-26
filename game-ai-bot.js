/**
 * 3-2. game-ai-bot.js
 * 이탈 유저 감지, AI 대타 스위칭 및 직업별 야간/주간 자동 투표 오토메이션 엔진
 */

// [세션 유지 핵심] 로그인 및 대기실 진입 시 기존 인게임 참여 이력 스캔 (auth.js 보완 연동)
function checkAndRestoreSession(uid) {
    return getDb().ref(`game/players/${uid}`).get().then((snap) => {
        if (snap.exists()) {
            // 게임 도중 재접속한 학생: AI 제어권을 박탈하고 플레이어 복귀 처리
            return getDb().ref(`game/players/${uid}`).update({
                isAiControlled: false
            }).then(() => true);
        }
        return false;
    });
}

// [AI 가동] 교사가 낮 투표 개시 혹은 밤 정산 종료 버튼을 누를 때 봇 시스템 자동 호출
window.triggerAiAutomation = function(status, voteState) {
    getDb().ref('game').get().then((snapshot) => {
        const gameData = snapshot.val() || {};
        const players = gameData.players || {};
        const lastNightAssault = gameData.last_night_assault || "none";
        const updates = {};

        // 살아있는 AI 대타 봇들만 추출
        const aiPlayers = Object.entries(players).filter(([id, p]) => p.isAlive && p.isAiControlled);
        const allAlivePlayers = Object.entries(players).filter(([id, p]) => p.isAlive);

        if (aiPlayers.length === 0) return;

        // 분기 1: 낮 자유 투표 시간 (랜덤 지목)
        if (status === 'day_discuss' && voteState === 'voting') {
            aiPlayers.forEach(([aiId, aiData]) => {
                if (aiId === lastNightAssault) return; // 건달에게 폭행당했다면 패스
                
                // 나를 제외한 살아있는 유저 중 랜덤 추첨
                const targets = allAlivePlayers.filter(([id, _]) => id !== aiId);
                if (targets.length > 0) {
                    const randomTarget = targets[Math.floor(Math.random() * targets.length)][0];
                    updates[`game/players/${aiId}/dayVote`] = randomTarget;
                }
            });
        }
        
        // 분기 2: 사형대 찬반 재판 시간 (무조건 부활 서명 고정)
        else if (status === 'day_discuss' && voteState === 'execution_trial') {
            aiPlayers.forEach(([aiId, _]) => {
                // 규칙에 의거 AI 봇들은 무조건 '부활(revive)'을 선택
                updates[`game/players/${aiId}/trialDecision`] = 'revive';
            });
        }
        
        // 분기 3: 밤 능력 발동 시간 (직업별 조건부 오토 타겟팅)
        else if (status === 'night_action') {
            aiPlayers.forEach(([aiId, aiData]) => {
                const role = aiData.role || "citizen";
                let targets = [];

                if (role === 'doctor') {
                    // 의사: 나를 포함해 살아있는 아무나 살리기
                    targets = allAlivePlayers;
                } else if (role === 'mafia') {
                    // 마피아: 마피아 팀(mafia, spy)을 제외한 살아있는 유저 저격
                    targets = allAlivePlayers.filter(([_, p]) => p.role !== 'mafia' && p.role !== 'spy');
                } else if (role === 'gangster') {
                    // 건달: 자신을 제외하고 살아있는 유저 아무나 협박
                    targets = allAlivePlayers.filter(([id, _]) => id !== aiId);
                } else if (role === 'spy') {
                    // 스파이: 자신을 제외하고 살아있는 유저 아무나 선택 비밀 조사
                    targets = allAlivePlayers.filter(([id, _]) => id !== aiId);
                } else {
                    // 그 외 모든 직업(시민, 경찰, 탐정 등): 나를 제외한 아무나 랜덤 선택
                    targets = allAlivePlayers.filter(([id, _]) => id !== aiId);
                }

                if (targets.length > 0) {
                    const chosenTargetUid = targets[Math.floor(Math.random() * targets.length)][0];
                    
                    // 시민 계열은 suspect 노드에, 특수 직업군은 nightTarget 노드에 적재
                    if (['citizen', 'lovers', 'soldier', 'assemblyman'].includes(role)) {
                        updates[`game/players/${aiId}/suspect`] = chosenTargetUid;
                    } else {
                        updates[`game/players/${aiId}/nightTarget`] = chosenTargetUid;
                    }
                }
            });
        }

        if (Object.keys(updates).length > 0) {
            getDb().ref().update(updates);
        }
    });
};