/**
 * 4-2. phase-day-vote.js
 * 낮 토론 시간 투표 개시, 마감, 사형대 소환 및 처형/부활 최종 표결 제어기
 */

// 낮 의심자 지목 투표 시작
function serverStartDayVote() {
    if (!currentUser || !currentUser.isAdmin) return;
    getDb().ref('game/players').get().then(snap => {
        const players = snap.val() || {};
        const updates = {};
        for (let id in players) {
            updates[`game/players/${id}/dayVote`] = "none";
            updates[`game/players/${id}/trialDecision`] = "none";
        }
        updates['game/vote_state'] = 'voting';
        getDb().ref().update(updates);
    });
}

// 의심자 지목 투표 마감 및 동표 예외 처리 엔진
function serverFinishDayVote() {
    if (!currentUser || !currentUser.isAdmin) return;
    getDb().ref('game').get().then(snap => {
        const gameData = snap.val() || {};
        const players = gameData.players || {};
        const lastNightAssault = gameData.last_night_assault || "none";
        const currentRetry = gameData.day_vote_retry_count || 0;
        
        // game-mechanics.js의 순수 연산 코어 안전 호출
        const result = calculateDayVoteResult(players, lastNightAssault, currentRetry);

        let updates = {};
        if (result.status === "retry") {
            updates["game/day_vote_retry_count"] = result.nextRetry;
            updates["game/vote_state"] = 'voting'; 
            for (let id in players) { updates[`game/players/${id}/dayVote`] = "none"; }
            updates['game/last_popup_alert_text'] = `🚨 최다 득표 동표가 발생하여 재투표를 실시합니다! (현재 ${result.nextRetry}회차 재투표)`;
        } else if (result.status === "forced_trial" || result.status === "success") {
            const targetUid = result.candidate;
            updates['game/vote_state'] = 'execution_trial';
            updates['game/target_on_trial'] = targetUid;
            updates['game/day_vote_retry_count'] = 0; 
            updates['game/trial_retry_count'] = 0; 
            
            for (let id in players) { updates[`game/players/${id}/trialDecision`] = "none"; }
        }

        getDb().ref().update(updates);
    });
}

