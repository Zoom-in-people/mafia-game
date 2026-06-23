/**
 * 3. game-logic.js
 * 게임 시작(직업 분배), 낮/밤 페이즈 제어, 특수 직업 연산 정산 엔진
 */

// 게임 시작 및 직업 난수 분배 연산 (직업 증발 버그 전면 수정)
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
            alert(`[알림] 설정된 특수직업 정원이 접속 인원보다 많아, 참여 순서대로 자동 조정 분배됩니다.`);
            rolePool = rolePool.slice(0, total);
        }

        while (rolePool.length < total) rolePool.push("citizen");

        for (let i = rolePool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rolePool[i], rolePool[j]] = [rolePool[j], rolePool[i]];
        }

        // [★직업 none 방쇄 조치] 비동기 체인 순서를 보장하기 위해 맵 구조가 아닌 순수 단일 일괄 업데이트 방식으로 데이터 동시 각인
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

        // 인게임 세션 글로벌 변수들도 한 번에 묶어서 DB에 밀어 넣습니다
        updates['game/vote_state'] = 'none';
        updates['game/target_on_trial'] = 'none';
        updates['game/turn'] = 1;
        updates['game/morning_report'] = "첫 번째 아침이 밝았습니다. 학생들과 자유롭게 토론하며 마피아를 추적하세요.";
        updates['game/quiz_score'] = 0;
        updates['game/current_hint'] = "없음";
        updates['game/last_night_suspects'] = "none";
        updates['game/history_logs'] = ["게임이 흥미진진하게 시작되었습니다!"];
        updates['game/last_night_assault'] = "none";
        updates['game/shaman_target_uid'] = "none";
        updates['game/shaman_ghost_votes'] = "none";

        adminRevealMap = {}; 
        
        // 직업과 세팅 데이터가 확실하게 기록된 후, 마지막 순서로 status를 바꿔 강제 뷰포트 전환을 유도합니다
        getDb().ref().update(updates).then(() => {
            getDb().ref('game/status').set('day_discuss');
        });
    });
}

// 교사 전용 게임 강제 리셋 종료 기능
window.handleForceStopGame = function() {
    if (!currentUser || !currentUser.isAdmin) return;
    if (confirm("진행 중인 게임을 강제로 파기하고 대기실 리셋 상태로 되돌리시겠습니까?")) {
        handleResetToWaiting();
    }
};

// 낮 투표 개시 컨트롤러
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

// 투표 마감 및 다득표 의심자 사형대 소환 정산
function serverFinishDayVote() {
    getDb().ref('game').get().then(snap => {
        const gameData = snap.val() || {};
        const players = gameData.players || {};
        const lastNightAssault = gameData.last_night_assault || "none";
        
        let tally = {};
        for (let id in players) {
            if (id === lastNightAssault) continue;

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
            alert("지목된 투표 내역이 없어 사형 대상자가 선출되지 않았습니다.");
            return;
        }

        const updates = {};
        updates['game/vote_state'] = 'execution_trial';
        updates['game/target_on_trial'] = candidate;
        for (let id in players) updates[`game/players/${id}/trialDecision`] = "none";

        getDb().ref().update(updates);
    });
}

// 사형대 최종 처형/부활 선택 투표 제출
function submitExecutionVote(choice) {
    if (!currentUser || currentUser.isAdmin) return;
    getDb().ref(`game/players/${currentUser.id}/isAlive`).get().then(snap => {
        if (!snap.val()) return alert("사망 유령 상태에서는 재판 표결권이 없습니다.");
        getDb().ref(`game/players/${currentUser.id}/trialDecision`).set(choice);
    });
}

