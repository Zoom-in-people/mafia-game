/**
 * 3. game-logic.js
 * 게임 시작, 밤/낮 연산 제어 및 파이어베이스 다이렉트 푸시 엔진
 */

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
            alert(`[알림] 설정된 직업이 정원보다 많아 자동 조율됩니다.`);
            rolePool = rolePool.slice(0, total);
        }

        while (rolePool.length < total) rolePool.push("citizen");

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
        updates['game/morning_report'] = "첫 번째 아침이 밝았습니다. 자유롭게 토론하여 마피아를 추적하세요.";
        updates['game/quiz_score'] = 0;
        updates['game/current_hint'] = "없음";
        updates['game/last_night_suspects'] = "none";
        updates['game/history_logs'] = ["게임이 시작되었습니다!"];
        updates['game/last_night_assault'] = "none";
        updates['game/shaman_target_uid'] = "none";
        updates['game/shaman_ghost_votes'] = "none";

        adminRevealMap = {}; 
        
        getDb().ref().update(updates).then(() => {
            getDb().ref('game/status').set('day_discuss');
        });
    });
}

window.handleForceStopGame = function() {
    if (!currentUser || !currentUser.isAdmin) return;
    if (confirm("진행 중인 게임을 파기하고 대기실로 리셋하시겠습니까?")) {
        handleResetToWaiting();
    }
};

// 낮 투표 개시
function serverStartDayVote() {
    getDb().ref('game/players').get().then(snap => {
        const players = snap.val() || {};
        const updates = {};
        for (let id in players) {
            updates[`game/players/${id}/dayVote`] = "none";
            updates[`game/players/${id}/trialDecision`] = "none";
        }
        updates['game/vote_state'] = 'voting';
        updates['game/shaman_ghost_votes'] = "none"; 
        getDb().ref().update(updates);
    });
}

// 투표 마감 후 의심자 재판대 배정
function serverFinishDayVote() {
    getDb().ref('game').get().then(snap => {
        const gameData = snap.val() || {};
        const players = gameData.players || {};
        const lastNightAssault = gameData.last_night_assault || "none";
        
        let tally = {};
        for (let id in players) {
            if (id === lastNightAssault || !players[id].isAlive) continue; // 사망자 및 건달 폭행 대상 투표 제외

            let v = players[id].dayVote;
            if (v && v !== "none" && players[v] && players[v].isAlive) {
                tally[v] = (tally[v] || 0) + 1;
            }
        }

        let max = 0; let candidate = "none";
        for (let uid in tally) {
            if (tally[uid] > max) { max = tally[uid]; candidate = uid; }
        }

        if (candidate === "none") {
            alert("지목된 투표가 없어 사형대 대상을 선출하지 못했습니다.");
            return;
        }

        const updates = {};
        updates['game/vote_state'] = 'execution_trial';
        updates['game/target_on_trial'] = candidate;
        for (let id in players) updates[`game/players/${id}/trialDecision`] = "none";

        getDb().ref().update(updates);
    });
}

function submitExecutionVote(choice) {
    if (!currentUser || currentUser.isAdmin) return;
    getDb().ref(`game/players/${currentUser.id}/isAlive`).get().then(snap => {
        if (!snap.val()) return alert("사망한 유령은 재판권이 없습니다.");
        getDb().ref(`game/players/${currentUser.id}/trialDecision`).set(choice);
    });
}

