/**
 * 4-2. phase-day-vote.js
 * 낮 토론 시간 투표 개시, 마감, 사형대 소환 및 처형/부활 최종 표결 제어기 (매개변수 오타 교정판)
 * [★수정] "투표 개시" 단계를 없애고, 낮(day_discuss)이면 언제든 자유롭게 지목 투표가
 * 가능하도록 변경했습니다. game/vote_state는 이제 'execution_trial'(재판 진행 중)이 아닌 한
 * 항상 지목 투표 가능 상태로 취급됩니다. 교사는 "투표 마감" 버튼만 누르면 됩니다.
 */

// 의심자 지목 투표 마감 및 동표 예외 처리 엔진
function serverFinishDayVote() {
    if (!currentUser || !currentUser.isAdmin) return;
    
    getDb().ref('game').get().then(snap => {
        const gameData = snap.val() || {};
        const players = gameData.players || {};
        const lastNightAssault = gameData.last_night_assault || "none";
        const currentRetry = gameData.day_vote_retry_count || 0;
        
        // game-mechanics.js의 순수 연산 코어 안전 호출 (득표수 계산)
        const result = calculateDayVoteResult(players, lastNightAssault, currentRetry);

        let updates = {};
        
        if (result.status === "retry") {
            // 1~2회차 동표 발생 시: 카운트를 누적하고 낮 투표를 다시 실시
            updates["game/day_vote_retry_count"] = result.nextRetry;
            updates["game/vote_state"] = 'voting'; 
            for (let id in players) { updates[`game/players/${id}/dayVote`] = "none"; }
            queuePopupAlert(updates, `🚨 최다 득표 동표가 발생하여 재투표를 실시합니다!\n(현재 ${result.nextRetry}회차 재투표 진행)`);
            
            getDb().ref().update(updates).then(() => {
                // 재투표판이 열렸으므로 AI 봇들도 다시 투표하도록 트리거
                if (typeof window.triggerAiAutomation === 'function') {
                    window.triggerAiAutomation('day_discuss', 'voting');
                }
            });
        } 
        else if (result.status === "forced_trial" || result.status === "success") {
            // 사형대 진출 후보가 결정된 경우 (성공 혹은 3회차 동표 강제 소환)
            const targetUid = result.candidate;
            
            // 만약 아무도 투표하지 않아 candidate가 "none"이면 바로 밤으로 스킵 처리 가드
            if (targetUid === "none") {
                updates['game/status'] = 'night_action';
                updates['game/vote_state'] = 'none';
                updates['game/morning_report'] = "낮 동안 아무도 투표하지 않아 사형대 재판 없이 밤이 되었습니다.";
                queuePopupAlert(updates, "낮 투표가 무표 처리되어 즉시 밤이 되었습니다.");
                
                getDb().ref().update(updates).then(() => {
                    if (typeof window.processDayToNightShamanSettlement === 'function') {
                        window.processDayToNightShamanSettlement({});
                    }
                });
                return;
            }

            // 정상적인 사형대 재판 진입 처리
            updates['game/vote_state'] = 'execution_trial';
            updates['game/target_on_trial'] = targetUid;
            updates['game/day_vote_retry_count'] = 0; 
            updates['game/trial_retry_count'] = 0; 
            
            // 찬반 재판을 위해 모든 학생의 선택지 초기화
            for (let id in players) { updates[`game/players/${id}/trialDecision`] = "none"; }
            
            getDb().ref().update(updates).then(() => {
                console.log(`🚨 최다 득표자 사형대 진입 완료: [${players[targetUid]?.nickname || '조회불가'}]`);
                
                // [★AI 연동] 사형대 판이 열렸으므로 AI 봇들이 무조건 '부활' 표결을 하도록 트리거합니다.
                if (typeof window.triggerAiAutomation === 'function') {
                    window.triggerAiAutomation('day_discuss', 'execution_trial');
                }
            });
        }
    }).catch(err => console.error("낮 투표 마감 처리 오류:", err));
}