// 찬반 표결 결과 최종 연산 정산 및 연쇄 체인 발동
function serverCalculateExecution() {
    getDb().ref('game').get().then(snap => {
        const gameData = snap.val() || {};
        const players = gameData.players || {};
        const targetUid = gameData.target_on_trial || "none";
        const targetUser = players[targetUid];
        const historyLogs = gameData.history_logs || [];
        const turn = gameData.turn || 1;

        if (targetUid === "none" || !targetUser) return alert("정산할 투표 대상자가 존재하지 않습니다.");

        let exeCount = 0; let revCount = 0;
        for (let id in players) {
            if (players[id].trialDecision === 'execute') exeCount++;
            if (players[id].trialDecision === 'revive') revCount++;
        }

        let reports = []; let updates = {};
        const sideText = (targetUser.role === 'mafia' || targetUser.role === 'spy') ? "마피아 진영🔴" : "시민 진영⚪";

        if (exeCount >= revCount) {
            if (targetUser.role === 'assemblyman') {
                reports.push(`[최종 재판 결과] 찬성 ${exeCount}표 / 반대 ${revCount}표\n국회의원 면책특권 발동으로 [${targetUser.nickname}] 학생이 부활 생존했습니다!`);
                historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] (국회의원) 면책특권 발동 생존`);
            } 
            else if (targetUser.role === 'terrorist') {
                updates[`game/players/${targetUid}/isAlive`] = false;
                updates[`game/players/${targetUid}/deathReason`] = "투표 처형";
                historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] (테러리스트) 투표 처형`);
                reports.push(`[최종 재판 결과] 찬성 ${exeCount}표 / 반대 ${revCount}표\n[${targetUser.nickname}] 학생은 처형되었습니다! (해당 학생은 ${sideText} 이었습니다.)`);

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
                    historyLogs.push(`제 ${turn}회차 낮: [${players[randomVictimUid].nickname}] 테러 저격 동반 폭사`);
                    reports.push(`💥 테러리스트 자폭 복수 발동!\n나를 사형대에 올리고 처형에 찬성한 [${players[randomVictimUid].nickname}] 학생을 길동무 삼아 동반 사망했습니다!`);
                }
            } 
            else {
                updates[`game/players/${targetUid}/isAlive`] = false;
                updates[`game/players/${targetUid}/deathReason`] = "투표 처형";
                reports.push(`[최종 재판 결과] 찬성 ${exeCount}표 / 반대 ${revCount}표\n[${targetUser.nickname}] 학생은 최종 처형되었습니다! (해당 학생은 ${sideText} 이었습니다.)`);
            }
        } else {
            reports.push(`[최종 재판 결과] 찬성 ${exeCount}표 / 반대 ${revCount}표\n과반수가 부활을 선택하여 [${targetUser.nickname}] 학생이 무죄 방면되었습니다!`);
            historyLogs.push(`제 ${turn}회차 낮: [${targetUser.nickname}] 찬반 재판 부활 생존`);
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

        getDb().ref().update(updates);
    });
}

