/**
 * 4-3. phase-night-action.js
 * 낮 종료 시 유령 투표 취합 전송 및 야간 특수 직업 연산 브리핑 제어기 (AI 동기화 완전체)
 */

// 낮 동안 축적된 유령들의 진영 감별 투표 결과를 밤이 시작되는 순간 무당의 일지에 주입 정산
window.processDayToNightShamanSettlement = function(parentUpdates) {
    getDb().ref('game').get().then(snapshot => {
        const gameData = snapshot.val() || {};
        const players = gameData.players || {};
        const currentTurnVal = gameData.turn || 1;
        const lastShamanTargetUid = gameData.shaman_target_uid || "none";
        const ghostVotes = gameData.shaman_ghost_votes || {}; 

        const updates = parentUpdates || {};

        if (lastShamanTargetUid !== "none" && players[lastShamanTargetUid]) {
            let citizenVotes = 0; let mafiaVotes = 0;

            Object.entries(ghostVotes).forEach(([gId, side]) => {
                if (side === 'citizen_side') citizenVotes++;
                if (side === 'mafia_side') mafiaVotes++;
            });
            
            // [★수정 반영] 죽은 사람이 단 한 명도 없거나 유령 투표가 전무할 때와 동표 의견 대립 상황의 예외 처리 분기 구축
            let deadCount = Object.values(players).filter(p => !p.isAlive).length;
            let shamanLogLine = "";

            if (deadCount === 0 || (citizenVotes === 0 && mafiaVotes === 0)) {
                shamanLogLine = "무당에게 영혼의 제보 결과를 유령이 없어 확인이 불가했습니다.";
            } else if (citizenVotes === mafiaVotes) {
                shamanLogLine = `[제 ${currentTurnVal}회차 밤 영혼의 제보] 낮 동안 유령들이 투표한 결과, [${players[lastShamanTargetUid].nickname}] 학생은 '의견 대립 (동일한 투표결과)' 입니다.`;
            } else {
                let finalGhostVerdict = "";
                if (citizenVotes > mafiaVotes) finalGhostVerdict = "시민 편⚪";
                else if (mafiaVotes > citizenVotes) finalGhostVerdict = "마피아 편🔴";
                shamanLogLine = `[제 ${currentTurnVal}회차 밤 영혼의 제보] 낮 동안 유령들이 투표한 결과, [${players[lastShamanTargetUid].nickname}] 학생은 '${finalGhostVerdict}' 진영 소속이라고 합니다.`;
            }

            for (let id in players) {
                if (players[id].role === 'mudang' && players[id].isAlive) {
                    let mLog = (players[id].personalLog === "none") ? "" : (players[id].personalLog || "");
                    updates[`game/players/${id}/personalLog`] = mLog ? `${mLog}\n${shamanLogLine}` : shamanLogLine;
                }
            }
        }

        // 유령 투표소 초기화
        updates['game/shaman_ghost_votes'] = null;
        
        // 데이터 업로드 완료 후 안전하게 AI 오토메이션 트리거 가동
        getDb().ref().update(updates).then(() => {
            if (updates['game/status'] === 'night_action' && typeof window.triggerAiAutomation === 'function') {
                window.triggerAiAutomation('night_action', 'none');
            }
        });
    }).catch(err => console.error("무당 인계 파이프라인 오류:", err));
};

// 교사용 패널의 "밤으로 단계 이동" 수동 라우터 버튼 핸들러
function handleNextStage() {
    if (!currentUser || !currentUser.isAdmin) return;
    getDb().ref('game/status').get().then(snap => {
        if (snap.val() === 'day_discuss') {
            // [★수정 반영] 낮 자유 토론에서 밤으로 전이 시 일반 시민의 참여 독려 지침 문구를 완벽하게 매핑 주입합니다.
            const initialUpdates = { 
                'game/status': 'night_action',
                'game/morning_report': "밤이 되었습니다. 마피아는 저격 대상을 지목하고, 특수 직업군은 고유 능력을 발동해 주세요. 일반 시민과 밤에 능력이 없는 직업군은 마피아로 의심되는 사람을 선택해주세요."
            };
            window.processDayToNightShamanSettlement(initialUpdates);
        } else {
            // 현재가 밤(night_action) 상태라면 밤을 끝내고 아침 정산 실행
            processNightActions();
        }
    });
}