// 찬반 표결 결과 연산 및 즉각적인 밤 페이즈 전환 트리거
function serverCalculateExecution() {
    getDb().ref('game').get().then(snap => {
        const gameData = snap.val() || {};
        const players = gameData.players || {};
        const targetUid = gameData.target_on_trial || "none";
        const targetUser = players[targetUid];
        const historyLogs = gameData.history_logs || [];
        const turn = gameData.turn || 1;

        if (targetUid === "none" || !targetUser) return alert("재판 대상자가 없습니다.");

        let exeCount = 0; let revCount = 0;
        for (let id in players) {
            if (players[id].trialDecision === 'execute') exeCount++;
            if (players[id].trialDecision === 'revive') revCount++;
        }

        let reports = []; let updates = {};
        const sideText = (targetUser.role === 'mafia' || targetUser.role === 'spy') ? "마피아 진영🔴" : "시민 진영⚪";

        if (exeCount >= revCount) {
            if (targetUser.role === 'assemblyman') {
                reports.push(`[재판 결과] 찬성 ${exeCount} / 반대 ${revCount}\n국회의원의 면책특권이 발동되어 [${targetUser.nickname}] 학생이 생존했습니다.`);
                historyLogs.push(`제 ${turn}회 낮: [${targetUser.nickname}] (국회의원) 면책특권 생존`);
            } 
            else if (targetUser.role === 'terrorist') {
                updates[`game/players/${targetUid}/isAlive`] = false;
                updates[`game/players/${targetUid}/deathReason`] = "투표 처형";
                historyLogs.push(`제 ${turn}회 낮: [${targetUser.nickname}] (테러리스트) 처형`);
                reports.push(`[재판 결과] 찬성 ${exeCount} / 반대 ${revCount}\n[${targetUser.nickname}] 학생 처형 완료. (직업: ${sideText})`);

                let AvengerPool = [];
                for (let id in players) {
                    if (players[id].dayVote === targetUid && players[id].trialDecision === 'execute' && players[id].isAlive) {
                        AvengerPool.push(id);
                    }
                }
                if (AvengerPool.length > 0) {
                    let randomVictimUid = AvengerPool[Math.floor(Math.random() * AvengerPool.length)];
                    updates[`game/players/${randomVictimUid}/isAlive`] = false;
                    updates[`game/players/${randomVictimUid}/deathReason`] = "테러 자폭 복수";
                    historyLogs.push(`제 ${turn}회 낮: [${players[randomVictimUid].nickname}] 테러 연쇄 폭사`);
                    reports.push(`💣 테러리스트 자폭 발동!\n처형에 찬성한 [${players[randomVictimUid].nickname}] 학생과 동반 사망했습니다!`);
                }
            } 
            else {
                updates[`game/players/${targetUid}/isAlive`] = false;
                updates[`game/players/${targetUid}/deathReason`] = "투표 처형";
                reports.push(`[재판 결과] 찬성 ${exeCount} / 반대 ${revCount}\n[${targetUser.nickname}] 학생이 최종 처형되었습니다. (${sideText})`);
                historyLogs.push(`제 ${turn}회 낮: [${targetUser.nickname}] 처형 사망`);
            }
        } else {
            reports.push(`[재판 결과] 찬성 ${exeCount} / 반대 ${revCount}\n방면 투표 과반수로 [${targetUser.nickname}] 학생이 살았습니다.`);
            historyLogs.push(`제 ${turn}회 낮: [${targetUser.nickname}] 무죄 부활`);
        }

        let aliveMafia = 0; let aliveCitizen = 0;
        for (let id in players) {
            let stillAlive = players[id].isAlive;
            if (updates[`game/players/${id}/isAlive`] === false) stillAlive = false;
            if (stillAlive) {
                if (players[id].role === 'mafia') aliveMafia++; else aliveCitizen++;
            }
        }

        // 상태값 할당 및 초기화 일괄 갱신
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

        getDb().ref().update(updates);
    });
}

function handleNextStage() {
    if (!currentUser || !currentUser.isAdmin) return;
    processNightActions();
}