// 사형대 진입자 최종 처형 / 무죄 부활 판정 정산기
function serverCalculateExecution() {
    if (!currentUser || !currentUser.isAdmin) return;
    getDb().ref('game').get().then(snap => {
        const gameData = snap.val() || {};
        const players = gameData.players || {};
        const targetUid = gameData.target_on_trial || "none";
        const targetUser = players[targetUid];
        const historyLogs = gameData.history_logs || [];
        const turn = gameData.turn || 1;
        const tRetry = gameData.trial_retry_count || 0;

        if (targetUid === "none" || !targetUser) return alert("재판대에 올라간 대상이 없습니다.");

        // game-mechanics.js의 찬반 판정 코어 호출
        const result = calculateTrialExecution(players, targetUid, tRetry);

        let updates = {};
        if (result.status === "retry") {
            updates['game/trial_retry_count'] = result.nextTRetry;
            for (let id in players) { updates[`game/players/${id}/trialDecision`] = "none"; }
            updates['game/last_popup_alert_text'] = `🚨 처형/부활 동표(${result.exeCount}대${result.revCount}) 발생으로 인해 재투표를 실시합니다!`;
            getDb().ref().update(updates);
            return;
        }

        let reports = [];
        let popupAlertText = ""; 
        const sideText = (targetUser.role === 'mafia' || targetUser.role === 'spy') ? "마피아 진영🔴" : "시민 진영⚪";

        if (result.isExecuted) {
            // 처형 처리 및 특수 능력(국회의원, 테러리스트) 가드 처리
            if (targetUser.role === 'assemblyman') {
                reports.push(`[최종 재판 결과] 처형 찬성 ${result.exeCount}표 / 부활 반대 ${result.revCount}표\n국회의원 면책특권 발동으로 [${targetUser.nickname}] 학생이 부활 생존했습니다!`);
                historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] (국회의원) 면책특권 생존`);
                popupAlertText = `국회의원 면책특권 발동으로 [${targetUser.nickname}] 학생이 부활하였습니다!`;
            } 
            else if (targetUser.role === 'terrorist') {
                updates[`game/players/${targetUid}/isAlive`] = false;
                updates[`game/players/${targetUid}/deathReason`] = "투표 처형";
                historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] (테러리스트) 투표 처형`);
                reports.push(`[최종 재판 결과] 처형 [${targetUser.nickname}] 학생 처형 완료! (${sideText} 소속)`);
                popupAlertText = `[${targetUser.nickname}] 학생은 처형되었습니다!\n(해당 학생은 ${sideText} 이었습니다.)`;

                let AvengerPool = [];
                for (let id in players) {
                    if (players[id].dayVote === targetUid && players[id].trialDecision === 'execute' && players[id].isAlive) {
                        AvengerPool.push(id);
                    }
                }
                if (AvengerPool.length > 0) {
                    let randomVictimUid = AvengerPool[Math.floor(Math.random() * AvengerPool.length)];
                    updates[`game/players/${randomVictimUid}/isAlive`] = false;
                    updates[`game/players/${randomVictimUid}/deathReason`] = "테러 자폭";
                    historyLogs.push(`제 ${turn}회차 낮: [${players[randomVictimUid].nickname}] 테러 저격 복수 사망`);
                    reports.push(`💥 테러리스트 자폭!\n나를 처형시킨 [${players[randomVictimUid].nickname}] 학생이 동반 사망했습니다!`);
                    popupAlertText += `\n\n💥 테러리스트 자폭!\n나를 처형시킨 [${players[randomVictimUid].nickname}] 학생이 동반 사망했습니다!`;
                }
            } 
            else {
                updates[`game/players/${targetUid}/isAlive`] = false;
                updates[`game/players/${targetUid}/deathReason`] = "투표 처형";
                historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] 학생 투표 처형`);
                reports.push(`[최종 재판 결과] 처형 완료!\n[${targetUser.nickname}] 학생이 최종 처형되었습니다. (${sideText})`);
                popupAlertText = `[${targetUser.nickname}] 학생은 최종 처형되었습니다!\n(해당 학생은 ${sideText} 이었습니다.)`;
            }
        } else {
            reports.push(`[최종 재판 결과] 부활 찬성이 많아 [${targetUser.nickname}] 학생이 사형대에서 면제 부활하였습니다!`);
            historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] 재판 부활 성공`);
            popupAlertText = `과반수가 반대하거나 동표 기준 초과로 [${targetUser.nickname}] 학생이 부활하였습니다!`;
        }

        // 승리 판정 헬퍼 호출
        const victory = checkVictoryFaction(players, updates);
        if (victory !== "continue") {
            updates['game/status'] = 'game_over';
            updates['game/winner'] = victory;
        } else {
            updates['game/status'] = 'night_action'; // 밤으로 상태 전이
        }

        for (let id in players) {
            updates[`game/players/${id}/dayVote`] = "none";
            updates[`game/players/${id}/trialDecision`] = "none";
            updates[`game/players/${id}/suspect`] = "none";
        }
        
        updates['game/morning_report'] = reports.join("\n");
        updates['game/history_logs'] = historyLogs;
        updates['game/vote_state'] = 'none';
        updates['game/target_on_trial'] = 'none';
        updates['game/last_popup_alert_text'] = popupAlertText;
        updates['game/trial_retry_count'] = 0; 

        // [★정산 동기화 핵심 연동] 낮이 완전히 끝나는 직후, 유령들의 투표 데이터를 취합해 무당 일지에 선제 백킹 처리합니다.
        window.processDayToNightShamanSettlement(updates);
    });
}