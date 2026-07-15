/**
 * 3-2. game-ai-bot.js
 * 이탈 유저 감지, AI 대타 스위칭 및 직업별 야간/주간 자동 투표 오토메이션 엔진 (레이스 컨디션 교정판)
 */

// [세션 유지 코어] 유저가 재접속했을 때 AI 모드를 해제하고 복귀시키는 함수
function checkAndRestoreSession(uid) {
    return getDb().ref(`game/players/${uid}`).get().then((snap) => {
        if (snap.exists() && snap.val().isAiControlled) {
            return getDb().ref(`game/players/${uid}`).update({
                isAiControlled: false
            }).then(() => true);
        }
        return false;
    }).catch(err => {
        console.error("세션 복구 스캔 중 예외 발생:", err);
        return false;
    });
}

// [AI 핵심 트리거] 교사가 단계를 전환할 때마다 호출되어 AI 봇들의 대리 투표/행동을 연산합니다.
window.triggerAiAutomation = function(status, voteState) {
    // [★버그 완벽 해결 가드] 교사의 데이터 리셋 명령이 서버에 먼저 안착할 수 있도록 0.2초의 안정화 유예 시간을 부여합니다.
    setTimeout(() => {
        getDb().ref('game').get().then((snapshot) => {
            const gameData = snapshot.val() || {};
            const players = gameData.players || {};
            const lastNightAssault = gameData.last_night_assault || "none"; 
            const updates = {};

            // 1. 현재 살아있으면서 AI 제어 상태(isAiControlled: true)인 봇들만 필터링
            const aiPlayers = Object.entries(players).filter(([id, p]) => p.isAlive && p.isAiControlled);
            // 2. 현재 생존해 있는 모든 플레이어 명단 추출 (타겟용)
            const allAlivePlayers = Object.entries(players).filter(([id, p]) => p.isAlive);

            // 대리 연산할 AI가 없다면 즉시 종료
            if (aiPlayers.length === 0) return;

            // -------------------------------------------------------------
            // [분기 1] 낮 의심자 자유 투표 시간
            // [★수정] "투표 개시" 단계가 사라졌으므로, 재판(execution_trial) 중이 아니라면
            // 낮 동안 언제든 AI도 자유롭게 지목 투표를 하도록 조건을 완화했습니다.
            // -------------------------------------------------------------
            if (status === 'day_discuss' && voteState !== 'execution_trial') {
                aiPlayers.forEach(([aiId, aiData]) => {
                    if (aiId === lastNightAssault) return; // 건달에게 폭행당했다면 낮 투표 패스
                    
                    // 규칙: 자신을 제외하고 살아있는 아무나 랜덤으로 선택하여 투표
                    const targets = allAlivePlayers.filter(([id, _]) => id !== aiId);
                    if (targets.length > 0) {
                        const randomTargetUid = targets[Math.floor(Math.random() * targets.length)][0];
                        updates[`game/players/${aiId}/dayVote`] = randomTargetUid;
                    }
                });
            }
            
            // -------------------------------------------------------------
            // [분기 2] 사형대 최종 재판 시간 (execution_trial)
            // -------------------------------------------------------------
            else if (status === 'day_discuss' && voteState === 'execution_trial') {
                aiPlayers.forEach(([aiId, _]) => {
                    // 규칙: AI 봇들은 무조건 '부활(revive)'을 선택하도록 고정
                    updates[`game/players/${aiId}/trialDecision`] = 'revive';
                });
            }
            
            // -------------------------------------------------------------
            // [분기 3] 밤 능력 발동 시간 (night_action)
            // -------------------------------------------------------------
            else if (status === 'night_action') {
                aiPlayers.forEach(([aiId, aiData]) => {
                    const role = aiData.role || "citizen";
                    let targets = [];

                    if (role === 'doctor') {
                        targets = allAlivePlayers; // 의사: 나 포함 랜덤 힐
                    } else if (role === 'mafia') {
                        targets = allAlivePlayers.filter(([_, p]) => p.role !== 'mafia' && p.role !== 'spy'); // 마피아: 시민 진영만 조준
                    } else if (role === 'gangster') {
                        targets = allAlivePlayers.filter(([id, _]) => id !== aiId); // 건달: 타인 랜덤 협박
                    } else if (role === 'spy') {
                        targets = allAlivePlayers.filter(([id, _]) => id !== aiId); // 스파이: 타인 랜덤 조사
                    } else {
                        targets = allAlivePlayers.filter(([id, _]) => id !== aiId); // 기타 직업군
                    }

                    if (targets.length > 0) {
                        const chosenTargetUid = targets[Math.floor(Math.random() * targets.length)][0];
                        
                        if (['citizen', 'lovers', 'soldier', 'assemblyman'].includes(role)) {
                            updates[`game/players/${aiId}/suspect`] = chosenTargetUid;
                        } else {
                            updates[`game/players/${aiId}/nightTarget`] = chosenTargetUid;
                        }
                    }
                });
            }

            // 안전하게 리셋이 완료된 깨끗한 판 위에 AI 마킹 데이터를 최종 덮어씌웁니다.
            if (Object.keys(updates).length > 0) {
                getDb().ref().update(updates).then(() => {
                    console.log(`🤖 [AI 오토메이션] 교사 제어 신호 수신 후 안정적 대리 마킹 완료.`);
                });
            }
        });
    }, 200); 
};