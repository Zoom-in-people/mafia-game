// js/firebase-config.js (새로 만든 파일)
const firebaseConfig = {
  apiKey: "AIzaSyANgMobksIBGlAUp7lqb3GZbyIho_4142g",
  authDomain: "mafia-game-5c6db.firebaseapp.com",
  databaseURL: "https://mafia-game-5c6db-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mafia-game-5c6db",
  storageBucket: "mafia-game-5c6db.firebasestorage.app",
  messagingSenderId: "211882425801",
  appId: "1:211882425801:web:69b95a32239c16d2f2fc18"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("✅ 파이어베이스(Firebase) 서버 엔진이 성공적으로 연동 및 초기화되었습니다.");
} else {
    firebase.app(); // 이미 활성화된 앱 세션 인스턴스가 있다면 재사용
}

// 전역 window 상자에 데이터베이스 객체를 담아 app.js에 안전하게 넘깁니다.
window.sharedDatabase = firebase.database();