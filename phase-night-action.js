/**
 * 4-3. phase-night-action.js
 * 낮 종료 시 유령 투표 취합 전송 및 야간 특수 직업 연산 브리핑 제어기 (설명문구 버그 교정판)
 */

// 2회차 낮 유령 감별 결과를 2회차 밤 무당이 바로 읽을 수 있도록 즉시 파싱 정산
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
            
            let finalGhostVerdict = "판별 유보 (유령 투표 없음)";
            if (citizenVotes > mafiaVotes) finalGhostVerdict = "시민 편⚪";
            else if (mafiaVotes > citizenVotes) finalGhostVerdict = "마피아 편🔴";
            else if (citizenVotes > 0 && citizenVotes === mafiaVotes) finalGhostVerdict = "의견 대립 (동표)";

            for (let id in players) {
                if (players[id].role === 'mudang' && players[id].isAlive) {
                    let mLog = (players[id].personalLog === "none") ? "" : (players[id].personalLog || "");
                    let shamanLogLine = `[제 ${currentTurnVal}회차 밤 영혼의 제보] 낮 동안 유령들이 투표한 결과, [${players[lastShamanTargetUid].nickname}] 학생은 '${finalGhostVerdict}' 진영 소속이라고 합니다.`;
                    updates[`game/players/${id}/personalLog`] = mLog ? `${mLog}\n${shamanLogLine}` : shamanLogLine;
                }
            }
        }

        updates['game/shaman_ghost_votes'] = null;
        getDb().ref().update(updates);
    }).catch(err => console.error("무당 인계 파이프라인 오류:", err));
};

// 교사용 밤 종료 마감 처리 라우터
function handleNextStage() {
    if (!currentUser || !currentUser.isAdmin) return;
    getDb().ref('game/status').get().then(snap => {
        if (snap.val() === 'day_discuss') {
            // [★버그 해결 1-1] 낮 토론에서 밤으로 넘어가는 "즉시" 상단 알림 배너 문구를 밤에 알맞게 강제 교체합니다.
            const initialUpdates = { 
                'game/status': 'night_action',
                'game/morning_report': "밤이 되었습니다. 마피아는 저격 대상을 지목하고, 특수 직업군은 고유 능력을 발동해 주세요."
            };
            window.processDayToNightShamanSettlement(initialUpdates);
        } else {
            processNightActions();
        }
    });
    window.triggerAiAutomation('night_action', 'none');
}

function processNightActions() {
    getDb().ref('game').get().then((snapshot) => {
        const gameData = snapshot.val() || {};
        const players = gameData.players || {};
        const currentTurnVal = gameData.turn || 1; 
        const historyLogs = gameData.history_logs || [];

        let reports = []; let deadList = []; const updates = {};
        let mafiaTargets = {}; let protectedUid = "none";
        let spyTargetUid = "none"; let gangsterTargetUid = "none";

        for (let id in players) {
            const p = players[id];
            if (!p.isAlive) continue;
            if (p.role === 'mafia' && p.nightTarget && p.nightTarget !== 'none') mafiaTargets[p.nightTarget] = (mafiaTargets[p.nightTarget] || 0) + 1;
            if (p.role === 'doctor' && p.nightTarget && p.nightTarget !== 'none') protectedUid = p.nightTarget;
            if (p.role === 'spy' && p.nightTarget && p.nightTarget !== 'none') spyTargetUid = p.nightTarget;
            if (p.role === 'gangster' && p.nightTarget && p.nightTarget !== 'none') gangsterTargetUid = p.nightTarget;
        }

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

        let maxM = 0; let finalMTarget = "none";
        for (let t in mafiaTargets) { if (mafiaTargets[t] > maxM) { maxM = mafiaTargets[t]; finalMTarget = t; } }

        if (finalMTarget !== "none" && finalMTarget !== protectedUid) {
            const targetUser = players[finalMTarget];
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
                    reports.push(`테러리스트의 폭사 반격으로 마피아[${players[deadMafia].nickname}]와 테러리스트[${targetUser.nickname}]가 동반 사망했습니다.`);
                }
            } else if (targetUser.role === 'lovers') {
                let substituteUid = "none";
                for (let id in players) { if (players[id].role === 'lovers' && id !== finalMTarget && players[id].isAlive) { substituteUid = id; break; } }
                if (substituteUid !== "none") {
                    deadList.push(substituteUid); updates[`game/players/${substituteUid}/deathReason`] = "연인 대신 희생";
                    reports.push(`마피아가 연인을 습격했으나, 다른 연인이 대신 몸을 던져 사망했습니다.`);
                } else {
                    deadList.push(finalMTarget); updates[`game/players/${finalMTarget}/deathReason`] = "마피아 피습";
                    reports.push(`홀로 남은 연인 [${targetUser.nickname}] 학생이 피습을 받아 사망했습니다.`);
                }
            } else {
                deadList.push(finalMTarget); updates[`game/players/${finalMTarget}/deathReason`] = "마피아 피습";
                reports.push(`밤사이 참혹한 피습 사건으로 [${targetUser.nickname}] 학생이 사망했습니다.`);
            }
        } else if (finalMTarget !== "none" && finalMTarget === protectedUid) {
            reports.push(`의사의 헌신적인 수호 덕분에 밤사이 아무도 다치지 않았습니다.`);
        } else {
            reports.push(`밤사이에 평화로운 정적만이 흘렀습니다.`);
        }

        if (gangsterTargetUid !== "none" && players[gangsterTargetUid]) {
            reports.push(`🥊 건달의 폭행으로 [${players[gangsterTargetUid].nickname}] 학생은 오늘 낮 투표권이 박탈됩니다!`);
            updates['game/last_night_assault'] = gangsterTargetUid;
        } else { updates['game/last_night_assault'] = "none"; }

        let morningSuspectCounts = {};
        for (let id in players) {
            const sId = players[id].suspect;
            if (sId && sId !== "none" && players[sId] && players[sId].isAlive) {
                const sNick = players[sId].nickname; morningSuspectCounts[sNick] = (morningSuspectCounts[sNick] || 0) + 1;
            }
        }

        deadList.forEach(d => {
            updates[`game/players/${d}/isAlive`] = false;
            historyLogs.push(`제 ${currentTurnVal}회차 밤: [${players[d].nickname}] 사망 (${updates[`game/players/${d}/deathReason`]})`);
        });
        if (deadList.length === 0) historyLogs.push(`제 ${currentTurnVal}회차 밤: 아무도 사망하지 않음`);

        const victory = checkVictoryFaction(players, updates);
        if (victory !== "continue") {
            updates['game/status'] = 'game_over'; updates['game/winner'] = victory;
        } else {
            updates['game/status'] = 'day_discuss'; 
        }

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