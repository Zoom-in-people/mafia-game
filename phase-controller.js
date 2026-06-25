/**
 * 4. phase-controller.js
 * 교사용 토론/투표 제어 및 낮/밤 타이머/단계 전환 총괄 컨트롤러
 */

// [★교사용 핵심 복구] 🎬 게임 시작 버튼 클릭 시 직업 난수 분배 및 게임 세션 개시
function handleStartGame() {
    if (!currentUser || !currentUser.isAdmin) return;

    getDb().ref('game/players').get().then((snapshot) => {
        const players = snapshot.val() || {};
        const uids = Object.keys(players);
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
            updates[`game/players/${uid}/role`] = rolePool[index];
            updates[`game/players/${uid}/isAlive`] = true;
            updates[`game/players/${uid}/nightTarget`] = "none";
            updates[`game/players/${uid}/suspect`] = "none";
            updates[`game/players/${uid}/dayVote`] = "none";
            updates[`game/players/${uid}/soldierLife`] = 2;
            updates[`game/players/${uid}/personalLog`] = "none";
            updates[`game/players/${uid}/deathReason`] = "none";
            updates[`game/players/${uid}/trialDecision`] = "none";
        });

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
        
        getDb().ref().update(updates).then(() => {
            getDb().ref('game/status').set('day_discuss');
        });
    });
}

// [교사용 액션] 🚨 게임 강제 종료
window.handleForceStopGame = function() {
    if (!currentUser || !currentUser.isAdmin) return;
    if (confirm("진행 중인 게임을 강제로 파기하고 대기실로 리셋하시겠습니까?")) {
        handleResetToWaiting();
    }
};