// 밤 행동 종합 정산 후 실시간 '낮 상태' 원격 전송
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

        if (lastShamanTargetUid !== "none" && players[lastShamanTargetUid]) {
            let citizenVotes = 0; let mafiaVotes = 0;
            for (let gId in ghostVotes) {
                if (ghostVotes[gId] === 'citizen_side') citizenVotes++;
                if (ghostVotes[gId] === 'mafia_side') mafiaVotes++;
            }
            let finalGhostVerdict = "판별 유보";
            if (citizenVotes > mafiaVotes) finalGhostVerdict = "시민 편⚪";
            else if (mafiaVotes > citizenVotes) finalGhostVerdict = "마피아 편🔴";

            for (let id in players) {
                if (players[id].role === 'mudang' && players[id].isAlive) {
                    let mLog = (players[id].personalLog === "none") ? "" : (players[id].personalLog || "");
                    let shamanLogLine = `[🔮 접신 제보] 유령들의 투표 결과, [${players[lastShamanTargetUid].nickname}] 학생은 '${finalGhostVerdict}' 소속입니다.`;
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

            if (p.role === 'police') line = `[👮 경찰 조사] [${t.nickname}] -> ${(t.role==='mafia'||t.role==='spy') ? '마피아 🔴' : '시민 ⚪'}`;
            if (p.role === 'detective') line = `[🔍 탐정 조사] [${t.nickname}]의 타겟 -> [${players[t.nightTarget]?.nickname || '없음'}]`;
            if (p.role === 'spy') line = `[🕵️ 스파이 조사] [${t.nickname}] 비밀 조사 완료.`;

            if (line) updates[`game/players/${id}/personalLog`] = currentLog ? `${currentLog}\n${line}` : line;
        }

        if (spyTargetUid !== "none" && players[spyTargetUid]) {
            const spyT = players[spyTargetUid];
            let spyIdentityResult = spyT.role === 'mafia' ? "마피아" : (spyT.role === 'spy' ? "스파이" : `${spyT.role} 직업군`);
            for (let id in players) {
                if (players[id].role === 'mafia' || players[id].role === 'spy') {
                    let mLog = (players[id].personalLog === "none") ? "" : (players[id].personalLog || "");
                    updates[`game/players/${id}/personalLog`] = mLog ? `${mLog}\n[🕵️ 군사 무전] [${spyT.nickname}]은 '${spyIdentityResult}' 입니다.` : `[🕵️ 군사 무전] [${spyT.nickname}]은 '${spyIdentityResult}' 입니다.`;
                }
            }
        }

        let max = 0; let finalMTarget = "none";
        for (let t in mafiaTargets) {
            if (mafiaTargets[t] > max) { max = mafiaTargets[t]; finalMTarget = t; }
        }

        if (finalMTarget !== "none" && finalMTarget !== protectedUid) {
            const targetUser = players[finalMTarget];
            if (targetUser.role === 'soldier' && targetUser.soldierLife > 1) {
                updates[`game/players/${finalMTarget}/soldierLife`] = 1;
                reports.push(`🪖 군인 [${targetUser.nickname}] 학생이 마피아의 야간 피습을 방어했습니다!`);
            } else if (targetUser.role === 'terrorist') {
                deadList.push(finalMTarget);
                let mafiaIds = [];
                for (let mId in players) { if (players[mId].role === 'mafia' && players[mId].isAlive) mafiaIds.push(mId); }
                if (mafiaIds.length > 0) {
                    let deadMafia = mafiaIds[Math.floor(Math.random() * mafiaIds.length)];
                    deadList.push(deadMafia);
                    updates[`game/players/${deadMafia}/deathReason`] = "테러 자폭 복수";
                    reports.push(`💥 테러리스트 반격!\n테러리스트 [${targetUser.nickname}]와 마피아 [${players[deadMafia].nickname}] 학생이 함께 사망했습니다.`);
                }
            } else {
                deadList.push(finalMTarget);
                updates[`game/players/${finalMTarget}/deathReason`] = "마피아 피습";
                reports.push(`밤사이에 마피아의 습격으로 [${targetUser.nickname}] 학생이 사망했습니다.`);
            }
        } else if (finalMTarget !== "none" && finalMTarget === protectedUid) {
            reports.push(`🩺 의사의 정밀 치료 덕분에 밤사이 아무도 사망하지 않았습니다.`);
        } else {
            reports.push(`밤사이에 평화로운 정적만이 흘렀습니다.`);
        }

        if (gangsterTargetUid !== "none" && players[gangsterTargetUid]) {
            reports.push(`🔨 건달의 협박으로 [${players[gangsterTargetUid].nickname}] 학생은 오늘 낮 투표권이 박탈됩니다!`);
            updates['game/last_night_assault'] = gangsterTargetUid;
        } else {
            updates['game/last_night_assault'] = "none";
        }

        deadList.forEach(d => {
            updates[`game/players/${d}/isAlive`] = false;
            historyLogs.push(`제 ${currentTurnVal}회 밤: [${players[d].nickname}] 학생 사망`);
        });

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
        updates['game/morning_report'] = reports.join("\n");
        updates['game/turn'] = currentTurnVal + 1;
        updates['game/history_logs'] = historyLogs;
        updates['game/vote_state'] = 'none';

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
        updates['game/history_logs'] = ["새 게임 대기실이 생성되었습니다."];
        updates['game/last_night_assault'] = "none";
        updates['game/shaman_target_uid'] = "none";
        updates['game/shaman_ghost_votes'] = "none";

        getDb().ref().update(updates).then(() => {
            currentQuiz = null;
            location.reload(); 
        });
    });
}