// 밤 종료 및 아침 브리핑 연산 코어 엔진
function processNightActions() {
    getDb().ref('game').get().then((snapshot) => {
        const gameData = snapshot.val() || {};
        const players = gameData.players || {};
        const currentTurnVal = gameData.turn || 1; 
        const historyLogs = gameData.history_logs || [];

        let reports = []; let deadList = []; const updates = {};
        let mafiaTargets = {}; let protectedUid = "none";
        let spyTargetUid = "none"; let gangsterTargetUid = "none";
        let nextShamanTargetUid = "none"; 

        // 1. 밤사이 활동한 살아있는 직업군들의 타겟팅 데이터 전수 취합
        for (let id in players) {
            const p = players[id];
            if (!p.isAlive) continue;
            if (p.role === 'mafia' && p.nightTarget && p.nightTarget !== 'none') mafiaTargets[p.nightTarget] = (mafiaTargets[p.nightTarget] || 0) + 1;
            if (p.role === 'doctor' && p.nightTarget && p.nightTarget !== 'none') protectedUid = p.nightTarget;
            if (p.role === 'spy' && p.nightTarget && p.nightTarget !== 'none') spyTargetUid = p.nightTarget;
            if (p.role === 'gangster' && p.nightTarget && p.nightTarget !== 'none') gangsterTargetUid = p.nightTarget;
            if (p.role === 'mudang' && p.nightTarget && p.nightTarget !== 'none') nextShamanTargetUid = p.nightTarget;
        }

        // 다음날 낮에 유령들이 참조할 수 있도록 무당의 기도를 데이터베이스에 각인
        updates['game/shaman_target_uid'] = nextShamanTargetUid;

        // 2. 경찰 및 탐정의 비밀 수사 실시간 결과 보고서 작성 및 개인 로그 주입
        for (let id in players) {
            const p = players[id];
            if (!p.isAlive || p.nightTarget === "none" || !players[p.nightTarget]) continue;
            const t = players[p.nightTarget];
            let line = ""; let currentLog = p.personalLog === "none" ? "" : (p.personalLog || "");

            if (p.role === 'police') {
                const isMafiaSide = (t.role === 'mafia' || t.role === 'spy');
                line = `[${currentTurnVal}일차 밤] [${t.nickname}] 조사 -> ${isMafiaSide ? '마피아 진영🔴' : '시민 진영⚪'}`;
            }
            if (p.role === 'detective') line = `[${currentTurnVal}일차 밤] [${t.nickname}] 추적 -> 지목 타겟 [${players[t.nightTarget]?.nickname || '없음'}]`;
            
            if (line) updates[`game/players/${id}/personalLog`] = currentLog ? `${currentLog}\n${line}` : line;
        }

        // 3. 스파이의 비밀 조사 및 마피아 합동 무전 채널 결과 보고 가공
        if (spyTargetUid !== "none" && players[spyTargetUid]) {
            const spyT = players[spyTargetUid];
            let spyIdentityResult = spyT.role === 'mafia' ? "마피아입니다." : (spyT.role === 'citizen' ? "시민입니다." : "직업이 있습니다.");
            let spyContactBonusText = "";
            if (spyT.role === 'mafia') {
                let actualSpyNick = "스파이";
                for (let sId in players) { if (players[sId].role === 'spy') { actualSpyNick = players[sId].nickname; break; } }
                spyContactBonusText = `\n🔥 [접선성공] 스파이는 [${actualSpyNick}]입니다.`;
            }
            for (let id in players) {
                if (players[id].role === 'mafia' || players[id].role === 'spy') {
                    let mLog = (players[id].personalLog === "none") ? "" : (players[id].personalLog || "");
                    let spySecureLine = `[${currentTurnVal}일차 밤 스파이제보] [${spyT.nickname}] 학생은 '${spyIdentityResult}'${spyContactBonusText}`;
                    updates[`game/players/${id}/personalLog`] = mLog ? `${mLog}\n${spySecureLine}` : spySecureLine;
                }
            }
        }

        // 4. 마피아의 총구 조준선 최종 확정 계산
        let maxM = 0; let finalMTarget = "none";
        for (let t in mafiaTargets) { if (mafiaTargets[t] > maxM) { maxM = mafiaTargets[t]; finalMTarget = t; } }

        // 5. 피습 타겟 유저와 방어 직업군(의사, 군인, 연인, 테러리스트) 간의 상호작용 예외 처리 연산
        if (finalMTarget !== "none" && finalMTarget !== protectedUid) {
            const targetUser = players[finalMTarget];
            if (targetUser) {
                if (targetUser.role === 'soldier' && targetUser.soldierLife > 1) {
                    updates[`game/players/${finalMTarget}/soldierLife`] = 1;
                    reports.push(`🪖 군인 [${targetUser.nickname}]이 기습을 방패로 막아냈습니다.`);
                } else if (targetUser.role === 'terrorist') {
                    deadList.push(finalMTarget); updates[`game/players/${finalMTarget}/deathReason`] = "마피아 피습";
                    let mafiaIds = [];
                    for (let mId in players) { if (players[mId].role === 'mafia' && players[mId].isAlive) mafiaIds.push(mId); }
                    if (mafiaIds.length > 0) {
                        let deadMafia = mafiaIds[Math.floor(Math.random() * mafiaIds.length)];
                        deadList.push(deadMafia); updates[`game/players/${deadMafia}/deathReason`] = "테러 자폭";
                        reports.push(`💣 테러리스트의 폭사 반격으로 마피아 [${players[deadMafia].nickname}]와 테러리스트 [${targetUser.nickname}]가 동반 사망했습니다.`);
                    }
                } else if (targetUser.role === 'lovers') {
                    let substituteUid = "none";
                    for (let id in players) { if (players[id].role === 'lovers' && id !== finalMTarget && players[id].isAlive) { substituteUid = id; break; } }
                    if (substituteUid !== "none") {
                        deadList.push(substituteUid); updates[`game/players/${substituteUid}/deathReason`] = "연인 대신 희생";
                        // [★수정 반영] 피습 유저와 수호 희생 연인의 실시간 동적 닉네임 치환 규칙 보강
                        reports.push(`연인 [${targetUser.nickname}]을 습격했으나, 다른 연인[${players[substituteUid].nickname}]이 대신 몸을 던져 사망했습니다.`);
                    } else {
                        deadList.push(finalMTarget); updates[`game/players/${finalMTarget}/deathReason`] = "마피아 피습";
                        reports.push(`💔 홀로 남은 연인 [${targetUser.nickname}] 학생이 피습을 받아 사망했습니다.`);
                    }
                } else {
                    deadList.push(finalMTarget); updates[`game/players/${finalMTarget}/deathReason`] = "마피아 피습";
                    reports.push(`💀 밤사이 참혹한 피습 사건으로 [${targetUser.nickname}] 학생이 사망했습니다.`);
                }
            }
        } else if (finalMTarget !== "none" && finalMTarget === protectedUid) {
            reports.push(`🕊️ 의사의 헌신적인 수호 덕분에 밤사이 아무도 다치지 않았습니다.`);
        } else {
            reports.push(`💤 밤사이에 평화로운 정적만이 흘렀습니다.`);
        }

        // 6. 건달의 폭행 결과 정산
        if (gangsterTargetUid !== "none" && players[gangsterTargetUid]) {
            reports.push(`🥊 건달의 폭행으로 [${players[gangsterTargetUid].nickname}] 학생은 오늘 낮 투표권이 박탈됩니다!`);
            updates['game/last_night_assault'] = gangsterTargetUid;
        } else { updates['game/last_night_assault'] = "none"; }

        // 7. 생존자들의 야간 간이 투표(의심자 마킹 지목) 수치 취합
        let morningSuspectCounts = {};
        for (let id in players) {
            const sId = players[id].suspect;
            if (sId && sId !== "none" && players[sId] && players[sId].isAlive) {
                const sNick = players[sId].nickname; morningSuspectCounts[sNick] = (morningSuspectCounts[sNick] || 0) + 1;
            }
        }

        // 8. 사망자 최종 노드 플래그 업데이트 및 연대기 히스토리 축적
        deadList.forEach(d => {
            updates[`game/players/${d}/isAlive`] = false;
            historyLogs.push(`제 ${currentTurnVal}회차 밤: [${players[d].nickname}] 사망 (${updates[`game/players/${d}/deathReason`]})`);
        });
        if (deadList.length === 0) historyLogs.push(`제 ${currentTurnVal}회차 밤: 아무도 사망하지 않음`);

        // 9. 마피아 vs 시민 연합 최종 승리 조건 검증 (game-mechanics.js 연동)
        const victory = checkVictoryFaction(players, updates);
        if (victory !== "continue") {
            updates['game/status'] = 'game_over'; updates['game/winner'] = victory;
        } else {
            updates['game/status'] = 'day_discuss'; 
        }

        // 10. 다음 날 정순 활동을 위한 임시 야간 버퍼 플래그 벌크 청소
        for (let id in players) {
            updates[`game/players/${id}/nightTarget`] = "none";
            updates[`game/players/${id}/dayVote`] = "none";
            updates[`game/players/${id}/suspect`] = "none";
        }
        
        const nightSummaryReportText = reports.join("\n");
        updates['game/morning_report'] = nightSummaryReportText;
        updates['game/last_popup_alert_text'] = `[아침 알림 - 밤사이 사건 브리핑]\n\n${nightSummaryReportText}`;
        updates['game/turn'] = currentTurnVal + 1;
        updates['game/quiz_score'] = 0;
        updates['game/current_hint'] = "없음";
        updates['game/last_night_suspects'] = Object.keys(morningSuspectCounts).length > 0 ? morningSuspectCounts : "none";
        updates['game/history_logs'] = historyLogs;
        updates['game/vote_state'] = 'none';

        getDb().ref().update(updates);
    });
}