// [교사용 액션] 🗳️ 학생 낮 의심자 투표 개시
function serverStartDayVote() {
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

// [교사용 액션] 📊 투표 마감 및 최다 득표자 사형대 소환
function serverFinishDayVote() {
    getDb().ref('game').get().then(snap => {
        const gameData = snap.val() || {};
        const players = gameData.players || {};
        const lastNightAssault = gameData.last_night_assault || "none";
        const currentRetry = gameData.day_vote_retry_count || 0;
        
        // game-mechanics.js의 순수 연산 코어 호출
        const result = calculateDayVoteResult(players, lastNightAssault, currentRetry);

        let updates = {};
        if (result.status === "retry") {
            updates["game/day_vote_retry_count"] = result.nextRetry;
            updates["game/vote_state"] = 'voting'; 
            for (let id in players) {
                updates[`game/players/${id}/dayVote`] = "none";
            }
        } else if (result.status === "forced_trial" || result.status === "success") {
            const targetUid = result.candidate;
            updates['game/vote_state'] = 'execution_trial';
            updates['game/target_on_trial'] = targetUid;
            updates['game/day_vote_retry_count'] = 0; 
            updates['game/trial_retry_count'] = 0; 
            
            for (let id in players) {
                updates[`game/players/${id}/trialDecision`] = "none";
            }
        }

        getDb().ref().update(updates);
    });
}

// [교사용 액션] ⚖️ 처형/부활 찬반 표결 최종 확정 및 사망 처리
function serverCalculateExecution() {
    getDb().ref('game').get().then(snap => {
        const gameData = snap.val() || {};
        const players = gameData.players || {};
        const targetUid = gameData.target_on_trial || "none";
        const targetUser = players[targetUid];
        const historyLogs = gameData.history_logs || [];
        const turn = gameData.turn || 1;
        const tRetry = gameData.trial_retry_count || 0;

        if (targetUid === "none" || !targetUser) return alert("재판대에 올라간 대상이 없습니다.");

        let exeCount = 0; let revCount = 0;
        for (let id in players) {
            if (players[id].trialDecision === 'execute') exeCount++;
            if (players[id].trialDecision === 'revive') revCount++;
        }

        if (exeCount === revCount && (exeCount > 0 || revCount > 0)) {
            const nextTRetry = tRetry + 1;
            if (nextTRetry < 3) {
                const updates = {};
                updates['game/trial_retry_count'] = nextTRetry;
                for (let id in players) {
                    updates[`game/players/${id}/trialDecision`] = "none";
                }
                updates['game/last_popup_alert_text'] = `🚨 찬성/반대 동표(${exeCount}대${revCount}) 발생으로 인해 재투표를 실시합니다! (재시도: ${nextTRetry}/2회)`;
                getDb().ref().update(updates);
                return;
            } else {
                exeCount = 0; revCount = 999; 
            }
        }

        let reports = []; let updates = {};
        let popupAlertText = ""; 
        const sideText = (targetUser.role === 'mafia' || targetUser.role === 'spy') ? "마피아 진영🔴" : "시민 진영⚪";

        if (exeCount > revCount) {
            if (targetUser.role === 'assemblyman') {
                reports.push(`[최종 재판 결과] 찬성 ${exeCount}표 / 반대 ${revCount}표\n국회의원 면책특권 발동으로 [${targetUser.nickname}] 학생이 부활 생존했습니다!`);
                historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] (국회의원) 면책특권 생존`);
                popupAlertText = `[최종 재판 결과]\n처형 찬성: ${exeCount}표 / 부활 반대: ${revCount}표\n국회의원 면책특권 발동으로 [${targetUser.nickname}] 학생이 부활하였습니다!`;
            } 
            else if (targetUser.role === 'terrorist') {
                updates[`game/players/${targetUid}/isAlive`] = false;
                updates[`game/players/${targetUid}/deathReason`] = "투표 처형";
                historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] (테러리스트) 투표 처형`);
                reports.push(`[최종 재판 결과] 찬성 ${exeCount}표 / 반대 ${revCount}표\n[${targetUser.nickname}] 학생은 처형되었습니다! (해당 학생은 ${sideText} 이었습니다.)`);
                popupAlertText = `[최종 재판 결과]\n처형 찬성: ${exeCount}표 / 부활 반대: ${revCount}표\n[${targetUser.nickname}] 학생은 처형되었습니다!\n(해당 학생은 ${sideText} 이었습니다.)`;

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
                    reports.push(`💥 테러리스트 자폭 복수 발동!\n나를 지목하고 처형을 누른 [${players[randomVictimUid].nickname}] 학생이 동반 사망했습니다!`);
                    popupAlertText += `\n\n💥 테러리스트 자폭 복수 발동!\n나를 지목하고 처형을 누른 [${players[randomVictimUid].nickname}] 학생이 동반 사망했습니다!`;
                }
            } 
            else {
                updates[`game/players/${targetUid}/isAlive`] = false;
                updates[`game/players/${targetUid}/deathReason`] = "투표 처형";
                historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] 학생 투표 처형`);
                reports.push(`[최종 재판 결과] 찬성 ${exeCount}표 / 반대 ${revCount}표\n[${targetUser.nickname}] 학생은 최종 처형되었습니다! (해당 학생은 ${sideText} 이었습니다.)`);
                popupAlertText = `[최종 재판 결과]\n처형 찬성: ${exeCount}표 / 부활 반대: ${revCount}표\n[${targetUser.nickname}] 학생은 최종 처형되었습니다!\n(해당 학생은 ${sideText} 이었습니다.)`;
            }
        } else {
            reports.push(`[최종 재판 결과] 찬성 ${exeCount}표 / 반대 ${revCount}표\n과반수(혹은 동표 규정)에 의해 [${targetUser.nickname}] 학생이 사형대에서 무죄 부활(방면)하였습니다!`);
            historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] 찬반 재판 부활 면제 성공`);
            popupAlertText = `[최종 재판 결과]\n처형 찬성: ${exeCount}표 / 부활 반대: ${revCount}표\n과반수가 반대하거나 동표 기준 초과로 [${targetUser.nickname}] 학생이 부활하였습니다!`;
        }

        let aliveMafia = 0; let aliveCitizen = 0;
        for (let id in players) {
            let stillAlive = players[id].isAlive;
            if (updates[`game/players/${id}/isAlive`] === false) stillAlive = false;
            if (stillAlive) {
                if (players[id].role === 'mafia') aliveMafia++; else aliveCitizen++;
            }
        }

        if (aliveMafia === 0) {
            updates['game/status'] = 'game_over'; updates['game/winner'] = 'citizen_win';
        } else if (aliveMafia >= aliveCitizen) {
            updates['game/status'] = 'game_over'; updates['game/winner'] = 'mafia_win';
        } else {
            updates['game/status'] = 'night_action'; 
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
        updates['game/shaman_ghost_votes'] = "none";
        updates['game/trial_retry_count'] = 0; 

        getDb().ref().update(updates);
    });
}

// [교사용 액션] 단계 이동 처리 핸들러
function handleNextStage() {
    if (!currentUser || !currentUser.isAdmin) return;
    getDb().ref('game/status').get().then(snap => {
        if (snap.val() === 'day_discuss') {
            getDb().ref('game/status').set('night_action');
        } else {
            processNightActions();
        }
    });
}