// 사형대 진입자 최종 처형 / 무죄 부활 판정 정산기
function serverCalculateExecution() {
    if (!currentUser || !currentUser.isAdmin) return;
    
    getDb().ref('game').get().then(snap => {
        // [★오류 교정 완결] 콜백 매개변수인 snap 명칭에 맞게 오타를 완벽히 수정했습니다.
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
            // 찬반 동표 발생 시 찬반 재투표 실시
            updates['game/trial_retry_count'] = result.nextTRetry;
            for (let id in players) { updates[`game/players/${id}/trialDecision`] = "none"; }
            queuePopupAlert(updates, `🚨 처형/부활 동표(${result.exeCount}대${result.revCount}) 발생으로 인해 재판 찬반 재투표를 실시합니다!`);
            
            getDb().ref().update(updates).then(() => {
                if (typeof window.triggerAiAutomation === 'function') {
                    window.triggerAiAutomation('day_discuss', 'execution_trial');
                }
            });
            return;
        }

        let reports = [];
        let popupAlertText = ""; 
        const sideText = (targetUser.role === 'mafia' || targetUser.role === 'spy') ? "마피아 진영🔴" : "시민 진영⚪";

        if (result.isExecuted) {
            // [처형 확정 분기] 특수 직업(국회의원, 테러리스트) 면책 및 자폭 예외 처리 가드
            if (targetUser.role === 'assemblyman') {
                reports.push(`[최종 재판 결과] 처형 찬성 ${result.exeCount}표 / 부활 반대 ${result.revCount}표\n국회의원 면책특권 발동으로 [${targetUser.nickname}] 학생이 사형대에서 극적으로 생존했습니다!`);
                historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] (국회의원) 면책특권 생존`);
                popupAlertText = `국회의원 면책특권 발동으로 [${targetUser.nickname}] 학생이 부활하였습니다!`;
            } 
            else if (targetUser.role === 'terrorist') {
                updates[`game/players/${targetUid}/isAlive`] = false;
                updates[`game/players/${targetUid}/deathReason`] = "투표 처형";
                historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] (테러리스트) 투표 처형`);
                reports.push(`[최종 재판 결과] 처형 완료!\n[${targetUser.nickname}] 학생이 처형되었습니다. (${sideText} 소속)`);
                popupAlertText = `[${targetUser.nickname}] 학생은 처형되었습니다!\n(해당 학생은 ${sideText} 이었습니다.)`;

                // 테러리스트를 죽이는 데 동조한(처형 찬성표를 던진) 생존자 중 1명 길동무 자폭 추첨
                let AvengerPool = [];
                for (let id in players) {
                    if (players[id].dayVote === targetUid && players[id].trialDecision === 'execute' && players[id].isAlive && id !== targetUid) {
                        AvengerPool.push(id);
                    }
                }
                if (AvengerPool.length > 0) {
                    let randomVictimUid = AvengerPool[Math.floor(Math.random() * AvengerPool.length)];
                    updates[`game/players/${randomVictimUid}/isAlive`] = false;
                    updates[`game/players/${randomVictimUid}/deathReason`] = "테러 자폭";
                    historyLogs.push(`제 ${turn}회차 낮: [${players[randomVictimUid].nickname}] 테러 저격 복수 사망`);
                    reports.push(`💥 테러리스트의 논개 작전 자폭 발동!\n나를 사형대로 몬 [${players[randomVictimUid].nickname}] 학생을 물귀신처럼 끌고 동반 사망했습니다!`);
                    popupAlertText += `\n\n💥 테러리스트 자폭!\n나를 처형시킨 [${players[randomVictimUid].nickname}] 학생이 동반 사망했습니다!`;
                }
            } 
            else {
                // 일반적인 처형 성립
                updates[`game/players/${targetUid}/isAlive`] = false;
                updates[`game/players/${targetUid}/deathReason`] = "투표 처형";
                historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] 학생 투표 처형`);
                reports.push(`[최종 재판 결과] 처형 완료!\n[${targetUser.nickname}] 학생이 최종 처형되었습니다. (${sideText})`);
                popupAlertText = `[${targetUser.nickname}] 학생은 최종 처형되었습니다!\n(해당 학생은 ${sideText} 이었습니다.)`;
            }
        } else {
            // [부활 확정 분기] 무죄 방면
            reports.push(`[최종 재판 결과] 부활 반대보다 찬성이 많거나 동표 가드 규칙에 의해 [${targetUser.nickname}] 학생이 사형대에서 면제 부활하였습니다!`);
            historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] 재판 부활 성공`);
            popupAlertText = `과반수가 반대하거나 규칙 초과로 [${targetUser.nickname}] 학생이 부활하였습니다!`;
        }

        // 실시간 진영 머릿수 대조 기반 승리 판정 헬퍼 호출
        const victory = checkVictoryFaction(players, updates);
        
        if (victory !== "continue") {
            updates['game/status'] = 'game_over';
            updates['game/winner'] = victory;
            updates['game/morning_report'] = reports.join("\n");
        } else {
            // 게임이 계속된다면 정순 메커니즘에 따라 '밤' 상태로 전이합니다.
            updates['game/status'] = 'night_action'; 
            
            // 밤 상태로 진입하는 순간 상단 사회자 배너 문구를 밤 전용으로 강제 갱신합니다.
            updates['game/morning_report'] = "밤이 되었습니다. 마피아는 저격 대상을 지목하고, 특수 직업군은 고유 능력을 발동해 주세요.";
        }

        // 다음 날 깨끗한 활동을 위해 생존자들의 주간 행동 플래그 벌크 클리어
        for (let id in players) {
            updates[`game/players/${id}/dayVote`] = "none";
            updates[`game/players/${id}/trialDecision`] = "none";
            updates[`game/players/${id}/suspect`] = "none";
        }
        
        updates['game/history_logs'] = historyLogs;
        updates['game/vote_state'] = 'none';
        updates['game/target_on_trial'] = 'none';
        queuePopupAlert(updates, popupAlertText);
        updates['game/trial_retry_count'] = 0; 

        // 낮이 마감되어 밤으로 전환되는 바로 그 순간, 유령들의 투표를 무당에게 인계합니다.
        if (typeof window.processDayToNightShamanSettlement === 'function') {
            window.processDayToNightShamanSettlement(updates);
        } else {
            getDb().ref().update(updates);
        }
    });
}