function handleNextStage() {
    if (!currentUser || !currentUser.isAdmin) return;
    processNightActions();
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

        if (lastShamanTargetUid !== "none" && players[lastShamanTargetUid]) {
            let citizenVotes = 0; let mafiaVotes = 0;
            for (let gId in ghostVotes) {
                if (ghostVotes[gId] === 'citizen_side') citizenVotes++;
                if (ghostVotes[gId] === 'mafia_side') mafiaVotes++;
            }
            let finalGhostVerdict = "판별 유보 (유령 투표 부족)";
            if (citizenVotes > mafiaVotes) finalGhostVerdict = "시민 편⚪";
            else if (mafiaVotes > citizenVotes) finalGhostVerdict = "마피아 편🔴";

            for (let id in players) {
                if (players[id].role === 'mudang' && players[id].isAlive) {
                    let mLog = (players[id].personalLog === "none") ? "" : (players[id].personalLog || "");
                    let shamanLogLine = `[🔮 영혼의 작두 제보] 유령들이 판결한 결과, [${players[lastShamanTargetUid].nickname}] 학생은 '${finalGhostVerdict}' 소속으로 기울었습니다.`;
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

            if (p.role === 'police') line = `[제 ${currentTurnVal}회차 밤 조사] [${t.nickname}] 학생 -> ${(t.role==='mafia'||t.role==='spy') ? '마피아 진영🔴' : '시민 진영⚪'}`;
            if (p.role === 'detective') line = `[제 ${currentTurnVal}회차 밤 추적] [${t.nickname}] -> 지목 타겟 [${players[t.nightTarget]?.nickname || '없음'}]`;
            if (p.role === 'spy') line = `[제 ${currentTurnVal}회차 밤 조사] [${t.nickname}] 완료 -> 마피아에게 정체 정보 송신 완료.`;

            if (line) updates[`game/players/${id}/personalLog`] = currentLog ? `${currentLog}\n${line}` : line;
        }

        if (spyTargetUid !== "none" && players[spyTargetUid]) {
            const spyT = players[spyTargetUid];
            let spyIdentityResult = spyT.role === 'mafia' ? "마피아 본인" : (spyT.role === 'spy' ? "스파이 동료" : `${spyT.role} 직업군`);
            for (let id in players) {
                if (players[id].role === 'mafia' || players[id].role === 'spy') {
                    let mLog = (players[id].personalLog === "none") ? "" : (players[id].personalLog || "");
                    updates[`game/players/${id}/personalLog`] = mLog ? `${mLog}\n[🕵️ 스파이 무전] [${spyT.nickname}] 학생은 '${spyIdentityResult}' 입니다.` : `[🕵️ 스파이 무전] [${spyT.nickname}] 학생은 '${spyIdentityResult}' 입니다.`;
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
                reports.push(`🪖 군인 [${targetUser.nickname}] 학생이 밤사이 마피아의 기습 엄습을 강인하게 방어해냈습니다!`);
            } else if (targetUser.role === 'terrorist') {
                deadList.push(finalMTarget);
                let mafiaIds = [];
                for (let mId in players) { if (players[mId].role === 'mafia' && players[mId].isAlive) mafiaIds.push(mId); }
                if (mafiaIds.length > 0) {
                    let deadMafia = mafiaIds[Math.floor(Math.random() * mafiaIds.length)];
                    deadList.push(deadMafia);
                    updates[`game/players/${deadMafia}/deathReason`] = "테러 자폭 복수";
                    reports.push(`💥 테러리스트 밤 습격 반격!\n테러리스트[${targetUser.nickname}]와 습격해온 마피아[${players[deadMafia].nickname}] 학생이 야간 폭사로 함께 사망했습니다.`);
                }
            } else {
                deadList.push(finalMTarget);
                updates[`game/players/${finalMTarget}/deathReason`] = "마피아 피습";
                reports.push(`밤사이에 발생한 참혹한 피습 사건으로 인해 [${targetUser.nickname}] 학생이 사망했습니다.`);
            }
        } else if (finalMTarget !== "none" && finalMTarget === protectedUid) {
            reports.push(`🩺 의사의 헌신적인 수호 방어 덕분에 밤사이 아무도 다치지 않고 안전하게 아침이 밝았습니다.`);
        } else {
            reports.push(`밤사이에 평화로운 정적만이 흘렀습니다.`);
        }

        if (gangsterTargetUid !== "none" && players[gangsterTargetUid]) {
            reports.push(`🥊 건달의 무자비한 협박 폭행으로 인해 [${players[gangsterTargetUid].nickname}] 학생은 오늘 낮 투표권이 박탈(봉쇄)되었습니다!`);
            updates['game/last_night_assault'] = gangsterTargetUid;
        } else {
            updates['game/last_night_assault'] = "none";
        }

        deadList.forEach(d => {
            updates[`game/players/${d}/isAlive`] = false;
            historyLogs.push(`제 ${currentTurnVal}회차 밤: [${players[d].nickname}] 학생 사망`);
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
        updates['game/history_logs'] = ["새로운 대기실 초기 세션이 구성되었습니다."];
        updates['game/last_night_assault'] = "none";
        updates['game/shaman_target_uid'] = "none";
        updates['game/shaman_ghost_votes'] = "none";

        getDb().ref().update(updates).then(() => {
            currentQuiz = null;
            location.reload(); 
        });
    });
}