function processNightActions() {
    getDb().ref('game').get().then((snapshot) => {
        const gameData = snapshot.val() || {};
        const players = gameData.players || {};
        const currentTurnVal = gameData.turn || 1; 
        const historyLogs = gameData.history_logs || [];
        const ghostVotes = gameData.shaman_ghost_votes || {};
        const lastShamanTargetUid = gameData.shaman_target_uid || "none";

        let reports = []; let deadList = []; const updates = {};
        let mafiaTargets = {}; let protectedUid = "none";
        let spyTargetUid = "none"; let gangsterTargetUid = "none"; let nextShamanTargetUid = "none"; 

        for (let id in players) {
            const p = players[id];
            if (!p.isAlive) continue;
            if (p.role === 'mafia' && p.nightTarget && p.nightTarget !== 'none') mafiaTargets[p.nightTarget] = (mafiaTargets[p.nightTarget] || 0) + 1;
            if (p.role === 'doctor' && p.nightTarget && p.nightTarget !== 'none') protectedUid = p.nightTarget;
            if (p.role === 'spy' && p.nightTarget && p.nightTarget !== 'none') spyTargetUid = p.nightTarget;
            if (p.role === 'gangster' && p.nightTarget && p.nightTarget !== 'none') gangsterTargetUid = p.nightTarget;
            if (p.role === 'mudang' && p.nightTarget && p.nightTarget !== 'none') nextShamanTargetUid = p.nightTarget;
        }

        // phase-controller.js 내부 processNightActions() 함수 내 무당 정산 파트 수정

        // [★버그 완벽 해결] 파이어베이스 트리의 game 노드 직속 하위 경로에서 유령 투표 집계 추출
        if (lastShamanTargetUid !== "none" && players[lastShamanTargetUid]) {
            let citizenVotes = 0; let mafiaVotes = 0;
            // gameData.shaman_ghost_votes 대신 리얼타임으로 연동된 ghostVotes 객체를 직접 순회합니다.
            for (let gId in ghostVotes) {
                if (ghostVotes[gId] === 'citizen_side') citizenVotes++;
                if (ghostVotes[gId] === 'mafia_side') mafiaVotes++;
            }
            
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

        updates['game/shaman_target_uid'] = nextShamanTargetUid;

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
            if (p.role === 'spy') line = `[${currentTurnVal}일차 밤] [${t.nickname}] 조사 완료 -> 마피아에게 정보가 안전하게 전달되었습니다.`;

            if (line) updates[`game/players/${id}/personalLog`] = currentLog ? `${currentLog}\n${line}` : line;
        }

        if (spyTargetUid !== "none" && players[spyTargetUid]) {
            const spyT = players[spyTargetUid];
            let spyIdentityResult = "직업이 있습니다.";
            if (spyT.role === 'citizen') spyIdentityResult = "시민입니다.";
            if (spyT.role === 'mafia') spyIdentityResult = "마피아입니다.";

            let spyContactBonusText = "";
            if (spyT.role === 'mafia') {
                let actualSpyNick = "스파이";
                for (let sId in players) { if (players[sId].role === 'spy') { actualSpyNick = players[sId].nickname; break; } }
                spyContactBonusText = `\n🔥 [접선성공] 스파이가 마피아를 찾았습니다. 스파이는 [${actualSpyNick}]입니다.`;
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
        for (let t in mafiaTargets) {
            if (mafiaTargets[t] > maxM) { maxM = mafiaTargets[t]; finalMTarget = t; }
        }

        if (finalMTarget !== "none" && finalMTarget !== protectedUid) {
            const targetUser = players[finalMTarget];
            
            if (targetUser.role === 'soldier' && targetUser.soldierLife > 1) {
                updates[`game/players/${finalMTarget}/soldierLife`] = 1;
                reports.push(`🪖 군인 [${targetUser.nickname}]이 어젯밤 마피아의 기습을 강력한 방패로 막아냈습니다.`);
            } else if (targetUser.role === 'terrorist') {
                deadList.push(finalMTarget);
                updates[`game/players/${finalMTarget}/deathReason`] = "마피아 피습";
                let mafiaIds = [];
                for (let mId in players) { if (players[mId].role === 'mafia' && players[mId].isAlive) mafiaIds.push(mId); }
                if (mafiaIds.length > 0) {
                    let deadMafia = mafiaIds[Math.floor(Math.random() * mafiaIds.length)];
                    deadList.push(deadMafia);
                    updates[`game/players/${deadMafia}/deathReason`] = "테러 자폭";
                    reports.push(`테러리스트의 폭사 반격으로 마피아[${players[deadMafia].nickname}]와 테러리스트[${targetUser.nickname}]가 함께 사망했습니다.`);
                }
            } else if (targetUser.role === 'lovers') {
                let substituteUid = "none";
                for (let id in players) {
                    if (players[id].role === 'lovers' && id !== finalMTarget && players[id].isAlive) {
                        substituteUid = id; break;
                    }
                }
                if (substituteUid !== "none") {
                    deadList.push(substituteUid);
                    updates[`game/players/${substituteUid}/deathReason`] = "연인 대신 희생";
                    reports.push(`마피아가 연인인 [${targetUser.nickname}] 학생을 저격했으나, 다른 연인이 대신 몸을 던져 희생하고 파트너를 살려냈습니다.`);
                } else {
                    deadList.push(finalMTarget);
                    updates[`game/players/${finalMTarget}/deathReason`] = "마피아 피습";
                    reports.push(`홀로 외로이 남은 연인 [${targetUser.nickname}] 학생이 마피아의 피습을 받아 사망했습니다.`);
                }
            } else {
                deadList.push(finalMTarget);
                updates[`game/players/${finalMTarget}/deathReason`] = "마피아 피습";
                reports.push(`밤사이에 발생한 참혹한 피습 사건으로 인해 [${targetUser.nickname}] 학생이 사망했습니다.`);
            }
        } else if (finalMTarget !== "none" && finalMTarget === protectedUid) {
            reports.push(`의사의 헌신적인 수호 덕분에 밤사이 아무도 다치지 않았습니다.`);
        } else {
            reports.push(`밤사이에 평화로운 정적만이 흘렀습니다.`);
        }

        if (gangsterTargetUid !== "none" && players[gangsterTargetUid]) {
            reports.push(`🥊 건달의 무자비한 폭행으로 인해 [${players[gangsterTargetUid].nickname}] 학생은 오늘 낮 투표권을 완전히 박탈당했습니다!`);
            updates['game/last_night_assault'] = gangsterTargetUid;
        } else {
            updates['game/last_night_assault'] = "none";
        }

        let morningSuspectCounts = {};
        for (let id in players) {
            const sId = players[id].suspect;
            if (sId && sId !== "none" && players[sId] && players[sId].isAlive) {
                const sNick = players[sId].nickname;
                morningSuspectCounts[sNick] = (morningSuspectCounts[sNick] || 0) + 1;
            }
        }

        deadList.forEach(d => {
            updates[`game/players/${d}/isAlive`] = false;
            historyLogs.push(`제 ${currentTurnVal}회차 밤: [${players[d].nickname}] 사망 (${updates[`game/players/${d}/deathReason`]})`);
        });
        if (deadList.length === 0) historyLogs.push(`제 ${currentTurnVal}회차 밤: 아무도 사망하지 않음`);

        let mCount = 0; let cCount = 0;
        for (let id in players) {
            let state = players[id].isAlive;
            if (deadList.includes(id)) state = false;
            if (state) {
                if (players[id].role === 'mafia') mCount++; else cCount++;
            }
        }

        if (mCount === 0) {
            updates['game/status'] = 'game_over'; updates['game/winner'] = 'citizen_win';
        } else if (mCount >= cCount) {
            updates['game/status'] = 'game_over'; updates['game/winner'] = 'mafia_win';
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
        updates['game/shaman_ghost_votes'] = "none"; 

        getDb().ref().update(updates);
    });
}

function handleResetToWaiting() {
    getDb().ref('game/players').get().then((snapshot) => {
        const players = snapshot.val() || {};
        const updates = {};

        for (let id in players) {
            updates[`game/players/${id}/role`] = "none";
            updates[`game/players/${id}/isAlive`] = true;
            updates[`game/players/${id}/nightTarget`] = "none";
            updates[`game/players/${id}/dayVote`] = "none";
            updates[`game/players/${id}/suspect`] = "none";
            updates[`game/players/${id}/personalLog`] = "none";
            updates[`game/players/${id}/deathReason`] = "none";
            updates[`game/players/${id}/trialDecision`] = "none";
        }

        updates['game/status'] = 'waiting';
        updates['game/turn'] = 1;
        updates['game/vote_state'] = 'none';
        updates['game/target_on_trial'] = 'none';
        updates['game/current_hint'] = "없음";
        updates['game/last_night_suspects'] = "none";
        updates['game/history_logs'] = ["새로운 대기실 세션이 시작되었습니다."];
        updates['game/last_night_assault'] = "none";
        updates['game/last_popup_alert_text'] = "none";
        updates['game/shaman_target_uid'] = "none";
        updates['game/shaman_ghost_votes'] = "none";
        updates['game/day_vote_retry_count'] = 0;
        updates['game/trial_retry_count'] = 0;

        getDb().ref().update(updates).then(() => {
            currentQuiz = null;
            location.reload(); 
        });
    });
}